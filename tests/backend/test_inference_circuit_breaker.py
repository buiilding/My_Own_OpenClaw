from backend.src.core.inference.circuit_breaker import ProviderCircuitBreaker


def test_success_does_not_close_open_circuit_before_cooldown() -> None:
    now = 10.0
    breaker = ProviderCircuitBreaker(
        failure_threshold=2,
        cooldown_seconds=30.0,
        time_func=lambda: now,
    )

    breaker.record_failure("first")
    breaker.record_failure("second")

    assert breaker.is_open is True
    breaker.record_success()

    assert breaker.is_open is True
    assert breaker.failure_count == 2
    assert breaker.last_error == "second"


def test_success_resets_failures_when_circuit_is_closed() -> None:
    breaker = ProviderCircuitBreaker(
        failure_threshold=2,
        cooldown_seconds=30.0,
    )

    breaker.record_failure("first")
    breaker.record_success()

    assert breaker.is_open is False
    assert breaker.failure_count == 0
    assert breaker.last_error is None
