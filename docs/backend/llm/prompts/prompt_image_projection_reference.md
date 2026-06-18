---
summary: "Deep reference for backend prompt image projection: artifact refs stay in history, prompt construction resolves and bounds model-ready image payloads, and text/image size limits are enforced separately."
read_when:
  - When changing screenshot/image attachment handling for backend provider prompts.
  - When debugging multi-image prompt failures, `screenshot_ref`/`screenshot_refs`, prompt image byte limits, or multimodal prompt validation.
title: "Prompt Image Projection Reference"
---

# Prompt Image Projection Reference

## Contract

Query transport and stored history keep artifact-backed user images as refs:

- `screenshot_ref` / `screenshot_refs` are normalized during query input shaping.
- Artifact refs are stored on the user history row as `image_refs` plus owner metadata.

Provider prompt construction owns image hydration:

1. `PromptConstructor` reads stored `image_refs`.
2. It resolves each ref through `ArtifactStore.load_base64(...)` using the stored owner user id.
3. `PromptImageProjector` decodes, validates, resizes, and compresses the image when needed.
4. The provider-bound message receives bounded `image_url` data URLs.

Raw artifact bytes are not durable conversation truth. They are a prompt-time projection.

## Limits

Prompt images use explicit security limits:

- `max_prompt_images_per_message`
- `max_prompt_image_bytes`
- `max_prompt_image_dimension`

`max_message_content_size` applies to text content. Multimodal image bytes are validated by the prompt-image limits, then still contribute to the aggregate `max_prompt_size`.

## Failure Behavior

- Too many image refs raise a `prompt_image_count` size violation.
- Invalid or unbounded images raise prompt-image-specific size violations such as `prompt_image_decode` or `prompt_image_size`.
- Artifact-store initialization or per-ref load failures are warning-level and skip the unresolved image, preserving the existing non-fatal artifact-missing behavior.

## Tests

Focused coverage lives in:

- `tests/backend/test_prompt_constructor_utils.py`
- `tests/backend/test_query_execution_inputs.py`
- `tests/backend/test_api_handlers.py`
