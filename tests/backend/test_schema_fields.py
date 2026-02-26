from pydantic.fields import PydanticUndefined

from backend.src.tools.schema_fields import (
    EXPLANATION_FIELD_DESCRIPTION,
    POST_ACTION_WAIT_DESCRIPTION,
    explanation_field,
    post_action_wait_field,
)


def test_explanation_field_is_required_and_has_expected_description():
    field_info = explanation_field()

    assert field_info.description == EXPLANATION_FIELD_DESCRIPTION
    assert field_info.default is PydanticUndefined
    assert field_info.is_required()


def test_post_action_wait_field_has_default_and_expected_description():
    field_info = post_action_wait_field()
    custom = post_action_wait_field(default=1.25)

    assert field_info.description == POST_ACTION_WAIT_DESCRIPTION
    assert field_info.default == 0.0
    assert custom.default == 1.25
