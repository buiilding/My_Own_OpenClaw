"""
Trust Boundary Metrics and Observability.

Tracks structured metrics for trust boundary violations to enable:
- Detection of active abuse patterns
- Production limit tuning based on real usage
- Security incident detection
- Performance monitoring
"""
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Deque, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

METRICS_HISTORY_LIMIT = 1000
STATS_SAMPLE_WINDOW = 100


def _numeric_stats(values: Sequence[float]) -> Dict[str, Optional[float]]:
    """Calculate count/min/max/avg for a numeric sequence."""
    if not values:
        return {"count": 0, "min": None, "max": None, "avg": None}
    return {
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "avg": sum(values) / len(values),
    }


@dataclass
class BoundaryViolationMetrics:
    """Structured metrics for trust boundary violations."""
    
    # Counters by violation type
    size_limit_violations: int = 0
    timeout_violations: int = 0
    validation_violations: int = 0
    total_violations: int = 0
    
    # Size distribution tracking (for tuning limits)
    rejected_sizes: Deque[int] = field(
        default_factory=lambda: deque(maxlen=METRICS_HISTORY_LIMIT)
    )  # Actual sizes that were rejected
    timeout_durations: Deque[float] = field(
        default_factory=lambda: deque(maxlen=METRICS_HISTORY_LIMIT)
    )  # How long before timeout
    
    # Violation details for analysis
    violation_details: Deque[Dict[str, Any]] = field(
        default_factory=lambda: deque(maxlen=METRICS_HISTORY_LIMIT)
    )
    
    # Boundary name for context
    boundary_name: str = "unknown"
    
    _lock: Lock = field(default_factory=Lock, init=False, compare=False)
    
    def record_size_violation(
        self,
        actual_size: int,
        max_size: int,
        boundary_name: str,
        metadata: Optional[Dict] = None
    ) -> None:
        """Record a size limit violation."""
        with self._lock:
            self.size_limit_violations += 1
            self.total_violations += 1
            self.rejected_sizes.append(actual_size)
            self.violation_details.append({
                "type": "size_limit",
                "actual_size": actual_size,
                "max_size": max_size,
                "boundary_name": boundary_name,
                "timestamp": time.time(),
                "metadata": metadata or {},
            })
            
            # Structured logging for observability
            logger.warning(
                "Trust boundary size limit violation",
                extra={
                    "boundary_name": boundary_name,
                    "violation_type": "size_limit",
                    "actual_size": actual_size,
                    "max_size": max_size,
                    "ratio": actual_size / max_size if max_size > 0 else 0,
                    "metadata": metadata or {},
                }
            )
    
    def record_timeout_violation(
        self,
        timeout_seconds: float,
        boundary_name: str,
        metadata: Optional[Dict] = None
    ) -> None:
        """Record a timeout violation."""
        with self._lock:
            self.timeout_violations += 1
            self.total_violations += 1
            self.timeout_durations.append(timeout_seconds)
            self.violation_details.append({
                "type": "timeout",
                "timeout_seconds": timeout_seconds,
                "boundary_name": boundary_name,
                "timestamp": time.time(),
                "metadata": metadata or {},
            })
            
            logger.warning(
                "Trust boundary timeout violation",
                extra={
                    "boundary_name": boundary_name,
                    "violation_type": "timeout",
                    "timeout_seconds": timeout_seconds,
                    "metadata": metadata or {},
                }
            )
    
    def record_validation_violation(
        self,
        validation_errors: List[str],
        boundary_name: str,
        metadata: Optional[Dict] = None
    ) -> None:
        """Record a validation violation."""
        with self._lock:
            self.validation_violations += 1
            self.total_violations += 1
            self.violation_details.append({
                "type": "validation",
                "validation_errors": validation_errors,
                "boundary_name": boundary_name,
                "timestamp": time.time(),
                "metadata": metadata or {},
            })
            
            logger.warning(
                "Trust boundary validation violation",
                extra={
                    "boundary_name": boundary_name,
                    "violation_type": "validation",
                    "validation_errors": validation_errors,
                    "error_count": len(validation_errors),
                    "metadata": metadata or {},
                }
            )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics snapshot."""
        with self._lock:
            # Copy snapshots quickly under lock; expensive aggregation happens outside.
            rejected_sizes = tuple(self.rejected_sizes)
            timeout_durations = tuple(self.timeout_durations)
            boundary_name = self.boundary_name
            total_violations = self.total_violations
            size_limit_violations = self.size_limit_violations
            timeout_violations = self.timeout_violations
            validation_violations = self.validation_violations

        rejected_size_window = rejected_sizes[-STATS_SAMPLE_WINDOW:]
        timeout_window = timeout_durations[-STATS_SAMPLE_WINDOW:]

        return {
            "boundary_name": boundary_name,
            "total_violations": total_violations,
            "size_limit_violations": size_limit_violations,
            "timeout_violations": timeout_violations,
            "validation_violations": validation_violations,
            "rejected_size_stats": _numeric_stats(rejected_size_window),
            "timeout_stats": _numeric_stats(timeout_window),
        }
    
    def reset(self) -> None:
        """Reset all metrics (for testing)."""
        with self._lock:
            self.size_limit_violations = 0
            self.timeout_violations = 0
            self.validation_violations = 0
            self.total_violations = 0
            self.rejected_sizes.clear()
            self.timeout_durations.clear()
            self.violation_details.clear()


class MetricsService:
    """
    Service for managing trust boundary violation metrics.
    
    Encapsulates metrics registry to enable proper dependency injection
    and test isolation. Replaces module-level globals.
    """
    
    def __init__(self):
        """Initialize the metrics service."""
        self._boundary_metrics: Dict[str, BoundaryViolationMetrics] = defaultdict(
            lambda: BoundaryViolationMetrics()
        )
        self._metrics_lock = Lock()
    
    def get_metrics(self, boundary_name: str) -> BoundaryViolationMetrics:
        """
        Get metrics instance for a boundary.
        
        Args:
            boundary_name: Name of the trust boundary
            
        Returns:
            BoundaryViolationMetrics instance for the boundary
        """
        with self._metrics_lock:
            metrics = self._boundary_metrics[boundary_name]
            if not metrics.boundary_name or metrics.boundary_name == "unknown":
                metrics.boundary_name = boundary_name
            return metrics
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get statistics for all boundaries.
        
        Returns:
            Dictionary mapping boundary names to their statistics
        """
        with self._metrics_lock:
            return {
                name: metrics.get_stats()
                for name, metrics in self._boundary_metrics.items()
            }
    
    def reset_all_metrics(self) -> None:
        """
        Reset all metrics (for testing).
        
        Clears all boundary metrics to enable clean test isolation.
        """
        with self._metrics_lock:
            for metrics in self._boundary_metrics.values():
                metrics.reset()

