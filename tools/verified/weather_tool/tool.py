"""
Weather Tool for Desktop Assistant Marketplace.

This tool fetches current weather information for any location using
the wttr.in weather API (free, no API key required).
"""

import logging
from typing import Optional

import httpx

from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)

# Free weather API - no API key required
WEATHER_API_URL = "https://wttr.in/{location}?format=j1"


class WeatherTool(Tool):
    """Tool to get current weather information for any location."""

    def __init__(self, config):
        """
        Initialize the weather tool.

        Args:
            config: AppServices instance (dependency injection)
        """
        super().__init__(
            name="weather_tool",
            description="Get current weather information including temperature, conditions, and humidity for any location worldwide. Uses a free weather API with no API key required.",
            kind=Kind.FETCH,
        )
        self.config = config
        # Use httpx for async HTTP requests (allowed in import whitelist)
        self.client = httpx.AsyncClient(timeout=10.0)

    async def execute_async(
        self, context: ToolContext, location: str, unit: Optional[str] = "celsius"
    ) -> ToolResult:
        """
        Get weather information for a location.

        Args:
            context: Tool execution context
            location: City name or location query (e.g., "New York", "London,UK")
            unit: Temperature unit - "celsius" or "fahrenheit"

        Returns:
            ToolResult with weather data or error
        """
        try:
            # Validate unit parameter
            if unit not in ["celsius", "fahrenheit"]:
                return ToolResult(
                    success=False,
                    error=f"Invalid unit '{unit}'. Must be 'celsius' or 'fahrenheit'",
                    llm_content=f"Error: Invalid temperature unit '{unit}'. Use 'celsius' or 'fahrenheit'.",
                    return_display="Invalid temperature unit specified"
                )

            # Format location for API (replace spaces with +)
            formatted_location = location.replace(" ", "+")

            # Make API request
            url = WEATHER_API_URL.format(location=formatted_location)
            logger.info(f"Fetching weather for: {location} from {url}")

            response = await self.client.get(url)
            response.raise_for_status()

            data = response.json()

            # Parse weather data
            current_condition = data["current_condition"][0]
            weather_desc = data["weather"][0]["hourly"][0]

            # Extract key information
            temp_c = float(current_condition["temp_C"])
            temp_f = float(current_condition["temp_F"])
            humidity = int(current_condition["humidity"])
            weather_text = current_condition["weatherDesc"][0]["value"]
            wind_speed = float(current_condition["windspeedKmph"])

            # Format temperature based on unit preference
            if unit == "fahrenheit":
                temp_display = f"{temp_f}°F"
                temp_value = temp_f
            else:
                temp_display = f"{temp_c}°C"
                temp_value = temp_c

            # Create response
            weather_info = {
                "location": location,
                "temperature": temp_value,
                "temperature_display": temp_display,
                "unit": unit,
                "conditions": weather_text,
                "humidity": humidity,
                "wind_speed_kmph": wind_speed
            }

            # Format for LLM consumption
            llm_content = (
                f"Weather in {location}: {temp_display}, {weather_text}, "
                f"Humidity: {humidity}%, Wind: {wind_speed} km/h"
            )

            # Format for user display
            display_content = (
                f"🌤️ **Weather in {location}**\n"
                f"🌡️ Temperature: {temp_display}\n"
                f"🌥️ Conditions: {weather_text}\n"
                f"💧 Humidity: {humidity}%\n"
                f"💨 Wind Speed: {wind_speed} km/h"
            )

            logger.info(f"Weather fetched successfully for {location}: {temp_display}")

            return ToolResult(
                success=True,
                data=weather_info,
                llm_content=llm_content,
                return_display=display_content,
            )

        except httpx.HTTPStatusError as e:
            error_msg = f"Weather API returned error {e.response.status_code}"
            logger.error(f"Weather API error for {location}: {error_msg}")
            return ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: Could not fetch weather for {location}. API returned status {e.response.status_code}.",
                return_display=f"Could not fetch weather data for {location}"
            )

        except Exception as e:
            error_msg = f"Failed to fetch weather: {str(e)}"
            logger.error(f"Weather tool error for {location}: {error_msg}")
            return ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}",
                return_display=f"Weather lookup failed: {str(e)}"
            )

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - cleanup HTTP client."""
        await self.client.aclose()
