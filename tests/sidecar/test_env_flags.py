from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.env_flags import env_flag_enabled  # noqa: E402


def test_env_flag_enabled_resolves_truthy_values(monkeypatch) -> None:
    monkeypatch.setenv("WINDIE_TEST_FLAG", " yes ")

    assert env_flag_enabled("WINDIE_TEST_FLAG", default=False) is True


def test_env_flag_enabled_resolves_falsy_values(monkeypatch) -> None:
    monkeypatch.setenv("WINDIE_TEST_FLAG", "off")

    assert env_flag_enabled("WINDIE_TEST_FLAG", default=True) is False


def test_env_flag_enabled_falls_back_to_default_for_unknown_value(monkeypatch) -> None:
    monkeypatch.setenv("WINDIE_TEST_FLAG", "definitely")

    assert env_flag_enabled("WINDIE_TEST_FLAG", default=False) is False
