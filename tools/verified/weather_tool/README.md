# Weather Tool

A marketplace tool for the Desktop Assistant that provides current weather information for any location worldwide.

## Features

- Get current temperature, weather conditions, humidity, and wind speed
- Support for Celsius and Fahrenheit temperature units
- Uses free weather API (no API key required)
- Works with any city or location name worldwide

## Usage

The weather tool can be called by the agent with:

```json
{
  "functionCall": {
    "name": "weather_tool",
    "args": {
      "location": "New York",
      "unit": "celsius"
    }
  }
}
```

### Parameters

- `location` (required): City name or location (e.g., "London", "Paris, France", "Tokyo")
- `unit` (optional): Temperature unit - "celsius" (default) or "fahrenheit"

## Examples

**Basic usage:**
```
"What's the weather like in London?"
```

**With temperature unit:**
```
"What's the temperature in New York in Fahrenheit?"
```

## Permissions

This tool requires the `network_access` permission to make HTTP requests to the weather API.

## API

Uses the wttr.in weather service (free, no API key required). This service provides weather data from various sources and formats it in a clean JSON response.
