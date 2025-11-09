from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class EpisodicMemory(BaseModel):
    type: str = "episodic"
    timestamp: datetime = Field(default_factory=datetime.now)
    user_id: str
    session_id: str
    content: str


class SemanticMemory(BaseModel):
    type: str = "semantic"
    timestamp: datetime = Field(default_factory=datetime.now)
    source_session_id: str
    user_id: str
    content: str
