"""Covers windie package boundary behavior in the sidecar test suite."""

from tests.sidecar.remote_client_test_utils import (
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

import windie  # noqa: E402
from windie import AgentSdkClient  # noqa: E402
from windie.sdk import AgentSdkClient as SdkAgentSdkClient  # noqa: E402


def test_windie_package_exports_public_client():
    assert AgentSdkClient is SdkAgentSdkClient
    assert not hasattr(windie, "WindieSdkClient")
    assert not hasattr(windie, "WindieSdkAgentSession")
    client = AgentSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        auto_start_local_runtime=False,
    )

    assert client.backend_url == "https://api.windieos.com"
    assert client.default_user_id == "dev-user"
