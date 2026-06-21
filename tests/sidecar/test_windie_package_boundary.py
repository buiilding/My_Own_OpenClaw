"""Covers Python SDK package boundary behavior."""

import tomllib
from pathlib import Path

from tests.sidecar.remote_client_test_utils import (
    ensure_aiohttp_with_stubs,
    ensure_frontend_python_path,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_SDK_PYPROJECT = REPO_ROOT / "packages" / "windie-sdk-python" / "pyproject.toml"
PYTHON_SDK_TEST_LABEL_PATHS = [
    REPO_ROOT / "tests" / "sidecar" / "test_windie_package_boundary.py",
    REPO_ROOT / "tests" / "sidecar" / "test_windie_sdk_client.py",
    REPO_ROOT / "tests" / "sidecar" / "test_repo_agent_example.py",
]

ensure_aiohttp_with_stubs()
ensure_frontend_python_path()

import windie  # noqa: E402
from windie import AgentSdkClient  # noqa: E402
from windie.sdk import AgentSdkClient as SdkAgentSdkClient  # noqa: E402
from windie._runtime_env import first_env_value  # noqa: E402


def test_python_sdk_tests_use_boundary_docstrings():
    retired_suite_label = "behavior in the " + "sidecar test suite"
    retired_route_label = "_to_" + "sidecar"
    retired_discovery_fixture = "missing-" + "sidecar.json"
    expected_headers = {
        "test_windie_package_boundary.py": '"""Covers Python SDK package boundary behavior."""',
        "test_windie_sdk_client.py": '"""Covers Python SDK package client behavior."""',
        "test_repo_agent_example.py": '"""Covers local-runtime repo-agent extension example behavior."""',
    }

    for path in PYTHON_SDK_TEST_LABEL_PATHS:
        source = path.read_text(encoding="utf-8")
        assert source.splitlines()[0] == expected_headers[path.name]
        assert retired_suite_label not in source
        assert retired_route_label not in source
        assert retired_discovery_fixture not in source


def test_windie_package_exports_public_client():
    assert AgentSdkClient is SdkAgentSdkClient
    assert not hasattr(windie, "WindieSdkClient")
    assert not hasattr(windie, "WindieSdkAgentSession")
    client = AgentSdkClient(
        backend_url="https://backend.example.com",
        default_user_id="dev-user",
        auto_start_local_runtime=False,
    )

    assert client.backend_url == "https://backend.example.com"
    assert client.default_user_id == "dev-user"


def test_runtime_env_helper_stays_private_to_sdk_package():
    assert callable(first_env_value)
    assert not hasattr(windie, "RuntimeEnv")
    assert not hasattr(windie, "first_env_value")


def test_python_sdk_package_discovery_exposes_only_public_windie_package():
    pyproject = tomllib.loads(PYTHON_SDK_PYPROJECT.read_text(encoding="utf-8"))

    package_find = pyproject["tool"]["setuptools"]["packages"]["find"]

    assert package_find["where"] == ["../../frontend/src/main/python"]
    assert package_find["include"] == ["windie", "windie.*"]
    assert "windie_shared" not in package_find["include"]
    assert "windie*" not in package_find["include"]
