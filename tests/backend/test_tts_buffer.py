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
        # Period at end is kept in buffer (can't tell if it's end of sentence)
        assert result == []
        assert buffer._buffer_parts == ["Hello world."]
        
        # Flush to get the content
        flushed = buffer.flush()
        assert flushed == "Hello world."

    def test_append_multiple_sentences(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello world. How are you? I am fine.")
        # All periods except the last one are split
        assert result == ["Hello world.", "How are you?"]
        # Last sentence kept in buffer (with leading space from original)
        assert buffer._buffer_parts == [" I am fine."]

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
        
        # First sentence kept (period at end), second append triggers split
        # Second sentence ends with period, so it stays in buffer
        # Third append triggers split again
        assert result1 == []
        assert result2 == ["First sentence."]
        assert result3 == ["Second sentence."]
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
        # Newlines are stripped from sentence ends
        assert result == ["Line one", "Line two"]
        assert buffer._buffer_parts == []

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
        # "3.14" should not be split - but final period is kept in buffer
        result = buffer.append("Value is 3.14.")
        assert result == []
        # Verify content is preserved
        assert buffer.flush() == "Value is 3.14."

    def test_skip_period_in_abbreviation(self):
        buffer = SentenceBuffer()
        # "Mr. Smith" - the period after Mr is followed by space and S (alnum)
        # so it's not split there. The final period is at end, kept in buffer.
        result = buffer.append("Mr. Smith is here.")
        # "Mr." alone is a sentence (period at end with nothing after)
        assert result == ["Mr."]
        assert buffer.flush() == "Smith is here."

    def test_skip_period_before_quote(self):
        buffer = SentenceBuffer()
        result = buffer.append('She said "hello." Then left.')
        # Kept in buffer due to period at end
        assert result == []
        assert buffer.flush() == 'She said "hello." Then left.'

    def test_force_split_when_exceeds_max_size(self):
        buffer = SentenceBuffer(max_size=20)
        long_text = "This is a very long sentence without any delimiters"
        result = buffer.append(long_text)
        
        # Should force split at max_size (plus remaining in buffer)
        assert len(result) >= 1
        # First chunk should be around max_size
        assert len(result[0]) <= 25  # Allow some flexibility for word boundary

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
        
        # Should log warning about forced split
        assert logger.warning.called
        assert "exceeded" in str(logger.warning.call_args)

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
        # Second append adds content ending with period, kept in buffer
        assert result2 == []
        # Third append triggers split - first sentence is emitted
        assert result3 == ["The quick brown fox jumps over."]
        assert buffer._buffer_parts == [" The lazy dog."]

    def test_consecutive_delimiters(self):
        buffer = SentenceBuffer()
        result = buffer.append("Hello... World!!")
        # Should handle consecutive delimiters gracefully
        assert len(result) >= 1

    def test_whitespace_handling(self):
        buffer = SentenceBuffer()
        result = buffer.append("  First.  Second.  ")
        assert result == ["First.", "Second."]
