---
summary: "Grounding and OpenAI Responses refactor TODO (2026-03-08)"
read_when:
  - When refactoring grounded computer-use schemas and coordinate preparation.
  - When reducing drift between backend computer tool contracts, sidecar payloads, and dashboard transparency behavior.
  - When restructuring the OpenAI Responses runtime for provider-native reasoning and tool replay safety.
---

# Grounding and OpenAI Responses Refactor TODO (2026-03-08)

## Goals

- Collapse duplicated grounding-schema definitions for `mouse_control` and `scroll_control`.
- Separate generic grounded-source preparation from mouse-only drag-destination handling.
- Centralize grounded-tool capability policy so preparation logic stops branching on raw tool names in multiple places.
- Add parity coverage that proves backend-prepared computer tool payloads still match sidecar runtime expectations.
- Make tool-schema transparency state explicit at the conversation level instead of attaching it only to the first user message.
- Break `openai_responses_runtime.py` into smaller helpers for input shaping, stream normalization, and final payload assembly.

## Planned slices

1. Shared grounding schema builders
- Extract reusable source-grounding Pydantic mixins/validators for backend computer tool schemas.
- Extract reusable JSON-schema property/rule builders for unified `computer_use`.

2. Preparation split
- Keep `preparation_helper.py` as the public facade.
- Move generic grounded-source normalization into a dedicated helper module.
- Move mouse drag destination resolution/normalization into a mouse-specific helper module.
- Centralize grounded-tool policy in one importable module.

3. Contract parity tests
- Add focused parity coverage that backend-prepared `mouse_control` and `scroll_control` payloads validate against sidecar schemas.
- Keep the test at the payload/capability level, not raw schema-file equality.

4. Dashboard tool-schema transparency cleanup
- Stop storing tool schemas only on the first user row.
- Model them as conversation-level transparency state so later turns do not look like schemas disappeared.

5. OpenAI Responses cleanup
- Split input-item building, tool replay normalization, stream event normalization, and final payload extraction into smaller helpers.
- Keep current provider-native reasoning behavior unchanged while reducing adapter fragility.

## Constraints

- Do not touch `backend/src/llm/prompts/system_prompt.txt` in this refactor.
- Ignore unrelated workspace dirt in `.audit/plan1/jscpd-report/jscpd-report.md`.
- Ship docs and focused tests with each behavior-affecting slice.
