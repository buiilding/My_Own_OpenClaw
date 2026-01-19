"""
User Configuration Manager.

Manages per-user configuration for frontend-managed settings.
Only the 5 frontend-managed fields are stored per user:
- model_mode
- model_provider
- selected_model_id
- voice_mode_enabled
- speech_mode_enabled

All other config fields remain global/shared.
"""
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional

import yaml
from filelock import FileLock, Timeout

from backend.src.core.config.manager import get_config_dir

logger = logging.getLogger(__name__)

# Fields that are stored per-user (frontend-managed)
FRONTEND_MANAGED_FIELDS = {
    "model_mode",
    "model_provider",
    "selected_model_id",
    "voice_mode_enabled",
    "speech_mode_enabled",
}

USER_CONFIG_FILE_NAME = "config.yaml"


class UserConfigManager:
    """
    Manages per-user configuration for frontend-managed settings.
    """

    def __init__(self):
        """Initialize the user config manager."""
        self._users_dir: Optional[Path] = None

    def _get_users_dir(self) -> Path:
        """Get the users configuration directory."""
        if self._users_dir is None:
            config_dir = get_config_dir()
            self._users_dir = config_dir / "users"
            self._users_dir.mkdir(parents=True, exist_ok=True)
        return self._users_dir

    def _get_user_config_path(self, user_id: str) -> Path:
        """Get the config file path for a specific user."""
        users_dir = self._get_users_dir()
        user_dir = users_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / USER_CONFIG_FILE_NAME

    async def load_user_config(self, user_id: str) -> Dict[str, Any]:
        """
        Load user-specific configuration.
        
        PERFORMANCE FIX: Uses run_in_executor to offload blocking I/O operations
        (file read and YAML parsing) to a thread pool, preventing event loop blocking.

        Args:
            user_id: User identifier

        Returns:
            Dictionary containing only the frontend-managed fields for this user
        """
        config_path = self._get_user_config_path(user_id)

        if not config_path.exists():
            logger.debug(f"No user config found for user {user_id}, returning empty dict")
            return {}

        def _load_sync() -> Dict[str, Any]:
            """Synchronous file I/O and YAML parsing (runs in executor)."""
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    user_config_data = yaml.safe_load(f) or {}

                # Filter to only include frontend-managed fields
                filtered_config = {
                    key: value
                    for key, value in user_config_data.items()
                    if key in FRONTEND_MANAGED_FIELDS
                }

                logger.debug(f"Loaded user config for {user_id}: {filtered_config}")
                return filtered_config
            except (yaml.YAMLError, OSError) as e:
                logger.error(f"Failed to load user config for {user_id}: {e}", exc_info=True)
                return {}
        
        # PERFORMANCE FIX: Offload blocking I/O to thread pool
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _load_sync)

    def _load_user_config_sync(self, user_id: str) -> Dict[str, Any]:
        """
        Synchronous version of load_user_config for use in file lock context.
        
        Internal method used by save_user_config which needs to load within a file lock.
        """
        config_path = self._get_user_config_path(user_id)

        if not config_path.exists():
            return {}

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_config_data = yaml.safe_load(f) or {}

            # Filter to only include frontend-managed fields
            filtered_config = {
                key: value
                for key, value in user_config_data.items()
                if key in FRONTEND_MANAGED_FIELDS
            }

            return filtered_config
        except (yaml.YAMLError, OSError) as e:
            logger.error(f"Failed to load user config for {user_id}: {e}", exc_info=True)
            return {}

    async def save_user_config(self, user_id: str, config_updates: Dict[str, Any]) -> None:
        """
        Save user-specific configuration updates.

        Only saves the frontend-managed fields. Other fields are ignored.
        
        Thread-safe: Uses file locking to prevent race conditions during concurrent writes.

        Args:
            user_id: User identifier
            config_updates: Dictionary of config updates (only frontend fields will be saved)
        """
        config_path = self._get_user_config_path(user_id)
        lock_file = config_path.with_suffix(config_path.suffix + ".lock")

        # Filter to only include frontend-managed fields
        filtered_updates = {
            key: value
            for key, value in config_updates.items()
            if key in FRONTEND_MANAGED_FIELDS
        }

        if not filtered_updates:
            logger.debug(f"No frontend-managed fields to save for user {user_id}")
            return

        # Use file lock to prevent concurrent writes (race conditions)
        lock = FileLock(lock_file, timeout=10.0)  # 10 second timeout
        try:
            with lock:
                # Load existing user config to merge (inside lock to prevent read-modify-write race)
                # Use sync version since we're in a file lock context (blocking I/O is acceptable here)
                existing_config = self._load_user_config_sync(user_id)
                merged_config = {**existing_config, **filtered_updates}

                config_path.parent.mkdir(parents=True, exist_ok=True)
                with open(config_path, "w", encoding="utf-8") as f:
                    yaml.dump(merged_config, f, default_flow_style=False, sort_keys=False)
                logger.info(f"Saved user config for {user_id}: {filtered_updates}")
        except Timeout:
            logger.error(f"Failed to acquire lock for user config file {config_path}: timeout after 10s")
            raise OSError(f"User config file is locked by another process") from None
        except (yaml.YAMLError, OSError) as e:
            logger.error(f"Failed to save user config for {user_id}: {e}", exc_info=True)
            raise

    async def merge_with_global_config(
        self, user_id: str, global_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge user-specific config with global config.

        User config overrides global config for frontend-managed fields.

        Args:
            user_id: User identifier
            global_config: Global configuration dictionary

        Returns:
            Merged configuration dictionary
        """
        user_config = await self.load_user_config(user_id)

        # Start with global config, then override with user-specific values
        merged = {**global_config}
        merged.update(user_config)

        return merged


