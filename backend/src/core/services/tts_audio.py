"""Audio chunk helpers for TTS."""
import base64
from typing import Any, Dict


def prepare_audio_data(audio_chunk) -> Dict[str, Any]:
    """Prepare audio chunk data for transmission."""
    return {
        "audio": base64.b64encode(audio_chunk.audio_int16_bytes).decode("utf-8"),
        "sample_rate": audio_chunk.sample_rate,
        "sample_width": audio_chunk.sample_width,
        "channels": audio_chunk.sample_channels,
    }


def send_audio_chunk(loop, audio_queue, audio_data: Dict[str, Any]) -> None:
    """Send audio chunk to async queue safely."""
    if loop and audio_queue:
        loop.call_soon_threadsafe(audio_queue.put_nowait, audio_data)
