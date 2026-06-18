"""Provides the execution lanes module for the backend agent runtime."""

from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.agent.tools.sending.execution_envelope import ToolExecutionEnvelope
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.tool import Tool

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
    from backend.src.llm.parser_types import ParsedToolCall


_BACKEND_VALIDATION_FAILURE_MARKER = (
    "call is invalid and was rejected before backend execution"
)


def resolve_tool(session: "AgentSession", tool_name: str) -> Optional[Tool]:
    tool_registry = getattr(session, "tool_registry", None)
    if tool_registry is None:
        return None
    return tool_registry.get_tool(tool_name)


def resolve_execution_target(tool: Optional[Tool]) -> str:
    if tool is None:
        return "local_runtime"
    target = getattr(tool, "execution_target", "local_runtime")
    return target if isinstance(target, str) and target.strip() else "local_runtime"


def bundle_contains_backend_tool(
    resolved_calls: List[Any],
    session: "AgentSession",
) -> bool:
    for resolved_call in resolved_calls:
        tool = resolve_tool(session, resolved_call.tool_name)
        if resolve_execution_target(tool) == "backend":
            return True
    return False


def build_model_facing_tool_call(
    *,
    tool_name: str,
    parameters: Optional[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    model_tool_call: Dict[str, Any] = {
        "name": tool_name,
        "arguments": dict(parameters or {}),
    }
    if isinstance(metadata, dict):
        tool_call_id = metadata.get("tool_call_id")
        if isinstance(tool_call_id, str) and tool_call_id:
            model_tool_call["id"] = tool_call_id
    return model_tool_call


def build_tool_event_metadata(resolved_call: Any) -> Dict[str, Any]:
    tool_metadata = (
        dict(resolved_call.metadata)
        if isinstance(resolved_call.metadata, dict)
        else {}
    )
    tool_metadata.setdefault(
        "model_facing_tool_call",
        build_model_facing_tool_call(
            tool_name=resolved_call.original_call.tool_name,
            parameters=resolved_call.original_call.parameters,
            metadata=resolved_call.original_call.metadata,
        ),
    )
    return tool_metadata


def build_preparation_failure_metadata(
    *,
    tool_call: "ParsedToolCall",
    request_id: str,
    error_msg: str,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {
        "skip_local_execution": True,
        "request_id": request_id,
    }
    if _BACKEND_VALIDATION_FAILURE_MARKER in error_msg:
        metadata["llm_tool_call_validation_failed"] = True
    else:
        metadata["coordinate_resolution_failed"] = True
    return metadata


def build_preparation_failure_lane(
    *,
    tool_call: "ParsedToolCall",
    error_msg: str,
    synthetic_result_factory: "SyntheticResultFactory",
) -> Optional[Tuple[str, ToolResult, ToolExecutionEnvelope]]:
    execution_ref = ExecutionRef.from_metadata(tool_call.metadata)
    request_id = execution_ref.request_id if execution_ref else None
    if not request_id:
        return None

    synthetic_result = synthetic_result_factory.create(tool_call, error_msg)
    tool_metadata = dict(tool_call.metadata) if isinstance(tool_call.metadata, dict) else {}
    tool_metadata.setdefault(
        "model_facing_tool_call",
        build_model_facing_tool_call(
            tool_name=tool_call.tool_name,
            parameters=tool_call.parameters,
            metadata=tool_call.metadata,
        ),
    )
    failure_metadata = build_preparation_failure_metadata(
        tool_call=tool_call,
        request_id=request_id,
        error_msg=error_msg,
    )
    tool_metadata.update(failure_metadata)
    envelope = ToolExecutionEnvelope(
        tool_name=tool_call.tool_name,
        parameters=tool_call.parameters,
        request_id=request_id,
        metadata=tool_metadata,
        result=synthetic_result,
    )
    return request_id, synthetic_result, envelope


def build_unsupported_backend_bundle_failure_lane(
    *,
    tool_call: "ParsedToolCall",
    error_msg: str,
    synthetic_result_factory: "SyntheticResultFactory",
) -> Optional[Tuple[str, ToolResult, ToolExecutionEnvelope]]:
    execution_ref = ExecutionRef.from_metadata(tool_call.metadata)
    request_id = execution_ref.request_id if execution_ref else None
    if not request_id:
        return None

    synthetic_result = synthetic_result_factory.create(tool_call, error_msg)
    tool_metadata = dict(tool_call.metadata) if isinstance(tool_call.metadata, dict) else {}
    tool_metadata.setdefault(
        "model_facing_tool_call",
        build_model_facing_tool_call(
            tool_name=tool_call.tool_name,
            parameters=tool_call.parameters,
            metadata=tool_call.metadata,
        ),
    )
    tool_metadata.update(
        {
            "backend_tool_bundle_unsupported": True,
            "request_id": request_id,
            "skip_local_execution": True,
        }
    )
    envelope = ToolExecutionEnvelope(
        tool_name=tool_call.tool_name,
        parameters=tool_call.parameters,
        request_id=request_id,
        metadata=tool_metadata,
        result=synthetic_result,
    )
    return request_id, synthetic_result, envelope


def build_backend_execution_lane(
    *,
    resolved_call: Any,
    request_id: str,
    tool_metadata: Dict[str, Any],
    result: ToolResult,
) -> ToolExecutionEnvelope:
    backend_metadata = dict(tool_metadata)
    backend_metadata["skip_local_execution"] = True
    backend_metadata["request_id"] = request_id
    return ToolExecutionEnvelope(
        tool_name=resolved_call.tool_name,
        parameters=resolved_call.parameters,
        request_id=request_id,
        metadata=backend_metadata,
        result=result,
    )


def store_failed_bundle_result(
    *,
    session: "AgentSession",
    bundle_id: str,
    tool_calls: List["ParsedToolCall"],
    errors: List[tuple["ParsedToolCall", str]],
) -> None:
    first_error = errors[0][1] if errors else "Tool preparation failed"
    failed_call = errors[0][0] if errors else None
    failed_tool_name = failed_call.tool_name if failed_call else "unknown"
    skipped_reason = (
        "Skipped because bundle preparation failed before local-runtime dispatch"
    )
    step_results = []
    for call in tool_calls:
        if call is failed_call:
            output = first_error
        else:
            output = f"{skipped_reason} ({failed_tool_name})"
        step_results.append(
            {
                "tool": call.tool_name,
                "status": "error",
                "output": output,
            }
        )

    bundle_result = ToolResult(
        success=False,
        error=first_error,
        output=f"Error: {first_error}",
        data={
            "bundle_id": bundle_id,
            "status": "failure",
            "step_results": step_results,
            "error": first_error,
        },
    )
    result_storage = session.get_result_storage()
    result_storage.store_bundled_result(bundle_id, bundle_result)
    result_storage.resolve_bundle_future(bundle_id, bundle_result)
