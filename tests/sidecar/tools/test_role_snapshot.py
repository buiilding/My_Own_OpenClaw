"""Unit tests for role snapshot shaping helpers."""

from tools.browser.role_snapshot import (
    RoleSnapshotOptions,
    build_role_snapshot_from_aria_snapshot,
)


def test_compact_reduces_structural_noise_but_keeps_actionable_refs():
    aria_snapshot = """- group "App"
  - group "Sidebar"
    - group "Menu"
      - link "Home"
      - link "Explore"
  - group "Main"
    - group "Feed"
      - button "Play"
"""

    full_text, full_refs = build_role_snapshot_from_aria_snapshot(
        aria_snapshot,
        RoleSnapshotOptions(compact=False),
    )
    compact_text, compact_refs = build_role_snapshot_from_aria_snapshot(
        aria_snapshot,
        RoleSnapshotOptions(compact=True),
    )

    assert set(compact_refs.keys()) == set(full_refs.keys())
    assert len(compact_text) < len(full_text)
    assert 'group "Sidebar"' not in compact_text
    assert 'group "Main"' not in compact_text
    assert 'group "App"' in compact_text
    assert 'link "Home"' in compact_text
    assert 'link "Explore"' in compact_text
    assert 'button "Play"' in compact_text


def test_compact_falls_back_to_non_empty_output_when_no_refs_exist():
    aria_snapshot = """- group "Container"
  - group "Inner"
"""

    compact_text, refs = build_role_snapshot_from_aria_snapshot(
        aria_snapshot,
        RoleSnapshotOptions(compact=True),
    )

    assert refs == {}
    assert compact_text.strip() == '- group "Container"'
