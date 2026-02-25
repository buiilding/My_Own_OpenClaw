"""
We have switched all of our code from langchain to openai.types.chat.chat_completion_message_param.

For easier transition we have
"""

from typing import TYPE_CHECKING

# Lightweight imports that are commonly used
from browser_use._lazy_import import resolve_lazy_attr
from browser_use.llm.base import BaseChatModel
from browser_use.llm.messages import (
	AssistantMessage,
	BaseMessage,
	SystemMessage,
	UserMessage,
)
from browser_use.llm.messages import (
	ContentPartImageParam as ContentImage,
)
from browser_use.llm.messages import (
	ContentPartRefusalParam as ContentRefusal,
)
from browser_use.llm.messages import (
	ContentPartTextParam as ContentText,
)

# Type stubs for lazy imports
if TYPE_CHECKING:
	from browser_use.llm._type_stubs import (
		ChatGoogle,
		ChatMistral,
		ChatOpenAI,
	)

	# Type stubs for model instances - enables IDE autocomplete
	openai_gpt_4o: ChatOpenAI
	openai_gpt_4o_mini: ChatOpenAI
	openai_gpt_4_1_mini: ChatOpenAI
	openai_o1: ChatOpenAI
	openai_o1_mini: ChatOpenAI
	openai_o1_pro: ChatOpenAI
	openai_o3: ChatOpenAI
	openai_o3_mini: ChatOpenAI
	openai_o3_pro: ChatOpenAI
	openai_o4_mini: ChatOpenAI
	openai_gpt_5: ChatOpenAI
	openai_gpt_5_mini: ChatOpenAI
	openai_gpt_5_nano: ChatOpenAI

	openrouter_openai_gpt_4o_mini: ChatOpenAI
	ollama_qwen3_32b: ChatOpenAI
	lmstudio_gpt_oss_20b: ChatOpenAI
	kimi_coding_kimi_k2_turbo_preview: ChatOpenAI

	google_gemini_2_0_flash: ChatGoogle
	google_gemini_2_0_pro: ChatGoogle
	google_gemini_2_5_pro: ChatGoogle
	google_gemini_2_5_flash: ChatGoogle
	google_gemini_2_5_flash_lite: ChatGoogle

	mistral_large: ChatMistral
	mistral_medium: ChatMistral
	mistral_small: ChatMistral
	codestral: ChatMistral
	pixtral_large: ChatMistral

# Models are imported on-demand via __getattr__

# Lazy imports mapping for heavy chat models
_LAZY_IMPORTS = {
	'ChatGoogle': ('browser_use.llm.google.chat', 'ChatGoogle'),
	'ChatMistral': ('browser_use.llm.mistral.chat', 'ChatMistral'),
	'ChatOpenAI': ('browser_use.llm.openai.chat', 'ChatOpenAI'),
}

# Cache for model instances - only created when accessed
_model_cache: dict[str, 'BaseChatModel'] = {}


def __getattr__(name: str):
	"""Lazy import mechanism for heavy chat model imports and model instances."""
	if name in _LAZY_IMPORTS:
		return resolve_lazy_attr(
			name=name,
			lazy_imports=_LAZY_IMPORTS,
			module_name=__name__,
		)

	# Check cache first for model instances
	if name in _model_cache:
		return _model_cache[name]

	# Try to get model instances from models module on-demand
	try:
		from browser_use.llm.models import __getattr__ as models_getattr

		attr = models_getattr(name)
		# Cache in our clean cache dict
		_model_cache[name] = attr
		return attr
	except (AttributeError, ImportError):
		pass

	raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
	# Message types -> for easier transition from langchain
	'BaseMessage',
	'UserMessage',
	'SystemMessage',
	'AssistantMessage',
	# Content parts with better names
	'ContentText',
	'ContentRefusal',
	'ContentImage',
	# Chat models
	'BaseChatModel',
	'ChatOpenAI',
	'ChatGoogle',
	'ChatMistral',
]
