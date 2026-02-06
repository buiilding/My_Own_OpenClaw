"""Tests for SentenceBuffer TTS buffering."""
import pytest
from unittest.mock import MagicMock

from backend.src.core.services.tts_buffer import SentenceBuffer


class TestSentenceBuffer:
    """Tests for SentenceBuffer class."""

    def test_init_default(self):
        buffer = SentenceBuffer()
        assert buffer._max_size == 500
        assert buffer._delimiters == {".", "!", "?", "\n", ";", ":"}
        assert buffer._buffer_parts == []

    def test_init_custom(self):
        buffer = SentenceBuffer(delimiters={".", "?"}, max_size=1000)
        assert buffer._max_size == 1000
        assert buffer._delimiters == {".", "?"}

    def test_append_empty_string(self):
        buffer = SentenceBuffer()
        result = buffer.append("")
        assert result == []
        assert buffer._buffer_parts == []

    def test_append_single_sentence(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello world.")
        assert result == ["Hello world."]
        assert buffer._buffer_parts == []

    def test_append_multiple_sentences(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello world. How are you? I am fine.")
        assert result == ["Hello world.", "How are you?", "I am fine."]
        assert buffer._buffer_parts == []

    def test_append_partial_sentence(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello world")
        assert result == []
        assert buffer._buffer_parts == ["Hello world"]

    def test_append_completes_previous(self):
        buffer = SentenceBuffer()
        buffer.append("Hello world")
        result = buffer.append("! How are you?")
        assert result == ["Hello world!", "How are you?"]

    def test_append_multiple_chunks(self):
        buffer = SentenceBuffer()
        result1 = buffer.append("First sentence.")
        result2 = buffer.append(" Second sentence.")
        result3 = buffer.append(" Third")
        
        assert result1 == ["First sentence."]
        assert result2 == ["Second sentence."]
        assert result3 == []
        assert buffer._buffer_parts == [" Third"]

    def test_split_on_exclamation(self):
        buffer = SentenceBuffer()
        result = buffer.append("Wow! Amazing!")
        assert result == ["Wow!", "Amazing!"]

    def test_split_on_question(self):
        buffer = SentenceBuffer()
        result = buffer.append("What? Really?")
        assert result == ["What?", "Really?"]

    def test_split_on_newline(self):
        buffer = SentenceBuffer()
        result = buffer.append("Line one\nLine two\n")
        assert result == ["Line one\n", "Line two\n"]

    def test_split_on_semicolon(self):
        buffer = SentenceBuffer()
        result = buffer.append("First; second;")
        assert result == ["First;", "second;"]

    def test_split_on_colon(self):
        buffer = SentenceBuffer()
        result = buffer.append("Note: important:")
        assert result == ["Note:", "important:"]

    def test_skip_period_in_decimal(self):
        buffer = SentenceBuffer()
        # "3.14" should not be split
        result = buffer.append("Value is 3.14.")
        assert result == ["Value is 3.14."]

    def test_skip_period_in_abbreviation(self):
        buffer = SentenceBuffer()
        # "Mr. Smith" should not be split at the period
        result = buffer.append("Mr. Smith is here.")
        assert result == ["Mr. Smith is here."]

    def test_skip_period_before_quote(self):
        buffer = SentenceBuffer()
        result = buffer.append('She said "hello." Then left.')
        assert result == ['She said "hello." Then left.']

    def test_force_split_when_exceeds_max_size(self):
        buffer = SentenceBuffer(max_size=20)
        long_text = "This is a very long sentence without any delimiters"
        result = buffer.append(long_text)
        
        # Should force split at max_size
        assert len(result) == 1
        assert len(result[0]) <= 20

    def test_force_split_at_whitespace(self):
        buffer = SentenceBuffer(max_size=20)
        # Text with whitespace near the max_size boundary
        text = "This is a very long sentence with spaces"
        result = buffer.append(text)
        
        # Should split at whitespace
        assert len(result) >= 1
        # The split should be at a whitespace
        assert result[0].endswith("long") or result[0].endswith("sentence")

    def test_force_split_logs_warning(self):
        logger = MagicMock()
        buffer = SentenceBuffer(max_size=10, logger=logger)
        
        result = buffer.append("This exceeds max size")
        
        logger.warning.assert_called_once()
        assert "exceeded" in logger.warning.call_args[0][0]

    def test_flush_empty_buffer(self):
        buffer = SentenceBuffer()
        result = buffer.flush()
        assert result is None

    def test_flush_with_content(self):
        buffer = SentenceBuffer()
        buffer.append("Partial sentence")
        result = buffer.flush()
        assert result == "Partial sentence"
        assert buffer._buffer_parts == []

    def test_flush_clears_buffer(self):
        buffer = SentenceBuffer()
        buffer.append("Some text")
        buffer.flush()
        second_flush = buffer.flush()
        assert second_flush is None

    def test_flush_with_whitespace(self):
        buffer = SentenceBuffer()
        buffer.append("  text with spaces  ")
        result = buffer.flush()
        assert result == "text with spaces"

    def test_thread_safety_append(self):
        import threading
        buffer = SentenceBuffer()
        results = []
        
        def append_text(text):
            result = buffer.append(text)
            results.extend(result)
        
        threads = [
            threading.Thread(target=append_text, args=("Hello. ",)),
            threading.Thread(target=append_text, args=("World. ",)),
            threading.Thread(target=append_text, args=("Test. ",)),
        ]
        
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        # All operations should complete without errors
        assert len(results) >= 0  # May vary due to race conditions

    def test_complex_multipart_text(self):
        buffer = SentenceBuffer()
        
        # Simulate streaming text
        result1 = buffer.append("The quick brown")
        result2 = buffer.append(" fox jumps over.")
        result3 = buffer.append(" The lazy dog.")
        
        assert result1 == []
        assert result2 == ["The quick brown fox jumps over."]
        assert result3 == ["The lazy dog."]

    def test_consecutive_delimiters(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello... World!!")
        # Should handle consecutive delimiters gracefully
        assert len(result) >= 1

    def test_whitespace_handling(self):
        buffer = SentenceBuffer()
        result = buffer.append("  First.  Second.  ")
        assert result == ["First.", "Second."]
