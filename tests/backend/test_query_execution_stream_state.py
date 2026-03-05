from backend.src.api.services.query_execution_stream_state import QueryExecutionStreamState


def test_stream_state_observes_chunk_and_assistant_text() -> None:
    state = QueryExecutionStreamState()

    state.observe_texts(chunk_text="hello", assistant_full_text="")
    state.observe_texts(chunk_text="", assistant_full_text="full")

    assert state.saw_text_chunk is True
    assert state.text_chunks == ["hello"]
    assert state.last_assistant_full_text == "full"


def test_stream_state_marks_terminal_and_builds_completion_kwargs() -> None:
    state = QueryExecutionStreamState(
        saw_text_chunk=True,
        text_chunks=["a", "b"],
        last_assistant_full_text="final",
    )
    state.mark_terminal()

    kwargs = state.completion_kwargs(event={"type": "streaming-complete"}, event_type="streaming-complete")

    assert state.saw_terminal_event is True
    assert kwargs["event_type"] == "streaming-complete"
    assert kwargs["text_chunks"] == ["a", "b"]
    assert kwargs["assistant_full_text"] == "final"
    assert kwargs["saw_text_chunk"] is True
