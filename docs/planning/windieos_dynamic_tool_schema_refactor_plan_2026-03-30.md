---
summary: "Refactor plan for dynamic model-facing tool schema generation with one canonical tool catalog, wrapper-aware filtering, and removal of post-hoc schema rewrites."
read_when:
  - Refactoring backend tool schema generation or tool registry architecture.
  - Designing dynamic add/remove behavior for model-facing tools.
  - Eliminating prompt-time schema drift between registry, policy, parser validation, and provider transport.
title: "Dynamic Tool Schema Refactor Plan (2026-03-30)"
---

# Dynamic Tool Schema Refactor Plan (2026-03-30)

## Summary

Refactor backend tool schema generation so the model-facing tool surface comes from one canonical runtime catalog instead of being assembled through multiple hard-coded layers. The new design must make tool addition and removal declarative:

- adding a tool means defining it once in the catalog
- disabling tools means applying one allowlist or policy pass over that catalog
- model-facing schemas must not be rewritten after the supposed source schema has already been defined

This is a backend-first refactor. It keeps backend ownership of model-facing schema generation and does not implement the planned frontend-sourced tool catalog sync in the same change.

Follow-up note:

- if the individual-tool plan in `docs/planning/windieos_production_prompt_and_individual_tool_contract_plan_2026-03-30.md` is adopted, that later plan supersedes this document's wrapper-preservation assumption

## Current Problems

Current model-facing tool schemas are fragmented across:

- backend remote-tool registration maps
- sidecar exposed-tool sets
- wrapper membership enums and routing maps
- static unified wrapper schema files
- prompt-time policy filters
- browser-specific schema mutation logic

This creates several concrete issues:

1. Adding a tool is not define-once. Multiple backend and sidecar surfaces must be updated manually.
2. Wrapper tools (`computer_use`, `system_use`) are not generated from the real tool catalog. They are replaced by static canonical dicts.
3. Some policy logic operates on direct tool schemas even though the model sees only wrapper schemas.
4. Browser model-facing schemas are derived by mutating a larger compatibility schema after generation rather than by building the intended model-facing contract directly.
5. Parser whitelist behavior, prompt injection, transparency events, and provider transport are coupled by convention instead of one deterministic schema pipeline.

## Goals

1. Introduce one canonical backend tool catalog for all LLM-callable tool metadata.
2. Generate model-facing schemas from that catalog, including wrappers.
3. Apply filtering before final schema assembly so allowlists automatically change wrapper contents.
4. Ensure prompt injection, parser validation, available-tool reporting, transparency events, and provider payloads all use the same filtered schema output.
5. Remove post-hoc schema rewrite layers from the model-facing path.

## Non-Goals

1. Do not implement frontend-sourced session tool catalogs in this refactor.
2. Do not remove wrapper UX (`computer_use`, `system_use`) in this refactor.
3. Do not change outward provider tool payload shape from canonical OpenAI/LiteLLM function-tool objects.
4. Do not remove runtime compatibility handling for legacy browser aliases unless that is separately approved.

## Proposed Design

### 1. Canonical backend tool catalog

Create one backend catalog abstraction that owns every LLM-callable tool definition.

Each entry should include:

- `public_name`
- `executor_name`
- `args_model`
- `wrapper_group` (`computer_use`, `system_use`, or none)
- `model_visible`
- `enabled_by_default`
- optional `policy_tags` for future grouping without name-set duplication

This catalog becomes the only source of truth for:

- tool registration
- model-facing schema generation
- wrapper membership
- parser whitelist generation
- available-tool listing
- backend/sidecar parity exports

Replace manual registry-driven name sets with catalog-derived data wherever possible.

### 2. Wrapper schemas generated from the catalog

Remove the static canonical replacement pattern for `computer_use` and `system_use`.

Instead:

- wrapper schema builders derive wrapper member enums from current catalog entries
- wrapper `arguments.oneOf` variants are built from current member tool schemas
- wrapper-only fields such as `metadata` and top-level `explanation` remain owned by wrapper builders
- runtime dispatch for wrapper subtools is derived from the same wrapper-member definitions used for schema generation

This ensures schema exposure and runtime dispatch cannot drift.

### 3. One deterministic model-facing schema pipeline

Define a single pipeline:

1. load canonical tool catalog
2. resolve wrapper and member relationships
3. generate canonical model-facing schemas
4. apply runtime allowlist or denylist filtering
5. validate canonical tool-object shape
6. hand the identical result to prompt injection, transparency events, parser whitelist, and provider transport

