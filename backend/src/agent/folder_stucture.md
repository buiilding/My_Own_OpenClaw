backend/src/agent/
├── __init__.py                        # Package initialization and exports
├── session/                          # Session & state management
│   ├── __init__.py                   # Package exports: AgentSession, SessionManager, ConversationHistory
│   ├── session.py                    # AgentSession - manages conversation state and delegates execution to AgentExecutor
│   ├── manager.py                    # SessionManager - manages lifecycle of user agent sessions (creation, retrieval, cleanup, TTL expiry)
│   └── state.py                      # ConversationHistory - manages conversation history state (pruning, token counting, image data cleanup)
│
├── execution/                         # Agent execution orchestration
│   ├── __init__.py                   # Package exports: AgentExecutor, InteractionLoop
│   ├── executor.py                   # AgentExecutor - initializes components and delegates main loop to InteractionLoop
│   └── interaction_loop.py           # InteractionLoop - controls agent's execution state machine (Prompt -> LLM -> Parse -> Tools -> Repeat)
│
├── llm/                              # LLM interaction
│   ├── __init__.py                   # Package exports: ConversationContext, LLMStreamProcessor, EventPresenter
│   ├── conversation_context.py       # ConversationContext - manages prompt preparation and caching
│   ├── llm_stream_processor.py       # LLMStreamProcessor - handles LLM streaming, text aggregation, token counting
│   └── event_presenter.py             # EventPresenter - presents all frontend/UI events (system prompt, user message, tool schemas, assistant message, completion, error)
│
├── tools/                             # Complete tool lifecycle
│   ├── __init__.py                   # Package exports: ToolOrchestrator, ToolPreparer, ResolvedToolCallStorage, etc.
│   ├── orchestrator.py               # ToolOrchestrator - high-level orchestrator (orchestrates sending via ToolSender, waiting via ToolResultWaiter, processing via ToolProcessingCoordinator)
│   │
│   ├── preparation/                  # Phase 1: Prepare tools (resolution)
│   │   ├── __init__.py               # Package exports: ResolvedToolCall, ToolPreparer
│   │   ├── preparer.py               # ToolPreparer - orchestrates tool call preparation (coordinates screenshot availability, coordinate resolution, tool rewriting)
│   │   │
│   │   ├── types/                    # Data structures
│   │   │   ├── __init__.py           # Package exports: ResolvedToolCall
│   │   │   └── resolved_tool_call.py # ResolvedToolCall - immutable tool call after resolution with resolved coordinates (transforms high-level intents to concrete instructions)
│   │   │
│   │   ├── helpers/                  # Helper utilities
│   │   │   ├── __init__.py           # Package exports: resolve_coordinates, resolve_tool_with_coordinates, VisionServiceProvider
│   │   │   ├── preparation_helper.py # resolve_tool_with_coordinates() - shared async generator for resolving tools with coordinate resolution (screenshot acquisition, coordinate resolution, tool rewriting)
│   │   │   ├── coordinate_resolution_helper.py  # resolve_coordinates() - centralizes coordinate resolution sub-logic (OCR results acquisition, vision service access, coordinate resolution)
│   │   │   └── vision_service_provider.py      # VisionServiceProvider - provides decoupled access to vision service from session hierarchy
│   │   │
│   │   ├── coordinate_resolution/     # Coordinate resolution
│   │   │   ├── __init__.py            # Package exports: CoordinateResolver, OcrCoordinateResolver, VisionCoordinateResolver
│   │   │   └── resolvers.py           # CoordinateResolver (routes to OCR/Vision), OcrCoordinateResolver (text matching), VisionCoordinateResolver (model prediction) - pure coordinate resolution logic
│   │   │
│   │   ├── screenshot/                # Screenshot management
│   │   │   ├── __init__.py            # Package exports: ScreenshotManager, ScreenshotProcessor, ScreenshotState
│   │   │   ├── manager.py             # ScreenshotManager - manages screenshot availability and processing (stores as current, triggers OCR)
│   │   │   ├── state.py               # ScreenshotState - manages screenshot and OCR state for a session (only current screenshot/OCR, previous discarded)
│   │   │   └── processor.py           # ScreenshotProcessor - processes screenshots from tool results (delegates to ScreenshotManager)
│   │   │
│   │   ├── ocr/                       # OCR coordination
│   │   │   ├── __init__.py            # Package exports: OcrCoordinator
│   │   │   └── coordinator.py         # OcrCoordinator - coordinates OCR result acquisition (waits for proactive OCR, fallback to on-demand OCR, verifies screenshot ID match)
│   │   │
│   │   └── storage/                   # Resolution storage
│   │       ├── __init__.py            # Package exports: ResolvedToolCallStorage
│   │       └── resolved_call_storage.py  # ResolvedToolCallStorage - manages storage and retrieval of resolved tool calls (used by ToolOrchestrator during execution)
│   │
│   ├── sending/                       # Phase 2: Send resolved tools to frontend
│   │   ├── __init__.py                # Package exports: ToolSender
│   │   └── sender.py                  # ToolSender - sends resolved tools to frontend (uses ToolPreparer for preparation, yields ToolCallEvent, ToolBundleEvent, ToolOutputEvent)
│   │
│   ├── waiting/                       # Phase 3: Wait for frontend results, receive and route
│   │   ├── __init__.py                # Package exports: ToolResultHandler, ToolResultReceiver, ToolResultRouter, ToolResultWaiter
│   │   ├── handler.py                 # ToolResultHandler - facade for tool result processing from frontend (delegates to receiver and router)
│   │   ├── receiver.py                # ToolResultReceiver - receives results from frontend and converts to ToolResult format (individual, bundle, bundled results)
│   │   ├── router.py                  # ToolResultRouter - routes tool results to screenshot processor, storage, and future resolution
│   │   ├── waiter.py                  # ToolResultWaiter - waits for results via backend ToolOrchestrator
│   │   └── storage/
│   │       ├── __init__.py            # Package exports: ToolResultStorage
│   │       └── result_storage.py      # ToolResultStorage - centralized storage for pending tool results, futures, bundled results (with TTL cleanup)
│   │
│   ├── processing/                    # Phase 4: Process results
│   │   ├── __init__.py                # Package exports: ToolProcessingCoordinator, ToolResultProcessor, ResultTransformer, SyntheticResultFactory
│   │   ├── coordinator.py             # ToolProcessingCoordinator - coordinates result processing (delegates to ToolResultProcessor)
│   │   ├── processor.py               # ToolResultProcessor - processes tool execution results (transforms via ResultTransformer and commits to history via HistoryCommitter)
│   │   ├── transformer.py             # ResultTransformer - pure function class for transforming tool execution results (formats for history)
│   │   └── synthetic_factory.py       # SyntheticResultFactory - creates synthetic error results for failed tool calls (coordinate resolution failures)
│   │
│   └── shared/                        # Shared utilities across phases
│       ├── __init__.py                # Package exports: bundle_detection, bundle_result_formatter, logging_utils
│       ├── bundle_detection.py        # is_atomic_bundle(), is_atomic_bundle_from_results() - detects atomic bundles from parsed responses or tool results
│       ├── bundle_result_formatter.py # BundleResultFormatter - formats atomic bundle results into single narrative for LLM history
│       └── logging_utils.py           # short_id() - utility for truncating IDs for logging
│
├── history/                           # History management
│   ├── __init__.py                    # Package exports: HistoryCommitter
│   └── history_committer.py           # HistoryCommitter - commits processed tool results to conversation history (pure state mutation, no computation)

