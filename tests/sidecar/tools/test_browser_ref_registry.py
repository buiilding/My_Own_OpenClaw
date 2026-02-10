"""
Unit tests for the browser ref registry (no Playwright dependency).
"""

from tools.browser.ref_registry import RefRegistry


class TestRefRegistry:
    def test_first_snapshot_has_no_new_markers(self):
        reg = RefRegistry()
        ref1, is_new1 = reg.assign(key="k1", url="https://example.com")
        ref2, is_new2 = reg.assign(key="k2", url="https://example.com")

        assert ref1 == "1"
        assert ref2 == "2"
        assert is_new1 is False
        assert is_new2 is False

        reg.finalize_snapshot(seen_refs={ref1, ref2}, url="https://example.com")

    def test_new_elements_marked_on_subsequent_snapshot(self):
        reg = RefRegistry()

        r1, n1 = reg.assign(key="k1", url="https://example.com")
        reg.finalize_snapshot(seen_refs={r1}, url="https://example.com")
        assert n1 is False

        # Existing element: not new.
        r1b, n1b = reg.assign(key="k1", url="https://example.com")
        assert r1b == r1
        assert n1b is False

        # New element: should be marked new.
        r2, n2 = reg.assign(key="k2", url="https://example.com")
        assert r2 == "2"
        assert n2 is True

    def test_url_change_resets_refs(self):
        reg = RefRegistry()

        r1, _ = reg.assign(key="k1", url="https://example.com")
        reg.finalize_snapshot(seen_refs={r1}, url="https://example.com")

        # Navigation / URL change resets numbering.
        r1_new_page, is_new = reg.assign(key="k1", url="https://other.example.com")
        assert r1_new_page == "1"
        assert is_new is False

