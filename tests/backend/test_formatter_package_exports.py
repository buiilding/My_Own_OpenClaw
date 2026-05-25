"""Smoke tests for backend formatter package exports."""


def test_formatter_package_import_exports_public_classes():
    from backend.src.api.processing import formatters

    expected_exports = {
        "EventFormatter",
        "ThinkingEventFormatter",
        "ChunkEventFormatter",
        "ErrorEventFormatter",
        "StreamingCompleteEventFormatter",
        "ToolCallEventFormatter",
        "ToolOutputEventFormatter",
        "WebSearchProgressEventFormatter",
        "SystemPromptEventFormatter",
        "ToolSchemasEventFormatter",
        "UserMessageFullEventFormatter",
        "AssistantMessageFullEventFormatter",
        "ContextCompactionCompletedEventFormatter",
        "ContextCompactionFailedEventFormatter",
        "ContextCompactionStartedEventFormatter",
        "TokenCountEventFormatter",
        "MemoryStoreEventFormatter",
        "ToolBundleEventFormatter",
    }

    assert set(formatters.__all__) == expected_exports
    for export_name in expected_exports:
        assert getattr(formatters, export_name).__name__ == export_name