## Data Flow

### Main Agent Loop Flow
```
execution/interaction_loop.py
    └── InteractionLoop.run_loop()
        ↓
1. Prompt Phase
    ├── llm/conversation_context.py
    │   └── ConversationContext.get_prompt() → (messages, tool_schemas, metadata)
    └── session/state.py
        └── ConversationHistory.get_history() → LLMMessage[]
        ↓
2. LLM Phase
    ├── llm/llm_stream_processor.py
    │   └── LLMStreamProcessor.get_response() → AsyncGenerator[StreamingEvent]
    └── llm/event_presenter.py
        └── EventPresenter.present_*() → AgentStreamingEvent
        ↓
3. Parse Phase
    └── ResponseParser.parse_response() → ParsedResponse
        ↓
4. Tool Execution Phase (if has_tool_calls)
    └── tools/orchestrator.py
        └── ToolOrchestrator.execute() → AsyncGenerator[AgentStreamingEvent]
            ↓
        └── ToolOrchestrator.process_results() → None
        ↓
5. Repeat or Complete
    └── session/state.py
        └── ConversationHistory.add_assistant_message() → state updated
```

### Tool Lifecycle Flow (Preparation → Sending → Waiting → Processing)
```
tools/orchestrator.py
    └── ToolOrchestrator
        ↓
1. Sending Phase (execute method)
    └── tools/sending/sender.py
        └── ToolSender.send_tools() → AsyncGenerator[AgentStreamingEvent]
            ├── tools/preparation/preparer.py
            │   └── ToolPreparer.prepare_tools() → returns PreparationResult
            │       └── tools/preparation/helpers/preparation_helper.py
            │           └── resolve_tool_with_coordinates() → coordinates resolved
            └── ToolSender yields ToolCallEvent | ToolBundleEvent | ToolOutputEvent
        ↓
2. Waiting Phase (process_results method)
    └── tools/waiting/waiter.py
        └── ToolResultWaiter.wait_for_results() → orchestration_result
            └── backend/src/tools/orchestrator.py
                └── ToolOrchestrator.execute_tools_from_response() → waits for futures
        ↓
3. Processing Phase
    └── tools/processing/coordinator.py
        └── ToolProcessingCoordinator.process() → None
            └── tools/processing/processor.py
                └── ToolResultProcessor.process() → None
                    ├── tools/processing/transformer.py
                    │   └── ResultTransformer.transform() → ProcessedToolResult
                    └── history/history_committer.py
                        └── HistoryCommitter.commit() → history updated
```

