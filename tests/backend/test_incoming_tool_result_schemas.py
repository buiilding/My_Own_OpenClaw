"""Covers incoming tool result schemas behavior in the backend test suite."""

import pytest
from pydantic import ValidationError

from backend.src.api.schemas.incoming import (
    ToolBundleResultPayload,
    ToolResultPayload,
)


def test_tool_result_payload_trims_request_id():
    payload = ToolResultPayload.model_validate(
        {
            "request_id": "  req-1  ",
            "success": True,
            "data": {"output": "ok"},
        }
    )

    assert payload.request_id == "req-1"


def test_tool_result_payload_rejects_whitespace_only_request_id():
    with pytest.raises(
        ValidationError, match="request_id cannot be empty or whitespace-only"
    ):
        ToolResultPayload.model_validate(
            {
                "request_id": " \t ",
                "success": True,
                "data": {"output": "ok"},
            }
        )


def test_tool_result_payload_rejects_non_string_request_id():
    with pytest.raises(ValidationError, match="request_id"):
        ToolResultPayload.model_validate(
            {
                "request_id": 123,
                "success": True,
                "data": {"output": "ok"},
            }
        )


def test_tool_result_payload_allows_extra_tool_specific_data_fields():
    payload = ToolResultPayload.model_validate(
        {
            "request_id": "req-with-extra",
            "success": True,
            "data": {
                "output": "ok",
                "tool_specific_metric": 42,
            },
        }
    )

    assert payload.data is not None
    assert payload.data.model_dump()["tool_specific_metric"] == 42


def test_tool_result_payload_accepts_typed_display_attachments():
    payload = ToolResultPayload.model_validate(
        {
            "request_id": "req-with-display-attachments",
            "success": True,
            "data": {
                "output": "ok",
                "display_attachments": [
                    {
                        "id": "attach-1",
                        "kind": "image",
                        "source": "tool_result",
                        "status": "ready",
                        "content_type": "image/png",
                        "screenshot_ref": "artifact-1.png",
                    }
                ],
            },
        }
    )

    assert payload.data.display_attachments is not None
    assert payload.data.display_attachments[0].screenshot_ref == "artifact-1.png"


def test_tool_result_payload_rejects_preview_fields_inside_display_attachments():
    with pytest.raises(ValidationError, match="previewSrc"):
        ToolResultPayload.model_validate(
            {
                "request_id": "req-preview-display-attachments",
                "success": True,
                "data": {
                    "output": "ok",
                    "display_attachments": [
                        {
                            "id": "attach-1",
                            "kind": "image",
                            "source": "tool_result",
                            "status": "ready",
                            "previewSrc": "data:image/png;base64,inline",
                        }
                    ],
                },
            }
        )


def test_tool_result_payload_rejects_data_url_display_attachment_urls():
    with pytest.raises(ValidationError, match="inline data URLs"):
        ToolResultPayload.model_validate(
            {
                "request_id": "req-data-url-display-attachments",
                "success": True,
                "data": {
                    "output": "ok",
                    "display_attachments": [
                        {
                            "id": "attach-1",
                            "kind": "image",
                            "source": "tool_result",
                            "status": "ready",
                            "screenshot_url": "data:image/png;base64,inline",
                        }
                    ],
                },
            }
        )


def test_tool_result_payload_rejects_unknown_capture_meta_fields():
    with pytest.raises(ValidationError, match="capture_meta"):
        ToolResultPayload.model_validate(
            {
                "request_id": "req-capture-extra",
                "success": True,
                "data": {
                    "output": "ok",
                    "capture_meta": {
                        "source_w": 1920,
                        "source_h": 1080,
                        "crop_x": 0,
                        "crop_y": 0,
                        "crop_w": 1920,
                        "crop_h": 1080,
                        "timestamp": 1700000000000,
                        "unexpected_field": "boom",
                    },
                },
            }
        )


def test_tool_bundle_result_payload_trims_bundle_id():
    payload = ToolBundleResultPayload.model_validate(
        {
            "bundle_id": "  bundle-1  ",
            "status": "success",
            "step_results": [],
        }
    )

    assert payload.bundle_id == "bundle-1"


def test_tool_bundle_result_payload_rejects_whitespace_only_bundle_id():
    with pytest.raises(
        ValidationError, match="bundle_id cannot be empty or whitespace-only"
    ):
        ToolBundleResultPayload.model_validate(
            {
                "bundle_id": "\n ",
                "status": "success",
                "step_results": [],
            }
        )


def test_tool_bundle_result_payload_rejects_missing_step_results():
    with pytest.raises(ValidationError, match="step_results"):
        ToolBundleResultPayload.model_validate(
            {
                "bundle_id": "bundle-no-steps",
                "status": "success",
            }
        )


def test_tool_bundle_result_payload_rejects_invalid_status():
    with pytest.raises(ValidationError, match="status"):
        ToolBundleResultPayload.model_validate(
            {
                "bundle_id": "bundle-bad-status",
                "status": "done",
                "step_results": [],
            }
        )


def test_tool_bundle_result_payload_accepts_typed_display_attachments():
    payload = ToolBundleResultPayload.model_validate(
        {
            "bundle_id": "bundle-with-display-attachments",
            "status": "success",
            "display_attachments": [
                {
                    "id": "bundle-attach-1",
                    "kind": "image",
                    "source": "tool_result",
                    "status": "ready",
                    "screenshot_ref": "bundle-artifact-1.png",
                }
            ],
            "step_results": [],
        }
    )

    assert payload.display_attachments is not None
    assert payload.display_attachments[0].screenshot_ref == "bundle-artifact-1.png"
