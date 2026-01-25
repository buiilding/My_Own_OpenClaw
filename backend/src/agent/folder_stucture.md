backend/src/agent/
├── __init__.py
├── session/                          # Session & state management
│   ├── __init__.py
│   ├── session.py                    # AgentSession (from core/core.py)
│   ├── manager.py                    # SessionManager (from core/session_manager.py)
│   └── state.py                      # ConversationHistory (from core/state.py)
│
├── execution/                         # Agent execution orchestration
│   ├── __init__.py
│   ├── executor.py                   # AgentExecutor (from core/executor.py)
│   └── interaction_loop.py           # InteractionLoop (from core/interaction_loop.py)
│
├── llm/                              # LLM interaction
│   ├── __init__.py
│   ├── conversation_context.py       # ConversationContext (renamed from prompt_coordinator.py)
│   ├── llm_stream_processor.py       # LLMStreamProcessor (renamed from llm_interaction_handler.py)
│   └── event_presenter.py             # EventPresenter (unchanged)
│
├── tools/                             # Complete tool lifecycle
│   ├── __init__.py
│   ├── orchestrator.py               # NEW: High-level orchestrator (orchestrates sending + waiting + processing)
│   │
│   ├── preparation/                  # Phase 1: Resolve tools
│   │   ├── __init__.py
│   │   ├── resolved_tool_call.py     # ResolvedToolCall (from tools/resolved_tool_call.py)
│   │   │
│   │   ├── helpers/                  # Helper utilities
│   │   │   ├── __init__.py
│   │   │   ├── preparation_helper.py # resolve_tool_with_coordinates() (from tools/tool_preparation_helper.py) 
│   │   │   ├── coordinate_resolution_helper.py  # resolve_coordinates() (from tools/coordinate_resolution_helper.py)
│   │   │   └── vision_service_provider.py      # VisionServiceProvider (from tools/vision_service_provider.py)
│   │   │
│   │   ├── coordinate_resolution/     # Coordinate resolution
│   │   │   ├── __init__.py           # (from tools/resolvers/__init__.py)
│   │   │   └── resolvers.py          # CoordinateResolver, OcrCoordinateResolver, VisionCoordinateResolver (from tools/resolvers/coordinate_resolvers.py)
│   │   │
│   │   ├── screenshot/                # Screenshot management
│   │   │   ├── __init__.py
│   │   │   ├── manager.py            # ScreenshotManager (from tools/screenshot_manager.py)
│   │   │   ├── state.py               # ScreenshotState (from core/screenshot_state.py)
│   │   │   └── processor.py          # NEW: ScreenshotProcessor (processes screenshots from results)
│   │   │
│   │   ├── ocr/                       # OCR coordination
│   │   │   ├── __init__.py
│   │   │   └── coordinator.py        # OcrCoordinator (from tools/ocr_coordinator.py)
│   │   │
│   │   └── storage/                   # Resolution storage
│   │       ├── __init__.py
│   │       └── resolved_call_storage.py  # ResolvedToolCallStorage (from core/resolved_call_storage.py)
│   │
│   ├── sending/                       # Phase 2: Send resolved tools to frontend
│   │   ├── __init__.py
│   │   ├── resolver.py                # ToolResolver (from tools/tool_resolver.py, split)
│   │   └── sender.py                  # NEW: ToolSender (only sends events)
│   │
│   ├── waiting/                       # Phase 3: Wait for frontend results, receive and route
│   │   ├── __init__.py
│   │   ├── receiver.py                # NEW: ToolResultReceiver (receives results from frontend)
│   │   ├── router.py                 # NEW: ToolResultRouter (routes results)
│   │   ├── waiter.py                 # NEW: ToolResultWaiter (waits for results via ToolOrchestrator)
│   │   └── storage/
│   │       ├── __init__.py
│   │       └── result_storage.py     # ToolResultStorage (from core/tool_result_storage.py)
│   │
│   ├── processing/                    # Phase 4: Process results
│   │   ├── __init__.py
│   │   ├── coordinator.py            # ToolProcessingCoordinator (from tools/tool_executor.py, split - only coordinates processing)
│   │   ├── processor.py              # NEW: ToolResultProcessor (processes results)
│   │   ├── transformer.py            # ResultTransformer (from tools/result_transformer.py)
│   │   └── synthetic_factory.py      # SyntheticResultFactory (from tools/synthetic_result_factory.py)
│   │
│   └── shared/                        # Shared utilities across phases
│       ├── __init__.py
│       ├── bundle_detection.py       # (from tools/bundle_detection.py)
│       ├── bundle_result_formatter.py # (from tools/bundle_result_formatter.py)
│       └── logging_utils.py          # (from tools/logging_utils.py)
│
├── history/                           # History management (unchanged)
│   ├── __init__.py
│   └── history_committer.py           # HistoryCommitter
│
└── plugins/                           # Plugin system (unchanged)
    ├── __init__.py
    ├── manager.py                     # PluginManager
    ├── interface.py                   # Plugin interface
    └── ocr_plugin.py                 # OCRPlugin

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

### Tool Lifecycle Flow (Resolution → Sending → Waiting → Processing)
```
tools/orchestrator.py
    └── ToolOrchestrator
        ↓
1. Sending Phase (execute method)
    └── tools/sending/resolver.py
        └── ToolResolver.resolve_tools() → AsyncGenerator[AgentStreamingEvent]
            ├── tools/preparation/helpers/preparation_helper.py
            │   └── resolve_tool_with_coordinates() → coordinates resolved
            └── tools/sending/sender.py
                └── ToolSender.send_tools() → ToolCallEvent | ToolBundleEvent
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

### Tool Resolution Flow (Coordinate Resolution)
```
tools/sending/resolver.py
    └── ToolResolver.resolve_tools()
        ↓
1. Screenshot Acquisition
    └── tools/preparation/screenshot/manager.py
        └── ScreenshotManager.get_screenshot() → AsyncGenerator[RequestScreenshotEvent]
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
    └── tools/preparation/resolved_tool_call.py
        └── ResolvedToolCall (immutable copy with resolved coordinates)
            └── tools/preparation/storage/resolved_call_storage.py
                └── ResolvedToolCallStorage.register() → stored for waiting phase
        ↓
4. Event Emission
    └── tools/sending/sender.py
        └── ToolSender.send_tools() → ToolCallEvent | ToolBundleEvent
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
            │       └── plugins/manager.py
            │           └── PluginManager.process_result() → plugins applied
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
tools/sending/resolver.py
    └── ToolResolver.resolve_tools() (multiple tools)
        └── All tools resolved with bundle_id
            └── tools/sending/sender.py
                └── ToolSender.send_tools() → ToolBundleEvent
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
        │   ├── tools/sending/resolver.py → ToolResolver
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
                        └── plugins/ocr_plugin.py (background task)
                            └── OCRPlugin.perform_ocr() → ocr_results[]
                                └── session/session.py
                                    └── AgentSession.set_current_ocr_results() → state updated
```