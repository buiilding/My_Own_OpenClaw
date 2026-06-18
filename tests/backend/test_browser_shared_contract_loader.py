"""Covers browser shared contract loader behavior in the backend test suite."""

import sys
from pathlib import Path

from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_CONTRACT_LOADER_PATH = (
    REPO_ROOT / "backend" / "src" / "tools" / "browser" / "shared_contract_loader.py"
)


def test_browser_shared_contract_loader_does_not_mutate_sys_path(monkeypatch):
    for module_name in list(sys.modules):
        if module_name == "windie_shared" or module_name.startswith("windie_shared."):
            monkeypatch.delitem(sys.modules, module_name, raising=False)

    before_sys_path = list(sys.path)

    contract = load_shared_browser_contract()

    assert contract.BROWSER_CANONICAL_ACTIONS
    assert sys.path == before_sys_path


def test_browser_shared_contract_loader_uses_local_runtime_boundary_words():
    source = SHARED_CONTRACT_LOADER_PATH.read_text(encoding="utf-8")

    assert "backend/local-runtime browser shared contract" in source
    assert "sidecar-visible browser shared contract" not in source
    assert "_load_windie_shared_package" not in source
