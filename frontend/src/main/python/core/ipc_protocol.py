"""
JSON-RPC Protocol Handler for Local Backend.

Handles JSON-RPC 2.0 protocol over stdin/stdout for communication
with Electron main process.
"""

import json
import logging
from dataclasses import dataclass
from inspect import Signature, iscoroutinefunction, signature
from typing import Any, Callable, Dict, Optional

from core.stdout_json import write_json_line

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RegisteredMethod:
    """Dispatch metadata computed once at registration time."""

    handler: Any
    is_callable: bool
    is_async_callable: bool
    handler_signature: Optional[Signature]


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
        self.methods: Dict[str, RegisteredMethod] = {}
    
    def register_method(self, name: str, handler: Callable[..., Any]) -> None:
        """Register a method handler."""
        is_callable = callable(handler)
        handler_signature: Optional[Signature] = None
        if is_callable:
            try:
                handler_signature = signature(handler)
            except (TypeError, ValueError):
                handler_signature = None
        self.methods[name] = RegisteredMethod(
            handler=handler,
            is_callable=is_callable,
            is_async_callable=is_callable and iscoroutinefunction(handler),
            handler_signature=handler_signature,
        )
        logger.debug(f"Registered method: {name}")
    
    def create_request(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        request_id: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Create a JSON-RPC request."""
        request = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params:
            request["params"] = params
        if request_id is not None:
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

    async def handle_request(self, request: Any) -> Optional[Dict[str, Any]]:
        """
        Handle a JSON-RPC request.
        
        Returns a JSON-RPC response.
        """
        if not isinstance(request, dict):
            return self.create_error_response(
                None,
                self.INVALID_REQUEST,
                "Invalid request: payload must be a JSON object",
            )
        is_notification = "id" not in request
        request_id = request.get("id")

        # Validate JSON-RPC version
        if request.get("jsonrpc") != "2.0":
            response = self.create_error_response(
                request_id,
                self.INVALID_REQUEST,
                "Invalid JSON-RPC version. Must be '2.0'",
            )
            return None if is_notification else response
        
        # Get method name
        method_name = request.get("method")
        if not method_name:
            response = self.create_error_response(
                request_id,
                self.INVALID_REQUEST,
                "Method name is required",
            )
            return None if is_notification else response
        if not isinstance(method_name, str):
            response = self.create_error_response(
                request_id,
                self.INVALID_REQUEST,
                "Method name must be a string",
            )
            return None if is_notification else response
        
        # Get method handler
        registered_method = self.methods.get(method_name)
        if registered_method is None:
            response = self.create_error_response(
                request_id,
                self.METHOD_NOT_FOUND,
                f"Method not found: {method_name}",
            )
            return None if is_notification else response
        
        # Get params
        params = request.get("params", {})
        if not isinstance(params, dict):
            response = self.create_error_response(
                request_id,
                self.INVALID_PARAMS,
                "Params must be an object",
            )
            return None if is_notification else response

        if registered_method.is_callable and registered_method.handler_signature is not None:
            try:
                registered_method.handler_signature.bind(**params)
            except TypeError as exc:
                response = self.create_error_response(
                    request_id,
                    self.INVALID_PARAMS,
                    f"Invalid params: {exc}",
                )
                return None if is_notification else response
        
        # Call handler
        try:
            handler = registered_method.handler
            if registered_method.is_async_callable:
                result = await handler(**params)
            elif registered_method.is_callable:
                result = handler(**params)
            else:
                result = handler
            
            response = self.create_response(request_id, result=result)
            return None if is_notification else response
        except JSONRPCError as e:
            response = self.create_error_response(request_id, e.code, e.message, e.data)
            return None if is_notification else response
        except Exception as e:
            logger.error(f"Error executing method {method_name}: {e}", exc_info=True)
            response = self.create_error_response(
                request_id,
                self.INTERNAL_ERROR,
                f"Internal error: {str(e)}",
            )
            return None if is_notification else response
    
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
            write_json_line(response)
        except Exception as e:
            logger.error(f"Error sending response: {e}", exc_info=True)
