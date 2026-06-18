"""Tests for backend client prompt-layer validation helpers."""

from backend.src.agent.session.prompt_layers import (
    prompt_layer_id_sample,
    prompt_layer_rejected_reason_sample,
    validate_client_prompt_layers,
)


def test_validate_client_prompt_layers_sorts_accepts_and_samples_layers():
    result = validate_client_prompt_layers(
        [
            {
                "id": "review",
                "type": "agent-md",
                "priority": 50,
                "content": "Review carefully.",
                "revision": "b",
            },
            {
                "id": "repo",
                "type": "agent-md",
                "priority": 10,
                "content": "Use repo rules.",
                "source_path": "AGENTS.md",
            },
            {
                "id": "review",
                "type": "agent-md",
                "priority": 50,
                "content": "Duplicate.",
                "revision": "b",
            },
            {"type": "agent-md", "content": "Missing id."},
        ]
    )

    assert result.accepted == [
        {
            "id": "repo",
            "type": "agent-md",
            "priority": 10,
            "content": "Use repo rules.",
            "source_path": "AGENTS.md",
        },
        {
            "id": "review",
            "type": "agent-md",
            "priority": 50,
            "content": "Review carefully.",
            "revision": "b",
        },
    ]
    assert result.rejected == [
        {"name": "review", "reason": "duplicate prompt layer"},
        {"name": "index:3", "reason": "id is required"},
    ]
    assert prompt_layer_id_sample(result.accepted) == ["repo", "review"]
    assert prompt_layer_rejected_reason_sample(result.rejected, limit=1) == [
        {"name": "review", "reason": "duplicate prompt layer"}
    ]
