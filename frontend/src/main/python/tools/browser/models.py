from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class PageSnapshot:
    """AI-friendly page snapshot."""

    text: str
    url: str = ""
    title: str = ""
    ref_count: int = 0
    refs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    stats: Optional[Dict[str, int]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot": self.text,
            "url": self.url,
            "title": self.title,
            "ref_count": self.ref_count,
            "refs": self.refs,
            "stats": self.stats,
        }


@dataclass
class BrowserTab:
    """Represents a browser tab."""

    target_id: str
    title: str
    url: str
