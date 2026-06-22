"""Helpers for transcription audio frame parsing and resampling."""

from __future__ import annotations

import base64
import json

import numpy as np

DEFAULT_SAMPLE_RATE = 16000


def parse_gateway_audio_frame(frame: bytes) -> tuple[int, bytes]:
    """Parse a gateway-framed metadata + PCM16 audio payload."""
    if len(frame) < 4:
        raise ValueError("Audio frame is too short to contain metadata length")

    metadata_length = int.from_bytes(frame[:4], byteorder="little")
    metadata_end = 4 + metadata_length
    if len(frame) < metadata_end:
        raise ValueError("Audio frame metadata is truncated")

    metadata_bytes = frame[4:metadata_end]
    metadata = {}
    if metadata_bytes:
        try:
            metadata = json.loads(metadata_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Audio frame metadata is invalid JSON") from exc

    sample_rate = int(metadata.get("sampleRate") or DEFAULT_SAMPLE_RATE)
    audio_bytes = frame[metadata_end:]
    return sample_rate, audio_bytes


def build_gateway_audio_frame(audio_bytes: bytes, sample_rate: int) -> bytes:
    """Build the gateway-compatible audio frame for proxy providers."""
    metadata = json.dumps({"sampleRate": int(sample_rate)}).encode("utf-8")
    return len(metadata).to_bytes(4, byteorder="little") + metadata + audio_bytes


def resample_pcm16_mono(audio_bytes: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Resample signed PCM16 mono audio with linear interpolation."""
    if not audio_bytes or src_rate <= 0 or dst_rate <= 0 or src_rate == dst_rate:
        return audio_bytes
    if len(audio_bytes) % 2 != 0:
        raise ValueError("PCM16 audio byte length must be even")

    source = np.frombuffer(audio_bytes, dtype=np.int16)
    if source.size == 0:
        return audio_bytes

    source_float = source.astype(np.float32)
    target_length = max(int(round(source.size * (dst_rate / src_rate))), 1)
    if target_length == source.size:
        return audio_bytes

    source_positions = np.arange(source.size, dtype=np.float32)
    target_positions = np.linspace(0, source.size - 1, target_length, dtype=np.float32)
    resampled = np.interp(target_positions, source_positions, source_float)
    clipped = np.clip(np.round(resampled), -32768, 32767).astype(np.int16)
    return clipped.tobytes()


def encode_audio_base64(audio_bytes: bytes) -> str:
    """Encode raw PCM bytes for OpenAI Realtime input_audio_buffer.append."""
    return base64.b64encode(audio_bytes).decode("ascii")
