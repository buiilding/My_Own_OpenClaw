"""Tests for the multi-provider LLM client."""

import pytest
from unittest.mock import patch, AsyncMock

from backend.agent.llm_client import (
    get_llm_client,
    OpenAIClient,
    AnthropicClient,
    GoogleClient,
    OllamaClient,
    OpenRouterClient,
    MistralClient,
    APIError,
    RateLimitError,
)
from backend.config import (
    AppConfig,
    LLMProviders,
    OpenAIConfig,
    AnthropicConfig,
    GoogleConfig,
    OllamaConfig,
    OpenRouterConfig,
    MistralConfig,
)



# --- Fixtures ---





@pytest.fixture

def mock_config():

    """Provides a mock AppConfig for testing."""

    return AppConfig(

        active_provider="openai",

        llm_providers=LLMProviders(

            openai=OpenAIConfig(),

            anthropic=AnthropicConfig(),

            google=GoogleConfig(),

            ollama=OllamaConfig(),

            openrouter=OpenRouterConfig(),

            mistral=MistralConfig(),

        ),

        api_key="test_api_key",

    )





# --- Tests for the Factory Function ---





@pytest.mark.parametrize(

    "provider_name, expected_class",

    [

        ("openai", OpenAIClient),

        ("anthropic", AnthropicClient),

        ("google", GoogleClient),

        ("ollama", OllamaClient),

        ("openrouter", OpenRouterClient),

        ("mistral", MistralClient),

    ],

)

def test_get_llm_client_factory(mock_config, provider_name, expected_class):

    """Test that the factory returns the correct client for each provider."""

    mock_config.active_provider = provider_name

    client = get_llm_client(mock_config)

    assert isinstance(client, expected_class)





def test_get_llm_client_unsupported_provider(mock_config):

    """Test that the factory raises a ValueError for an unsupported provider."""

    mock_config.active_provider = "unsupported_provider"

    with pytest.raises(ValueError, match="Unsupported LLM provider"):

        get_llm_client(mock_config)





# --- Tests for Concrete Client Implementations ---





@pytest.mark.asyncio

@patch("openai.AsyncOpenAI")

async def test_openai_client_get_completion(mock_async_openai):

    """Test the OpenAI client's get_completion method."""

    # Setup mock

    mock_api_response = AsyncMock()

    mock_api_response.choices = [AsyncMock()]

    mock_api_response.choices[0].message.content = "Hello from OpenAI"



    # The awaited method should return an awaitable

    mock_async_openai.return_value.chat.completions.create = AsyncMock(return_value=mock_api_response)



    # Test

    client = OpenAIClient(api_key="test", model="gpt-4o")

    messages = [{"role": "user", "content": "Hello"}]

    response = await client.get_completion(messages)



    # Assert

    assert response == "Hello from OpenAI"

    mock_async_openai.return_value.chat.completions.create.assert_awaited_once_with(

        model="gpt-4o", messages=messages

    )





@pytest.mark.asyncio

@patch("anthropic.AsyncAnthropic")

async def test_anthropic_client_get_completion(mock_async_anthropic):

    """Test the Anthropic client's get_completion method."""

    mock_api_response = AsyncMock()

    mock_api_response.content = [AsyncMock()]

    mock_api_response.content[0].text = "Hello from Anthropic"

    mock_async_anthropic.return_value.messages.create = AsyncMock(return_value=mock_api_response)



    client = AnthropicClient(api_key="test", model="claude-3.7")

    messages = [{"role": "user", "content": "Hello"}]

    response = await client.get_completion(messages)



    assert response == "Hello from Anthropic"

    mock_async_anthropic.return_value.messages.create.assert_awaited_once()





@pytest.mark.asyncio

@patch("google.generativeai.GenerativeModel")

async def test_google_client_get_completion(mock_gen_model):

    """Test the Google client's get_completion method."""

    mock_api_response = AsyncMock()

    mock_api_response.text = "Hello from Google"

    mock_gen_model.return_value.generate_content_async = AsyncMock(return_value=mock_api_response)



    client = GoogleClient(api_key="test", model="gemini-1.5-pro")

    messages = [{"role": "user", "content": "Hello"}]

    response = await client.get_completion(messages)



    assert response == "Hello from Google"

    mock_gen_model.return_value.generate_content_async.assert_awaited_once()





# --- Tests for Error Handling ---





@pytest.mark.asyncio

@patch("openai.AsyncOpenAI")

async def test_openai_client_api_error(mock_async_openai):

    """Test that OpenAI API errors are correctly wrapped."""

    from openai import APIError as OpenAIAPIError

    mock_async_openai.return_value.chat.completions.create.side_effect = OpenAIAPIError(

        "Test error", request=None, body=None

    )



    client = OpenAIClient(api_key="test", model="gpt-4o")

    with pytest.raises(APIError, match="OpenAI API error"):

        await client.get_completion([{"role": "user", "content": "Hello"}])





@pytest.mark.asyncio

@patch("openai.AsyncOpenAI")

async def test_openai_client_get_completion_stream(mock_async_openai):

    """Test the OpenAI client's streaming get_completion method."""

    # Mock the async stream

    async def mock_stream_generator():

        chunks = [

            {"choices": [{"delta": {"content": "Hello"}}]},

            {"choices": [{"delta": {"content": " from"}}]},

            {"choices": [{"delta": {"content": " OpenAI"}}]},

            {"choices": [{"delta": {"content": "!"}}]},

        ]

        for chunk_data in chunks:

            mock_chunk = AsyncMock()

            mock_chunk.choices = [AsyncMock()]

            mock_chunk.choices[0].delta.content = chunk_data["choices"][0]["delta"]["content"]

            yield mock_chunk



    # The awaited method should return the async generator
    mock_async_openai.return_value.chat.completions.create.return_value = mock_stream_generator()

    client = OpenAIClient(api_key="test", model="gpt-4o")
    messages = [{"role": "user", "content": "Hello"}]

    # Consume the stream and collect the chunks
    stream = await client.get_completion_stream(messages)
    response_chunks = [chunk async for chunk in stream]
    full_response = "".join(response_chunks)

    assert full_response == "Hello from OpenAI!"
    mock_async_openai.return_value.chat.completions.create.assert_awaited_once_with(
        model="gpt-4o", messages=messages, stream=True
    )
