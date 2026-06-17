"""Covers windie package boundary behavior in the sidecar test suite."""

from tests.sidecar.remote_client_test_utils import (
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

from core.windie_sdk_client import (  # noqa: E402
    AgentSdkClient as CoreAgentSdkClient,
    WindieSdkClient as CoreWindieSdkClient,
)
from windie import AgentSdkClient, WindieSdkClient  # noqa: E402


def test_windie_package_exports_public_client():
    assert AgentSdkClient is CoreAgentSdkClient
    assert WindieSdkClient is CoreWindieSdkClient
    assert WindieSdkClient is AgentSdkClient
    client = AgentSdkClient(
        backend_url="https://api.windieos.com",
        default_user_id="dev-user",
        auto_start_local_runtime=False,
    )

    assert client.backend_url == "https://api.windieos.com"
    assert client.default_user_id == "dev-user"
