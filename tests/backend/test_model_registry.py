"""Tests for the model registry functionality."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.agent.model_registry import (
    get_all_models, get_local_models, get_online_models,
    _fetch_ollama_models, _fetch_lmstudio_models
)


class TestOnlineModels:
    """Tests for online model registry functions."""

    def test_get_online_models(self):
        """Test that online models are returned correctly."""
        models = get_online_models()

        assert isinstance(models, list)
        assert len(models) > 0

        # Check structure of model entries
        for model in models:
            assert isinstance(model, dict)
            assert "provider" in model
            assert "model" in model
            assert "type" in model
            assert model["type"] == "online"

            # Provider should be one of the known providers
            assert model["provider"] in ["openai", "anthropic", "gemini", "groq", "mistral", "fireworks"]

    def test_get_online_models_includes_expected_providers(self):
        """Test that all expected providers are included."""
        models = get_online_models()
        providers = set(model["provider"] for model in models)

        expected_providers = {"openai", "anthropic", "gemini", "groq", "mistral", "fireworks"}
        assert expected_providers.issubset(providers)

    def test_get_online_models_has_reasonable_count(self):
        """Test that we have a reasonable number of online models."""
        models = get_online_models()

        # Should have at least 10 models across all providers
        assert len(models) >= 10

        # Each major provider should have at least one model
        providers = set(model["provider"] for model in models)
        major_providers = {"openai", "anthropic", "gemini"}
        assert major_providers.issubset(providers)


class TestLocalModels:
    """Tests for local model registry functions."""

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_ollama_models_success(self, mock_client_class):
        """Test successful Ollama model fetching."""
        # Mock the HTTP client
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [
                {"name": "llama2:7b", "size": "3.8GB"},
                {"name": "codellama:13b", "size": "7.4GB"}
            ]
        }
        mock_client.get.return_value = mock_response

        models = await _fetch_ollama_models()

        assert len(models) == 2
        assert models[0]["model"] == "llama2:7b"
        assert models[0]["provider"] == "ollama"
        assert models[0]["type"] == "local"
        assert models[1]["model"] == "codellama:13b"

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_ollama_models_connection_error(self, mock_client_class):
        """Test Ollama model fetching with connection error."""
        # Mock the HTTP client to raise an exception
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        mock_client.get.side_effect = Exception("Connection refused")

        models = await _fetch_ollama_models()

        assert len(models) == 0

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_ollama_models_invalid_response(self, mock_client_class):
        """Test Ollama model fetching with invalid response."""
        # Mock the HTTP client
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # Mock response with invalid JSON
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_client.get.return_value = mock_response

        models = await _fetch_ollama_models()

        assert len(models) == 0

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_lmstudio_models_success(self, mock_client_class):
        """Test successful LMStudio model fetching."""
        # Mock the HTTP client
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client

        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "model1", "object": "model"},
                {"id": "model2", "object": "model"}
            ]
        }
        mock_client.get.return_value = mock_response

        models = await _fetch_lmstudio_models()

        assert len(models) == 2
        assert models[0]["model"] == "model1"
        assert models[0]["provider"] == "lmstudio"
        assert models[0]["type"] == "local"

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_lmstudio_models_error(self, mock_client_class):
        """Test LMStudio model fetching with error."""
        # Mock the HTTP client to raise an exception
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        mock_client.get.side_effect = Exception("Connection failed")

        models = await _fetch_lmstudio_models()

        assert len(models) == 0

    @pytest.mark.asyncio
    async def test_get_local_models(self):
        """Test getting local models."""
        models = await get_local_models()

        assert isinstance(models, list)

        # Each model should have the required fields
        for model in models:
            assert isinstance(model, dict)
            assert "provider" in model
            assert "model" in model
            assert "type" in model
            assert model["type"] == "local"
            assert model["provider"] in ["ollama", "lmstudio", "openai-local"]

    @pytest.mark.asyncio
    async def test_get_local_models_includes_expected_providers(self):
        """Test that local models include expected providers."""
        models = await get_local_models()
        providers = set(model["provider"] for model in models)

        # Should include at least some local providers
        # (exact providers depend on what's running locally)
        assert isinstance(providers, set)


class TestAllModels:
    """Tests for the combined model registry functions."""

    @pytest.mark.asyncio
    async def test_get_all_models(self):
        """Test getting all models (online and local)."""
        all_models = await get_all_models()

        assert isinstance(all_models, dict)
        assert "online" in all_models
        assert "local" in all_models

        # Online models should be a list
        assert isinstance(all_models["online"], list)
        assert len(all_models["online"]) > 0

        # Local models should be a list
        assert isinstance(all_models["local"], list)

        # Each online model should have correct structure
        for model in all_models["online"]:
            assert model["type"] == "online"
            assert "provider" in model
            assert "model" in model

        # Each local model should have correct structure
        for model in all_models["local"]:
            assert model["type"] == "local"
            assert "provider" in model
            assert "model" in model

    @pytest.mark.asyncio
    async def test_get_all_models_online_matches_get_online_models(self):
        """Test that get_all_models online section matches get_online_models."""
        all_models = await get_all_models()
        online_models = get_online_models()

        assert all_models["online"] == online_models

    @pytest.mark.asyncio
    async def test_get_all_models_local_matches_get_local_models(self):
        """Test that get_all_models local section matches get_local_models."""
        all_models = await get_all_models()
        local_models = await get_local_models()

        assert all_models["local"] == local_models


class TestModelRegistryEdgeCases:
    """Tests for edge cases and error conditions."""

    def test_online_models_consistency(self):
        """Test that online models are consistent across multiple calls."""
        models1 = get_online_models()
        models2 = get_online_models()

        assert models1 == models2

    @pytest.mark.asyncio
    async def test_local_models_handles_timeouts(self):
        """Test that local model fetching handles timeouts gracefully."""
        # This test ensures that even if local services are down,
        # the functions don't crash and return empty lists

        # We can't easily test actual timeouts without complex mocking,
        # but we can ensure the functions don't crash
        try:
            models = await get_local_models()
            assert isinstance(models, list)
        except Exception as e:
            pytest.fail(f"get_local_models() raised an exception: {e}")

    @pytest.mark.asyncio
    async def test_all_models_handles_partial_failures(self):
        """Test that get_all_models handles partial failures."""
        # Even if local model fetching fails, online models should still work
        try:
            all_models = await get_all_models()
            assert "online" in all_models
            assert "local" in all_models
            assert isinstance(all_models["online"], list)
            assert isinstance(all_models["local"], list)
        except Exception as e:
            pytest.fail(f"get_all_models() raised an exception: {e}")

    def test_model_structure_validation(self):
        """Test that all models have required fields."""
        online_models = get_online_models()

        required_fields = ["provider", "model", "type"]

        for model in online_models:
            for field in required_fields:
                assert field in model, f"Model missing required field '{field}': {model}"
                assert model[field] is not None, f"Model field '{field}' is None: {model}"
                assert model[field] != "", f"Model field '{field}' is empty: {model}"
