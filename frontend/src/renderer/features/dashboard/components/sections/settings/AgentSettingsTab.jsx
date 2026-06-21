/**
 * Defines agent settings tab configuration for the renderer UI.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  DesktopRuntimeSkin,
} from '../../../../../app/skin/desktopRuntimeSkin';
import {
  DesktopExtensionRuntimeClient,
} from '../../../../../app/runtime/desktopExtensionRuntimeClient';
import { SettingsToggle } from './settingsControls';

const agentSettingsSkin = DesktopRuntimeSkin.desktopRuntimeSkin.settings.agent;
const {
  formatToolAcceptanceRuntimeSummary,
} = DesktopRuntimeSkin;

function AgentSettingsTab({ config, onConfigChange }) {
  const [manifestStatus, setManifestStatus] = useState(
    DesktopExtensionRuntimeClient.getEmptyToolManifestStatus,
  );
  const [remoteToolCatalog, setRemoteToolCatalog] = useState(
    DesktopExtensionRuntimeClient.getEmptyRemoteToolCatalog,
  );
  const [extensionRuntime, setExtensionRuntime] = useState(
    DesktopExtensionRuntimeClient.getEmptyExtensionRuntime,
  );
  const skillsPresentation = DesktopExtensionRuntimeClient.getSkillRuntimePresentation(
    extensionRuntime.skills,
  );
  const mcpsPresentation = DesktopExtensionRuntimeClient.getMcpRuntimeMetadataPresentation(
    extensionRuntime.mcps,
  );
  useEffect(() => {
    DesktopExtensionRuntimeClient.listAgentExtensions()
      .then(setExtensionRuntime)
      .catch(() => {
        setExtensionRuntime(DesktopExtensionRuntimeClient.getEmptyExtensionRuntime());
      });

    const removeListener = DesktopExtensionRuntimeClient.onAgentCapabilityUpdate((
      nextManifestStatus,
      nextRemoteToolCatalog,
    ) => {
      if (nextManifestStatus) {
        setManifestStatus(nextManifestStatus);
      }
      if (nextRemoteToolCatalog) {
        setRemoteToolCatalog(nextRemoteToolCatalog);
      }
    });
    return removeListener;
  }, []);

  return (
    <div className="settings-surface-general">
      <h2>{agentSettingsSkin.title}</h2>

      <div className="settings-surface-row settings-surface-row-rich">
        <div>
          <span>{agentSettingsSkin.customInstructions.label}</span>
          <p>{agentSettingsSkin.customInstructions.description}</p>
          <textarea
            className="settings-surface-textarea"
            value={config?.agent_custom_instructions || ''}
            onChange={(event) => onConfigChange({
              agent_custom_instructions: event.target.value,
            })}
            rows={6}
            spellCheck
          />
        </div>
      </div>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-stack">
        <div>
          <span>{agentSettingsSkin.extensions.label}</span>
          <p>{agentSettingsSkin.extensions.description}</p>
        </div>
        <div className="settings-surface-layer-list">
          {extensionRuntime.plugins.length > 0 ? extensionRuntime.plugins.map((plugin) => {
            const presentation = DesktopExtensionRuntimeClient.getPluginRuntimePresentation(plugin);
            return (
              <details key={presentation.key} className="settings-surface-schema-viewer">
                <summary>
                  {presentation.displayName}
                  <small>
                    {presentation.toolCount} tools / {presentation.settingsPanelCount} panels
                  </small>
                </summary>
                <PluginRuntimeDetails presentation={presentation} />
              </details>
            );
          }) : (
            <p className="settings-surface-tool-status">{agentSettingsSkin.extensions.emptyPlugins}</p>
          )}
          {skillsPresentation.count > 0 ? (
            <details className="settings-surface-schema-viewer">
              <summary>
                Skills
                <small>{skillsPresentation.summary}</small>
              </summary>
              <pre>{JSON.stringify(skillsPresentation.debugSpec, null, 2)}</pre>
            </details>
          ) : null}
          {mcpsPresentation.count > 0 ? (
            <details className="settings-surface-schema-viewer">
              <summary>
                MCP servers
                <small>{mcpsPresentation.summary}</small>
              </summary>
              <pre>{JSON.stringify(mcpsPresentation.debugSpec, null, 2)}</pre>
            </details>
          ) : null}
          {extensionRuntime.errors.length > 0 ? extensionRuntime.errors.map((error) => {
            const presentation = DesktopExtensionRuntimeClient.getExtensionRuntimeErrorPresentation(error);
            return (
              <p key={presentation.key} className="settings-surface-tool-status settings-surface-tool-status-error">
                {presentation.text}
              </p>
            );
          }) : null}
        </div>
      </div>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-stack">
        <div>
          <span>{agentSettingsSkin.localTools.label}</span>
          <p>{agentSettingsSkin.localTools.description}</p>
        </div>
        <div className="settings-surface-tool-grid">
          {agentSettingsSkin.localTools.ids.map((toolName) => (
            <div key={toolName} className="settings-surface-tool-card">
              <div className="settings-surface-tool-toggle">
                <span>{toolName}</span>
                <SettingsToggle
                  checked={DesktopExtensionRuntimeClient.isLocalToolEnabled(config, toolName)}
                  onChange={(enabled) => onConfigChange(
                    DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(
                      config,
                      toolName,
                      enabled,
                    ),
                  )}
                  ariaLabel={`Enable ${toolName}`}
                />
              </div>
              <ToolAcceptanceStatus
                presentation={DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(
                  manifestStatus,
                  toolName,
                )}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-stack">
        <div>
          <span>{agentSettingsSkin.remoteTools.label}</span>
          <p>{agentSettingsSkin.remoteTools.description}</p>
        </div>
        <div className="settings-surface-tool-grid">
          {agentSettingsSkin.remoteTools.ids.map((toolName) => {
            const toolPresentation = DesktopExtensionRuntimeClient.getRemoteToolPresentation(
              remoteToolCatalog,
              toolName,
            );
            return (
              <div key={toolName} className="settings-surface-tool-toggle settings-surface-tool-card">
                <span>
                  {toolName}
                  {!toolPresentation.available ? (
                    <small>
                      {toolPresentation.unavailableReason
                        || agentSettingsSkin.remoteTools.unavailableFallback}
                    </small>
                  ) : null}
                </span>
                <SettingsToggle
                  checked={DesktopExtensionRuntimeClient.isRemoteToolEnabled(config, toolName)}
                  onChange={(enabled) => onConfigChange(
                    DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch(
                      config,
                      toolName,
                      enabled,
                    ),
                  )}
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

function PluginRuntimeDetails({ presentation }) {
  return (
    <div className="settings-surface-extension-detail">
      {presentation.description ? (
        <p className="settings-surface-tool-status">{presentation.description}</p>
      ) : null}
      {presentation.permissions.length > 0 ? (
        <div>
          <strong>Permissions</strong>
          <ul>
            {presentation.permissions.map((permission) => (
              <li key={permission.key}>{permission.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {presentation.settingsPanels.length > 0 ? (
        <div>
          <strong>Settings panels</strong>
          <ul>
            {presentation.settingsPanels.map((panel) => (
              <li key={panel.key}>{panel.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <pre>{JSON.stringify(presentation.debugSpec, null, 2)}</pre>
    </div>
  );
}

function ToolAcceptanceStatus({ presentation }) {
  const config = agentSettingsSkin.toolAcceptance;
  if (presentation.status === 'rejected') {
    return (
      <p className="settings-surface-tool-status settings-surface-tool-status-error">
        {config.rejectedPrefix}: {presentation.rejectedReason}
      </p>
    );
  }
  if (presentation.status !== 'accepted' || !presentation.acceptedTool) {
    return (
      <p className="settings-surface-tool-status">{config.pending}</p>
    );
  }
  const { acceptedTool } = presentation;
  return (
    <details className="settings-surface-schema-viewer">
      <summary>{config.acceptedSummary}</summary>
      <p className="settings-surface-tool-status">
        {formatToolAcceptanceRuntimeSummary(acceptedTool)}
      </p>
      <pre>{JSON.stringify({
        schema: acceptedTool.schema,
      }, null, 2)}</pre>
    </details>
  );
}

ToolAcceptanceStatus.propTypes = {
  presentation: PropTypes.shape({
    acceptedTool: PropTypes.shape({
      argument_resolution: PropTypes.string,
      execution_target: PropTypes.string,
      schema: PropTypes.object,
    }),
    rejectedReason: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['accepted', 'rejected', 'pending']).isRequired,
  }).isRequired,
};

PluginRuntimeDetails.propTypes = {
  presentation: PropTypes.shape({
    debugSpec: PropTypes.object.isRequired,
    description: PropTypes.string,
    permissions: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
    })).isRequired,
    settingsPanels: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
    })).isRequired,
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
