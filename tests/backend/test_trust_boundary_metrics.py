import threading
import time

import pytest

from backend.src.core.observability.trust_boundary_metrics import (
    BoundaryViolationMetrics,
    METRICS_HISTORY_LIMIT,
    MetricsService,
    STATS_SAMPLE_WINDOW,
)


def test_violation_history_is_bounded(monkeypatch):
    metrics = BoundaryViolationMetrics()
    monkeypatch.setattr(
        "backend.src.core.observability.trust_boundary_metrics.logger.warning",
        lambda *args, **kwargs: None,
    )

    total_records = METRICS_HISTORY_LIMIT + 200
    for i in range(total_records):
        metrics.record_size_violation(
            actual_size=i,
            max_size=100,
            boundary_name="parser",
        )

    assert len(metrics.rejected_sizes) == METRICS_HISTORY_LIMIT
    assert len(metrics.violation_details) == METRICS_HISTORY_LIMIT
    assert metrics.rejected_sizes[0] == total_records - METRICS_HISTORY_LIMIT
    assert metrics.rejected_sizes[-1] == total_records - 1


def test_get_stats_uses_sampling_window(monkeypatch):
    metrics = BoundaryViolationMetrics()
    monkeypatch.setattr(
        "backend.src.core.observability.trust_boundary_metrics.logger.warning",
        lambda *args, **kwargs: None,
    )

    for i in range(1, STATS_SAMPLE_WINDOW + 51):
        metrics.record_size_violation(
            actual_size=i,
            max_size=1000,
            boundary_name="prompt_constructor",
        )

    stats = metrics.get_stats()
    rejected_stats = stats["rejected_size_stats"]

    assert rejected_stats["count"] == STATS_SAMPLE_WINDOW
    assert rejected_stats["min"] == 51
    assert rejected_stats["max"] == STATS_SAMPLE_WINDOW + 50
    assert rejected_stats["avg"] == pytest.approx(100.5)


def test_metrics_service_reset_all_metrics(monkeypatch):
    service = MetricsService()
    monkeypatch.setattr(
        "backend.src.core.observability.trust_boundary_metrics.logger.warning",
        lambda *args, **kwargs: None,
    )

    parser_metrics = service.get_metrics("response_parser")
    prompt_metrics = service.get_metrics("prompt_constructor")
    parser_metrics.record_validation_violation(
        validation_errors=["bad shape"],
        boundary_name="response_parser",
    )
    prompt_metrics.record_timeout_violation(
        timeout_seconds=5.0,
        boundary_name="prompt_constructor",
    )

    service.reset_all_metrics()
    all_stats = service.get_all_metrics()

    assert all_stats["response_parser"]["total_violations"] == 0
    assert all_stats["prompt_constructor"]["total_violations"] == 0


def test_get_all_metrics_releases_registry_lock_before_stats(monkeypatch):
    service = MetricsService()
    metrics = service.get_metrics("response_parser")

    started = threading.Event()
    release = threading.Event()
    original_get_stats = metrics.get_stats

    def blocked_get_stats():
        started.set()
        release.wait(timeout=5)
        return original_get_stats()

    monkeypatch.setattr(metrics, "get_stats", blocked_get_stats)

    results = {}

    def run_get_all():
        results["stats"] = service.get_all_metrics()

    worker = threading.Thread(target=run_get_all)
    worker.start()
    assert started.wait(timeout=5)

    start = time.monotonic()
    # Should not block on get_all_metrics() while per-metric stats are running.
    new_metrics = service.get_metrics("prompt_constructor")
    elapsed = time.monotonic() - start

    release.set()
    worker.join(timeout=5)

    assert new_metrics.boundary_name == "prompt_constructor"
    assert elapsed < 0.2
    assert "response_parser" in results["stats"]
