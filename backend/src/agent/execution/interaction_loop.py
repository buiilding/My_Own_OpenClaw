"""
Interaction Loop.

Controls the agent execution state machine.
Only responsible for loop control, sequencing, and termination decisions.
All content, I/O, and presentation is delegated to specialized components.
"""

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List
from uuid import uuid4

from backend.src.agent.execution.tool_call_bridge import (
    build_recoverable_tool_output_message,
    extract_history_tool_call_ids,
    is_recoverable_llm_tool_call_error,
    to_history_tool_calls,
    to_parsed_response,
)
from backend.src.core.utils.raw_tool_call_preview import build_raw_tool_call_preview
from backend.src.agent.session.capability_application import (
    capability_revision_from_agent_definition,
    final_tool_schema_source_counts,
)
from backend.src.agent.session.model_history_ledger import (
    build_model_history_checkpoint,
)
from backend.src.core.types.enums import MessageType
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionFailedEvent,
    ContextCompactionStartedEvent,
    ErrorEvent,
    FullResponseEvent,
    ModelHistoryUpdatedEvent,
    TraceEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.infrastructure.error_types.llm import LLMRateLimitError
from backend.src.core.infrastructure.user_facing_errors import (
    INTERNAL_SERVER_ERROR_MESSAGE,
    sanitize_stream_error_message,
)
from backend.src.core.types.schemas import NormalizedLLMResponse
from backend.src.llm.parser_types import ParsedResponse

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.llm.conversation_context import ConversationContext
    from backend.src.agent.llm.event_presenter import EventPresenter
    from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
    from backend.src.agent.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)
COMPACTION_RECOVERY_REASON = "overflow-retry"
MAX_COMPACTION_RECOVERY_ATTEMPTS = 1
COMPACTION_RECOVERY_FAILED_MESSAGE = (
    "The model response still failed after compacting history. Please retry, "
    "or start a new chat if this conversation remains too large."
)
CONTEXT_OVERFLOW_ERROR_MARKERS = (
    "context_length_exceeded",
    "maximum context length",
    "context window",
    "context length",
    "too many tokens",
    "input is too long",
    "token limit",
)


def _session_capability_revision(session: Any) -> str | None:
    runtime = getattr(session, "runtime", None)
    return capability_revision_from_agent_definition(
        getattr(runtime, "agent_definition", None)
    )


def _prompt_layer_count(prompt_metadata: Any) -> int:
    summary = getattr(prompt_metadata, "client_prompt_layer_summary", None)
    if isinstance(summary, dict):
        count = summary.get("count")
        if isinstance(count, int):
            return count
    layers = getattr(prompt_metadata, "client_prompt_layers", None)
    return len(layers) if isinstance(layers, list) else 0


