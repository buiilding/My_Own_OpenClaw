"""Canonical grouped browser tool contract re-exported from the shared module."""

from __future__ import annotations

from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)

__all__ = [
    "BROWSER_ACTION_CONTRACTS",
    "BROWSER_ACTION_CONTRACTS_BY_NAME",
    "BROWSER_ACTIONS_REQUIRING_CONNECTION",
    "BROWSER_CANONICAL_ACTIONS",
    "BROWSER_MODEL_VISIBLE_ACTIONS",
    "BROWSER_RUNTIME_ACTIONS",
    "BROWSER_SCHEMAS",
    "BrowserActionArgsBase",
    "BrowserActionContract",
    "BrowserCanonicalAction",
    "BrowserClickArgs",
    "BrowserCloseArgs",
    "BrowserCloseTabArgs",
    "BrowserConnectArgs",
    "BrowserControlArgs",
    "BrowserCoreAction",
    "BrowserDoneArgs",
    "BrowserEvaluateArgs",
    "BrowserExtractArgs",
    "BrowserFindElementsArgs",
    "BrowserFindTextArgs",
    "BrowserGetAttributesArgs",
    "BrowserGetBboxArgs",
    "BrowserGetTabsArgs",
    "BrowserGetTextArgs",
    "BrowserGetValueArgs",
    "BrowserGoBackArgs",
    "BrowserHoverArgs",
    "BrowserInputArgs",
    "BrowserMouseButton",
    "BrowserNavigateArgs",
    "BrowserNavigationState",
    "BrowserProfilesArgs",
    "BrowserReadFileArgs",
    "BrowserReadLongContentArgs",
    "BrowserReplaceFileArgs",
    "BrowserSaveAsPdfArgs",
    "BrowserScreenshotArgs",
    "BrowserScrollArgs",
    "BrowserScrollDirection",
    "BrowserSearchArgs",
    "BrowserSearchPageArgs",
    "BrowserSelectDropdownArgs",
    "BrowserSendKeysArgs",
    "BrowserSnapshotArgs",
    "BrowserStatusArgs",
    "BrowserSwitchArgs",
    "BrowserUploadFileArgs",
    "BrowserWaitArgs",
    "BrowserWaitState",
    "BrowserWriteFileArgs",
    "MAX_BROWSER_TEXT_CHARS",
    "build_browser_tool_parameters_schema",
    "get_browser_schema",
    "validate_browser_args",
]

_browser_contract = load_shared_browser_contract()
for _name in __all__:
    globals()[_name] = getattr(_browser_contract, _name)
del _browser_contract, _name
