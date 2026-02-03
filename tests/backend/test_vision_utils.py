from backend.src.services.vision.utils import normalize_model_name


def test_normalize_model_name_default_when_none():
    assert normalize_model_name(None) == "OpenGVLab/InternVL3_5-4B"


def test_normalize_model_name_strips_prefix():
    assert normalize_model_name("huggingface-local/ModelA") == "ModelA"


def test_normalize_model_name_returns_original_when_no_prefix():
    assert normalize_model_name("OpenGVLab/InternVL3_5-4B") == "OpenGVLab/InternVL3_5-4B"
