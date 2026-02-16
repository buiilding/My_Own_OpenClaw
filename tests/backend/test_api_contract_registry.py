"""API contract registry drift tests."""

from __future__ import annotations

from typing import get_args

import pytest

import backend.src.api.contracts.registry as registry_module
from backend.src.api.contracts.message_types import (
    INCOMING_MESSAGE_TYPES,
    OUTGOING_SCHEMA_MESSAGE_TYPES,
)
from backend.src.api.contracts.registry import (
    INCOMING_CONTRACTS,
    OUTGOING_SCHEMA_CONTRACTS,
    get_formatter_specs,
    get_outgoing_schema_message_types,
    validate_registry_alignment,
)
from backend.src.api.schemas.incoming import QueryMessage
from backend.src.api.schemas.outgoing import ErrorResponse
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.schemas.incoming import IncomingMessage


def _literal_value(model_cls: type) -> str:
    annotation = model_cls.model_fields["type"].annotation
    origin = get_args(annotation)
    if not origin:
        raise AssertionError(f"Expected Literal type annotation for {model_cls.__name__}")
    return origin[0]


def test_incoming_message_type_constants_unique() -> None:
    assert len(set(INCOMING_MESSAGE_TYPES)) == len(INCOMING_MESSAGE_TYPES)


def test_outgoing_schema_message_type_constants_unique() -> None:
    assert len(set(OUTGOING_SCHEMA_MESSAGE_TYPES)) == len(OUTGOING_SCHEMA_MESSAGE_TYPES)


def test_incoming_contracts_match_schema_literals() -> None:
    for contract in INCOMING_CONTRACTS:
        assert _literal_value(contract.model) == contract.message_type


def test_incoming_contracts_match_incoming_union_models() -> None:
    union_type = get_args(IncomingMessage)[0]
    union_models = set(get_args(union_type))
    contract_models = {contract.model for contract in INCOMING_CONTRACTS}
    assert union_models == contract_models


def test_outgoing_schema_contracts_match_schema_literals() -> None:
    for contract in OUTGOING_SCHEMA_CONTRACTS:
        assert _literal_value(contract.model) == contract.message_type


def test_formatter_specs_align_with_response_formatter_dispatch() -> None:
    formatter = ResponseFormatter()
    specs = get_formatter_specs()

    spec_event_classes = [event_cls for event_cls, _, _, _ in specs]
    spec_stream_event_types = [event_type for _, event_type, _, _ in specs]
    spec_outgoing_types = [outgoing_type for _, _, _, outgoing_type in specs]

    assert len(spec_event_classes) == len(set(spec_event_classes))
    assert len(spec_stream_event_types) == len(set(spec_stream_event_types))
    assert set(spec_stream_event_types) == set(formatter._formatters.keys())
    assert set(spec_event_classes) == set(formatter._typed_formatters.keys())
    assert set(spec_outgoing_types).issubset(get_outgoing_schema_message_types())


def test_validate_registry_alignment_passes() -> None:
    validate_registry_alignment()


def test_get_formatter_specs_proxies_contract_registry(monkeypatch) -> None:
    sentinel = ((object, "evt", object, "out"),)
    monkeypatch.setattr(
        registry_module,
        "get_formatter_specs_from_registry",
        lambda: sentinel,
    )

    assert registry_module.get_formatter_specs() is sentinel


def test_validate_registry_alignment_raises_for_incoming_mismatch(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        registry_module,
        "INCOMING_CONTRACTS",
        (registry_module.MessageContract("query", QueryMessage),),
    )

    with pytest.raises(ValueError, match="Incoming contract type mismatch"):
        registry_module.validate_registry_alignment()


def test_validate_registry_alignment_raises_for_outgoing_mismatch(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        registry_module,
        "OUTGOING_SCHEMA_CONTRACTS",
        (registry_module.MessageContract("error", ErrorResponse),),
    )

    with pytest.raises(ValueError, match="Outgoing schema contract type mismatch"):
        registry_module.validate_registry_alignment()