class InteractionLoop:
    """
    Controls the agent execution state machine.

    Responsibility: Loop control, sequencing, and termination decisions only.
    Delegates all content, I/O, and presentation to specialized components.
    """

    def __init__(
        self,
        session: "AgentSession",
        prompt_coordinator: "ConversationContext",
        llm_handler: "LLMStreamProcessor",
        tool_executor: "ToolOrchestrator",
        event_presenter: "EventPresenter",
    ):
        """
        Initialize the interaction loop.

        Args:
            session: Agent session for state access
            prompt_coordinator: Manages conversation context
            llm_handler: Processes LLM streaming and token counting
            tool_executor: Orchestrates tool execution
            event_presenter: Presents client streaming events
        """
        self.session = session
        self.prompt_coordinator = prompt_coordinator
        self.llm_handler = llm_handler
        self.tool_executor = tool_executor
        self.event_presenter = event_presenter

    async def run_loop(self) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.

        Controls the state machine and delegates all work to specialized components.
        """
        iteration = 0
        compaction_recovery_attempts = 0

        while True:
            iteration += 1

            compaction_engine = getattr(self.session, "compaction_engine", None)
            if iteration > 1 and compaction_engine is not None:
                mid_compaction_decision = compaction_engine.evaluate(reason="auto-mid")
                if mid_compaction_decision.should_compact:
                    _applied, compaction_events = await self._run_compaction(
                        reason="auto-mid",
                        decision=mid_compaction_decision,
                    )
                    for event in compaction_events:
                        yield event

            # Step 1: Get prompt (delegated to PromptCoordinator)
            prompt_started_at = time.perf_counter()
            prompt_mode = "initial" if iteration == 1 else "rebuild"
            yield TraceEvent(
                path="backend.prompt",
                stage="build",
                status="started",
                runtime="backend",
                data={
                    "iteration": iteration,
                    "promptMode": prompt_mode,
                },
            )
            try:
                prompt, tool_schemas, prompt_metadata = (
                    self.prompt_coordinator.get_prompt(iteration)
                )
            except Exception as exc:
                yield TraceEvent(
                    path="backend.prompt",
                    stage="build",
                    status="failed",
                    runtime="backend",
                    duration_ms=round((time.perf_counter() - prompt_started_at) * 1000),
                    data={
                        "iteration": iteration,
                        "promptMode": prompt_mode,
                    },
                    error={
                        "code": type(exc).__name__,
                        "message": "Backend prompt build failed.",
                    },
                )
                raise
            yield TraceEvent(
                path="backend.prompt",
                stage="build",
                status="succeeded",
                runtime="backend",
                duration_ms=round((time.perf_counter() - prompt_started_at) * 1000),
                data={
                    "iteration": iteration,
                    "promptMode": prompt_mode,
                    "promptMessageCount": len(prompt),
                    "toolSchemaCount": len(tool_schemas or []),
                    "hasPromptMetadata": prompt_metadata is not None,
                    "capabilityRevision": _session_capability_revision(self.session),
                    "finalToolSourceCounts": final_tool_schema_source_counts(
                        tool_schemas or [],
                        getattr(
                            getattr(self.session, "runtime", None),
                            "client_tool_manifest",
                            None,
                        ),
                    ),
                    "finalPromptLayerCount": _prompt_layer_count(prompt_metadata),
                },
            )
            yield TraceEvent(
                path="tool.schema.policy",
                stage="project",
                status="succeeded",
                runtime="backend",
                data={
                    "iteration": iteration,
                    "toolSchemaCount": len(tool_schemas or []),
                    "hasToolSchemas": bool(tool_schemas),
                    "promptMode": prompt_mode,
                },
            )

            # Present prompt metadata events (only on first iteration)
            if iteration == 1 and prompt_metadata:
                async for event in self.event_presenter.present_prompt_metadata(
                    prompt_metadata
                ):
                    yield event

            # Step 2: Get LLM response (delegated to LLMInteractionHandler)
            llm_response_text = ""
            llm_error_event_content = None
            llm_error_event_metadata = None
            provider_started_at = time.perf_counter()
            provider_trace_data = {
                "iteration": iteration,
                "modelId": getattr(
                    self.session.cfg,
                    "selected_model_id",
                    getattr(self.session.cfg, "llm_model", None),
                ),
                "modelProvider": getattr(self.session.cfg, "model_provider", None),
                "promptMessageCount": len(prompt),
                "toolSchemaCount": len(tool_schemas or []),
            }
            yield TraceEvent(
                path="provider.call",
                stage="request",
                status="started",
                runtime="provider",
                data=provider_trace_data,
            )
            try:
                async for event in self.llm_handler.get_response(
                    prompt,
                    tools=tool_schemas,
                ):
                    if isinstance(event, ErrorEvent):
                        llm_error_event_content = event.content
                        llm_error_event_metadata = (
                            dict(event.metadata)
                            if isinstance(event.metadata, dict)
                            else None
                        )
                        continue
                    yield event
                    if isinstance(event, FullResponseEvent):
                        llm_response_text = event.content

            except LLMRateLimitError:
                yield TraceEvent(
                    path="provider.call",
                    stage="request",
                    status="failed",
                    runtime="provider",
                    duration_ms=round(
                        (time.perf_counter() - provider_started_at) * 1000
                    ),
                    data={**provider_trace_data, "failureKind": "rate_limit"},
                    error={
                        "code": "LLMRateLimitError",
                        "message": "Provider rate limit exceeded.",
                    },
                )
                error_msg = "Rate limit exceeded. Please wait."
                async for event in self._emit_error_and_record(error_msg):
                    yield event
                return
            except Exception as e:
                yield TraceEvent(
                    path="provider.call",
                    stage="request",
                    status="failed",
                    runtime="provider",
                    duration_ms=round(
                        (time.perf_counter() - provider_started_at) * 1000
                    ),
                    data={**provider_trace_data, "failureKind": type(e).__name__},
                    error={
                        "code": type(e).__name__,
                        "message": "Provider call failed.",
                    },
                )
                if self._is_context_overflow_error(str(e)):
                    recovered, recovery_events = (
                        await self._attempt_compaction_recovery(
                            force=True,
                            attempts_used=compaction_recovery_attempts,
                        )
                    )
                    for event in recovery_events:
                        yield event
                    if recovered:
                        compaction_recovery_attempts += 1
                        continue
                    async for event in self._emit_error_and_record(
                        COMPACTION_RECOVERY_FAILED_MESSAGE
                    ):
                        yield event
                    return
                logger.error(f"LLM error: {e}", exc_info=True)
                async for event in self._emit_error_and_record(
                    INTERNAL_SERVER_ERROR_MESSAGE
                ):
                    yield event
                return

            if llm_error_event_content:
                yield TraceEvent(
                    path="provider.call",
                    stage="request",
                    status="failed",
                    runtime="provider",
                    duration_ms=round(
                        (time.perf_counter() - provider_started_at) * 1000
                    ),
                    data={
                        **provider_trace_data,
                        "failureKind": "stream_error_event",
                        "hasErrorMetadata": llm_error_event_metadata is not None,
                    },
                    error={
                        "code": "ProviderStreamError",
                        "message": "Provider stream failed.",
                    },
                )
                if self._is_recoverable_llm_tool_call_error(
                    llm_error_event_content,
                    llm_error_event_metadata,
                ):
                    logger.info(
                        "Recoverable LLM tool-call format error detected; "
                        "emitting synthetic tool output and continuing turn: %s",
                        llm_error_event_content,
                    )
                    async for event in self._emit_recoverable_tool_call_error(
                        llm_error_event_content,
                        metadata=llm_error_event_metadata,
                    ):
                        yield event
                    continue
                if self._is_context_overflow_error(llm_error_event_content):
                    recovered, recovery_events = (
                        await self._attempt_compaction_recovery(
                            force=True,
                            attempts_used=compaction_recovery_attempts,
                        )
                    )
                    for event in recovery_events:
                        yield event
                    if recovered:
                        compaction_recovery_attempts += 1
                        continue
                    async for event in self._emit_error_and_record(
                        COMPACTION_RECOVERY_FAILED_MESSAGE
                    ):
                        yield event
                    return
                logger.warning(
                    "Aborting interaction loop turn after LLM stream error event: %s",
                    llm_error_event_content,
                )
                sanitized_error_message = sanitize_stream_error_message(
                    llm_error_event_content
                )
                async for event in self._emit_error_and_record(sanitized_error_message):
                    yield event
                return

            yield TraceEvent(
                path="provider.call",
                stage="request",
                status="succeeded",
                runtime="provider",
                duration_ms=round((time.perf_counter() - provider_started_at) * 1000),
                data={
                    **provider_trace_data,
                    "responseLength": len(llm_response_text),
                },
            )

            normalized_response = self.llm_handler.get_last_response_payload() or {
                "content": llm_response_text
            }
            parsed_response = to_parsed_response(normalized_response)
            llm_response_text = parsed_response.text_content

            if self._is_empty_failed_response(normalized_response, parsed_response):
                recovered, recovery_events = await self._attempt_compaction_recovery(
                    force=False,
                    attempts_used=compaction_recovery_attempts,
                )
                for event in recovery_events:
                    yield event
                if recovered:
                    compaction_recovery_attempts += 1
                    continue
                if compaction_recovery_attempts >= MAX_COMPACTION_RECOVERY_ATTEMPTS:
                    async for event in self._emit_error_and_record(
                        COMPACTION_RECOVERY_FAILED_MESSAGE
                    ):
                        yield event
                    return

            if llm_response_text:
                async for event in self.event_presenter.present_assistant_message(
                    llm_response_text
                ):
                    yield event

            # Step 4: Decision - final answer or tools?
            if not parsed_response.has_tool_calls:
                llm_response_text, emit_backfill_message = (
                    self._resolve_final_assistant_turn_text(llm_response_text)
                )
                if emit_backfill_message:
                    async for event in self.event_presenter.present_assistant_message(
                        llm_response_text
                    ):
                        yield event
                self.session.history.add_assistant_message(llm_response_text)
                model_history_event = self._build_model_history_updated_event()
                if model_history_event is not None:
                    yield model_history_event
                async for event in self.event_presenter.present_completion(
                    llm_response_text
                ):
                    yield event
                return

            # Execute tools (yields execution-time events)
            # BUNDLE EXECUTION FIX: Wait for bundle results before processing next response.
            # This ensures that if a bundle is sent to the SDK/local runtime, we wait for its completion
            # before the interaction loop continues to the next iteration, preventing race
            # conditions where subsequent tool calls execute before the bundle finishes.
            # SESSION STATE LEAK FIX: Use finally block to ensure cleanup runs even if
            # execute() raises an exception or client disconnects (GeneratorExit)
            results_processed = False
            try:
                is_bundle = self._commit_assistant_tool_turn(
                    llm_response_text=llm_response_text,
                    parsed_response=parsed_response,
                )

                # Yield all resolution events (ToolBundleEvent or ToolCallEvent)
                async for event in self.tool_executor.execute(
                    parsed_response, self.session
                ):
                    yield event

                # BUNDLE EXECUTION FIX: For bundles, wait for results immediately after
                # sending the bundle event, before the interaction loop continues.
                # This ensures the bundle completes before any subsequent tool calls.
                if is_bundle:
                    logger.info(
                        "Waiting for bundle execution to complete before continuing..."
                    )
                    await self.tool_executor.process_results(
                        parsed_response, self.session
                    )
                    results_processed = True
                    model_history_event = self._build_model_history_updated_event()
                    if model_history_event is not None:
                        yield model_history_event
                    logger.info(
                        "Bundle execution completed, continuing interaction loop"
                    )
            except Exception as e:
                logger.error(f"Critical tool execution error: {e}", exc_info=True)
                async for event in self._emit_error_and_record(
                    INTERNAL_SERVER_ERROR_MESSAGE
                ):
                    yield event
                break
            finally:
                # SESSION STATE LEAK FIX: Always process results for cleanup, even if
                # execute() failed or client disconnected. This prevents tool state
                # (request_ids, pending results, resolved calls) from leaking in session.
                # Process tool results for history storage (for LLM context)
                # Note: SDK/UI projections display tool results immediately after execution.
                # Backend only processes results for conversation history, not for UI display.
                # ToolOutputEvent is only emitted for backend-side failures (e.g., coordinate resolution)
                # which are already yielded by ToolSender during tool preparation/sending.
                # BUNDLE EXECUTION FIX: For bundles, process_results() was already called above,
                # but we still need to handle cleanup for non-bundle tools or error cases.
                if not results_processed:
                    try:
                        await self.tool_executor.process_results(
                            parsed_response, self.session
                        )
                        model_history_event = self._build_model_history_updated_event()
                        if model_history_event is not None:
                            yield model_history_event
                    except Exception as cleanup_error:
                        # Log but don't re-raise - we're in finally block and don't want to
                        # mask the original exception if one occurred
                        logger.error(
                            f"Error during tool result cleanup: {cleanup_error}",
                            exc_info=True,
                        )

    def _build_model_history_updated_event(self) -> ModelHistoryUpdatedEvent | None:
        checkpoint = build_model_history_checkpoint(
            self.session.history,
            conversation_ref=getattr(
                self.session.runtime, "active_conversation_ref", None
            ),
            revision_id=getattr(self.session.runtime, "active_revision_id", None),
            turn_ref=getattr(self.session.runtime, "active_turn_ref", None),
        )
        if checkpoint is None:
            return None
        return ModelHistoryUpdatedEvent(
            conversation_ref=checkpoint["conversation_ref"],
            revision_id=checkpoint["revision_id"],
            checkpoint_id=checkpoint["checkpoint_id"],
            created_at=checkpoint["created_at"],
            rows=checkpoint["rows"],
        )

    async def _attempt_compaction_recovery(
        self,
        *,
        force: bool,
        attempts_used: int,
    ) -> tuple[bool, List[AgentStreamingEvent]]:
        if attempts_used >= MAX_COMPACTION_RECOVERY_ATTEMPTS:
            return False, []

        compaction_engine = getattr(self.session, "compaction_engine", None)
        if compaction_engine is None:
            return False, []

        decision = compaction_engine.evaluate(
            reason=COMPACTION_RECOVERY_REASON,
            force=force,
        )
        if not decision.should_compact:
            return False, []

        logger.warning(
            "[Compaction] Attempting model overflow recovery (force=%s, before=%s, projected=%s)",
            force,
            decision.before_tokens,
            decision.projected_tokens,
        )
        return await self._run_compaction(
            reason=COMPACTION_RECOVERY_REASON,
            decision=decision,
        )

    async def _run_compaction(
        self,
        *,
        reason: str,
        decision: Any,
    ) -> tuple[bool, List[AgentStreamingEvent]]:
        compaction_engine = getattr(self.session, "compaction_engine", None)
        if compaction_engine is None:
            return False, []

        started_at = time.monotonic()
        events: List[AgentStreamingEvent] = [
            TraceEvent(
                path="backend.compaction",
                stage="compact",
                status="started",
                runtime="backend",
                data={
                    "reason": reason,
                    "strategy": decision.strategy_name,
                    "beforeTokens": decision.before_tokens,
                    "projectedTokens": decision.projected_tokens,
                    "force": reason == COMPACTION_RECOVERY_REASON,
                },
            ),
            ContextCompactionStartedEvent(
                reason=reason,
                strategy=decision.strategy_name,
                before_tokens=decision.before_tokens,
                projected_tokens=decision.projected_tokens,
            ),
        ]
        try:
            result = await compaction_engine.compact(
                reason=reason,
                decision=decision,
            )
            events.append(
                ContextCompactionCompletedEvent(
                    reason=reason,
                    strategy=result.strategy_name,
                    before_tokens=result.before_tokens,
                    after_tokens=result.after_tokens,
                    removed_messages=result.removed_messages,
                    summary_preview=self._summary_preview(result.summary_text),
                    summary_text=result.summary_text,
                    replacement_history_preview=[
                        {
                            "role": entry.role,
                            "message_type": entry.message_type,
                            "content": entry.content,
                            "tool_name": entry.tool_name,
                            "tool_call_id": entry.tool_call_id,
                        }
                        for entry in result.replacement_history_preview
                    ],
                    replacement_history_entries=result.replacement_history_entries,
                    skipped_reason=result.skip_reason,
                )
            )
            events.append(
                TraceEvent(
                    path="backend.compaction",
                    stage="compact",
                    status="succeeded" if result.applied else "skipped",
                    runtime="backend",
                    duration_ms=round((time.monotonic() - started_at) * 1000),
                    data={
                        "reason": reason,
                        "strategy": result.strategy_name,
                        "beforeTokens": result.before_tokens,
                        "afterTokens": result.after_tokens,
                        "removedMessages": result.removed_messages,
                        "applied": bool(result.applied),
                        "hasSummary": bool(result.summary_text),
                        "replacementHistoryEntryCount": len(
                            result.replacement_history_entries
                        ),
                        "skippedReason": result.skip_reason,
                    },
                )
            )
            return bool(result.applied), events
        except Exception as exc:
            logger.error(
                "[Compaction] %s compaction failed: %s",
                reason,
                exc,
                exc_info=True,
            )
            events.append(
                ContextCompactionFailedEvent(
                    reason=reason,
                    strategy=decision.strategy_name,
                    error=str(exc),
                    before_tokens=decision.before_tokens,
                )
            )
            events.append(
                TraceEvent(
                    path="backend.compaction",
                    stage="compact",
                    status="failed",
                    runtime="backend",
                    duration_ms=round((time.monotonic() - started_at) * 1000),
                    data={
                        "reason": reason,
                        "strategy": decision.strategy_name,
                        "beforeTokens": decision.before_tokens,
                    },
                    error={
                        "code": "backend_compaction_failed",
                        "message": "Backend compaction failed.",
                    },
                )
            )
            return False, events

    def _resolve_final_assistant_turn_text(
        self,
        llm_response_text: str,
    ) -> tuple[str, bool]:
        """Return final assistant text plus whether a fallback message must be emitted."""
        final_response_text = llm_response_text
        if not final_response_text.strip():
            final_response_text = self._build_empty_final_response_fallback()
            return final_response_text, True
        return final_response_text, False

    def _commit_assistant_tool_turn(
        self,
        *,
        llm_response_text: str,
        parsed_response: ParsedResponse,
    ) -> bool:
        """Persist the assistant tool-call turn and stage tool ids for outputs."""
        history_tool_calls = to_history_tool_calls(parsed_response.tool_calls)
        self.session.history.add_assistant_message(
            llm_response_text,
            tool_calls=history_tool_calls,
        )
        is_bundle = len(parsed_response.tool_calls) > 1
        self.session.history.stage_tool_call_ids(
            extract_history_tool_call_ids(history_tool_calls),
            consume_all_on_next_output=is_bundle,
        )
        return is_bundle

    async def _emit_error_and_record(
        self, error_msg: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Emit an error event and persist it in assistant history."""
        async for event in self.event_presenter.present_error(error_msg):
            yield event
        self.session.history.add_assistant_message(f"[System Error: {error_msg}]")

    async def _emit_recoverable_tool_call_error(
        self,
        error_msg: str,
        metadata: Dict[str, Any] | None = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Convert malformed LLM tool-call payloads into synthetic tool output.

        This keeps the interaction loop alive and gives the model explicit,
        tool-shaped feedback so it can retry with corrected arguments.
        """
        structured_metadata = dict(metadata) if isinstance(metadata, dict) else {}
        tool_name = self._extract_tool_name_from_metadata(structured_metadata)
        tool_call_id = self._extract_tool_call_id_from_metadata(structured_metadata)
        raw_tool_call_preview = self._extract_raw_tool_call_preview_from_metadata(
            structured_metadata
        )
        raw_arguments_preview = self._extract_raw_arguments_preview_from_metadata(
            structured_metadata
        )
        parse_error_summary = self._extract_tool_call_parse_error_from_metadata(
            structured_metadata
        )
        if not tool_call_id:
            tool_call_id = f"llm_tool_call_error_{uuid4().hex[:12]}"
        if not raw_tool_call_preview and raw_arguments_preview:
            raw_tool_call_preview = build_raw_tool_call_preview(
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                raw_arguments_preview=raw_arguments_preview,
            )

        tool_output_message = build_recoverable_tool_output_message(
            tool_name,
            error_msg,
            raw_arguments_preview=raw_arguments_preview,
        )
        metadata = {
            "request_id": tool_call_id,
            "llm_tool_call_validation_failed": True,
            "skip_local_execution": True,
        }
        if raw_arguments_preview:
            metadata["llm_tool_call_raw_arguments_preview"] = raw_arguments_preview
            metadata["llm_tool_call_raw_arguments_preview_truncated"] = (
                raw_arguments_preview.endswith("...[truncated]")
            )
        if raw_tool_call_preview:
            metadata["llm_tool_call_raw_tool_call_preview"] = raw_tool_call_preview
        if parse_error_summary:
            metadata["llm_tool_call_parse_error"] = parse_error_summary

        # Maintain ToolCallEvent -> ToolOutputEvent ordering for SDK/main and renderer state.
        yield ToolCallEvent(
            tool_name=tool_name,
            parameters={},
            request_id=tool_call_id,
            metadata=metadata,
        )
        yield ToolOutputEvent(
            tool_name=tool_name,
            success=False,
            output=tool_output_message,
            error=error_msg,
            execution_time=0.0,
            metadata=metadata,
        )

        # Feed the synthetic tool output back into history for the next LLM turn.
        self.session.history.stage_tool_call_ids([tool_call_id])
        self.session.history.add_tool_output(
            tool_output_message,
            tool_name=tool_name,
            compaction_facts={
                "tool_name": tool_name,
                "success": False,
                "error": error_msg,
                "metadata": metadata,
            },
        )

    def _build_empty_final_response_fallback(self) -> str:
        """
        Provide a deterministic user-facing fallback when model returns empty final text.
        """
        tool_output_summary = self._extract_last_tool_output_summary()
        if tool_output_summary:
            return (
                "I completed the requested tool action(s), but the model returned an empty "
                "final response. Latest tool output:\n\n"
                f"{tool_output_summary}"
            )
        return (
            "I completed the requested action(s), but the model returned an empty "
            "final response."
        )

    def _extract_last_tool_output_summary(self) -> str:
        """Return a concise summary from the most recent tool-output history entry."""
        try:
            stored_messages = self.session.history.get_stored_messages()
        except Exception:
            return ""

        for message in reversed(stored_messages):
            if message.message_type != MessageType.TOOL_OUTPUT:
                continue
            content = (message.content or "").strip()
            if not content:
                continue
            if "<system_context>" in content:
                content = content.split("<system_context>", 1)[0].strip()
            if len(content) > 600:
                content = f"{content[:597]}..."
            return content
        return ""

    @staticmethod
    def _is_context_overflow_error(error_msg: str) -> bool:
        normalized = str(error_msg or "").strip().lower()
        if not normalized:
            return False
        return any(marker in normalized for marker in CONTEXT_OVERFLOW_ERROR_MARKERS)

    @staticmethod
    def _is_empty_failed_response(
        normalized_response: NormalizedLLMResponse,
        parsed_response: ParsedResponse,
    ) -> bool:
        if parsed_response.text_content.strip() or parsed_response.has_tool_calls:
            return False
        finish_reason = (
            str(normalized_response.get("finish_reason") or "").strip().lower()
        )
        return finish_reason in {"incomplete", "length"}

    @staticmethod
    def _is_recoverable_llm_tool_call_error(
        error_msg: str,
        metadata: Dict[str, Any] | None = None,
    ) -> bool:
        """Return True for recoverable model-generated tool-call format errors."""
        if not isinstance(metadata, dict):
            return False
        if metadata.get("llm_tool_call_parse_failed") is not True:
            return False
        return is_recoverable_llm_tool_call_error(error_msg)

    @staticmethod
    def _extract_tool_call_id_from_metadata(
        metadata: Dict[str, Any],
    ) -> str:
        value = metadata.get("llm_tool_call_id")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    @staticmethod
    def _extract_raw_arguments_preview_from_metadata(
        metadata: Dict[str, Any],
    ) -> str:
        value = metadata.get("llm_tool_call_raw_arguments_preview")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    @staticmethod
    def _extract_raw_tool_call_preview_from_metadata(
        metadata: Dict[str, Any],
    ) -> str:
        value = metadata.get("llm_tool_call_raw_tool_call_preview")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    @staticmethod
    def _extract_tool_call_parse_error_from_metadata(
        metadata: Dict[str, Any],
    ) -> str:
        value = metadata.get("llm_tool_call_parse_error")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    @staticmethod
    def _summary_preview(summary_text: str) -> str:
        """Return the full compaction summary preview for event payloads."""
        preview = (summary_text or "").strip()
        if not preview:
            return ""
        return preview

    @staticmethod
    def _extract_tool_name_from_metadata(
        metadata: Dict[str, Any],
    ) -> str:
        value = metadata.get("llm_tool_name")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return "invalid_tool_call"
