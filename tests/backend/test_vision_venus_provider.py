import pytest

import backend.src.services.vision.providers.ui_venus as venus_module


class _FakeTensor:
    def __init__(self, rows):
        self.rows = rows
        self.shape = (len(rows), len(rows[0]) if rows else 0)

    def __getitem__(self, key):
        if isinstance(key, tuple):
            row_selector, col_selector = key
            selected_rows = self.rows[row_selector]
            if isinstance(selected_rows, list) and selected_rows and not isinstance(
                selected_rows[0], list
            ):
                selected_rows = [selected_rows]
            return _FakeTensor([row[col_selector] for row in selected_rows])
        return self.rows[key]


class _FakeProcessor:
    def batch_decode(self, output_ids, skip_special_tokens=True):
        del skip_special_tokens
        return [" ".join(str(token) for token in output_ids.rows[0])]


def test_decode_generated_text_uses_generated_suffix_when_input_ids_present():
    model = venus_module.VenusVisionModel.__new__(venus_module.VenusVisionModel)
    model.processor = _FakeProcessor()
    output_ids = _FakeTensor([[10, 20, 30, 40, 50]])
    inputs = {"input_ids": _FakeTensor([[10, 20, 30]])}

    output = model._decode_generated_text(output_ids, inputs)

    assert output == "40 50"


def test_decode_generated_text_uses_full_output_without_input_ids():
    model = venus_module.VenusVisionModel.__new__(venus_module.VenusVisionModel)
    model.processor = _FakeProcessor()
    output_ids = _FakeTensor([[10, 20, 30]])

    output = model._decode_generated_text(output_ids, inputs={})

    assert output == "10 20 30"


def test_load_raises_import_error_when_venus_dependencies_unavailable(monkeypatch):
    monkeypatch.setattr(venus_module, "VENUS_MODEL_DEPS_AVAILABLE", False)
    model = venus_module.VenusVisionModel.__new__(venus_module.VenusVisionModel)
    model.model_name = "inclusionAI/UI-Venus-Ground-7B"
    model.trust_remote_code = True

    with pytest.raises(ImportError, match="Vision model dependencies not available"):
        model._load()
