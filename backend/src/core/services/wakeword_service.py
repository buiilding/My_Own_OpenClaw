"""
Wakeword Service.

Provides wakeword activation logic and greeting selection policy.
"""
import logging
import random
from typing import Any, Dict

from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)


class WakewordService:
    """
    Service for wakeword activation logic.
    
    Encapsulates policy decisions about how to greet users when wakeword is detected.
    Handler should say "wakeword detected", not "here's how we greet a human".
    """
    
    def __init__(self, config: AppConfig):
        """
        Initialize the wakeword service.
        
        Args:
            config: Application configuration instance
        """
        self.config = config
    
    def select_greeting(self) -> str:
        """
        Select a random greeting from configured greetings.
        
        Returns:
            Selected greeting string
        """
        greetings = self.config.wakeword_greetings
        return random.choice(greetings) if greetings else "Hello! I'm listening."
    
    def get_activation_payload(self, greeting: str) -> Dict[str, Any]:
        """
        Build wakeword activation response payload.
        
        Args:
            greeting: Selected greeting text
            
        Returns:
            Activation payload dictionary
        """
        return {
            "voice_mode_enabled": True,
            "speech_mode_enabled": self.config.speech_mode_enabled,
            "greeting": greeting,
            "status": "listening"
        }
