"""Covers local-runtime scroll config behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.computer import scroll_config  # noqa: E402


def test_get_os_scroll_multiplier_windows_uses_registry_when_available(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Windows")
    monkeypatch.setattr(scroll_config, "_get_windows_scroll_lines", lambda: 6)

    assert scroll_config.get_os_scroll_multiplier() == 0.5


def test_get_os_scroll_multiplier_windows_falls_back_to_default_when_registry_missing(
    monkeypatch,
):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Windows")
    monkeypatch.setattr(scroll_config, "_get_windows_scroll_lines", lambda: None)

    assert scroll_config.get_os_scroll_multiplier() == 1.0


def test_get_os_scroll_multiplier_unknown_os_uses_linux_defaults(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Plan9")

    assert scroll_config.get_os_scroll_multiplier() == 1.0


def test_calculate_scroll_clicks_uses_default_units_when_unspecified(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Darwin")

    assert scroll_config.calculate_scroll_clicks(None, "down") == 8


def test_calculate_scroll_clicks_enforces_minimum_one_click():
    assert scroll_config.calculate_scroll_clicks(1, "up") == 1


def test_get_scroll_diagnostics_reports_custom_windows_setting(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Windows")
    monkeypatch.setattr(scroll_config, "get_os_scroll_multiplier", lambda: 0.75)
    monkeypatch.setattr(scroll_config, "_get_windows_scroll_lines", lambda: 4)

    diagnostics = scroll_config.get_scroll_diagnostics()

    assert diagnostics["os"] == "Windows"
    assert diagnostics["multiplier"] == 0.75
    assert diagnostics["using_custom_windows_setting"] is True
    assert diagnostics["os_default_lines_per_tick"] == 3


def test_get_default_scroll_clicks_uses_windows_default(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Windows")

    assert scroll_config.get_default_scroll_clicks() == 5


def test_get_default_scroll_clicks_uses_macos_default(monkeypatch):
    monkeypatch.setattr(scroll_config.platform, "system", lambda: "Darwin")

    assert scroll_config.get_default_scroll_clicks() == 8
