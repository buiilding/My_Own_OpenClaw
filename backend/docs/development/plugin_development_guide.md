# Plugin Development Guide

This comprehensive guide provides step-by-step instructions for developing plugins for the Personal Assistant system. Learn how to create custom plugins that extend functionality, integrate with external services, and modify agent behavior.

## Table of Contents

- [Plugin Architecture Overview](#plugin-architecture-overview)
- [Getting Started](#getting-started)
- [Basic Plugin Development](#basic-plugin-development)
- [Advanced Plugin Patterns](#advanced-plugin-patterns)
- [Real-World Examples](#real-world-examples)
- [Testing and Debugging](#testing-and-debugging)
- [Deployment and Distribution](#deployment-and-distribution)

## Plugin Architecture Overview

### Plugin Types

The Personal Assistant supports several types of plugins:

1. **Agent Plugins**: Intercept and modify agent execution flow
2. **Tool Plugins**: Add new tools to the system
3. **Service Plugins**: Provide background services
4. **Integration Plugins**: Connect to external systems

### Plugin Lifecycle

```
Discovery → Registration → Initialization → Execution → Shutdown
```

- **Discovery**: PluginRegistry finds plugins in configured directories
- **Registration**: Plugins are registered with metadata and configuration
- **Initialization**: Plugins receive dependencies and set up resources
- **Execution**: Plugins respond to events and modify behavior
- **Shutdown**: Clean up resources and connections

### Hook System

Plugins interact with the system through hooks:

- `on_instruction`: Called when user sends a query
- `on_llm_response`: Called after LLM generates response
- `on_tool_start`: Called before tool execution
- `on_tool_end`: Called after tool execution
- `initialize`: Setup during plugin loading
- `shutdown`: Cleanup during plugin unloading

## Getting Started

### Prerequisites

- Python 3.9+
- Familiarity with async/await patterns
- Understanding of the Personal Assistant architecture
- Access to the SDK and core interfaces

### Development Environment

1. Set up a development environment:
```bash
# Clone the repository
git clone https://github.com/your-org/personal-assistant.git
cd personal-assistant

# Set up virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e .
```

2. Create a plugin development directory:
```bash
mkdir plugin-development
cd plugin-development
```

## Basic Plugin Development

### Creating Your First Plugin

Let's create a simple logging plugin that tracks agent interactions.

#### Step 1: Create Plugin Structure

```python
# my_logging_plugin.py
"""
Simple logging plugin for Personal Assistant.
Tracks agent interactions and tool usage.
"""
import logging
import json
from datetime import datetime
from typing import Any, Dict, Optional
from pathlib import Path

from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class LoggingPlugin(BasePlugin):
    """
    Plugin that logs agent interactions and tool usage.

    This plugin demonstrates:
    - Basic plugin structure
    - Event handling
    - Configuration management
    - File I/O operations
    """

    name = "logging_plugin"
    version = "1.0.0"
    description = "Logs agent interactions and tool usage to files"

    def __init__(self):
        self.logger = None
        self.log_file = None
        self.config = {}
        self._initialized = False

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize the logging plugin."""
        try:
            self.config = config.get("logging", {})

            # Configure logging
            log_level = getattr(logging, self.config.get("level", "INFO").upper())
            log_file = self.config.get("file", "agent_interactions.log")

            # Create logger
            self.logger = logging.getLogger(f"{self.name}")
            self.logger.setLevel(log_level)

            # Remove existing handlers
            for handler in self.logger.handlers[:]:
                self.logger.removeHandler(handler)

            # Add file handler
            self.log_file = Path(log_file)
            file_handler = logging.FileHandler(self.log_file)
            file_handler.setLevel(log_level)

            # Create JSON formatter
            formatter = logging.Formatter(
                '{"timestamp": "%(asctime)s", "level": "%(levelname)s", '
                '"plugin": "%(name)s", "message": "%(message)s"}'
            )
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)

            self._initialized = True
            self.logger.info("Logging plugin initialized successfully",
                           extra={"plugin_version": self.version})

            return True

        except Exception as e:
            print(f"Failed to initialize logging plugin: {e}")
            return False

    async def teardown(self) -> bool:
        """Clean up logging resources."""
        try:
            if self.logger:
                self.logger.info("Logging plugin shutting down")
                # Flush all handlers
                for handler in self.logger.handlers:
                    handler.flush()
            return True
        except Exception as e:
            print(f"Error during logging plugin teardown: {e}")
            return False

    async def handle_event(self, event: Event) -> None:
        """Handle system events for logging."""
        if not self._initialized or not self.logger:
            return

        # Log different event types with appropriate levels
        if event.type == "interaction_started":
            self.logger.info("New interaction started", extra={
                "event_type": event.type,
                "user_id": event.data.get("user_id"),
                "session_id": event.data.get("session_id"),
                "query_preview": event.data.get("query", "")[:100] + "..." if len(event.data.get("query", "")) > 100 else event.data.get("query", "")
            })

        elif event.type == "tool_executed":
            tool_name = event.data.get("tool_name")
            success = event.data.get("success", False)
            execution_time = event.data.get("execution_time", 0)

            log_level = logging.INFO if success else logging.WARNING
            self.logger.log(log_level, "Tool execution completed", extra={
                "event_type": event.type,
                "tool_name": tool_name,
                "success": success,
                "execution_time": execution_time,
                "error": event.data.get("error") if not success else None
            })

        elif event.type == "interaction_completed":
            self.logger.info("Interaction completed", extra={
                "event_type": event.type,
                "user_id": event.data.get("user_id"),
                "session_id": event.data.get("session_id"),
                "total_tools_used": event.data.get("tool_count", 0),
                "duration": event.data.get("duration", 0)
            })

        elif event.type == "error_occurred":
            self.logger.error("System error occurred", extra={
                "event_type": event.type,
                "error_type": event.data.get("error_type"),
                "component": event.data.get("component"),
                "user_id": event.data.get("user_id")
            })
```

#### Step 2: Create Plugin Configuration

```python
# plugin_config.json
{
    "name": "logging_plugin",
    "version": "1.0.0",
    "description": "Logs agent interactions and tool usage",
    "author": "Your Name",
    "entry_point": "my_logging_plugin:LoggingPlugin",
    "dependencies": [],
    "permissions": ["file_write"],
    "config": {
        "logging": {
            "level": "INFO",
            "file": "logs/agent_interactions.log",
            "max_file_size": "10MB",
            "backup_count": 5
        }
    },
    "hooks": ["handle_event"],
    "enabled": true
}
```

#### Step 3: Test the Plugin

Create a test script to verify your plugin works:

```python
# test_plugin.py
"""
Test script for the logging plugin.
"""
import asyncio
import sys
from pathlib import Path

# Add the backend to Python path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from backend.src.core.plugins.registry import PluginRegistry
from backend.src.core.events import Event


async def test_logging_plugin():
    """Test the logging plugin functionality."""

    # Create plugin registry
    registry = PluginRegistry()

    # Load and initialize the plugin
    plugin_config = {
        "logging": {
            "level": "DEBUG",
            "file": "test_logs.log"
        }
    }

    # Import the plugin class
    from my_logging_plugin import LoggingPlugin

    # Create plugin instance
    plugin = LoggingPlugin()

    # Initialize plugin
    success = await plugin.setup(plugin_config)
    if not success:
        print("Failed to initialize plugin")
        return

    print("Plugin initialized successfully")

    # Test event handling
    test_events = [
        Event(
            type="interaction_started",
            timestamp="2024-01-15T10:00:00Z",
            data={
                "user_id": "test_user",
                "session_id": "test_session",
                "query": "Help me analyze this data"
            }
        ),
        Event(
            type="tool_executed",
            timestamp="2024-01-15T10:00:02Z",
            data={
                "tool_name": "csv_analyzer",
                "success": True,
                "execution_time": 1.23
            }
        ),
        Event(
            type="interaction_completed",
            timestamp="2024-01-15T10:00:05Z",
            data={
                "user_id": "test_user",
                "session_id": "test_session",
                "tool_count": 1,
                "duration": 5.0
            }
        )
    ]

    # Send test events
    for event in test_events:
        await plugin.handle_event(event)
        print(f"Processed event: {event.type}")

    # Shutdown plugin
    await plugin.teardown()
    print("Plugin shutdown complete")

    # Check if log file was created
    log_file = Path("test_logs.log")
    if log_file.exists():
        print(f"Log file created: {log_file}")
        print("Log contents:")
        print(log_file.read_text())
    else:
        print("Log file was not created")


if __name__ == "__main__":
    asyncio.run(test_logging_plugin())
```

## Advanced Plugin Patterns

### Context-Aware Plugin

Plugins can access system context and modify agent behavior:

```python
"""
Context-aware plugin that modifies responses based on user preferences.
"""
import json
from typing import Any, Dict, Optional
from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class ContextAwarePlugin(BasePlugin):
    """
    Plugin that adapts agent behavior based on user context and preferences.

    Demonstrates:
    - Context access and modification
    - User preference learning
    - Dynamic response modification
    """

    name = "context_aware"
    version = "1.0.0"
    description = "Adapts responses based on user context and preferences"

    def __init__(self):
        self.user_preferences = {}
        self.context_cache = {}

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize with user preferences."""
        self.user_preferences = config.get("user_preferences", {})
        return True

    async def handle_event(self, event: Event) -> Optional[Dict[str, Any]]:
        """Handle events and modify behavior based on context."""

        if event.type == "interaction_started":
            user_id = event.data.get("user_id")
            query = event.data.get("query", "").lower()

            # Check for context clues
            if "simple" in query or "explain" in query:
                self.context_cache[user_id] = {"response_style": "simple"}
            elif "detailed" in query or "comprehensive" in query:
                self.context_cache[user_id] = {"response_style": "detailed"}

        elif event.type == "llm_response_generated":
            user_id = event.data.get("user_id")
            response = event.data.get("response", "")

            # Modify response based on context
            context = self.context_cache.get(user_id, {})
            if context.get("response_style") == "simple":
                # Simplify the response
                simplified = self._simplify_response(response)
                return {
                    "modified_response": simplified,
                    "modification_reason": "simplified_based_on_context"
                }
            elif context.get("response_style") == "detailed":
                # Add more detail
                detailed = self._add_details(response)
                return {
                    "modified_response": detailed,
                    "modification_reason": "added_details_based_on_context"
                }

        return None

    def _simplify_response(self, response: str) -> str:
        """Simplify a response for clarity."""
        # Simple implementation - in reality, you'd use NLP techniques
        if len(response.split()) > 100:
            return response[:500] + "... (simplified for clarity)"
        return response

    def _add_details(self, response: str) -> str:
        """Add more technical details to a response."""
        # Add technical depth
        if "code" in response.lower():
            return response + "\n\n💡 **Technical Details:** Consider using type hints and comprehensive error handling in your code."
        return response
```

### Integration Plugin

Plugins can integrate with external services:

```python
"""
External service integration plugin.
"""
import httpx
import asyncio
from typing import Any, Dict, Optional
from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class SlackIntegrationPlugin(BasePlugin):
    """
    Plugin that integrates with Slack for notifications and commands.

    Demonstrates:
    - External API integration
    - Background task management
    - Event filtering and routing
    - Error handling for external services
    """

    name = "slack_integration"
    version = "1.0.0"
    description = "Integrates with Slack for notifications and commands"

    def __init__(self):
        self.slack_token = None
        self.webhook_url = None
        self.http_client = None
        self.background_tasks = set()

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize Slack integration."""
        slack_config = config.get("slack", {})
        self.slack_token = slack_config.get("bot_token")
        self.webhook_url = slack_config.get("webhook_url")

        if not self.slack_token and not self.webhook_url:
            print("Slack integration requires either bot_token or webhook_url")
            return False

        # Create HTTP client
        self.http_client = httpx.AsyncClient(timeout=30.0)

        return True

    async def teardown(self) -> bool:
        """Clean up resources."""
        if self.http_client:
            await self.http_client.aclose()

        # Cancel background tasks
        for task in self.background_tasks:
            task.cancel()

        await asyncio.gather(*self.background_tasks, return_exceptions=True)
        return True

    async def handle_event(self, event: Event) -> Optional[Dict[str, Any]]:
        """Handle events and send Slack notifications."""

        # Only handle important events
        important_events = {
            "error_occurred",
            "tool_execution_failed",
            "interaction_timeout"
        }

        if event.type in important_events:
            # Send notification asynchronously
            task = asyncio.create_task(self._send_slack_notification(event))
            self.background_tasks.add(task)
            task.add_done_callback(self.background_tasks.discard)

        elif event.type == "interaction_completed":
            # Send summary for long interactions
            duration = event.data.get("duration", 0)
            if duration > 60:  # Over 1 minute
                task = asyncio.create_task(self._send_interaction_summary(event))
                self.background_tasks.add(task)
                task.add_done_callback(self.background_tasks.discard)

        return None

    async def _send_slack_notification(self, event: Event) -> None:
        """Send a notification to Slack."""
        try:
            if event.type == "error_occurred":
                message = self._format_error_message(event)
            elif event.type == "tool_execution_failed":
                message = self._format_tool_failure_message(event)
            else:
                message = f"System Event: {event.type}"

            await self._post_to_slack(message)

        except Exception as e:
            print(f"Failed to send Slack notification: {e}")

    async def _send_interaction_summary(self, event: Event) -> None:
        """Send a summary of a long interaction."""
        try:
            user_id = event.data.get("user_id", "unknown")
            duration = event.data.get("duration", 0)
            tool_count = event.data.get("tool_count", 0)

            message = f"""🤖 **Long Interaction Summary**
• User: {user_id}
• Duration: {duration:.1f} seconds
• Tools Used: {tool_count}
• Completed: {event.timestamp}"""

            await self._post_to_slack(message)

        except Exception as e:
            print(f"Failed to send interaction summary: {e}")

    def _format_error_message(self, event: Event) -> str:
        """Format an error event for Slack."""
        error_type = event.data.get("error_type", "Unknown")
        component = event.data.get("component", "Unknown")
        message = event.data.get("error_message", "No details")

        return f"""🚨 **System Error**
• Type: {error_type}
• Component: {component}
• Message: {message}
• Time: {event.timestamp}"""

    def _format_tool_failure_message(self, event: Event) -> str:
        """Format a tool failure event for Slack."""
        tool_name = event.data.get("tool_name", "Unknown")
        error = event.data.get("error", "No details")

        return f"""⚠️ **Tool Execution Failed**
• Tool: {tool_name}
• Error: {error}
• Time: {event.timestamp}"""

    async def _post_to_slack(self, message: str) -> None:
        """Post a message to Slack."""
        if self.webhook_url:
            # Use webhook
            payload = {"text": message}
            response = await self.http_client.post(
                self.webhook_url,
                json=payload
            )
            response.raise_for_status()

        elif self.slack_token:
            # Use API (would need channel ID)
            # This is a simplified example
            pass
```

## Real-World Examples

### Security Monitoring Plugin

```python
"""
Security monitoring plugin that tracks and alerts on suspicious activities.
"""
import re
import hashlib
from typing import Any, Dict, List, Optional
from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class SecurityPlugin(BasePlugin):
    """
    Plugin that monitors for security threats and suspicious activities.

    Features:
    - Input sanitization
    - Suspicious pattern detection
    - Rate limiting
    - Audit logging
    """

    name = "security_monitor"
    version = "1.0.0"
    description = "Monitors and prevents security threats"

    def __init__(self):
        self.suspicious_patterns = []
        self.rate_limits = {}
        self.blocked_users = set()
        self.audit_log = []

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize security monitoring."""
        security_config = config.get("security", {})

        # Load suspicious patterns
        self.suspicious_patterns = [
            re.compile(pattern, re.IGNORECASE)
            for pattern in security_config.get("suspicious_patterns", [
                r"system\s*\(",
                r"eval\s*\(",
                r"exec\s*\(",
                r"import\s+os",
                r"subprocess\.",
                r"rm\s+-rf",
                r"format\s+c:",
            ])
        ]

        # Load blocked users
        self.blocked_users = set(security_config.get("blocked_users", []))

        return True

    async def handle_event(self, event: Event) -> Optional[Dict[str, Any]]:
        """Monitor events for security threats."""

        if event.type == "interaction_started":
            user_id = event.data.get("user_id")
            query = event.data.get("query", "")

            # Check if user is blocked
            if user_id in self.blocked_users:
                return {
                    "block_interaction": True,
                    "reason": "User is blocked",
                    "alert": f"Blocked user {user_id} attempted interaction"
                }

            # Check rate limiting
            if self._check_rate_limit(user_id):
                return {
                    "block_interaction": True,
                    "reason": "Rate limit exceeded",
                    "alert": f"User {user_id} exceeded rate limit"
                }

            # Scan for suspicious patterns
            threats = self._scan_for_threats(query)
            if threats:
                self._log_security_event(user_id, "suspicious_input", {
                    "query_hash": hashlib.sha256(query.encode()).hexdigest(),
                    "threats": threats
                })

                return {
                    "block_interaction": True,
                    "reason": "Suspicious input detected",
                    "alert": f"Suspicious input from user {user_id}: {threats}"
                }

        elif event.type == "tool_executed":
            tool_name = event.data.get("tool_name")
            parameters = event.data.get("parameters", {})

            # Monitor dangerous tool usage
            if tool_name in ["run_shell", "file_delete"] and not self._is_safe_operation(parameters):
                user_id = event.data.get("user_id")
                self._log_security_event(user_id, "dangerous_tool_use", {
                    "tool": tool_name,
                    "parameters": parameters
                })

        return None

    def _check_rate_limit(self, user_id: str) -> bool:
        """Check if user has exceeded rate limits."""
        # Simple rate limiting - 10 requests per minute
        current_time = event.timestamp  # Would need proper timestamp handling

        if user_id not in self.rate_limits:
            self.rate_limits[user_id] = []

        # Clean old entries (older than 1 minute)
        self.rate_limits[user_id] = [
            ts for ts in self.rate_limits[user_id]
            if (current_time - ts).seconds < 60
        ]

        # Check limit
        if len(self.rate_limits[user_id]) >= 10:
            return True

        # Add current request
        self.rate_limits[user_id].append(current_time)
        return False

    def _scan_for_threats(self, text: str) -> List[str]:
        """Scan text for suspicious patterns."""
        threats = []
        for pattern in self.suspicious_patterns:
            if pattern.search(text):
                threats.append(pattern.pattern)
        return threats

    def _is_safe_operation(self, parameters: Dict[str, Any]) -> bool:
        """Check if a tool operation is safe."""
        # This would implement safety checks based on parameters
        # For example, prevent deleting system files
        if "path" in parameters:
            path = parameters["path"]
            dangerous_paths = ["/", "/etc", "/usr", "C:\\", "C:\\Windows"]
            if any(path.startswith(dangerous) for dangerous in dangerous_paths):
                return False
        return True

    def _log_security_event(self, user_id: str, event_type: str, details: Dict[str, Any]) -> None:
        """Log a security event."""
        event = {
            "timestamp": "current_time",  # Would use proper timestamp
            "user_id": user_id,
            "event_type": event_type,
            "details": details
        }
        self.audit_log.append(event)

        # In production, this would write to secure log storage
        print(f"SECURITY EVENT: {event_type} by {user_id}")
```

### Performance Monitoring Plugin

```python
"""
Performance monitoring plugin that tracks system metrics.
"""
import time
import psutil
from typing import Any, Dict, Optional
from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class PerformancePlugin(BasePlugin):
    """
    Plugin that monitors system performance and agent efficiency.

    Tracks:
    - Response times
    - Memory usage
    - Tool execution performance
    - System resource usage
    """

    name = "performance_monitor"
    version = "1.0.0"
    description = "Monitors system performance and efficiency"

    def __init__(self):
        self.metrics = {
            "interactions": [],
            "tool_executions": [],
            "system_resources": [],
            "errors": []
        }
        self.interaction_start_times = {}

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize performance monitoring."""
        perf_config = config.get("performance", {})
        self.monitoring_interval = perf_config.get("interval", 60)  # seconds
        return True

    async def handle_event(self, event: Event) -> None:
        """Track performance metrics."""

        if event.type == "interaction_started":
            user_id = event.data.get("user_id")
            session_id = event.data.get("session_id")
            self.interaction_start_times[f"{user_id}:{session_id}"] = time.time()

        elif event.type == "interaction_completed":
            user_id = event.data.get("user_id")
            session_id = event.data.get("session_id")
            duration = event.data.get("duration", 0)
            tool_count = event.data.get("tool_count", 0)

            # Record interaction metrics
            self.metrics["interactions"].append({
                "timestamp": event.timestamp,
                "user_id": user_id,
                "duration": duration,
                "tool_count": tool_count,
                "efficiency": tool_count / max(duration, 1)  # tools per second
            })

        elif event.type == "tool_executed":
            tool_name = event.data.get("tool_name")
            success = event.data.get("success", False)
            execution_time = event.data.get("execution_time", 0)

            # Record tool performance
            self.metrics["tool_executions"].append({
                "timestamp": event.timestamp,
                "tool_name": tool_name,
                "success": success,
                "execution_time": execution_time,
                "efficiency": 1.0 / max(execution_time, 0.001)  # operations per second
            })

        elif event.type == "error_occurred":
            self.metrics["errors"].append({
                "timestamp": event.timestamp,
                "error_type": event.data.get("error_type"),
                "component": event.data.get("component")
            })

        # Periodic system resource monitoring
        if len(self.metrics["system_resources"]) == 0 or \
           time.time() - self.metrics["system_resources"][-1]["timestamp"] > self.monitoring_interval:
            self._record_system_resources()

    def _record_system_resources(self) -> None:
        """Record current system resource usage."""
        resources = {
            "timestamp": time.time(),
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage": psutil.disk_usage('/').percent,
            "network_connections": len(psutil.net_connections())
        }

        self.metrics["system_resources"].append(resources)

    def get_performance_report(self) -> Dict[str, Any]:
        """Generate a performance report."""
        return {
            "summary": self._calculate_summary_stats(),
            "trends": self._analyze_trends(),
            "recommendations": self._generate_recommendations(),
            "alerts": self._check_alerts()
        }

    def _calculate_summary_stats(self) -> Dict[str, Any]:
        """Calculate summary statistics."""
        interactions = self.metrics["interactions"]
        tool_executions = self.metrics["tool_executions"]

        if not interactions:
            return {"message": "No interaction data available"}

        avg_duration = sum(i["duration"] for i in interactions) / len(interactions)
        avg_tools = sum(i["tool_count"] for i in interactions) / len(interactions)

        if tool_executions:
            success_rate = sum(1 for t in tool_executions if t["success"]) / len(tool_executions)
            avg_tool_time = sum(t["execution_time"] for t in tool_executions) / len(tool_executions)
        else:
            success_rate = 0
            avg_tool_time = 0

        return {
            "total_interactions": len(interactions),
            "average_duration": avg_duration,
            "average_tools_per_interaction": avg_tools,
            "tool_success_rate": success_rate,
            "average_tool_execution_time": avg_tool_time,
            "error_count": len(self.metrics["errors"])
        }

    def _analyze_trends(self) -> Dict[str, Any]:
        """Analyze performance trends."""
        # Simple trend analysis - compare recent vs older data
        interactions = self.metrics["interactions"]
        if len(interactions) < 10:
            return {"message": "Insufficient data for trend analysis"}

        midpoint = len(interactions) // 2
        recent = interactions[midpoint:]
        older = interactions[:midpoint]

        recent_avg_duration = sum(i["duration"] for i in recent) / len(recent)
        older_avg_duration = sum(i["duration"] for i in older) / len(older)

        duration_trend = "improving" if recent_avg_duration < older_avg_duration else "degrading"

        return {
            "duration_trend": duration_trend,
            "recent_avg_duration": recent_avg_duration,
            "older_avg_duration": older_avg_duration,
            "change_percent": ((recent_avg_duration - older_avg_duration) / older_avg_duration) * 100
        }

    def _generate_recommendations(self) -> List[str]:
        """Generate performance recommendations."""
        recommendations = []
        stats = self._calculate_summary_stats()

        if isinstance(stats, dict) and "average_duration" in stats:
            if stats["average_duration"] > 30:
                recommendations.append("Consider optimizing slow interactions (>30s average)")
            if stats.get("tool_success_rate", 1.0) < 0.9:
                recommendations.append("Investigate tool execution failures (<90% success rate)")
            if stats.get("average_tool_execution_time", 0) > 10:
                recommendations.append("Review slow tool executions (>10s average)")

        return recommendations

    def _check_alerts(self) -> List[str]:
        """Check for performance alerts."""
        alerts = []

        # Check error rate
        total_interactions = len(self.metrics["interactions"])
        error_count = len(self.metrics["errors"])

        if total_interactions > 0:
            error_rate = error_count / total_interactions
            if error_rate > 0.1:  # 10% error rate
                alerts.append(f"High error rate: {error_rate:.1%}")

        # Check system resources
        if self.metrics["system_resources"]:
            latest = self.metrics["system_resources"][-1]
            if latest["memory_percent"] > 90:
                alerts.append(f"High memory usage: {latest['memory_percent']}%")
            if latest["cpu_percent"] > 95:
                alerts.append(f"High CPU usage: {latest['cpu_percent']}%")

        return alerts
```

## Testing and Debugging

### Plugin Testing Framework

```python
"""
Testing framework for plugins.
"""
import pytest
import asyncio
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock

from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class PluginTestHarness:
    """Test harness for plugin testing."""

    def __init__(self, plugin_class):
        self.plugin_class = plugin_class
        self.plugin = None

    async def setup_plugin(self, config: Dict[str, Any] = None) -> BasePlugin:
        """Set up plugin for testing."""
        config = config or {}
        self.plugin = self.plugin_class()
        success = await self.plugin.setup(config)
        assert success, "Plugin setup failed"
        return self.plugin

    async def teardown_plugin(self):
        """Clean up plugin after testing."""
        if self.plugin:
            await self.plugin.teardown()

    async def send_event(self, event: Event) -> Any:
        """Send an event to the plugin and return response."""
        return await self.plugin.handle_event(event)

    def create_test_event(self, event_type: str, data: Dict[str, Any]) -> Event:
        """Create a test event."""
        return Event(
            type=event_type,
            timestamp="2024-01-15T10:00:00Z",
            data=data
        )


@pytest.fixture
async def logging_plugin_harness():
    """Fixture for logging plugin testing."""
    harness = PluginTestHarness(LoggingPlugin)
    yield harness
    await harness.teardown_plugin()


@pytest.mark.asyncio
class TestLoggingPlugin:
    """Test cases for the logging plugin."""

    async def test_plugin_initialization(self, logging_plugin_harness):
        """Test plugin initializes correctly."""
        plugin = await logging_plugin_harness.setup_plugin({
            "logging": {
                "level": "INFO",
                "file": "test.log"
            }
        })

        assert plugin._initialized is True
        assert plugin.logger is not None

    async def test_interaction_logging(self, logging_plugin_harness):
        """Test that interactions are logged."""
        plugin = await logging_plugin_harness.setup_plugin()

        event = logging_plugin_harness.create_test_event(
            "interaction_started",
            {
                "user_id": "test_user",
                "session_id": "test_session",
                "query": "Test query"
            }
        )

        await logging_plugin_harness.send_event(event)

        # Verify log file was created and contains the event
        log_file = Path("logs/agent_interactions.log")
        assert log_file.exists()

        log_content = log_file.read_text()
        assert "interaction_started" in log_content
        assert "test_user" in log_content

    async def test_error_event_logging(self, logging_plugin_harness):
        """Test that errors are logged appropriately."""
        plugin = await logging_plugin_harness.setup_plugin()

        event = logging_plugin_harness.create_test_event(
            "error_occurred",
            {
                "error_type": "TestError",
                "component": "test_component",
                "error_message": "Test error message"
            }
        )

        await logging_plugin_harness.send_event(event)

        log_file = Path("logs/agent_interactions.log")
        log_content = log_file.read_text()
        assert "error_occurred" in log_content
        assert "TestError" in log_content
```

### Debugging Tools

```python
"""
Debugging utilities for plugin development.
"""
import logging
import time
from typing import Any, Dict
from backend.src.core.plugins.base import BasePlugin


class DebugPlugin(BasePlugin):
    """
    Debug plugin that provides development and troubleshooting tools.

    Features:
    - Event logging and inspection
    - Performance profiling
    - Configuration validation
    - Health checks
    """

    name = "debug_plugin"
    version = "1.0.0"
    description = "Debug and development tools for plugin development"

    def __init__(self):
        self.event_log = []
        self.performance_log = {}
        self.start_time = None

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize debug plugin."""
        debug_config = config.get("debug", {})
        self.log_level = debug_config.get("log_level", "DEBUG")
        self.max_events = debug_config.get("max_events", 1000)

        # Set up logging
        logging.basicConfig(level=getattr(logging, self.log_level))
        self.logger = logging.getLogger("debug_plugin")

        self.start_time = time.time()
        self.logger.info("Debug plugin initialized")
        return True

    async def handle_event(self, event: Event) -> Optional[Dict[str, Any]]:
        """Log and analyze events."""
        # Log the event
        event_data = {
            "timestamp": event.timestamp,
            "type": event.type,
            "data": event.data.copy()
        }
        self.event_log.append(event_data)

        # Keep log size manageable
        if len(self.event_log) > self.max_events:
            self.event_log.pop(0)

        # Performance tracking
        if event.type in ["interaction_started", "tool_executed"]:
            self._start_performance_tracking(event)

        elif event.type in ["interaction_completed", "tool_end"]:
            self._end_performance_tracking(event)

        # Debug logging
        self.logger.debug(f"Event: {event.type}", extra={
            "event_data": event.data,
            "event_count": len(self.event_log)
        })

        return None

    def _start_performance_tracking(self, event: Event):
        """Start tracking performance for an operation."""
        key = f"{event.type}_{event.data.get('user_id', 'unknown')}"
        self.performance_log[key] = {
            "start_time": time.time(),
            "event_type": event.type,
            "data": event.data
        }

    def _end_performance_tracking(self, event: Event):
        """End performance tracking and record metrics."""
        key = f"{event.type.replace('_completed', '_started').replace('_end', '_start')}_{event.data.get('user_id', 'unknown')}"

        if key in self.performance_log:
            start_data = self.performance_log[key]
            duration = time.time() - start_data["start_time"]

            self.logger.info(f"Performance: {event.type}", extra={
                "duration": duration,
                "start_event": start_data["event_type"],
                "end_event": event.type,
                "user_id": event.data.get("user_id")
            })

            del self.performance_log[key]

    def get_debug_info(self) -> Dict[str, Any]:
        """Get comprehensive debug information."""
        return {
            "uptime": time.time() - self.start_time,
            "events_logged": len(self.event_log),
            "recent_events": self.event_log[-10:],  # Last 10 events
            "active_performance_tracks": len(self.performance_log),
            "system_info": self._get_system_info()
        }

    def _get_system_info(self) -> Dict[str, Any]:
        """Get basic system information."""
        import platform
        import sys

        return {
            "platform": platform.platform(),
            "python_version": sys.version,
            "cpu_count": len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else os.cpu_count()
        }

    def clear_logs(self) -> None:
        """Clear all debug logs."""
        self.event_log.clear()
        self.performance_log.clear()
        self.logger.info("Debug logs cleared")
```

## Deployment and Distribution

### Plugin Packaging

```python
# setup.py for plugin distribution
from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="personal-assistant-logging-plugin",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="Logging plugin for Personal Assistant",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/your-org/pa-logging-plugin",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.9",
    install_requires=[
        "personal-assistant-sdk>=1.0.0",
    ],
    entry_points={
        "personal_assistant.plugins": [
            "logging = my_logging_plugin:LoggingPlugin",
        ]
    },
)
```

### Plugin Registry Configuration

```yaml
# plugins.yaml - Plugin registry configuration
plugins:
  - name: logging_plugin
    enabled: true
    config:
      logging:
        level: INFO
        file: logs/agent.log

  - name: security_plugin
    enabled: true
    config:
      security:
        suspicious_patterns:
          - "system\\s*\\("
          - "eval\\s*\\("
        blocked_users: []

  - name: performance_plugin
    enabled: true
    config:
      performance:
        interval: 60
```

### Distribution Best Practices

1. **Version Management**: Use semantic versioning
2. **Dependencies**: Specify exact versions to avoid conflicts
3. **Documentation**: Include comprehensive README and examples
4. **Testing**: Provide test suite and CI configuration
5. **Security**: Code review and vulnerability scanning
6. **Licensing**: Choose appropriate open source license

This plugin development guide provides a comprehensive foundation for creating, testing, and deploying plugins for the Personal Assistant system. The examples demonstrate real-world patterns and best practices for building robust, maintainable plugins.