`ToolRegistry.get_function_declarations()` should return already-final model-facing schemas. It should not return raw tool schemas that are later swapped for other objects.

### 4. Filtering becomes wrapper-aware

Filtering must happen at catalog-entry level before wrapper schema assembly.

That means:

- allowlisting `mouse_control` yields a `computer_use` wrapper containing only mouse
- allowlisting `read_file` yields a `system_use` wrapper containing only read_file
- disabling all members of a wrapper removes that wrapper schema entirely
- mouse coordinate-method filtering must target the mouse variant inside generated `computer_use`, not only a direct `mouse_control` schema

### 5. Remove post-hoc model-facing schema mutation

Browser must stop relying on schema pruning after `get_json_schema()` has already produced a broader compatibility schema.

Split browser schema concerns into:

- backend-accepted compatibility schema for parser and runtime validation
- model-facing canonical schema built directly for LLM use

The model-facing browser schema should be constructed from canonical browser action metadata, not by generating a superset schema and then removing fields afterward.

Apply the same rule to future tools: no broad compatibility schema followed by model-facing pruning.

### 6. Real runtime allowlist support

Generalize current tool allowlisting into a real config-backed facility rather than a hard-coded `interaction_mode == "chat"` branch.

Keep chat-mode defaults by expressing them as a default profile or config-derived allowlist, not inline code.

The same filtered result must drive:

- prompt schemas
- parser whitelist behavior
- available-tool capability listings
- startup service gating where applicable

## Implementation Outline

### Phase 1: Introduce the canonical catalog

- add a new catalog module for backend LLM-callable tools
- move remote tool metadata into catalog entries
- make backend registry instantiate tools by iterating the catalog
- export catalog-derived public tool names for parity tests and sidecar checks

### Phase 2: Replace static wrapper schema replacement

- remove static unified wrapper schema files as final-source artifacts
- add wrapper builders that derive tool enums and argument variants from catalog members
- update wrapper execution routing to consume the same wrapper-member metadata

### Phase 3: Unify filtering and prompt-path generation

- refactor policy logic to filter catalog entries before final schema assembly
- make prompt constructor, transparency event emission, parser whitelist generation, and provider transport all consume the same final schema list
- remove duplicated legacy-name normalization sets where catalog metadata already provides that relationship

### Phase 4: Separate browser compatibility from model-facing schema generation

- define canonical browser action metadata for model-facing schema generation
- keep compatibility validation for runtime-only alias handling
- remove browser-specific post-generation pruning from the model-facing path

### Phase 5: Replace hard-coded interaction allowlist behavior

- introduce config-backed allowlist selection that is not limited to one hard-coded chat-mode branch
- preserve current chat behavior by expressing it as a default allowlist profile

## Tests

Add or update tests for the following scenarios:

### Catalog and registration

- adding a new catalog tool automatically appears in generated model-facing schemas without editing registry filter code
- disabling a catalog tool removes it from generated schemas and parser whitelist
- backend/sidecar parity test reads exported catalog metadata rather than separate hard-coded name sets

### Wrapper generation

- `computer_use` enum and `arguments.oneOf` variants derive from filtered member tools
- `system_use` enum and `arguments.oneOf` variants derive from filtered member tools
- wrappers disappear when they have zero enabled members

### Policy and filtering

- allowlisting only `mouse_control` still produces a wrapper-visible `computer_use` schema with only mouse
- allowlisting only `read_file` still produces a wrapper-visible `system_use` schema with only read_file
- mouse coordinate-method filtering prunes the mouse variant inside `computer_use`
- prompt constructor, parser whitelist, and available-tool listings all reflect the same filtered result

### Browser

- canonical browser model-facing schema includes only canonical actions and fields by construction
- compatibility-only aliases remain accepted at runtime when intended, but never appear in emitted tool schemas

### Integration

- transparency `tool-schemas` event payload matches provider `tools` payload
- schema cache invalidates when catalog-derived output changes
- restricted sub-agent tool registries still produce correct wrapper-aware filtered schemas

## Assumptions and Defaults

- Backend remains the authority for model-facing schema generation in this refactor.
- Existing wrapper tool names remain unchanged.
- This is intended as a behavior-preserving architectural refactor except where it fixes real drift between current policy logic and actual model-facing schemas.
- If needed, this work can land in two PRs:
  - PR 1: canonical catalog plus wrapper-aware schema generation and filtering
  - PR 2: browser canonical model-facing schema generation and removal of remaining post-hoc schema mutation
