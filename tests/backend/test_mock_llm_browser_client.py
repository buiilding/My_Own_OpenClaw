"""
Tests for MockLLMBrowserClient.
"""

import pytest
from unittest import mock

from backend.src.simulation.mock_llm_browser_client import (
    MockLLMBrowserClient,
    get_mock_llm_browser_client,
    BROWSER_SIMULATION_RESPONSES,
)


class TestMockLLMBrowserClient:
    """Test MockLLMBrowserClient."""
    
    def test_initialization(self):
        """Test client initialization."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        assert client._iteration == 0
        assert client._max_iterations == len(BROWSER_SIMULATION_RESPONSES)
    
    @pytest.mark.asyncio
    async def test_get_completion_first_iteration(self):
        """Test getting completion for first iteration."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        result = await client.get_completion("gpt-4", [])
        
        assert "browser_control" in result
        assert "connect" in result
        assert client._iteration == 1
    
    @pytest.mark.asyncio
    async def test_get_completion_navigate(self):
        """Test getting completion for navigate step."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        # Skip first iteration
        client._iteration = 1
        result = await client.get_completion("gpt-4", [])
        
        assert "amazon.com" in result
        assert "navigate" in result
    
    @pytest.mark.asyncio
    async def test_get_completion_exceeds_max(self):
        """Test behavior when exceeding max iterations."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        # Set iteration beyond max
        client._iteration = client._max_iterations + 10
        result = await client.get_completion("gpt-4", [])
        
        # Should return final response
        assert "task is complete" in result.lower() or "successfully" in result.lower()
    
    @pytest.mark.asyncio
    async def test_get_completion_stream(self):
        """Test streaming completion."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        chunks = []
        async for event in client.get_completion_stream("gpt-4", []):
            chunks.append(event.content)
        
        # Should have streamed some content
        assert len(chunks) > 0
        full_response = "".join(chunks)
        assert "browser_control" in full_response
    
    def test_reset(self):
        """Test reset functionality."""
        mock_cfg = mock.Mock()
        client = MockLLMBrowserClient(mock_cfg)
        
        # Advance iteration
        client._iteration = 5
        
        # Reset
        client.reset()
        
        assert client._iteration == 0
    
    def test_factory_function(self):
        """Test factory function."""
        mock_cfg = mock.Mock()
        client = get_mock_llm_browser_client(mock_cfg)
        
        assert isinstance(client, MockLLMBrowserClient)


class TestBrowserSimulationResponses:
    """Test the simulation response sequence."""
    
    def test_simulation_has_expected_steps(self):
        """Test that simulation has expected browser control steps."""
        responses = BROWSER_SIMULATION_RESPONSES
        
        # Check for key actions in sequence
        response_text = "\n".join(r["response"] for r in responses)
        
        # Should have connect
        assert "connect" in response_text
        
        # Should have navigate to amazon
        assert "amazon.com" in response_text or "amazon" in response_text.lower()
        
        # Should have snapshot
        assert "snapshot" in response_text
        
        # Should have type "shoes"
        assert "shoes" in response_text
        
        # Should have click actions
        assert "click" in response_text
        
        # Should have wait
        assert "wait" in response_text
        
        # Should have screenshot
        assert "screenshot" in response_text
        
        # Should have close
        assert "close" in response_text
    
    def test_simulation_sequence_length(self):
        """Test that simulation has reasonable number of steps."""
        # Should have steps for: connect, navigate, snapshot, type, wait, 
        # snapshot, sort click, wait, sort option click, wait, snapshot, 
        # product click, wait, screenshot, close
        assert len(BROWSER_SIMULATION_RESPONSES) >= 10
        assert len(BROWSER_SIMULATION_RESPONSES) <= 20
