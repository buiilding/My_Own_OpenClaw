"""Covers local-runtime environment flag behavior."""

import ast
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import core.env_flags as env_flags_module  # noqa: E402
from core.env_flags import env_flag_enabled  # noqa: E402


def test_env_flags_module_doc_uses_local_runtime_wording() -> None:
    assert "local-runtime processes" in (env_flags_module.__doc__ or "")
    assert "sidecar processes" not in (env_flags_module.__doc__ or "")


def test_windie_env_alias_constants_are_named_as_aliases() -> None:
    local_runtime_root = (
        Path(__file__).resolve().parents[2] / "frontend/src/main/python"
    )
    offenders: list[str] = []
    for module_path in local_runtime_root.rglob("*.py"):
        tree = ast.parse(module_path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign):
                continue
            value = node.value
            if not (
                isinstance(value, ast.Constant)
                and isinstance(value.value, str)
                and value.value.startswith("WINDIE")
            ):
                continue
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.startswith("ENV_"):
                    if not target.id.startswith("ENV_WINDIE"):
                        offenders.append(
                            f"{module_path.relative_to(local_runtime_root)}:{target.id}"
                        )
    assert offenders == []


def test_env_flag_enabled_resolves_truthy_values(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_TEST_FLAG", " yes ")

    assert env_flag_enabled("AGENT_TEST_FLAG", default=False) is True


def test_env_flag_enabled_resolves_falsy_values(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_TEST_FLAG", "off")

    assert env_flag_enabled("AGENT_TEST_FLAG", default=True) is False


def test_env_flag_enabled_falls_back_to_default_for_unknown_value(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_TEST_FLAG", "definitely")

    assert env_flag_enabled("AGENT_TEST_FLAG", default=False) is False
