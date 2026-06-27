---
summary: "Implementation plan for agent-managed self-configuration so users can change WindieOS behavior with natural language instead of manually toggling settings."
read_when:
  - Planning natural-language preference changes (for example TTS on/off, query screenshot attach on/off).
  - Extending renderer-managed config updates while keeping backend schema safety.
  - Designing safe self-edit limits for user-facing settings.
---

# WindieOS Self-Edit Config Plan

## Objective

Let users change WindieOS behavior by saying it directly in chat or voice, without opening Settings manually.

Examples:
- "I don't like you talking to me, stop talking." -> disable speech replies.
- "Talk again." -> enable speech replies.
- "Don't attach screenshots to my prompts." -> disable query screenshot attach.
- "Attach image by default." -> enable query screenshot attach.

## Baseline (Current Behavior)

- Config changes are currently UI-driven via dashboard toggles and model selectors.
- Renderer persists config to:
  - `localStorage` (`windieos-config`)
  - Electron disk config (`frontend-config.json` via `save-frontend-config`)
- Renderer syncs config to backend through `update-settings`.
- Backend only accepts an allowlisted settings schema (`UpdateSettingsPayload`).

Relevant files:
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/main/ipc.cjs`
- `backend/src/api/schemas/incoming.py`
- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`

## Scope

In scope:
- Natural-language settings edits for renderer-managed fields:
  - `speech_mode_enabled`
  - `include_query_screenshot`
  - (optional) `interaction_mode`
- Works from both dashboard chat and chat pill.
- Works from voice transcripts (same text pipeline).
- Confirmed persistence + backend sync identical to manual settings changes.

Out of scope:
- Editing protected/backend-only config (API keys, security limits, updater policy).
- Arbitrary file edits.
- Hidden autonomous config mutation without explicit user intent.

## Product Contract

1. User intent first.
- Windie changes settings only when user explicitly expresses a preference.

2. Safe allowlist only.
- Agent can only mutate fields already allowed by `configFilter` + backend `UpdateSettingsPayload`.

3. Observable behavior.
- Windie always confirms what changed, for example:
  - "Okay, I turned speech replies off."

4. Reversible.
- Each applied change can be undone with a direct command ("undo that setting change" / "turn it back on").

## Proposed Architecture

## Layer 1: Config Intent Resolver (deterministic)

Add a lightweight resolver that checks user text before normal query send:
- Input: `text`, current config.
- Output:
  - `matched: boolean`
  - `patch: Partial<FrontendConfig>`
  - `confidence`
  - `reason`

Initial implementation should be rule-based (phrase patterns) for high precision:
- stop talking / don't talk / no voice -> `speech_mode_enabled=false`
- talk / speak / read out loud -> `speech_mode_enabled=true`
- don't attach screenshot / no screenshot -> `include_query_screenshot=false`
- attach screenshot / include image -> `include_query_screenshot=true`

If no confident match: continue normal query path unchanged.

Suggested location:
- new resolver module under renderer settings feature (`intents/configIntentResolver.ts`)

## Layer 2: Unified Config Mutation Path

When resolver returns a patch:
- Apply through existing `updateConfig(...)` from `AppConfigProvider`.
- Do not bypass current persistence/sync path.
- Emit user-visible acknowledgement message in chat timeline.

This guarantees:
- Local storage write.
- Disk write.
- `update-settings` backend sync.

Suggested integration points:
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx` (helper export if needed)

## Layer 3: Optional Agent Tool Path (phase 2+)

After deterministic MVP is stable, add a structured tool for broader language:
- Tool name: `update_user_preferences`
- Schema: allowlisted fields + explicit target values only
- Validation: same allowlist, same persistence path

This keeps free-form language support while preserving schema safety.

## Safety and Abuse Controls

- Field allowlist hardcoded at resolver + backend schema level.
- Reject/ignore unknown config keys.
- Cooldown for repeated conflicting toggles in one turn.
- Require explicit confirmation for high-impact mode flips (if added later).
- Add telemetry/audit event: `config_intent_applied` with old/new values.

## UX Behavior

- On success:
  - Apply config immediately.
  - Show short confirmation text.
- On ambiguity:
  - Ask one follow-up ("Do you want me to disable speech replies?").
- On blocked request:
  - Explain boundary ("I can change speech/screenshot/voice settings, but not API keys from chat.").

## Implementation Plan

## Phase 0: Contract + Field Matrix

- Freeze v1 allowlist for NL config edits.
- Define command phrase matrix and precedence rules.
- Define acknowledgement/error copy style.

## Phase 1: Deterministic Resolver MVP

- Add resolver module + unit tests.
- Wire resolver into chat send pipeline (dashboard + pill + voice text path).
- Apply only for explicit, high-confidence matches.

## Phase 2: Persistence + Sync Verification

- Ensure resolver-applied patch uses existing `updateConfig` flow.
- Add tests proving localStorage, disk save, and `update-settings` send all happen.

## Phase 3: Chat UX + Undo

- Add acknowledgement responses.
- Add "undo last setting change" in-session action.
- Add simple history buffer for latest config deltas.

## Phase 4: Optional LLM Tool Expansion

- Add `update_user_preferences` tool contract for broader phrasing.
- Keep deterministic resolver first; tool path fallback only when safe.

## Test Plan

Frontend tests:
- Resolver unit tests (phrase -> exact config patch).
- Chat sender tests:
  - matched intent applies config and does not misroute payload.
  - unmatched intent remains normal query path.
- AppConfig tests:
  - resolver-triggered updates persist and sync exactly like manual toggle.

Backend tests:
- `update-settings` schema reject unknown fields.
- no regression for existing settings sync behavior.

Manual E2E checks:
- Dashboard chat: "stop talking" flips speech toggle off.
- Chat pill: "don't attach image" flips screenshot attach off.
- Voice transcript with same phrases performs identical updates.

## Rollout

- Feature flag: `self_edit_config_intents_enabled` (default off in first release).
- Internal dogfood first.
- Enable by default after false-positive rate is acceptable.

## Success Metrics

- % of settings changes performed via NL commands.
- False-positive config changes per 1k preference utterances.
- User retention of settings changes across restart.
- Reduction in manual settings navigation for common toggles.

## Dependencies

- Existing renderer config persistence plus backend settings sync pipeline.
- Existing `update-settings` schema contract.

## Cross References

- `docs/operations/configuration.md`
- `docs/planning/future_plan.md`
- `docs/architecture/frontend_architecture.md`
