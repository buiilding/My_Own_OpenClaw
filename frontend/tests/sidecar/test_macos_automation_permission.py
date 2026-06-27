"""Covers local-runtime macOS automation permission behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.platform import macos_automation_permission as automation_permission  # noqa: E402


class FakeCompletedProcess:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class FakeAEFramework:
    def __init__(self, determine_status: int):
        def create_desc(_descriptor_type, _payload, _payload_size, _out_desc):
            return 0

        def dispose_desc(_desc):
            return 0

        def determine_permission(_target, _event_class, _event_id, _ask_user_if_needed):
            return determine_status

        self.AECreateDesc = create_desc
        self.AEDisposeDesc = dispose_desc
        self.AEDeterminePermissionToAutomateTarget = determine_permission


def test_determine_system_events_automation_permission_requires_consent(monkeypatch):
    monkeypatch.setattr(automation_permission.platform, "system", lambda: "Darwin")

    result = automation_permission.determine_system_events_automation_permission(
        False,
        ae_framework_loader=lambda: FakeAEFramework(
            automation_permission.ERR_AE_EVENT_WOULD_REQUIRE_USER_CONSENT
        ),
        launch_runner=lambda *args, **kwargs: FakeCompletedProcess(),
    )

    assert result["granted"] is False
    assert result["reason"].startswith("This app still needs permission")
    assert "Windie" "OS" not in result["reason"]
    assert result["details"]["needs_user_consent"] is True
    assert result["details"]["os_status"] == automation_permission.ERR_AE_EVENT_WOULD_REQUIRE_USER_CONSENT


def test_determine_system_events_automation_permission_denial_uses_generic_app_copy(monkeypatch):
    monkeypatch.setattr(automation_permission.platform, "system", lambda: "Darwin")

    result = automation_permission.determine_system_events_automation_permission(
        False,
        ae_framework_loader=lambda: FakeAEFramework(
            automation_permission.ERR_AE_EVENT_NOT_PERMITTED
        ),
        launch_runner=lambda *args, **kwargs: FakeCompletedProcess(),
    )

    assert result["granted"] is False
    assert "Re-enable this app" in result["reason"]
    assert "Windie" "OS" not in result["reason"]
    assert result["details"]["denied"] is True


def test_determine_system_events_automation_permission_reports_granted(monkeypatch):
    monkeypatch.setattr(automation_permission.platform, "system", lambda: "Darwin")

    result = automation_permission.determine_system_events_automation_permission(
        True,
        ae_framework_loader=lambda: FakeAEFramework(0),
        launch_runner=lambda *args, **kwargs: FakeCompletedProcess(),
    )

    assert result["granted"] is True
    assert result["details"]["ask_user_if_needed"] is True
    assert result["details"]["os_status"] == 0


def test_determine_system_events_automation_permission_is_unsupported_off_macos(monkeypatch):
    monkeypatch.setattr(automation_permission.platform, "system", lambda: "Linux")

    result = automation_permission.determine_system_events_automation_permission()

    assert result["granted"] is False
    assert result["details"]["supported"] is False
