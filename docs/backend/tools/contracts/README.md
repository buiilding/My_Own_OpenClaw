---
summary: "Backend tools contract docs sub-hub for tool domain/category enums, shared schema field factories, and typed tool-result container/helper construction semantics."
read_when:
  - When changing shared tool contracts in `backend/src/tools/{__init__,categorization,schema_fields,result_types,result_helpers}.py`.
  - When debugging schema description drift, tool-result object shape mismatches, or enum/domain contract regressions.
title: "Backend Tools Contracts Docs Hub"
---

# Backend Tools Contracts Docs Hub

## Deep Pages

- [Tool Domain and Category Enum Contract Reference](tool_domain_and_category_enum_contract_reference.md)
- [Schema Field Factory Explanation and Post-Action Wait Contract Reference](schema_field_factory_explanation_and_post_action_wait_contract_reference.md)
- [Tool Execution Result and Batch Dataclass Contract Reference](tool_execution_result_and_batch_dataclass_contract_reference.md)
- [Tool Result Helper Object Creation and Default Timing Contract Reference](tool_result_helper_object_creation_and_default_timing_contract_reference.md)
- [Tools Package Lazy Export and Runtime Import Contract Reference](tools_package_lazy_export_and_runtime_import_contract_reference.md)

## Related Pages

- [Backend Tools Docs Hub](../README.md)
- [Backend Tools Execution Docs Hub](../execution/README.md)
- [Backend Tools Processing Docs Hub](../processing/README.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)

## Code Scope

- `backend/src/tools/__init__.py`
- `backend/src/tools/categorization.py`
- `backend/src/tools/schema_fields.py`
- `backend/src/tools/result_types.py`
- `backend/src/tools/result_helpers.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/system/schemas.py`
- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/filesystem/schemas.py`
- `tests/backend/test_categorization.py`
- `tests/backend/test_result_helpers.py`
