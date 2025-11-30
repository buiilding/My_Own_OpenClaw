# Configuration Management Documentation

This document provides comprehensive documentation for the Personal Assistant Backend configuration management system, including the Unified Configuration Service, Config Subscription Manager, and related components.

## Overview

The configuration management system provides a centralized, unified approach to handling all configuration needs across the Personal Assistant Backend. It consolidates application configuration, plugin configuration, and runtime overrides into a single, consistent interface with change notification capabilities.

## Core Components

### Unified Configuration Service

**Location**: `backend/src/core/unified_config.py`

The Unified Configuration Service provides a single source of truth for all configuration access, consolidating `AppConfig`, `PluginConfig`, and runtime configuration overrides.

#### Architecture

```python
class UnifiedConfigurationService:
    """
    Unified configuration service that consolidates all configuration access.

    Provides a single interface for:
    - Application configuration (AppConfig)
    - Plugin configuration (PluginConfigManager)
    - Runtime configuration overrides
    """
```

#### Key Features

- **Single Interface**: Unified access to all configuration types
- **Change Notifications**: Real-time updates when configuration changes
- **Plugin Integration**: Seamless plugin configuration management
- **Runtime Overrides**: Dynamic configuration modification
- **Type Safety**: Full type hints and validation

#### Usage Patterns

```python
# Initialize the service
config_service = UnifiedConfigurationService()

# Access application configuration
app_config = await config_service.get_app_config()

# Access plugin configuration
plugin_config = await config_service.get_plugin_config("tool_name")

# Subscribe to configuration changes
await config_service.subscribe_config_changes(subscriber)

# Runtime configuration override
await config_service.set_runtime_override("max_memory_mb", 1024)
```

#### Configuration Sources

1. **Application Config**: Core system configuration from YAML files
2. **Plugin Config**: Tool-specific configuration managed by plugins
3. **Runtime Overrides**: Dynamic configuration changes during execution
4. **Environment Variables**: System environment configuration
5. **Default Values**: Built-in fallback configurations

### Config Subscription Manager

**Location**: `backend/src/core/config_subscription_manager.py`

The Config Subscription Manager handles subscription management for configuration change notifications, separating subscriber management from configuration data access.

#### Architecture

```python
class ConfigSubscriber(Protocol):
    """Protocol for components that subscribe to config changes."""

    async def on_config_changed(
        self, old_config: AppConfig, new_config: AppConfig
    ) -> None:
        """Called when configuration changes."""
        ...

class ConfigSubscriptionManager:
    """
    Manages subscriptions to configuration changes.

    Handles both protocol-based subscribers and callback functions.
    Separates subscription management from configuration data access.
    """
```

#### Subscription Types

- **Protocol Subscribers**: Objects implementing the `ConfigSubscriber` protocol
- **Callback Functions**: Simple functions that receive old/new config pairs
- **Async Support**: All notifications are async-compatible

#### Usage Example

```python
# Create subscription manager
subscription_manager = ConfigSubscriptionManager()

# Subscribe with protocol-based subscriber
class MyComponent:
    async def on_config_changed(self, old_config, new_config):
        # Handle configuration change
        pass

subscriber = MyComponent()
subscription_manager.subscribe(subscriber)

# Subscribe with callback function
def config_changed_callback(old_config, new_config):
    print(f"Config changed from {old_config} to {new_config}")

subscription_manager.subscribe_callback(config_changed_callback)

# Notify all subscribers
await subscription_manager.notify_subscribers(old_config, new_config)
```

## Configuration Data Flow

```
YAML Files → ConfigManager → AppConfig
Plugin Configs → PluginConfigManager → PluginConfig
Runtime Overrides → UnifiedConfigurationService → Runtime State
                                      ↓
                            ConfigSubscriptionManager
                                      ↓
                              Subscribers Notified
```

## Configuration Types

### Application Configuration (`AppConfig`)

Core system configuration covering:

- **LLM Settings**: Provider configurations, model settings, API keys
- **Security Settings**: Permission policies, resource limits, audit settings
- **Tool Settings**: Tool discovery paths, execution limits, sandboxing
- **Plugin Settings**: Plugin directories, loading policies, isolation
- **Memory Settings**: Vector storage, embedding providers, retrieval limits
- **Network Settings**: CORS policies, rate limits, proxy settings
- **Performance Settings**: Caching policies, concurrency limits, timeouts

### Plugin Configuration (`PluginConfig`)

Tool-specific configuration managed by individual plugins:

```python
@dataclass
class PluginConfig:
    """Configuration for a specific plugin/tool."""
    name: str
    version: str
    enabled: bool = True
    settings: Dict[str, Any] = field(default_factory=dict)
    permissions: List[str] = field(default_factory=list)
    resource_limits: Dict[str, Any] = field(default_factory=dict)
```

### Runtime Overrides

Dynamic configuration changes that override static configuration:

- **Temporary Changes**: Session-specific overrides
- **Dynamic Scaling**: Resource limit adjustments based on load
- **Feature Flags**: Runtime feature enablement/disablement
- **Debug Settings**: Enhanced logging and debugging options

## Configuration Validation

### Schema Validation

All configuration undergoes schema validation using Pydantic models:

```python
class AppConfig(BaseModel):
    """Validated application configuration."""
    llm: LLMConfig
    security: SecurityConfig
    tools: ToolsConfig
    plugins: PluginsConfig
    memory: MemoryConfig

    class Config:
        validate_assignment = True
        extra = 'forbid'
```

### Runtime Validation

- **Type Checking**: Ensures configuration values match expected types
- **Range Validation**: Validates numeric ranges and limits
- **Path Validation**: Ensures file paths exist and are accessible
- **Dependency Validation**: Checks for required configuration dependencies

## Configuration Persistence

### Storage Mechanisms

1. **YAML Files**: Primary configuration storage format
2. **Environment Variables**: Sensitive data and environment-specific overrides
3. **Database**: Runtime state and dynamic configuration (planned)
4. **Plugin Storage**: Plugin-specific configuration persistence

### Configuration Files Structure

```
config/
├── default.yaml          # Default configuration
├── development.yaml      # Development overrides
├── production.yaml       # Production settings
└── local.yaml           # Local machine overrides (gitignored)
```

### Loading Priority

Configuration sources are loaded in priority order:

1. **Default Configuration**: Built-in defaults
2. **Base YAML**: `config/default.yaml`
3. **Environment YAML**: `config/{environment}.yaml`
4. **Local Overrides**: `config/local.yaml`
5. **Environment Variables**: `PA_*` prefixed variables
6. **Runtime Overrides**: Dynamic changes

## Change Notification System

### Notification Flow

1. **Configuration Change**: Configuration is modified via any interface
2. **Validation**: Change is validated against schema and constraints
3. **Persistence**: Change is persisted to appropriate storage
4. **Notification**: All subscribers are notified asynchronously
5. **Component Updates**: Components update their internal state

### Thread Safety

The notification system is designed to be thread-safe:

- **Async Notifications**: All notifications are async to prevent blocking
- **Error Isolation**: Subscriber errors don't affect other subscribers
- **Atomic Updates**: Configuration changes are atomic where possible
- **Race Condition Prevention**: Proper locking mechanisms for concurrent access

### Performance Considerations

- **Lazy Evaluation**: Configuration values are computed on-demand
- **Caching**: Frequently accessed values are cached
- **Debouncing**: Rapid configuration changes are debounced
- **Batch Notifications**: Multiple changes can be batched into single notifications

## Security Considerations

### Sensitive Data Handling

- **Encryption**: Sensitive configuration values are encrypted at rest
- **Access Control**: Configuration access is permission-based
- **Audit Logging**: All configuration changes are logged
- **Validation**: Input validation prevents injection attacks

### Permission Model

Configuration access follows a permission-based model:

