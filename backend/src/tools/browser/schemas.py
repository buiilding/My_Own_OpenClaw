"""Canonical browser schemas re-exported from the shared browser contract module."""

from backend.src.tools.browser.shared_contract_loader import (
    load_shared_browser_contract,
)

__all__ = [
    "BROWSER_ACTION_CONTRACTS",
    "BROWSER_CANONICAL_ACTIONS",
    "BrowserActionArgsBase",
    "BrowserActionContract",
    "BrowserCanonicalAction",
    "BrowserClickArgs",
    "BrowserCloseArgs",
    "BrowserCloseTabArgs",
    "BrowserConnectArgs",
    "BrowserControlArgs",
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
    "BrowserWriteFileArgs",
    "MAX_BROWSER_TEXT_CHARS",
    "build_browser_tool_parameters_schema",
]

_browser_contract = load_shared_browser_contract()
for _name in __all__:
    globals()[_name] = getattr(_browser_contract, _name)
del _browser_contract, _name
