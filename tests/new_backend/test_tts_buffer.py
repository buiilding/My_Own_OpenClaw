from backend.src.core.services.tts_buffer import SentenceBuffer


def test_tts_buffer_splits_sentences():
    buffer = SentenceBuffer()

    sentences = buffer.append("Hello world. Next")
    assert sentences == ["Hello world."]

    sentences = buffer.append(" sentence.")
    assert sentences == ["Next sentence."]


def test_tts_buffer_forced_split():
    buffer = SentenceBuffer(max_size=10)

    sentences = buffer.append("abcdefghijk")
    assert sentences == ["abcdefghij"]

    sentences = buffer.append(".")
    assert sentences == ["k."]
