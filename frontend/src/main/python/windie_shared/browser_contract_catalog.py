"""Browser action catalog and validation helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from pydantic import ValidationError

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
    runtime_action: str | None
    requires_connection: bool
    model_visible: bool = True


BROWSER_ACTION_CONTRACTS: tuple[BrowserActionContract, ...] = (
    BrowserActionContract("connect", BrowserConnectArgs, None, False),
    BrowserActionContract("status", BrowserStatusArgs, "status", False),
    BrowserActionContract("profiles", BrowserProfilesArgs, None, False),
    BrowserActionContract("navigate", BrowserNavigateArgs, "navigate", True),
    BrowserActionContract("snapshot", BrowserSnapshotArgs, "snapshot", True),
    BrowserActionContract("extract", BrowserExtractArgs, "extract", True),
    BrowserActionContract("click", BrowserClickArgs, "click", True),
    BrowserActionContract("input", BrowserInputArgs, "input", True),
    BrowserActionContract("send_keys", BrowserSendKeysArgs, "send_keys", True),
    BrowserActionContract("scroll", BrowserScrollArgs, "scroll", True),
    BrowserActionContract("screenshot", BrowserScreenshotArgs, "screenshot", True),
    BrowserActionContract("wait", BrowserWaitArgs, "wait", True),
    BrowserActionContract("get_tabs", BrowserGetTabsArgs, "get_tabs", True),
    BrowserActionContract("switch", BrowserSwitchArgs, "switch", True),
    BrowserActionContract("evaluate", BrowserEvaluateArgs, "evaluate", True),
    BrowserActionContract("done", BrowserDoneArgs, "done", False),
    BrowserActionContract("search", BrowserSearchArgs, "search", True),
    BrowserActionContract("go_back", BrowserGoBackArgs, "go_back", True),
    BrowserActionContract("search_page", BrowserSearchPageArgs, "search_page", True),
    BrowserActionContract("find_elements", BrowserFindElementsArgs, "find_elements", True),
    BrowserActionContract("find_text", BrowserFindTextArgs, "find_text", True),
    BrowserActionContract("close_tab", BrowserCloseTabArgs, "close", True),
    BrowserActionContract(
        "select_dropdown",
        BrowserSelectDropdownArgs,
        "select_dropdown",
        True,
    ),
    BrowserActionContract("upload_file", BrowserUploadFileArgs, "upload_file", True),
    BrowserActionContract("hover", BrowserHoverArgs, "hover", True),
    BrowserActionContract("save_as_pdf", BrowserSaveAsPdfArgs, "save_as_pdf", True),
    BrowserActionContract("get_text", BrowserGetTextArgs, "get_text", True),
    BrowserActionContract("get_value", BrowserGetValueArgs, "get_value", True),
    BrowserActionContract("get_attributes", BrowserGetAttributesArgs, "get_attributes", True),
    BrowserActionContract("get_bbox", BrowserGetBboxArgs, "get_bbox", True),
    BrowserActionContract("write_file", BrowserWriteFileArgs, "write_file", True),
    BrowserActionContract("replace_file", BrowserReplaceFileArgs, "replace_file", True),
    BrowserActionContract("read_file", BrowserReadFileArgs, "read_file", True),
    BrowserActionContract(
        "read_long_content",
        BrowserReadLongContentArgs,
        "read_long_content",
        True,
    ),
    BrowserActionContract("close", BrowserCloseArgs, None, False),
)

BROWSER_ACTION_CONTRACTS_BY_NAME = {
    contract.name: contract for contract in BROWSER_ACTION_CONTRACTS
}
BROWSER_SCHEMAS = {
    contract.name: contract.args_model for contract in BROWSER_ACTION_CONTRACTS
}
BROWSER_MODEL_VISIBLE_ACTIONS = tuple(
    contract.name for contract in BROWSER_ACTION_CONTRACTS if contract.model_visible
)
BROWSER_RUNTIME_ACTIONS = {
    contract.name: contract.runtime_action
    for contract in BROWSER_ACTION_CONTRACTS
    if contract.runtime_action is not None
}
BROWSER_ACTIONS_REQUIRING_CONNECTION = frozenset(
    contract.name for contract in BROWSER_ACTION_CONTRACTS if contract.requires_connection
)


def get_browser_schema(action: str) -> type[BrowserActionArgsBase] | None:
    return BROWSER_SCHEMAS.get(action)


def validate_browser_args(action: str, args: dict[str, Any]) -> tuple[bool, Optional[str]]:
    schema_class = get_browser_schema(action)
    if schema_class is None:
        return False, f"Unknown browser action: {action}"

    try:
        schema_class.model_validate({**args, "action": action})
        return True, None
    except ValidationError as exc:
        return False, str(exc)
