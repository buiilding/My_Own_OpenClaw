import os
from typing import TYPE_CHECKING

from browser_use.logging_config import setup_logging
from browser_use._lazy_import import resolve_lazy_attr

# Only set up logging if not in MCP mode or if explicitly requested
if os.environ.get('BROWSER_USE_SETUP_LOGGING', 'true').lower() != 'false':
	from browser_use.config import CONFIG

	# Get log file paths from config/environment
	debug_log_file = getattr(CONFIG, 'BROWSER_USE_DEBUG_LOG_FILE', None)
	info_log_file = getattr(CONFIG, 'BROWSER_USE_INFO_LOG_FILE', None)

	# Set up logging with file handlers if specified
	logger = setup_logging(debug_log_file=debug_log_file, info_log_file=info_log_file)
else:
	import logging

	logger = logging.getLogger('browser_use')

# Monkeypatch BaseSubprocessTransport.__del__ to handle closed event loops gracefully
from asyncio import base_subprocess

_original_del = base_subprocess.BaseSubprocessTransport.__del__


def _patched_del(self):
	"""Patched __del__ that handles closed event loops without throwing noisy red-herring errors like RuntimeError: Event loop is closed"""
	try:
		# Check if the event loop is closed before calling the original
		if hasattr(self, '_loop') and self._loop and self._loop.is_closed():
			# Event loop is closed, skip cleanup that requires the loop
			return
		_original_del(self)
	except RuntimeError as e:
		if 'Event loop is closed' in str(e):
			# Silently ignore this specific error
			pass
		else:
			raise


base_subprocess.BaseSubprocessTransport.__del__ = _patched_del


# Type stubs for lazy imports - fixes linter warnings
if TYPE_CHECKING:
	from browser_use.agent.views import ActionModel, ActionResult, AgentHistoryList
	from browser_use.browser import BrowserProfile, BrowserSession
	from browser_use.browser import BrowserSession as Browser
	from browser_use.dom.service import DomService
	from browser_use.llm import models
	from browser_use.llm._type_stubs import (
		ChatGoogle,
		ChatMistral,
		ChatOpenAI,
	)
	from browser_use.tools.service import Controller, Tools

# Lazy imports mapping - only import when actually accessed
_LAZY_IMPORTS = {
	# Agent views
	'ActionModel': ('browser_use.agent.views', 'ActionModel'),
	'ActionResult': ('browser_use.agent.views', 'ActionResult'),
	'AgentHistoryList': ('browser_use.agent.views', 'AgentHistoryList'),
	'BrowserSession': ('browser_use.browser', 'BrowserSession'),
	'Browser': ('browser_use.browser', 'BrowserSession'),  # Alias for BrowserSession
	'BrowserProfile': ('browser_use.browser', 'BrowserProfile'),
	# Tools
	'Tools': ('browser_use.tools.service', 'Tools'),
	'Controller': ('browser_use.tools.service', 'Controller'),  # alias
	# DOM service
	'DomService': ('browser_use.dom.service', 'DomService'),
	# Chat models available in vendored runtime
	'ChatOpenAI': ('browser_use.llm.openai.chat', 'ChatOpenAI'),
	'ChatGoogle': ('browser_use.llm.google.chat', 'ChatGoogle'),
	'ChatMistral': ('browser_use.llm.mistral.chat', 'ChatMistral'),
	# LLM models module
	'models': ('browser_use.llm.models', None),
}


def __getattr__(name: str):
	"""Lazy import mechanism - only import modules when they're actually accessed."""
	return resolve_lazy_attr(
		name=name,
		lazy_imports=_LAZY_IMPORTS,
		module_name=__name__,
		cache=globals(),
	)


__all__ = [
	'BrowserSession',
	'Browser',  # Alias for BrowserSession
	'BrowserProfile',
	'Controller',
	'DomService',
	'ActionResult',
	'ActionModel',
	'AgentHistoryList',
	# Chat models
	'ChatOpenAI',
	'ChatGoogle',
	'ChatMistral',
	'Tools',
	'Controller',
	# LLM models module
	'models',
]
