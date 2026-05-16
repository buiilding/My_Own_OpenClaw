"""Core entrypoint for the public ``windie`` Python SDK package."""

from windie import sdk as _sdk
from windie.sdk import (
    SidecarDaemonHttpClient,
    WindieSdkAgentSession,
    WindieSdkClient,
)

aiohttp = _sdk.aiohttp
platform = _sdk.platform

__all__ = [
    "SidecarDaemonHttpClient",
    "WindieSdkAgentSession",
    "WindieSdkClient",
    "aiohttp",
    "platform",
]