### Tool Preparation Flow (Coordinate Resolution)
```
tools/sending/sender.py
    └── ToolSender.send_tools()
        ↓
    └── tools/preparation/preparer.py
        └── ToolPreparer.prepare_tools()
            ↓
1. Screenshot Acquisition
    └── tools/preparation/screenshot/manager.py
        └── ScreenshotManager.get_screenshot() → AsyncGenerator[AgentStreamingEvent]
            └── session/session.py
                └── AgentSession._pending_screenshots → Future created
        ↓
2. Coordinate Resolution (if needed)
    └── tools/preparation/helpers/preparation_helper.py
        └── resolve_tool_with_coordinates()
            ├── tools/preparation/screenshot/manager.py
            │   └── ScreenshotManager.get_screenshot() → screenshot_data
            └── tools/preparation/helpers/coordinate_resolution_helper.py
                └── resolve_coordinates()
                    ├── tools/preparation/ocr/coordinator.py (if OCR method)
                    │   └── OcrCoordinator.get_ocr_results() → ocr_results[]
                    └── tools/preparation/coordinate_resolution/resolvers.py
                        ├── OcrCoordinateResolver.resolve() → (x, y)
                        └── VisionCoordinateResolver.resolve() → (x, y)
        ↓
3. Tool Call Rewriting
    └── tools/preparation/types/resolved_tool_call.py
        └── ResolvedToolCall (immutable copy with resolved coordinates)
            └── tools/preparation/storage/resolved_call_storage.py
                └── ResolvedToolCallStorage.register() → stored for waiting phase
        ↓
4. Event Emission (back in ToolSender)
    └── tools/sending/sender.py
        └── ToolSender yields ToolCallEvent | ToolBundleEvent | ToolOutputEvent
            └── Frontend receives event and executes tool
```

### Tool Result Flow (Receiving → Routing → Processing)
```
Frontend Tool Result
    ↓
tools/waiting/handler.py
    └── ToolResultHandler.process_frontend_tool_result()
        ↓
1. Receiving Phase
    └── tools/waiting/receiver.py
        └── ToolResultReceiver.receive_individual_result() → ToolResult
            └── Converts frontend format to ToolResult format
        ↓
2. Routing Phase
    └── tools/waiting/router.py
        └── ToolResultRouter.route_individual_result()
            ├── tools/preparation/screenshot/processor.py (if screenshot present)
            │   └── ScreenshotProcessor.process_from_result() → screenshot_id
            │       └── tools/preparation/screenshot/manager.py
            │           └── ScreenshotManager.process_screenshot() → stored + OCR triggered
            ├── tools/waiting/storage/result_storage.py
            │   └── ToolResultStorage.store_pending_result() → stored
            └── tools/waiting/storage/result_storage.py
                └── ToolResultStorage.resolve_result_future() → future resolved
        ↓
3. Waiting Phase (orchestrator waits)
    └── tools/waiting/waiter.py
        └── ToolResultWaiter.wait_for_results()
            └── backend/src/tools/orchestrator.py
                └── ToolOrchestrator.execute_tools_from_response()
                    └── backend/src/tools/single_tool_execution.py
                        └── execute_single_tool() → waits for future
                            └── await asyncio.wait_for(future) → ToolResult
        ↓
4. Processing Phase
    └── tools/processing/processor.py
        └── ToolResultProcessor.process()
            ├── tools/processing/transformer.py
            │   └── ResultTransformer.transform() → ProcessedToolResult
            └── history/history_committer.py
                └── HistoryCommitter.commit() → history updated
                    └── session/state.py
                        └── ConversationHistory.add_tool_output() → state updated
```

