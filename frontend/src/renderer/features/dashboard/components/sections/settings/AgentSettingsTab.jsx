import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { IpcBridge, ON_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
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

const COORDINATE_METHODS = Object.freeze([
  'manual',
  'ocr',
  'prediction',
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
  const disabledLocalTools = Array.isArray(config?.agent_disabled_local_tools)
    ? config.agent_disabled_local_tools
    : [];
  const disabledRemoteTools = Array.isArray(config?.agent_disabled_remote_tools)
    ? config.agent_disabled_remote_tools
    : [];
  const coordinateMethods = Array.isArray(config?.agent_coordinate_methods)
    ? config.agent_coordinate_methods
    : COORDINATE_METHODS;
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

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>Coordinate modes</span>
          <p>Controls which target-resolution methods the backend may use for grounded tools.</p>
        </div>
        <div className="clone-settings-tool-grid">
          {COORDINATE_METHODS.map((method) => (
            <div key={method} className="clone-settings-tool-toggle">
              <span>{method}</span>
              <CloneToggle
                checked={coordinateMethods.includes(method)}
                onChange={(enabled) => onConfigChange({
                  agent_coordinate_methods: toggleListValue(
                    coordinateMethods,
                    method,
                    enabled,
                  ),
                })}
                ariaLabel={`Enable ${method}`}
              />
            </div>
          ))}
        </div>
      </div>
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

AgentSettingsTab.propTypes = {
  config: PropTypes.shape({
    agent_custom_instructions: PropTypes.string,
    agent_disabled_local_tools: PropTypes.arrayOf(PropTypes.string),
    agent_disabled_remote_tools: PropTypes.arrayOf(PropTypes.string),
    agent_coordinate_methods: PropTypes.arrayOf(PropTypes.string),
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default AgentSettingsTab;
