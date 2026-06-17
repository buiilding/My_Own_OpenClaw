/**
 * Defines agent settings tab configuration for the renderer UI.
 */

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  formatToolAcceptanceRuntimeSummary,
  desktopAgentSkin,
} from '../../../../../app/skin/desktopAgentSkin';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import { CloneToggle } from './settingsControls';

const agentSettingsSkin = desktopAgentSkin.settings.agent;

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
  const [extensionRuntime, setExtensionRuntime] = useState({
    plugins: [],
    skills: [],
    mcps: [],
    errors: [],
  });
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
          plugins: Array.isArray(payload?.plugins) ? payload.plugins : [],
          skills: Array.isArray(payload?.skills) ? payload.skills : [],
          mcps: Array.isArray(payload?.mcps) ? payload.mcps : [],
          errors: Array.isArray(payload?.errors) ? payload.errors : [],
        });
      })
      .catch(() => {
        setExtensionRuntime({ plugins: [], skills: [], mcps: [], errors: [] });
      });

    const removeListener = IpcBridge.on(ON_CHANNELS.AGENT_CAPABILITY_EVENT, (event) => {
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
    });
    return removeListener;
  }, []);

  return (
    <div className="clone-settings-general">
      <h2>{agentSettingsSkin.title}</h2>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>{agentSettingsSkin.customInstructions.label}</span>
          <p>{agentSettingsSkin.customInstructions.description}</p>
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
          <span>{agentSettingsSkin.extensions.label}</span>
          <p>{agentSettingsSkin.extensions.description}</p>
        </div>
        <div className="clone-settings-layer-list">
          {extensionRuntime.plugins.length > 0 ? extensionRuntime.plugins.map((plugin) => (
            <details key={`plugin:${plugin.id}`} className="clone-settings-schema-viewer">
              <summary>
                {plugin.name || plugin.id}
                <small>{plugin.tools?.length || 0} tools / {plugin.settings_panels?.length || 0} panels</small>
              </summary>
              <PluginRuntimeDetails plugin={plugin} />
            </details>
          )) : (
            <p className="clone-settings-tool-status">{agentSettingsSkin.extensions.emptyPlugins}</p>
          )}
          {extensionRuntime.skills.length > 0 ? (
            <details className="clone-settings-schema-viewer">
              <summary>
                Skills
                <small>{extensionRuntime.skills.length} prompt layers</small>
              </summary>
              <pre>{JSON.stringify(extensionRuntime.skills, null, 2)}</pre>
            </details>
          ) : null}
          {extensionRuntime.mcps.length > 0 ? (
            <details className="clone-settings-schema-viewer">
              <summary>
                MCP servers
                <small>{extensionRuntime.mcps.length} servers</small>
              </summary>
              <pre>{JSON.stringify(extensionRuntime.mcps.map((server) => ({
                id: server.id,
                name: server.name,
                command: server.command,
                tools: (server.tools || []).map((tool) => tool.name),
              })), null, 2)}</pre>
            </details>
          ) : null}
          {extensionRuntime.errors.length > 0 ? extensionRuntime.errors.map((error) => (
            <p key={`${error.kind || 'extension'}-${error.id || 'unknown'}-${error.reason}`} className="clone-settings-tool-status clone-settings-tool-status-error">
              {error.kind || 'extension'} {error.id || 'unknown'}: {error.reason}
            </p>
          )) : null}
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-stack">
        <div>
          <span>{agentSettingsSkin.localTools.label}</span>
          <p>{agentSettingsSkin.localTools.description}</p>
        </div>
        <div className="clone-settings-tool-grid">
          {agentSettingsSkin.localTools.ids.map((toolName) => (
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
          <span>{agentSettingsSkin.remoteTools.label}</span>
          <p>{agentSettingsSkin.remoteTools.description}</p>
        </div>
        <div className="clone-settings-tool-grid">
          {agentSettingsSkin.remoteTools.ids.map((toolName) => {
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

function PluginRuntimeDetails({ plugin }) {
  return (
    <div className="clone-settings-extension-detail">
      {plugin.description ? (
        <p className="clone-settings-tool-status">{plugin.description}</p>
      ) : null}
      {Array.isArray(plugin.permissions) && plugin.permissions.length > 0 ? (
        <div>
          <strong>Permissions</strong>
          <ul>
            {plugin.permissions.map((permission) => (
              <li key={permission.id}>
                {permission.id}{permission.reason ? `: ${permission.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(plugin.settings_panels) && plugin.settings_panels.length > 0 ? (
        <div>
          <strong>Settings panels</strong>
          <ul>
            {plugin.settings_panels.map((panel) => (
              <li key={panel.id}>
                {panel.title}{panel.description ? `: ${panel.description}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <pre>{JSON.stringify({
        id: plugin.id,
        version: plugin.version || null,
        tools: (plugin.tools || []).map((tool) => tool.name),
        config_schema: plugin.config_schema || {},
      }, null, 2)}</pre>
    </div>
  );
}

function ToolAcceptanceStatus({ acceptedTool, rejectedTool }) {
  const config = agentSettingsSkin.toolAcceptance;
  if (rejectedTool) {
    return (
      <p className="clone-settings-tool-status clone-settings-tool-status-error">
        {config.rejectedPrefix}: {rejectedTool.reason || 'manifest validation failed'}
      </p>
    );
  }
  if (!acceptedTool) {
    return (
      <p className="clone-settings-tool-status">{config.pending}</p>
    );
  }
  return (
    <details className="clone-settings-schema-viewer">
      <summary>{config.acceptedSummary}</summary>
      <p className="clone-settings-tool-status">
        {formatToolAcceptanceRuntimeSummary(acceptedTool)}
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

PluginRuntimeDetails.propTypes = {
  plugin: PropTypes.shape({
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
