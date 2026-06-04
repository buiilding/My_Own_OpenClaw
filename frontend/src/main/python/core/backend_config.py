"""Compatibility exports for sidecar backend endpoint configuration."""

from windie import _backend_config

__all__ = [
    "DEFAULT_BACKEND_HTTP_URL",
    "get_backend_http_url",
    "get_backend_http_urls",
]

DEFAULT_BACKEND_HTTP_URL = _backend_config.DEFAULT_BACKEND_HTTP_URL
get_backend_http_url = _backend_config.get_backend_http_url
get_backend_http_urls = _backend_config.get_backend_http_urls
