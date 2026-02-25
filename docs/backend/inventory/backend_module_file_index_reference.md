---
summary: "Backend module/file ownership index for `backend/src`, including domain-level file counts and high-value module maps for faster code navigation."
read_when:
  - When onboarding to backend code and needing quick file-level navigation.
  - When planning a backend change and choosing exact files to inspect first.
title: "Backend Module File Index Reference"
---

# Backend Module File Index Reference

This index maps backend functionality to file ownership.

## Domain File Counts

Based on current source tree under `backend/src`:

| Domain | Python files |
| --- | ---: |
| `agent` | 60 |
| `api` | 67 |
| `core` | 69 |
| `tools` | 31 |
| `llm` | 24 |
| `services` | 14 |
| `simulation` | 12 |
| `sdk` | 6 |
| `embeddings` | 2 |
| **Total** | **287** |

## API Layer Index

- App + deps:
- `backend/src/api/app_assembly.py`
- `backend/src/api/deps.py`
- Routes:
- `backend/src/api/routes/websocket/{__init__,connection,message_handler,json_parse,task_manager}.py`
- `backend/src/api/routes/memory/{embeddings,semantic,semantic_service,semantic_parser,health}.py`
- `backend/src/api/routes/artifacts.py`
- Handlers:
- `backend/src/api/handlers/{query,tool_result,settings,stop_query,rehydrate,wakeword}.py`
- Processing:
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/formatters/*.py`
- `backend/src/api/processing/tts/{manager,processor}.py`
- Transport:
- `backend/src/api/transport/{websocket,sender,envelope,protocol}.py`
- Contracts/schemas:
- `backend/src/api/contracts/{message_types,formatter_specs,registry}.py`
- `backend/src/api/schemas/{common,incoming,outgoing}.py`

## Agent Layer Index

- Session lifecycle:
- `backend/src/agent/session/{session,manager,state,runtime_state,initializer,config_runtime,lifecycle}.py`
- Loop + execution:
- `backend/src/agent/execution/{executor,interaction_loop,tool_call_bridge,policies}.py`
- Agent LLM bridge:
- `backend/src/agent/llm/{conversation_context,llm_stream_processor,event_presenter,token_counting}.py`
- History:
- `backend/src/agent/history/history_committer.py`
- Tool lifecycle:
- `backend/src/agent/tools/preparation/**`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/waiting/**`
- `backend/src/agent/tools/processing/**`
- `backend/src/agent/tools/shared/**`

## Core Layer Index

- Bootstrap:
- `backend/src/core/bootstrap/{coordinator,entrypoint,handler_initializer}.py`
- Container graph:
- `backend/src/core/container/{application,facade,core_container,tool_container,memory_container,api_container,initializer,config_updater,session_factory,incoming_routing}.py`
- Config:
- `backend/src/core/config/{models,app_config,loader,runtime,manager,service,subscriptions}.py`
- Infrastructure:
- `backend/src/core/infrastructure/{bus,event_bus_registry,cache,cache_store,cache_manager,cache_entry,exceptions}.py`
- `backend/src/core/infrastructure/error_types/*.py`
- Events/types/messages:
- `backend/src/core/events/*.py`
- `backend/src/core/types/*.py`
- `backend/src/core/messages/*.py`
- Services/security/validation:
- `backend/src/core/services/*.py`
- `backend/src/core/security/{policy,executor}.py`
- `backend/src/core/validation/validators.py`
- `backend/src/core/observability/trust_boundary_metrics.py`

## LLM + Tools + Services Index

LLM domain:

- `backend/src/llm/client.py`
- `backend/src/llm/providers/*.py`
- `backend/src/llm/models/{model_service,models_config}.py`
- `backend/src/llm/prompts/{prompt_constructor,prompts,prompt_metadata}.py`
- `backend/src/llm/{parser,parser_extraction,parser_validation,parser_types,request_kwargs}.py`

Backend tool surface:

- `backend/src/tools/registry.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/remote_tools/*.py`
- `backend/src/tools/{computer,filesystem,system,browser}/schemas*.py`

Services domain:

- `backend/src/services/token_service.py`
- `backend/src/services/artifacts/store.py`
- `backend/src/services/ocr/{ocr_service,helpers}.py`
- `backend/src/services/vision/{vision_service,utils,coordinates}.py`
- `backend/src/services/vision/providers/{base,internvl,internvl_runtime_helpers,ui_venus}.py`

## SDK + Simulation + Embeddings Index

SDK:

- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`
- `backend/src/sdk/agents/{session_builder,response_extractor,config_helper}.py`

Simulation:

- `backend/src/simulation/{main,app_factory,lifespan_factory,mock_llm_client,mock_llm_browser_client,base_mock_llm_client,native_tool_adapter,browser,computer,coordinate_resolver}.py`

Embeddings:

- `backend/src/embeddings/embeddings.py`

## Fast Navigation Queries

Useful local queries for backend navigation:

- All API handlers: `rg --files backend/src/api/handlers`
- Agent tool waiting/processing code: `rg --files backend/src/agent/tools/waiting backend/src/agent/tools/processing`
- LLM parser + validation stack: `rg --files backend/src/llm | rg 'parser|provider|prompt'`
- Tool schemas: `rg -n "class .*Args\(BaseModel\)" backend/src/tools backend/src/api/schemas`

## Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Full Functionality Inventory Reference](backend_full_functionality_inventory_reference.md)
- [Backend Runtime Flow Matrix Reference](backend_runtime_flow_matrix_reference.md)
