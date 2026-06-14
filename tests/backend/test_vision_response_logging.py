"""Covers vision response logging behavior in the backend test suite."""

from backend.src.services.vision.providers.internvl_runtime_helpers import (
    build_response_log_metadata,
    log_vision_response_metadata,
    run_chat_generation,
)


class _CapturingLogger:
    def __init__(self) -> None:
        self.messages: list[str] = []

    def info(self, message, *args):
        self.messages.append(message % args if args else message)

    def warning(self, message, *args):
        self.messages.append(message % args if args else message)


class _FakeInternVLModel:
    def __init__(self, response: str) -> None:
        self.response = response

    def chat(self, *_args, **_kwargs):
        return self.response


def test_vision_response_log_metadata_excludes_raw_response_text() -> None:
    secret_response = "SECRET_SCREEN_TEXT [[100, 200, 300, 400]]"
    logger = _CapturingLogger()

    response_length, response_hash = log_vision_response_metadata(
        logger,
        "test vision response",
        secret_response,
    )

    assert response_length == len(secret_response)
    assert response_hash == build_response_log_metadata(secret_response)[1]
    assert logger.messages == [
        f"test vision response received (length={response_length}, sha256={response_hash})"
    ]
    assert secret_response not in logger.messages[0]
    assert "SECRET_SCREEN_TEXT" not in logger.messages[0]


def test_run_chat_generation_logs_only_response_metadata() -> None:
    secret_response = "PRIVATE_WINDOW_TITLE [[10, 20, 30, 40]]"
    logger = _CapturingLogger()

    response = run_chat_generation(
        model=_FakeInternVLModel(secret_response),
        tokenizer=object(),
        pixel_values=object(),
        question="<image>\nwhere is the private button?",
        num_patches_list=[1],
        generation_config={"max_new_tokens": 128},
        logger_instance=logger,
    )

    assert response == secret_response
    assert logger.messages
    assert "PRIVATE_WINDOW_TITLE" not in "\n".join(logger.messages)
    assert "sha256=" in logger.messages[0]
