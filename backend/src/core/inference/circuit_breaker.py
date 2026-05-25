"""Small circuit breaker used by inference capability routers."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Optional

from backend.src.core.inference.errors import ProviderCircuitOpenError


@dataclass
class CircuitState:
    failure_count: int = 0
    opened_until: Optional[float] = None
    last_error: Optional[str] = None


class ProviderCircuitBreaker:
    """Track repeated provider failures and temporarily stop routing requests."""

    def __init__(
        self,
        *,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60.0,
        time_func: Callable[[], float] = time.monotonic,
    ) -> None:
        self.failure_threshold = max(1, int(failure_threshold))
        self.cooldown_seconds = max(0.1, float(cooldown_seconds))
        self._time_func = time_func
        self._state = CircuitState()

    @property
    def failure_count(self) -> int:
        return self._state.failure_count

    @property
    def last_error(self) -> Optional[str]:
        return self._state.last_error

    @property
    def is_open(self) -> bool:
        opened_until = self._state.opened_until
        if opened_until is None:
            return False
        if self._time_func() >= opened_until:
            self.reset()
            return False
        return True

    @property
    def remaining_cooldown_seconds(self) -> Optional[float]:
        if self._state.opened_until is None:
            return None
        remaining = self._state.opened_until - self._time_func()
        return max(0.0, remaining)

    def reset(self) -> None:
        self._state = CircuitState()

    def configure(self, *, failure_threshold: int, cooldown_seconds: float) -> None:
        self.failure_threshold = max(1, int(failure_threshold))
        self.cooldown_seconds = max(0.1, float(cooldown_seconds))
        if self._state.failure_count < self.failure_threshold:
            self._state.opened_until = None

    def ensure_closed(self, *, capability: str, provider_id: str) -> None:
        if not self.is_open:
            return
        raise ProviderCircuitOpenError(
            capability=capability,
            provider_id=provider_id,
            message=(f"{capability} provider circuit is open after repeated failures"),
            retry_after_seconds=self.remaining_cooldown_seconds,
            details={
                "failure_count": self._state.failure_count,
                "failure_threshold": self.failure_threshold,
                "last_error": self._state.last_error,
            },
        )

    def record_success(self) -> None:
        opened_until = self._state.opened_until
        if opened_until is not None and self._time_func() < opened_until:
            return
        self.reset()

    def record_failure(self, error: BaseException | str) -> None:
        self._state.failure_count += 1
        self._state.last_error = str(error)
        if self._state.failure_count >= self.failure_threshold:
            self._state.opened_until = self._time_func() + self.cooldown_seconds
