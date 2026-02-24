---
summary: "Backend tools security docs sub-hub for core permission checks, audit-log sanitization/concurrency guards, and tool-executor registry isolation contracts."
read_when:
  - When changing `backend/src/core/security/*` policy or executor behavior.
  - When hardening tool execution boundaries with explicit permissions, path controls, audit retention, or sandbox executor selection.
title: "Backend Tools Security Docs Hub"
---

# Backend Tools Security Docs Hub

## Deep Pages

- [Policy Permissions, Audit Sanitization, and Executor Registry Reference](policy_permissions_audit_and_executor_registry_reference.md)

## Code Scope

- `backend/src/core/security/policy.py`
- `backend/src/core/security/executor.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/remote_tools/base.py`
