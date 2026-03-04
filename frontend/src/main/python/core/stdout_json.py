"""
Shared JSON line writer for sidecar stdout protocols.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from core.unicode_sanitizer import sanitize_surrogates


def write_json_line(payload: Any) -> None:
    """
    Serialize a payload as one UTF-8 JSON line and flush stdout.

    This keeps sidecar protocol writes consistent across JSON-RPC and
    lightweight line-based services.
    """
    sanitized_payload = sanitize_surrogates(payload)
    response_json = json.dumps(sanitized_payload, ensure_ascii=False)
    response_bytes = (response_json + "\n").encode("utf-8")
    sys.stdout.buffer.write(response_bytes)
    sys.stdout.buffer.flush()
