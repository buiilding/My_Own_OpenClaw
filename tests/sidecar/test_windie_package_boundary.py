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
from windie._runtime_env import first_env_value  # noqa: E402


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


def test_runtime_env_helper_stays_private_to_sdk_package():
    assert callable(first_env_value)
    assert not hasattr(windie, "RuntimeEnv")
    assert not hasattr(windie, "first_env_value")
