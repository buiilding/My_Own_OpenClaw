"""Shared type-only chat model imports for TYPE_CHECKING blocks."""

from browser_use.llm.anthropic.chat import ChatAnthropic
from browser_use.llm.aws.chat_anthropic import ChatAnthropicBedrock
from browser_use.llm.aws.chat_bedrock import ChatAWSBedrock
from browser_use.llm.azure.chat import ChatAzureOpenAI
from browser_use.llm.browser_use.chat import ChatBrowserUse
from browser_use.llm.cerebras.chat import ChatCerebras
from browser_use.llm.deepseek.chat import ChatDeepSeek
from browser_use.llm.google.chat import ChatGoogle
from browser_use.llm.groq.chat import ChatGroq
from browser_use.llm.mistral.chat import ChatMistral
from browser_use.llm.oci_raw.chat import ChatOCIRaw
from browser_use.llm.ollama.chat import ChatOllama
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.llm.openrouter.chat import ChatOpenRouter
from browser_use.llm.vercel.chat import ChatVercel
