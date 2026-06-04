"""Browser action catalog and validation helpers."""

from __future__ import annotations

from dataclasses import dataclass

from windie_shared.browser_contract_models import (
    BrowserActionArgsBase,
    BrowserClickArgs,
    BrowserCloseArgs,
    BrowserCloseTabArgs,
    BrowserConnectArgs,
    BrowserControlArgs,
    BrowserDoneArgs,
    BrowserEvaluateArgs,
    BrowserExtractArgs,
    BrowserFindElementsArgs,
    BrowserFindTextArgs,
    BrowserGetAttributesArgs,
    BrowserGetBboxArgs,
    BrowserGetTabsArgs,
    BrowserGetTextArgs,
    BrowserGetValueArgs,
    BrowserGoBackArgs,
    BrowserHoverArgs,
    BrowserInputArgs,
    BrowserNavigateArgs,
    BrowserProfilesArgs,
    BrowserReadFileArgs,
    BrowserReadLongContentArgs,
    BrowserReplaceFileArgs,
    BrowserSaveAsPdfArgs,
    BrowserScreenshotArgs,
    BrowserScrollArgs,
    BrowserSearchArgs,
    BrowserSearchPageArgs,
    BrowserSelectDropdownArgs,
    BrowserSendKeysArgs,
    BrowserSnapshotArgs,
    BrowserStatusArgs,
    BrowserSwitchArgs,
    BrowserUploadFileArgs,
    BrowserWaitArgs,
    BrowserWriteFileArgs,
)


@dataclass(frozen=True, slots=True)
class BrowserActionContract:
    name: str
    args_model: type[BrowserActionArgsBase]


BROWSER_ACTION_CONTRACTS: tuple[BrowserActionContract, ...] = (
    BrowserActionContract("connect", BrowserConnectArgs),
    BrowserActionContract("status", BrowserStatusArgs),
    BrowserActionContract("profiles", BrowserProfilesArgs),
    BrowserActionContract("navigate", BrowserNavigateArgs),
    BrowserActionContract("snapshot", BrowserSnapshotArgs),
    BrowserActionContract("extract", BrowserExtractArgs),
    BrowserActionContract("click", BrowserClickArgs),
    BrowserActionContract("input", BrowserInputArgs),
    BrowserActionContract("send_keys", BrowserSendKeysArgs),
    BrowserActionContract("scroll", BrowserScrollArgs),
    BrowserActionContract("screenshot", BrowserScreenshotArgs),
    BrowserActionContract("wait", BrowserWaitArgs),
    BrowserActionContract("get_tabs", BrowserGetTabsArgs),
    BrowserActionContract("switch", BrowserSwitchArgs),
    BrowserActionContract("evaluate", BrowserEvaluateArgs),
    BrowserActionContract("done", BrowserDoneArgs),
    BrowserActionContract("search", BrowserSearchArgs),
    BrowserActionContract("go_back", BrowserGoBackArgs),
    BrowserActionContract("search_page", BrowserSearchPageArgs),
    BrowserActionContract("find_elements", BrowserFindElementsArgs),
    BrowserActionContract("find_text", BrowserFindTextArgs),
    BrowserActionContract("close_tab", BrowserCloseTabArgs),
    BrowserActionContract("select_dropdown", BrowserSelectDropdownArgs),
    BrowserActionContract("upload_file", BrowserUploadFileArgs),
    BrowserActionContract("hover", BrowserHoverArgs),
    BrowserActionContract("save_as_pdf", BrowserSaveAsPdfArgs),
    BrowserActionContract("get_text", BrowserGetTextArgs),
    BrowserActionContract("get_value", BrowserGetValueArgs),
    BrowserActionContract("get_attributes", BrowserGetAttributesArgs),
    BrowserActionContract("get_bbox", BrowserGetBboxArgs),
    BrowserActionContract("write_file", BrowserWriteFileArgs),
    BrowserActionContract("replace_file", BrowserReplaceFileArgs),
    BrowserActionContract("read_file", BrowserReadFileArgs),
    BrowserActionContract("read_long_content", BrowserReadLongContentArgs),
    BrowserActionContract("close", BrowserCloseArgs),
)
