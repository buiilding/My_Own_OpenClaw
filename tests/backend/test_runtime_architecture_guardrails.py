"""Covers runtime architecture guardrails behavior in the backend test suite."""

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _read(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text(encoding="utf-8")


def _assigns_dunder_all(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "__all__"
            for target in node.targets
        ):
            return True
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == "__all__":
                return True
    return False


def test_session_manager_is_no_longer_the_owner_of_transition_alias_state():
    manager_source = _read("backend/src/agent/session/manager.py")

    assert "self.active_sessions =" not in manager_source
    assert "self._user_locks =" not in manager_source
    assert "self._active_query_tasks =" not in manager_source
    assert "self._client_operating_systems =" not in manager_source
    assert "self._latest_conversation_refs =" not in manager_source
    assert "self._user_config_overrides =" not in manager_source


def test_session_registry_does_not_assemble_config():
    registry_source = _read("backend/src/agent/session/session_registry.py")

    assert "AppConfig" not in registry_source
    assert "render_system_prompt" not in registry_source
    assert "update_config(" not in registry_source


def test_session_config_service_does_not_own_query_cancellation():
    config_source = _read("backend/src/agent/session/session_config_service.py")

    assert "register_active_query_task" not in config_source
    assert "cancel_active_query_task" not in config_source
    assert "pending_stop_requests" not in config_source


def test_parser_types_import_from_owner_module():
    disallowed_import = "from backend.src.llm.parser import " + "Parsed"
    for path in [
        *REPO_ROOT.glob("backend/src/**/*.py"),
        *REPO_ROOT.glob("tests/backend/**/*.py"),
    ]:
        if path.as_posix().endswith("backend/src/llm/parser.py"):
            continue
        source = path.read_text(encoding="utf-8")
        assert disallowed_import not in source, path


def test_backend_modules_do_not_publish_wildcard_export_lists():
    allowed_export_surfaces = {
        REPO_ROOT / "backend/src/api/routes/__init__.py",
    }

    for path in REPO_ROOT.glob("backend/src/**/*.py"):
        if path in allowed_export_surfaces:
            continue
        assert not _assigns_dunder_all(path), path


def test_api_topology_map_does_not_document_removed_package_exports():
    source_map = _read("backend/src/api/folder_structure.md")

    assert source_map.count("__init__.py") == 1
    assert "API_ROUTERS app assembly registration surface" in source_map
    assert "Package initialization and exports" not in source_map
    assert "Package marker" not in source_map
    assert "Package exports" not in source_map
    assert "Schema package exports" not in source_map
    assert "Package router export" not in source_map
    assert "Exports:" not in source_map


def test_backend_runtime_docs_use_sdk_client_boundary_wording():
    session_source = _read("backend/src/agent/session/session.py")
    synthetic_reference = _read(
        "docs/backend/tools/processing/synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md"
    )
    frontend_architecture = _read("docs/architecture/frontend_architecture.md")

    assert "client runtime system_state payload" in session_source
    assert "SDK/client transport" in session_source
    assert "SDK/local-runtime event ordering guarantees" in synthetic_reference
    assert "SDK/local-runtime protocol-ordering issues" in synthetic_reference
    assert "SDK/main local-runtime dispatch" in synthetic_reference
    assert "rebuilding provider history in renderer code" in frontend_architecture
    assert "system_state payload captured by the frontend" not in session_source
    assert "Active conversation identity from frontend" not in session_source
    assert "frontend event ordering guarantees" not in synthetic_reference
    assert "frontend protocol-ordering issues" not in synthetic_reference
    assert "tool never executed on frontend" not in synthetic_reference
    assert "renderer-owned runtime" not in frontend_architecture


def test_backend_protocol_docs_use_sdk_renderer_correlation_wording():
    transport_reference = _read(
        "docs/backend/api/transport/safe_websocket_and_transport_envelope_reference.md"
    )
    state_reference = _read(
        "docs/backend/inventory/protocols/state/backend_protocol_identity_and_context_field_propagation_reference.md"
    )
    combined = f"{transport_reference}\n{state_reference}"

    assert "SDK/renderer turn/session correlation" in transport_reference
    assert "SDK/renderer event correlation expectations" in state_reference
    assert "frontend turn/session correlation" not in combined
    assert "frontend event correlation expectations" not in combined


def test_backend_formatter_docs_use_sdk_renderer_typed_consumer_wording():
    formatter_reference = _read(
        "docs/backend/api/processing/formatters/signals/"
        "token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md"
    )

    assert "SDK/renderer typed message guards" in formatter_reference
    assert "typed frontend schema guards" not in formatter_reference
    assert "frontend schema guards" not in formatter_reference
