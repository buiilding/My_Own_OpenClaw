---
summary: "Frontend main testing docs sub-hub for shell-tool harness behavior and deterministic mock-memory data seeding entrypoints for dashboard demos."
read_when:
  - When changing `frontend/src/main/test_shell.cjs` behavior or sidecar shell/process tool contracts used by local shell harness work.
  - When changing `frontend/src/main/python/dev_seed_mock_memory.py` or frontend npm scripts that seed demo memory data.
title: "Frontend Main Testing Docs Hub"
---

# Frontend Main Testing Docs Hub

## Deep Pages

- [Shell Tool Chrome Command Test Harness Runtime Reference](shell_tool_chrome_command_test_harness_runtime_reference.md)
- [Frontend Main Testing Data-Seed Docs Hub](data_seed/README.md)
- [Mock Memory Seed Script and NPM Entrypoints Reference](data_seed/mock_memory_seed_script_and_npm_entrypoints_reference.md)

## Related Pages

- [Frontend Main Docs Hub](../README.md)
- [Sidecar Shell and Process Session Runtime Reference](../../sidecar/tools/shell_and_process_session_runtime_reference.md)

## Code Scope

- `frontend/src/main/test_shell.cjs`
- `frontend/src/main/python/tools/system/shell_tool.py`
- `frontend/src/main/python/tools/system/process_tool.py`
- `frontend/src/main/python/dev_seed_mock_memory.py`
- `frontend/package.json` (`mock-memory-data`, `electron:mock-memory-data`)
