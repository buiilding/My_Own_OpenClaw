import backend.src.api.handlers as handlers
from backend.src.api.handlers import (
    ListModelsHandler,
    LoadSettingsHandler,
    UpdateSettingsHandler,
)


def test_settings_handlers_are_exported_from_handlers_package() -> None:
    assert ListModelsHandler is handlers.ListModelsHandler
    assert LoadSettingsHandler is handlers.LoadSettingsHandler
    assert UpdateSettingsHandler is handlers.UpdateSettingsHandler
    assert "ListModelsHandler" in handlers.__all__
    assert "LoadSettingsHandler" in handlers.__all__
    assert "UpdateSettingsHandler" in handlers.__all__
