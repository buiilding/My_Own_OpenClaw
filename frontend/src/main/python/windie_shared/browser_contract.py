"""Canonical grouped browser contract shared by backend and sidecar."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal, Optional, cast, get_args

from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field
from pydantic import RootModel
from pydantic import ValidationError
from pydantic import model_validator

BrowserNavigationState = Literal["load", "domcontentloaded", "networkidle", "commit"]
BrowserMouseButton = Literal["left", "right", "middle"]
BrowserScrollDirection = Literal["up", "down", "left", "right"]
BrowserWaitState = Literal["load", "domcontentloaded", "networkidle"]
BrowserCanonicalAction = Literal[
    "connect",
    "status",
    "profiles",
    "navigate",
    "snapshot",
    "extract",
    "click",
    "input",
    "send_keys",
    "scroll",
    "screenshot",
    "wait",
    "get_tabs",
    "switch",
    "evaluate",
    "done",
    "search",
    "go_back",
    "search_page",
    "find_elements",
    "find_text",
    "close_tab",
    "dropdown_options",
    "select_dropdown",
    "upload_file",
    "write_file",
    "replace_file",
    "read_file",
    "read_long_content",
    "close",
]
BrowserCoreAction = BrowserCanonicalAction

BROWSER_CANONICAL_ACTIONS = cast(
    tuple[str, ...],
    tuple(
        action
        for action in get_args(BrowserCanonicalAction)
        if isinstance(action, str)
    ),
)

MAX_BROWSER_TEXT_CHARS = 120_000


class BrowserActionArgsBase(BaseModel):
    """Strict base model for canonical browser actions."""

    model_config = ConfigDict(extra="forbid")


def _ensure_click_target(
    ref: Optional[str],
    index: Optional[int],
    coordinate_x: Optional[int],
    coordinate_y: Optional[int],
) -> None:
    has_ref_or_index = ref is not None or index is not None
    has_coordinates = coordinate_x is not None and coordinate_y is not None
    if not has_ref_or_index and not has_coordinates:
        raise ValueError(
            "click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'"
        )
    if (coordinate_x is None) != (coordinate_y is None):
        raise ValueError(
            "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click"
        )


def _ensure_index_or_ref(action: str, ref: Optional[str], index: Optional[int]) -> None:
    if ref is None and index is None:
        raise ValueError(f"{action} requires either 'ref' or 'index'")


class BrowserConnectArgs(BrowserActionArgsBase):
    action: Literal["connect"] = Field(..., description="Connect to the Windie browser.")


class BrowserStatusArgs(BrowserActionArgsBase):
    action: Literal["status"] = Field(..., description="Get current browser connection state.")


class BrowserProfilesArgs(BrowserActionArgsBase):
    action: Literal["profiles"] = Field(
        ..., description="List available Windie browser profiles."
    )


class BrowserNavigateArgs(BrowserActionArgsBase):
    action: Literal["navigate"] = Field(..., description="Navigate the current tab.")
    url: str = Field(..., description="URL to navigate to.")
    new_tab: bool = Field(False, description="Open the URL in a new tab.")


class BrowserSnapshotArgs(BrowserActionArgsBase):
    action: Literal["snapshot"] = Field(..., description="Read the current page snapshot.")
    offset: int = Field(
        0,
        description="Character offset into the snapshot text for paginated reads.",
        ge=0,
    )
    limit: int = Field(
        4000,
        description="Maximum number of snapshot characters to return.",
        ge=1,
        le=MAX_BROWSER_TEXT_CHARS,
    )
    include_screenshot: bool = Field(
        False,
        description="Include a screenshot with the snapshot result when available.",
    )

    @model_validator(mode="after")
    def validate_window(self) -> "BrowserSnapshotArgs":
        if self.offset + self.limit > MAX_BROWSER_TEXT_CHARS:
            raise ValueError(
                "snapshot offset + limit exceeds maximum snapshot window (120000)"
            )
        return self


class BrowserExtractArgs(BrowserActionArgsBase):
    action: Literal["extract"] = Field(
        ..., description="Extract query-relevant content from the current page."
    )
    query: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Extraction goal or question.",
    )
    extract_links: bool = Field(
        False,
        description="Include page links in extracted source text before filtering.",
    )
    start_from_char: int = Field(
        0,
        ge=0,
        description="Character offset into extracted page content for long pages.",
    )
    output_schema: Optional[dict[str, Any]] = Field(
        None,
        description="Optional JSON schema hint for structured extraction output.",
    )


class BrowserClickArgs(BrowserActionArgsBase):
    action: Literal["click"] = Field(..., description="Click a page element.")
    ref: Optional[str] = Field(None, description="Element ref from the latest snapshot.")
    index: Optional[int] = Field(None, description="Browser Use element index.", ge=0)
    coordinate_x: Optional[int] = Field(
        None, description="Coordinate-click X position."
    )
    coordinate_y: Optional[int] = Field(
        None, description="Coordinate-click Y position."
    )
    double_click: bool = Field(False, description="Perform a double click.")
    button: BrowserMouseButton = Field("left", description="Mouse button to use.")

    @model_validator(mode="after")
    def validate_target(self) -> "BrowserClickArgs":
        _ensure_click_target(
            ref=self.ref,
            index=self.index,
            coordinate_x=self.coordinate_x,
            coordinate_y=self.coordinate_y,
        )
        return self


class BrowserInputArgs(BrowserActionArgsBase):
    action: Literal["input"] = Field(..., description="Type text into an element.")
    ref: Optional[str] = Field(None, description="Element ref from the latest snapshot.")
    index: Optional[int] = Field(None, description="Browser Use element index.", ge=0)
    text: str = Field(..., description="Text to type.", max_length=10000)
    clear: bool = Field(True, description="Clear the field before typing.")
    submit: bool = Field(False, description="Submit after typing.")

    @model_validator(mode="after")
    def validate_target(self) -> "BrowserInputArgs":
        _ensure_index_or_ref("input", ref=self.ref, index=self.index)
        return self


class BrowserSendKeysArgs(BrowserActionArgsBase):
    action: Literal["send_keys"] = Field(..., description="Send a key sequence.")
    keys: str = Field(..., description="Key sequence to send.", min_length=1)


class BrowserScrollArgs(BrowserActionArgsBase):
    action: Literal["scroll"] = Field(..., description="Scroll the current page.")
    direction: BrowserScrollDirection = Field("down", description="Scroll direction.")
    amount: int = Field(500, description="Scroll amount in pixels.", ge=100, le=5000)
    pages: Optional[float] = Field(
        None,
        description="Optional page-count override for Browser Use scrolling.",
        gt=0,
    )
    index: Optional[int] = Field(
        None, description="Optional Browser Use element index.", ge=0
    )


class BrowserScreenshotArgs(BrowserActionArgsBase):
    action: Literal["screenshot"] = Field(..., description="Take a browser screenshot.")
    file_name: Optional[str] = Field(
        None, description="Optional output filename for the screenshot."
    )


class BrowserWaitArgs(BrowserActionArgsBase):
    action: Literal["wait"] = Field(..., description="Wait within the browser runtime.")
    seconds: Optional[float] = Field(
        None,
        description="Seconds to wait. Omit to use the runtime default wait.",
        ge=0,
        le=60,
    )


class BrowserGetTabsArgs(BrowserActionArgsBase):
    action: Literal["get_tabs"] = Field(..., description="List browser tabs.")


class BrowserSwitchArgs(BrowserActionArgsBase):
    action: Literal["switch"] = Field(..., description="Switch to an existing tab.")
    tab_id: str = Field(..., description="Tab ID from get_tabs.")


class BrowserEvaluateArgs(BrowserActionArgsBase):
    action: Literal["evaluate"] = Field(..., description="Evaluate JavaScript.")
    code: str = Field(..., description="JavaScript code to execute.", max_length=5000)


class BrowserDoneArgs(BrowserActionArgsBase):
    action: Literal["done"] = Field(..., description="Mark the browser task as complete.")
    text: str = Field("Done.", description="Completion text to return.")
    success: Optional[bool] = Field(None, description="Optional success flag.")
    files_to_display: Optional[list[str]] = Field(
        None,
        description="Optional attachment paths to surface with the completion result.",
    )


class BrowserSearchArgs(BrowserActionArgsBase):
    action: Literal["search"] = Field(..., description="Search the web from the browser.")
    query: str = Field(..., description="Search query.", min_length=1, max_length=2000)
    engine: Optional[str] = Field(None, description="Optional search engine override.")


class BrowserGoBackArgs(BrowserActionArgsBase):
    action: Literal["go_back"] = Field(..., description="Go back in browser history.")
    description: Optional[str] = Field(
        None, description="Optional note about the navigation step."
    )


class BrowserSearchPageArgs(BrowserActionArgsBase):
    action: Literal["search_page"] = Field(..., description="Search within the current page.")
    pattern: str = Field(..., description="Pattern to find on the page.", min_length=1)
    regex: bool = Field(False, description="Interpret the pattern as a regex.")
    case_sensitive: bool = Field(False, description="Use case-sensitive matching.")
    context_chars: Optional[int] = Field(
        None, description="Context characters to include around each match.", ge=0
    )
    css_scope: Optional[str] = Field(None, description="Optional CSS scope for the search.")
    max_results: Optional[int] = Field(
        None, description="Maximum number of matches to return.", ge=1
    )


class BrowserFindElementsArgs(BrowserActionArgsBase):
    action: Literal["find_elements"] = Field(
        ..., description="Find elements matching a CSS selector."
    )
    selector: str = Field(..., description="CSS selector to match.", min_length=1)
    attributes: Optional[list[str]] = Field(
        None, description="Attributes to include in the results."
    )
    max_results: Optional[int] = Field(
        None, description="Maximum number of results to return.", ge=1
    )
    include_text: bool = Field(False, description="Include element text in the results.")


class BrowserFindTextArgs(BrowserActionArgsBase):
    action: Literal["find_text"] = Field(..., description="Find text on the current page.")
    text: str = Field(..., description="Text to find.", min_length=1)


class BrowserCloseTabArgs(BrowserActionArgsBase):
    action: Literal["close_tab"] = Field(..., description="Close an existing tab.")
    tab_id: str = Field(..., description="Tab ID from get_tabs.")


class BrowserDropdownOptionsArgs(BrowserActionArgsBase):
    action: Literal["dropdown_options"] = Field(
        ..., description="List available options for a dropdown element."
    )
    ref: Optional[str] = Field(None, description="Element ref from the latest snapshot.")
    index: Optional[int] = Field(None, description="Browser Use element index.", ge=0)

    @model_validator(mode="after")
    def validate_target(self) -> "BrowserDropdownOptionsArgs":
        _ensure_index_or_ref("dropdown_options", ref=self.ref, index=self.index)
        return self


class BrowserSelectDropdownArgs(BrowserActionArgsBase):
    action: Literal["select_dropdown"] = Field(
        ..., description="Select an option in a dropdown element."
    )
    ref: Optional[str] = Field(None, description="Element ref from the latest snapshot.")
    index: Optional[int] = Field(None, description="Browser Use element index.", ge=0)
    text: str = Field(..., description="Visible option text to select.", min_length=1)

    @model_validator(mode="after")
    def validate_target(self) -> "BrowserSelectDropdownArgs":
        _ensure_index_or_ref("select_dropdown", ref=self.ref, index=self.index)
        return self


class BrowserUploadFileArgs(BrowserActionArgsBase):
    action: Literal["upload_file"] = Field(..., description="Upload a file with an input.")
    ref: Optional[str] = Field(None, description="Element ref from the latest snapshot.")
    index: Optional[int] = Field(None, description="Browser Use element index.", ge=0)
    path: str = Field(..., description="Path to the file to upload.", min_length=1)

    @model_validator(mode="after")
    def validate_target(self) -> "BrowserUploadFileArgs":
        _ensure_index_or_ref("upload_file", ref=self.ref, index=self.index)
        return self


class BrowserWriteFileArgs(BrowserActionArgsBase):
    action: Literal["write_file"] = Field(..., description="Write a browser-side file.")
    file_name: str = Field(..., description="Browser-side file name.", min_length=1)
    content: str = Field(..., description="Content to write.")
    append: bool = Field(False, description="Append instead of overwriting.")
    trailing_newline: bool = Field(
        False, description="Append a trailing newline after the written content."
    )
    leading_newline: bool = Field(
        False, description="Insert a leading newline before the written content."
    )


class BrowserReplaceFileArgs(BrowserActionArgsBase):
    action: Literal["replace_file"] = Field(
        ..., description="Replace text inside a browser-side file."
    )
    file_name: str = Field(..., description="Browser-side file name.", min_length=1)
    old_str: str = Field(..., description="Text to replace.")
    new_str: str = Field(..., description="Replacement text.")


class BrowserReadFileArgs(BrowserActionArgsBase):
    action: Literal["read_file"] = Field(..., description="Read a browser-side file.")
    file_name: str = Field(..., description="Browser-side file name.", min_length=1)


class BrowserReadLongContentArgs(BrowserActionArgsBase):
    action: Literal["read_long_content"] = Field(
        ..., description="Read long content using the browser runtime reader."
    )
    goal: str = Field(..., description="Reading goal or question.", min_length=1)
    source: Optional[str] = Field(None, description="Optional source hint.")
    context: Optional[str] = Field(None, description="Optional context hint.")


class BrowserCloseArgs(BrowserActionArgsBase):
    action: Literal["close"] = Field(..., description="Close the browser connection.")


BrowserActionUnion = Annotated[
    BrowserConnectArgs
    | BrowserStatusArgs
    | BrowserProfilesArgs
    | BrowserNavigateArgs
    | BrowserSnapshotArgs
    | BrowserExtractArgs
    | BrowserClickArgs
    | BrowserInputArgs
    | BrowserSendKeysArgs
    | BrowserScrollArgs
    | BrowserScreenshotArgs
    | BrowserWaitArgs
    | BrowserGetTabsArgs
    | BrowserSwitchArgs
    | BrowserEvaluateArgs
    | BrowserDoneArgs
    | BrowserSearchArgs
    | BrowserGoBackArgs
    | BrowserSearchPageArgs
    | BrowserFindElementsArgs
    | BrowserFindTextArgs
    | BrowserCloseTabArgs
    | BrowserDropdownOptionsArgs
    | BrowserSelectDropdownArgs
    | BrowserUploadFileArgs
    | BrowserWriteFileArgs
    | BrowserReplaceFileArgs
    | BrowserReadFileArgs
    | BrowserReadLongContentArgs
    | BrowserCloseArgs,
    Field(discriminator="action"),
]


class BrowserControlArgs(RootModel[BrowserActionUnion]):
    """Canonical grouped browser payload validated as a strict discriminated union."""

    def __getattr__(self, name: str) -> Any:
        return getattr(self.root, name)


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
        "dropdown_options",
        BrowserDropdownOptionsArgs,
        "dropdown_options",
        True,
    ),
    BrowserActionContract(
        "select_dropdown",
        BrowserSelectDropdownArgs,
        "select_dropdown",
        True,
    ),
    BrowserActionContract("upload_file", BrowserUploadFileArgs, "upload_file", True),
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


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return schema

    cleaned: dict[str, Any] = {}

    if "properties" in schema:
        cleaned["properties"] = {
            key: _clean_schema(value)
            for key, value in schema["properties"].items()
        }

    if "required" in schema:
        cleaned["required"] = schema["required"]

    if "anyOf" in schema:
        any_of = schema["anyOf"]
        non_null_types = [item for item in any_of if item.get("type") != "null"]

        if len(non_null_types) == 1:
            cleaned.update(_clean_schema(non_null_types[0]))
        else:
            cleaned["anyOf"] = [_clean_schema(item) for item in any_of]
    elif "type" in schema:
        cleaned["type"] = schema["type"]

    if "oneOf" in schema:
        cleaned["oneOf"] = [_clean_schema(item) for item in schema["oneOf"]]
    if "allOf" in schema:
        cleaned["allOf"] = [_clean_schema(item) for item in schema["allOf"]]

    if "items" in schema:
        cleaned["items"] = _clean_schema(schema["items"])

    if "description" in schema:
        cleaned["description"] = schema["description"]

    if "additionalProperties" in schema and isinstance(
        schema["additionalProperties"], bool
    ):
        cleaned["additionalProperties"] = schema["additionalProperties"]

    if "default" in schema and schema["default"] is not None:
        cleaned["default"] = schema["default"]

    for key in [
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minLength",
        "maxLength",
        "pattern",
        "enum",
    ]:
        if key in schema:
            cleaned[key] = schema[key]

    return cleaned


def _resolve_local_defs(schema: dict[str, Any]) -> dict[str, Any]:
    defs = schema.get("$defs")
    if not isinstance(defs, dict):
        return schema

    def _resolve(node: Any) -> Any:
        if isinstance(node, list):
            return [_resolve(item) for item in node]

        if not isinstance(node, dict):
            return node

        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            key = ref[len("#/$defs/"):]
            target = defs.get(key)
            if isinstance(target, dict):
                resolved_target = _resolve(target)
                extras = {
                    nested_key: _resolve(nested_value)
                    for nested_key, nested_value in node.items()
                    if nested_key != "$ref"
                }
                if isinstance(resolved_target, dict):
                    merged = dict(resolved_target)
                    merged.update(extras)
                    return merged
                return extras or resolved_target

        all_of = node.get("allOf")
        if isinstance(all_of, list) and len(all_of) == 1:
            resolved_base = _resolve(all_of[0])
            extras = {
                nested_key: _resolve(nested_value)
                for nested_key, nested_value in node.items()
                if nested_key != "allOf"
            }
            if isinstance(resolved_base, dict):
                merged = dict(resolved_base)
                merged.update(extras)
                return merged
            return extras or resolved_base

        return {
            nested_key: _resolve(nested_value)
            for nested_key, nested_value in node.items()
            if nested_key != "$defs"
        }

    return _resolve(schema)


def _clean_action_schema(model: type[BrowserActionArgsBase]) -> dict[str, Any]:
    raw_schema = model.model_json_schema()
    resolved_schema = _resolve_local_defs(raw_schema)
    cleaned_schema = _clean_schema(resolved_schema)
    cleaned_schema.pop("title", None)
    return cleaned_schema


def build_browser_tool_parameters_schema() -> dict[str, Any]:
    one_of = [
        _clean_action_schema(cast(type[BrowserActionArgsBase], contract.args_model))
        for contract in BROWSER_ACTION_CONTRACTS
        if contract.model_visible
    ]
    return {
        "type": "object",
        "description": "Canonical grouped browser action payload.",
        "properties": {
            "action": {
                "type": "string",
                "enum": list(BROWSER_MODEL_VISIBLE_ACTIONS),
                "description": "Canonical browser action to perform.",
            }
        },
        "required": ["action"],
        "oneOf": one_of,
    }


assert tuple(BROWSER_MODEL_VISIBLE_ACTIONS) == tuple(BROWSER_CANONICAL_ACTIONS)


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
    "BrowserDropdownOptionsArgs",
    "BrowserEvaluateArgs",
    "BrowserExtractArgs",
    "BrowserFindElementsArgs",
    "BrowserFindTextArgs",
    "BrowserGetTabsArgs",
    "BrowserGoBackArgs",
    "BrowserInputArgs",
    "BrowserMouseButton",
    "BrowserNavigateArgs",
    "BrowserNavigationState",
    "BrowserProfilesArgs",
    "BrowserReadFileArgs",
    "BrowserReadLongContentArgs",
    "BrowserReplaceFileArgs",
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
