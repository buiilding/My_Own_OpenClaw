"""
Frontend-Backend Communication Protocol

Handles JSON message serialization, compression, and the stdin/stdout protocol
between Electron (main process) and the Python sidecar.
"""

import json
import sys
import uuid
import zlib
from typing import Any, Dict, Optional
from dataclasses import dataclass


@dataclass
class Message:
    """Represents a message in the protocol."""
    id: str
    type: str  # 'request', 'response', 'error'
    payload: Dict[str, Any]
    compression: Optional[str] = None  # 'zlib' if data is compressed


class ProtocolError(Exception):
    """Protocol communication error."""
    pass


class FrontendProtocol:
    """
    Handles communication between Electron and Python sidecar via stdin/stdout.

    Protocol Format:
    - Messages are JSON objects with 4-byte length prefix (little-endian)
    - Compression is indicated by 'compression' field in message
    - All stdout output must be JSON to avoid breaking the protocol
    """

    def __init__(self):
        self._buffer = b""

    def send_message(self, message: Message) -> None:
        """
        Send a message to stdout with length prefix.

        Args:
            message: The message to send
        """
        try:
            # Convert message to dict
            msg_dict = {
                "id": message.id,
                "type": message.type,
                "payload": message.payload,
            }

            if message.compression:
                msg_dict["compression"] = message.compression

            # Serialize to JSON
            json_str = json.dumps(msg_dict)
            json_bytes = json_str.encode('utf-8')

            # Write length prefix (4 bytes, little-endian)
            length_bytes = len(json_bytes).to_bytes(4, byteorder='little')
            sys.stdout.buffer.write(length_bytes)
            sys.stdout.buffer.write(json_bytes)
            sys.stdout.buffer.flush()

        except Exception as e:
            # If sending fails, try to send error message
            self._send_error_message(f"Failed to send message: {str(e)}")

    def receive_message(self) -> Optional[Message]:
        """
        Read a message from stdin.

        Returns:
            Message object or None if no complete message available
        """
        try:
            # Read length prefix (4 bytes)
            length_bytes = sys.stdin.buffer.read(4)
            if not length_bytes or len(length_bytes) != 4:
                return None

            # Read message data
            length = int.from_bytes(length_bytes, byteorder='little')
            message_bytes = sys.stdin.buffer.read(length)
            if not message_bytes or len(message_bytes) != length:
                return None

            # Parse JSON
            msg_dict = json.loads(message_bytes.decode('utf-8'))

            # Reconstruct Message object
            message = Message(
                id=msg_dict["id"],
                type=msg_dict["type"],
                payload=msg_dict["payload"],
                compression=msg_dict.get("compression")
            )

            return message

        except json.JSONDecodeError as e:
            self._send_error_message(f"Invalid JSON received: {str(e)}")
            return None
        except Exception as e:
            self._send_error_message(f"Protocol error: {str(e)}")
            return None

    def _send_error_message(self, error_msg: str) -> None:
        """Send an error message (used for protocol errors)."""
        try:
            error_message = Message(
                id=str(uuid.uuid4()),
                type="error",
                payload={"error": error_msg}
            )
            self.send_message(error_message)
        except Exception:
            # If even error sending fails, write to stderr as last resort
            print(f"[PROTOCOL ERROR] {error_msg}", file=sys.stderr, flush=True)

    @staticmethod
    def compress_data(data: bytes) -> bytes:
        """
        Compress data using zlib.

        Args:
            data: Raw bytes to compress

        Returns:
            Compressed bytes
        """
        return zlib.compress(data)

    @staticmethod
    def decompress_data(data: bytes) -> bytes:
        """
        Decompress data using zlib.

        Args:
            data: Compressed bytes

        Returns:
            Decompressed bytes
        """
        return zlib.decompress(data)

    @staticmethod
    def create_request(tool_name: str, args: Dict[str, Any]) -> Message:
        """
        Create a tool execution request message.

        Args:
            tool_name: Name of the tool to execute
            args: Arguments for the tool

        Returns:
            Request message
        """
        return Message(
            id=str(uuid.uuid4()),
            type="request",
            payload={
                "tool": tool_name,
                "args": args
            }
        )

    @staticmethod
    def create_response(request_id: str, success: bool, data: Any = None, error: str = None) -> Message:
        """
        Create a response message.

        Args:
            request_id: ID of the request this responds to
            success: Whether the operation succeeded
            data: Response data (if success)
            error: Error message (if not success)

        Returns:
            Response message
        """
        payload = {"success": success}
        if success and data is not None:
            payload["data"] = data
        elif not success and error:
            payload["error"] = error

        return Message(
            id=request_id,
            type="response",
            payload=payload
        )

    def log(self, message: str) -> None:
        """
        Log a message to stderr (safe for protocol).

        Args:
            message: Message to log
        """
        print(f"[FRONTEND] {message}", file=sys.stderr, flush=True)