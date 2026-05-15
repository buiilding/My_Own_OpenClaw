import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import { CloneToggle } from './settingsControls';

const LOCAL_TOOLS = Object.freeze([
  'mouse_control',
  'keyboard_control',
  'screenshot',
  'scroll_control',
  'switch_window',
  'wait',
  'get_open_windows',
  'get_system_stats',
  'open_app',
  'run_shell_command',
  'process',
  'read_file',
  'replace',
  'browser',
]);

const REMOTE_TOOLS = Object.freeze([
  'web_search',
]);

function toggleListValue(values, value, enabled) {
  const source = Array.isArray(values) ? values : [];
  if (enabled) {
    return source.includes(value) ? source : [...source, value];
  }
  return source.filter((item) => item !== value);
}

function AgentSettingsTab({ config, onConfigChange }) {
  const [manifestStatus, setManifestStatus] = useState({ accepted: [], rejected: [] });
  const [remoteToolCatalog, setRemoteToolCatalog] = useState({ remote_tools: [] });
  const [activePromptLayers, setActivePromptLayers] = useState([]);
  const [extensionRuntime, setExtensionRuntime] = useState({ extensions: [], errors: [] });
  const disabledLocalTools = Array.isArray(config?.agent_disabled_local_tools)
    ? config.agent_disabled_local_tools
    : [];
  const disabledRemoteTools = Array.isArray(config?.agent_disabled_remote_tools)
    ? config.agent_disabled_remote_tools
    : [];
  const acceptedTools = useMemo(() => new Map(
    (manifestStatus.accepted || []).map((tool) => [tool.name, tool]),
  ), [manifestStatus.accepted]);
  const rejectedTools = useMemo(() => new Map(
    (manifestStatus.rejected || []).map((tool) => [tool.name, tool]),
  ), [manifestStatus.rejected]);
  const remoteTools = Array.isArray(remoteToolCatalog.remote_tools)
    ? remoteToolCatalog.remote_tools
    : [];

  useEffect(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.LIST_AGENT_EXTENSIONS)
      .then((payload) => {
        setExtensionRuntime({
          extensions: Array.isArray(payload?.extensions) ? payload.extensions : [],
          errors: Array.isArray(payload?.errors) ? payload.errors : [],
        });
      })
      .catch(() => {
        setExtensionRuntime({ extensions: [], errors: [] });
      });

    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (event) => {
      if (event?.type === 'client-tool-manifest') {
        setManifestStatus({
          accepted: Array.isArray(event.payload?.accepted) ? event.payload.accepted : [],
          rejected: Array.isArray(event.payload?.rejected) ? event.payload.rejected : [],
        });
      }
      if (event?.type === 'remote-tool-catalog') {
        setRemoteToolCatalog({
          remote_tools: Array.isArray(event.payload?.remote_tools)
            ? event.payload.remote_tools
            : [],
        });
      }
      if (event?.type === 'system-prompt') {
        setActivePromptLayers(
          Array.isArray(event.payload?.client_prompt_layers)
            ? event.payload.client_prompt_layers
            : [],
        );
      }
    });
    return removeListener;
  }, []);

  return (
    <div className="clone-settings-general">
      <h2>Agent</h2>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Custom instructions</span>
          <p>Saved locally and sent as a client prompt layer on each workspace query.</p>
          <textarea
            className="clone-settings-textarea"
            value={config?.agent_custom_instructions || ''}
            onChange={(event) => onConfigChange({
              agent_custom_instructions: event.target.value,
            })}
            rows={6}
            spellCheck
          />
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>Active prompt layers</span>
          <p>These are the client prompt layers the backend reported in the latest prompt.</p>
        </div>
        <div className="clone-settings-layer-list">
          {activePromptLayers.length > 0 ? activePromptLayers.map((layer) => (
            <details key={`${layer.id || 'layer'}-${layer.priority ?? 100}`} className="clone-settings-schema-viewer">
              <summary>
                {layer.id || 'client-layer'}
                <small>{layer.type || 'custom'} / priority {layer.priority ?? 100}</small>
              </summary>
              <pre>{layer.content || ''}</pre>
            </details>
          )) : (
            <p className="clone-settings-tool-status">Waiting for backend prompt transparency</p>
          )}
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>Extensions</span>
          <p>Local plugin packages can contribute tools, MCP servers, prompt layers, skills, settings panels, hooks, config, and permissions.</p>
        </div>
        <div className="clone-settings-layer-list">
          {extensionRuntime.extensions.length > 0 ? extensionRuntime.extensions.map((extension) => (
            <details key={extension.id} className="clone-settings-schema-viewer">
              <summary>
                {extension.name || extension.id}
                <small>{extension.tools?.length || 0} tools / {extension.mcp_servers?.length || 0} MCP / {extension.settings_panels?.length || 0} panels</small>
              </summary>
              <ExtensionRuntimeDetails extension={extension} />
            </details>
          )) : (
            <p className="clone-settings-tool-status">No local extensions loaded</p>
          )}
          {extensionRuntime.errors.length > 0 ? extensionRuntime.errors.map((error) => (
            <p key={`${error.extension}-${error.reason}`} className="clone-settings-tool-status clone-settings-tool-status-error">
              {error.extension}: {error.reason}
            </p>
          )) : null}
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>Local sidecar tools</span>
          <p>These are included in the client tool manifest when enabled.</p>
        </div>
        <div className="clone-settings-tool-grid">
          {LOCAL_TOOLS.map((toolName) => (
            <div key={toolName} className="clone-settings-tool-card">
              <div className="clone-settings-tool-toggle">
                <span>{toolName}</span>
                <CloneToggle
                  checked={!disabledLocalTools.includes(toolName)}
                  onChange={(enabled) => onConfigChange({
                    agent_disabled_local_tools: toggleListValue(
                      disabledLocalTools,
                      toolName,
                      !enabled,
                    ),
                  })}
                  ariaLabel={`Enable ${toolName}`}
                />
              </div>
              <ToolAcceptanceStatus
                acceptedTool={acceptedTools.get(toolName)}
                rejectedTool={rejectedTools.get(toolName)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>Remote backend tools</span>
          <p>These execute on the hosted WindieOS backend when available.</p>
        </div>
        <div className="clone-settings-tool-grid">
          {REMOTE_TOOLS.map((toolName) => {
            const catalogEntry = remoteTools.find((tool) => tool.name === toolName);
            return (
              <div key={toolName} className="clone-settings-tool-toggle clone-settings-tool-card">
                <span>
                  {toolName}
                  {catalogEntry?.available === false ? (
                    <small>{catalogEntry.reason_unavailable || 'Unavailable'}</small>
                  ) : null}
                </span>
                <CloneToggle
                  checked={!disabledRemoteTools.includes(toolName)}
                  onChange={(enabled) => onConfigChange({
                    agent_disabled_remote_tools: toggleListValue(
                      disabledRemoteTools,
                      toolName,
                      !enabled,
                    ),
                  })}
                  ariaLabel={`Enable ${toolName}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExtensionRuntimeDetails({ extension }) {
  const hookCounts = extension.lifecycle_hooks || {};
  return (
    <div className="clone-settings-extension-detail">
      {extension.description ? (
        <p className="clone-settings-tool-status">{extension.description}</p>
      ) : null}
      {Array.isArray(extension.permissions) && extension.permissions.length > 0 ? (
        <div>
          <strong>Permissions</strong>
          <ul>
            {extension.permissions.map((permission) => (
              <li key={permission.id}>
                {permission.id}{permission.reason ? `: ${permission.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(extension.settings_panels) && extension.settings_panels.length > 0 ? (
        <div>
          <strong>Settings panels</strong>
          <ul>
            {extension.settings_panels.map((panel) => (
              <li key={panel.id}>
                {panel.title}{panel.description ? `: ${panel.description}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(extension.mcp_servers) && extension.mcp_servers.length > 0 ? (
        <div>
          <strong>MCP servers</strong>
          <ul>
            {extension.mcp_servers.map((server) => (
              <li key={server.id}>
                {server.name || server.id}{server.tools?.length ? `: ${server.tools.map((tool) => tool.name).join(', ')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <pre>{JSON.stringify({
        id: extension.id,
        version: extension.version || null,
        tools: (extension.tools || []).map((tool) => tool.name),
        mcp_servers: (extension.mcp_servers || []).map((server) => ({
          id: server.id,
          command: server.command,
          tools: (server.tools || []).map((tool) => tool.name),
        })),
        prompt_layers: extension.prompt_layers || [],
        lifecycle_hooks: hookCounts,
        config_schema: extension.config_schema || {},
      }, null, 2)}</pre>
    </div>
  );
}

function ToolAcceptanceStatus({ acceptedTool, rejectedTool }) {
  if (rejectedTool) {
    return (
      <p className="clone-settings-tool-status clone-settings-tool-status-error">
        Rejected: {rejectedTool.reason || 'manifest validation failed'}
      </p>
    );
  }
  if (!acceptedTool) {
    return (
      <p className="clone-settings-tool-status">Waiting for backend acceptance</p>
    );
  }
  return (
    <details className="clone-settings-schema-viewer">
      <summary>Accepted schema</summary>
      <p className="clone-settings-tool-status">
        {acceptedTool.argument_resolution || 'passthrough'} / {acceptedTool.execution_target || 'sidecar'}
      </p>
      <pre>{JSON.stringify({
        schema: acceptedTool.schema,
      }, null, 2)}</pre>
    </details>
  );
}

ToolAcceptanceStatus.propTypes = {
  acceptedTool: PropTypes.shape({
    argument_resolution: PropTypes.string,
    execution_target: PropTypes.string,
    schema: PropTypes.object,
  }),
  rejectedTool: PropTypes.shape({
    reason: PropTypes.string,
  }),
};

ExtensionRuntimeDetails.propTypes = {
  extension: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    version: PropTypes.string,
    permissions: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string,
      reason: PropTypes.string,
    })),
    settings_panels: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string,
      title: PropTypes.string,
      description: PropTypes.string,
    })),
    tools: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
    })),
    mcp_servers: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      command: PropTypes.string,
      tools: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
      })),
    })),
    prompt_layers: PropTypes.arrayOf(PropTypes.object),
    lifecycle_hooks: PropTypes.object,
    config_schema: PropTypes.object,
  }).isRequired,
};

AgentSettingsTab.propTypes = {
  config: PropTypes.shape({
    agent_custom_instructions: PropTypes.string,
    agent_disabled_local_tools: PropTypes.arrayOf(PropTypes.string),
    agent_disabled_remote_tools: PropTypes.arrayOf(PropTypes.string),
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default AgentSettingsTab;
