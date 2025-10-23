# API Reference

This document provides a reference for the core public APIs and abstract base classes within the backend.

---

## `LLMClient` Abstract Base Class

**Module**: `backend.agent.llm_client`

This is the abstract base class that defines the common interface for all Large Language Model (LLM) clients. Its purpose is to abstract away provider-specific details, allowing the agent to interact with any supported LLM through a consistent API.

### Methods

---

#### `async def get_completion(messages)`

Gets a standard, non-streaming completion from the LLM.

- **Arguments**:
  - `messages` (`List[Dict[str, str]]`): A list of message dictionaries, following the format `[{"role": "user", "content": "Hello"}]`. The "role" can typically be "system", "user", or "assistant".

- **Returns**:
  - `str`: The complete text response from the assistant.

- **Raises**:
  - `APIError`: For general, non-specific API errors from the provider.
  - `RateLimitError`: If the API call fails due to a rate limit. The client will automatically retry a few times with exponential backoff before raising this exception.

---

#### `async def get_completion_stream(messages)`

Gets a streaming completion from the LLM. This method is an async generator.

- **Arguments**:
  - `messages` (`List[Dict[str, str]]`): A list of message dictionaries, same as `get_completion`.

- **Yields**:
  - `str`: Text chunks from the assistant's response as they are generated.

- **Raises**:
  - `APIError`: For general, non-specific API errors from the provider.
  - `RateLimitError`: If the API call fails due to a rate limit.

### Custom Exceptions

---

#### `LLMError`
The base exception for all errors raised by the LLM client module.

---

#### `APIError`
Inherits from `LLMError`. Raised for general API failures, such as invalid requests or server-side errors from the provider.

---

#### `RateLimitError`
Inherits from `LLMError`. Raised specifically when an API request fails due to exceeding a rate limit.
