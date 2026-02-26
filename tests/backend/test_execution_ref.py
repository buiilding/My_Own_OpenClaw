from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef


def test_execution_ref_single_and_bundle_constructors():
    single = ExecutionRef.single("req-1")
    bundle = ExecutionRef.bundle("bundle-1")

    assert single.kind == "single"
    assert single.request_id == "req-1"
    assert single.bundle_id is None
    assert single.correlation_id == "req-1"

    assert bundle.kind == "bundle"
    assert bundle.request_id is None
    assert bundle.bundle_id == "bundle-1"
    assert bundle.correlation_id == "bundle-1"


def test_execution_ref_from_metadata_prefers_request_id_over_bundle_id():
    ref = ExecutionRef.from_metadata({"request_id": "req-2", "bundle_id": "bundle-2"})

    assert ref is not None
    assert ref.kind == "single"
    assert ref.request_id == "req-2"
    assert ref.bundle_id is None


def test_execution_ref_from_metadata_returns_none_for_invalid_payloads():
    assert ExecutionRef.from_metadata(None) is None
    assert ExecutionRef.from_metadata("not-a-dict") is None
    assert ExecutionRef.from_metadata({}) is None
    assert ExecutionRef.from_metadata({"request_id": ""}) is None
    assert ExecutionRef.from_metadata({"bundle_id": ""}) is None


def test_execution_ref_apply_to_metadata_rewrites_correlation_keys():
    single = ExecutionRef.single("req-3")
    bundle = ExecutionRef.bundle("bundle-3")

    single_meta = single.apply_to_metadata({"bundle_id": "old-bundle", "x": 1})
    bundle_meta = bundle.apply_to_metadata({"request_id": "old-req", "y": 2})

    assert single_meta == {"request_id": "req-3", "x": 1}
    assert bundle_meta == {"bundle_id": "bundle-3", "y": 2}
