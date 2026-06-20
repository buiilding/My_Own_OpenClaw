"""Covers incoming message contract behavior in the backend test suite."""

import json
from pathlib import Path

from backend.src.api.schemas.common import BaseMessage
from backend.src.api.schemas.incoming import (
    CompactHistoryPayload,
    ListModelsPayload,
    LoadSettingsPayload,
    ProviderApiKeyEntry,
    ProviderApiKeysPayload,
    QueryPayload,
    RehydrateConversationPayload,
    StopQueryPayload,
    ToolBundleResultPayload,
    ToolBundleStepResult,
    ToolManifestSettingsPayload,
    ToolResultData,
    ToolResultPayload,
    UpdateSettingsMessage,
    UpdateSettingsPayload,
    WakewordDetectedPayload,
)


CONTRACT_PATH = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "src"
    / "api"
    / "contracts"
    / "incoming_message_contract.json"
)


def _load_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def _field_names(model) -> list[str]:
    return list(model.model_fields.keys())


def test_incoming_message_contract_matches_pydantic_payload_fields():
    contract = _load_contract()

    assert contract["envelope_keys"] == _field_names(BaseMessage)

    expected_payload_models = {
        "query": QueryPayload,
        "stop-query": StopQueryPayload,
        "rehydrate-conversation": RehydrateConversationPayload,
        "load-settings": LoadSettingsPayload,
        "list-models": ListModelsPayload,
        "update-settings": UpdateSettingsPayload,
        "wakeword-detected": WakewordDetectedPayload,
        "compact-history": CompactHistoryPayload,
        "tool-result": ToolResultPayload,
        "tool-bundle-result": ToolBundleResultPayload,
    }

    assert set(contract["payloads"]) == set(expected_payload_models)
    for message_type, model in expected_payload_models.items():
        assert contract["payloads"][message_type]["keys"] == _field_names(model)


def test_incoming_message_contract_records_intentional_nested_extra_allowance():
    contract = _load_contract()

    assert contract["payloads"]["tool-result"]["nested"]["data"] == {
        "extra": "allow",
        "keys": _field_names(ToolResultData),
    }
    assert contract["payloads"]["tool-bundle-result"]["nested"]["step_results[]"] == {
        "extra": "allow",
        "keys": _field_names(ToolBundleStepResult),
    }
    assert contract["payloads"]["update-settings"]["nested"]["tools"] == {
        "extra": "forbid",
        "keys": _field_names(ToolManifestSettingsPayload),
    }
    assert contract["payloads"]["update-settings"]["nested"]["provider_api_keys"] == {
        "extra": "ignore",
        "keys": _field_names(ProviderApiKeysPayload),
        "entry_keys": _field_names(ProviderApiKeyEntry),
    }


def test_update_settings_message_ignores_unknown_provider_credential_ids():
    message = UpdateSettingsMessage(
        id="settings-1",
        type="update-settings",
        user_id="user-1",
        payload={
            "provider_api_keys": {
                "openai": {"enabled": True, "api_key": "sk-openai"},
                "future_provider": {"enabled": True, "api_key": "future"},
            }
        },
    )

    assert message.payload.model_dump(exclude_none=True) == {
        "provider_api_keys": {
            "openai": {"enabled": True, "api_key": "sk-openai"},
        }
    }