### Session State Flow
```
session/session.py
    └── AgentSession
        ├── session/state.py
        │   └── ConversationHistory
        │       ├── get_history() → LLMMessage[]
        │       ├── add_assistant_message() → state updated
        │       └── add_tool_output() → state updated
        │
        ├── tools/preparation/screenshot/state.py
        │   └── ScreenshotState
        │       ├── get_current_screenshot() → screenshot_data
        │       └── set_current_screenshot() → state updated
        │
        ├── tools/preparation/storage/resolved_call_storage.py
        │   └── ResolvedToolCallStorage
        │       ├── register() → resolved_call stored
        │       └── get() → ResolvedToolCall retrieved
        │
        └── tools/waiting/storage/result_storage.py
            └── ToolResultStorage
                ├── store_pending_result() → result stored
                ├── create_result_future() → Future created
                └── resolve_result_future() → future resolved
```

### Bundle Execution Flow
```
tools/sending/sender.py
    └── ToolSender.send_tools() (multiple tools)
        └── tools/preparation/preparer.py
            └── ToolPreparer.prepare_tools() → all tools resolved with bundle_id
                └── ToolSender yields ToolBundleEvent
                    └── Frontend executes bundle atomically
        ↓
Frontend Bundle Result
    ↓
tools/waiting/handler.py
    └── ToolResultHandler.process_frontend_tool_bundle_result()
        ↓
tools/waiting/receiver.py
    └── ToolResultReceiver.receive_bundle_result() → ToolResult (bundle)
        ↓
tools/waiting/router.py
    └── ToolResultRouter.route_bundle_result()
        ├── tools/preparation/screenshot/processor.py (if screenshot)
        ├── tools/waiting/storage/result_storage.py
        │   └── ToolResultStorage.store_bundled_result() → bundle stored
        └── tools/waiting/storage/result_storage.py
            └── ToolResultStorage.resolve_bundle_future() → bundle future resolved
        ↓
tools/waiting/waiter.py
    └── ToolResultWaiter.wait_for_results()
        └── backend/src/tools/bundle_execution.py
            └── execute_bundle() → waits for bundle future
        ↓
tools/processing/processor.py
    └── ToolResultProcessor.process()
        ├── tools/shared/bundle_detection.py
        │   └── is_atomic_bundle_from_results() → True
        └── tools/shared/bundle_result_formatter.py
            └── BundleResultFormatter.format() → formatted message
                └── history/history_committer.py
                    └── HistoryCommitter.commit() → single bundle message in history
```

### Execution Orchestration Flow
```
execution/executor.py
    └── AgentExecutor
        ├── Initialization
        │   ├── llm/conversation_context.py → ConversationContext
        │   ├── llm/llm_stream_processor.py → LLMStreamProcessor
        │   ├── tools/preparation/preparer.py → ToolPreparer
        │   ├── tools/sending/sender.py → ToolSender
        │   ├── tools/waiting/waiter.py → ToolResultWaiter
        │   ├── tools/processing/processor.py → ToolResultProcessor
        │   └── tools/orchestrator.py → ToolOrchestrator
        │
        └── execution/interaction_loop.py
            └── InteractionLoop.run_loop()
                ├── ConversationContext.get_prompt()
                ├── LLMStreamProcessor.get_response()
                ├── ResponseParser.parse_response()
                └── ToolOrchestrator.execute() + process_results()
```

### Screenshot Processing Flow (from Results)
```
Tool Result (with screenshot)
    ↓
tools/waiting/router.py
    └── ToolResultRouter.route_individual_result()
        └── tools/preparation/screenshot/processor.py
            └── ScreenshotProcessor.process_from_result()
                └── tools/preparation/screenshot/manager.py
                └── ScreenshotManager.process_screenshot()
                    ├── session/session.py
                    │   └── AgentSession.set_current_screenshot() → state updated
                    └── services/ocr/ocr_service.py (background task)
                        └── OcrService.perform_ocr() → ocr_results[]
                            └── session/session.py
                                └── AgentSession.set_current_ocr_results() → state updated
```
