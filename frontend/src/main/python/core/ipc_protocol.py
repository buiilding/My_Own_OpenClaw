"""
JSON-RPC Protocol Handler for Local Backend.

Handles JSON-RPC 2.0 protocol over stdin/stdout for communication
with Electron main process.
"""

import json
import logging
import sys
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class JSONRPCError(Exception):
    """JSON-RPC error exception."""
    
    def __init__(self, code: int, message: str, data: Optional[Any] = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)


class JSONRPCProtocol:
    """
    JSON-RPC 2.0 protocol handler.
    
    Handles request/response protocol over stdin/stdout.
    """
    
    # Standard JSON-RPC error codes
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    
    def __init__(self):
        self.methods: Dict[str, callable] = {}
    
    def register_method(self, name: str, handler: callable) -> None:
        """Register a method handler."""
        self.methods[name] = handler
        logger.debug(f"Registered method: {name}")
    
    def create_request(self, method: str, params: Optional[Dict[str, Any]] = None, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a JSON-RPC request."""
        request = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params:
            request["params"] = params
        if request_id:
            request["id"] = request_id
        return request
    
    def create_response(self, request_id: Any, result: Any = None, error: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a JSON-RPC response."""
        response = {"jsonrpc": "2.0"}
        if request_id is not None:
            response["id"] = request_id
        
        if error:
            response["error"] = error
        else:
            response["result"] = result
        
        return response
    
    def create_error_response(self, request_id: Any, code: int, message: str, data: Optional[Any] = None) -> Dict[str, Any]:
        """Create an error response."""
        error = {
            "code": code,
            "message": message
        }
        if data is not None:
            error["data"] = data
        return self.create_response(request_id, error=error)
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle a JSON-RPC request.
        
        Returns a JSON-RPC response.
        """
        # Validate JSON-RPC version
        if request.get("jsonrpc") != "2.0":
            return self.create_error_response(
                request.get("id"),
                self.INVALID_REQUEST,
                "Invalid JSON-RPC version. Must be '2.0'"
            )
        
        # Get method name
        method_name = request.get("method")
        if not method_name:
            return self.create_error_response(
                request.get("id"),
                self.INVALID_REQUEST,
                "Method name is required"
            )
        
        # Get method handler
        handler = self.methods.get(method_name)
        if not handler:
            return self.create_error_response(
                request.get("id"),
                self.METHOD_NOT_FOUND,
                f"Method not found: {method_name}"
            )
        
        # Get params
        params = request.get("params", {})
        if not isinstance(params, dict):
            return self.create_error_response(
                request.get("id"),
                self.INVALID_PARAMS,
                "Params must be an object"
            )
        
        # Call handler
        request_id = request.get("id")
        try:
            if callable(handler):
                # Check if handler is async
                import asyncio
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(**params)
                else:
                    result = handler(**params)
            else:
                result = handler
            
            return self.create_response(request_id, result=result)
        except JSONRPCError as e:
            return self.create_error_response(request_id, e.code, e.message, e.data)
        except Exception as e:
            logger.error(f"Error executing method {method_name}: {e}", exc_info=True)
            return self.create_error_response(
                request_id,
                self.INTERNAL_ERROR,
                f"Internal error: {str(e)}"
            )
    
    async def process_line(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Process a single line of JSON-RPC input.
        
        Returns a response dict if the line contains a request, None otherwise.
        """
        line = line.strip()
        if not line:
            return None
        
        try:
            request = json.loads(line)
            response = await self.handle_request(request)
            return response
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            return self.create_error_response(
                None,
                self.PARSE_ERROR,
                f"Parse error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return self.create_error_response(
                None,
                self.INTERNAL_ERROR,
                f"Internal error: {str(e)}"
            )
    
    def send_response(self, response: Dict[str, Any]) -> None:
        """Send a JSON-RPC response to stdout."""
        try:
            response_json = json.dumps(response, ensure_ascii=False)
            # Use buffer.write() with explicit UTF-8 encoding to avoid Windows console encoding issues
            # This bypasses cp1252 encoding limitations and handles all Unicode characters
            response_bytes = (response_json + "\n").encode('utf-8')
            sys.stdout.buffer.write(response_bytes)
            sys.stdout.buffer.flush()
        except Exception as e:
            logger.error(f"Error sending response: {e}", exc_info=True)
