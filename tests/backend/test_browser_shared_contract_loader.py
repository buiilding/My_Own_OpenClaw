import sys

from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)


def test_browser_shared_contract_loader_does_not_mutate_sys_path(monkeypatch):
    for module_name in list(sys.modules):
        if module_name == "windie_shared" or module_name.startswith("windie_shared."):
            monkeypatch.delitem(sys.modules, module_name, raising=False)

    before_sys_path = list(sys.path)

    contract = load_shared_browser_contract()

    assert contract.BROWSER_CANONICAL_ACTIONS
    assert sys.path == before_sys_path