```python
class ConfigPermissions:
    READ_CONFIG = "read_config"
    WRITE_CONFIG = "write_config"
    MODIFY_SECURITY = "modify_security"
    RUNTIME_OVERRIDE = "runtime_override"
```

## Monitoring and Observability

### Metrics

The configuration system exposes metrics for monitoring:

- **Change Frequency**: Rate of configuration changes
- **Subscriber Count**: Number of active subscribers
- **Validation Errors**: Configuration validation failures
- **Load Times**: Configuration loading performance

### Logging

Comprehensive logging covers:

- **Configuration Loading**: File loading and parsing events
- **Change Events**: All configuration modifications
- **Validation Events**: Schema validation results
- **Subscriber Events**: Subscription and notification events

### Debugging

Debug capabilities include:

- **Configuration Dump**: Export current configuration state
- **Change History**: Track configuration change history
- **Validation Reports**: Detailed validation error reports
- **Subscriber Status**: Active subscriber information

## Migration and Versioning

### Configuration Versioning

Configuration schemas include version information for compatibility:

```yaml
version: "1.2.0"
compatibility:
  minimum_version: "1.0.0"
  migration_required: false
```

### Migration Support

Automatic migration handles configuration updates:

- **Backward Compatibility**: Older configurations remain valid
- **Migration Scripts**: Automated configuration upgrades
- **Version Detection**: Automatic version detection and migration
- **Rollback Support**: Configuration rollback capabilities

## Best Practices

### Configuration Design

- **Hierarchical Structure**: Organize configuration in logical hierarchies
- **Descriptive Names**: Use clear, descriptive configuration keys
- **Documentation**: Document all configuration options
- **Validation**: Always validate configuration input
- **Defaults**: Provide sensible defaults for all options

### Usage Patterns

- **Dependency Injection**: Inject configuration rather than accessing globally
- **Immutable Configs**: Treat configuration as immutable where possible
- **Change Handling**: Properly handle configuration change notifications
- **Error Handling**: Gracefully handle configuration errors
- **Testing**: Test with various configuration scenarios

### Performance

- **Lazy Loading**: Load configuration on-demand
- **Caching**: Cache expensive configuration computations
- **Async Operations**: Use async configuration operations
- **Resource Limits**: Limit configuration size and complexity

## Troubleshooting

### Common Issues

- **Configuration Not Loading**: Check file paths and permissions
- **Validation Errors**: Review schema and provide valid values
- **Change Notifications Not Working**: Verify subscriber registration
- **Performance Issues**: Check for excessive change notifications

### Debug Commands

```bash
# Dump current configuration
python -m backend.src.core.config dump

# Validate configuration file
python -m backend.src.core.config validate config.yaml

# Show configuration subscribers
python -m backend.src.core.config subscribers
```

## API Reference

### UnifiedConfigurationService Methods

- `get_app_config() -> AppConfig`: Get application configuration
- `get_plugin_config(name: str) -> PluginConfig`: Get plugin configuration
- `set_runtime_override(key: str, value: Any)`: Set runtime override
- `subscribe_config_changes(subscriber: ConfigSubscriber)`: Subscribe to changes
- `unsubscribe_config_changes(subscriber: ConfigSubscriber)`: Unsubscribe from changes

### ConfigSubscriptionManager Methods

- `subscribe(subscriber: ConfigSubscriber)`: Add protocol subscriber
- `subscribe_callback(callback: Callable)`: Add callback subscriber
- `unsubscribe(subscriber: ConfigSubscriber)`: Remove protocol subscriber
- `notify_subscribers(old_config, new_config)`: Notify all subscribers

## Related Documentation

- [Configuration Reference](config_reference.md) - Detailed configuration options
- [Advanced Configuration](advanced_configuration.md) - Advanced configuration scenarios
- [Security Framework](security_framework.md) - Security-related configuration
- [Architecture Overview](architecture.md) - System architecture and components</contents>
</xai:function_call">Write file 'backend/docs/configuration_management.md' created successfully
