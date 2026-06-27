---
summary: "ADR 004 for the WindieOS browser extension auto-attach boundary, keeping current dedicated-browser CDP behavior separate from future extension-mode attachment."
read_when:
  - When changing browser launch, attach, dedicated profile, browser extension, or browser session ownership behavior.
  - When deciding whether browser automation should attach to arbitrary user browser sessions or remain in the dedicated browser runtime.
title: "ADR 004: Browser Extension Auto-Attach Boundary"
---

# ADR 004: Browser Extension Auto-Attach Boundary

## Status

Proposed. Current implementation remains dedicated browser control through local-runtime browser execution and CDP profile ownership.

## Context

WindieOS browser automation currently relies on a dedicated browser runtime:

- dedicated browser profile
- local-runtime Python Browser Use adapter
- desktop CDP launch/connect flow
- strict backend/local-runtime browser action schema
- explicit browser availability/permission checks

Some future product ideas involve a browser extension that could auto-attach to an existing user browser session. That would change the trust model because the extension would operate inside a user-managed browser profile with ambient cookies, extensions, and tabs.

## Decision

Do not treat extension auto-attach as current browser behavior.

Current behavior:

- keep dedicated browser runtime and profile ownership
- use Browser Use through the local-runtime Python adapter
- prefer installed Chrome/Chromium-family browsers through the fixed detection priority
- keep browser action execution in the local-runtime browser stack

Future extension mode, if implemented, must be designed as a separate capability with its own:

- permission and consent model
- profile/tab selection model
- extension install/update flow
- host messaging protocol
- security review and audit trail
- tests for accidental attachment to the wrong browser/profile/tab

## Alternatives Considered

| Alternative | Reason not chosen now |
| --- | --- |
| auto-attach to any user Chrome profile | too much ambient authority and unclear consent boundary |
| replace dedicated browser runtime with extension-only control | would remove current predictable CDP/profile behavior |
| support both without separate mode policy | risk of hidden profile/cookie access and difficult debugging |

## Consequences

- Browser docs should describe dedicated runtime behavior as current.
- Extension attachment docs must stay in planning/ADR language until code, permissions, and tests exist.
- Browser troubleshooting should debug local-runtime browser execution, CDP, profile, and browser availability before extension assumptions.

## Validation And Docs Impact

When extension mode is implemented:

- update [Browser Hub](../browser/README.md)
- update [Browser Troubleshooting](../browser/browser_troubleshooting.md)
- update [Security Boundary Matrix](../security/security_boundary_matrix.md)
- add local-runtime/browser extension protocol tests
- add permission/onboarding docs for extension mode
