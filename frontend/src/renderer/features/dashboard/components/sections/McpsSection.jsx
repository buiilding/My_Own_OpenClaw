import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  RefreshCcw,
  X,
} from 'lucide-react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { CloneToggle } from './settings/settingsControls';

function normalizeMcpRegistry(payload) {
  return {
    mcps: Array.isArray(payload?.mcps) ? payload.mcps : [],
    errors: Array.isArray(payload?.errors) ? payload.errors : [],
    mcp_errors: Array.isArray(payload?.mcp_errors) ? payload.mcp_errors : [],
  };
}

function McpsSection({ onClose = () => {} }) {
  const [registry, setRegistry] = useState({ mcps: [], errors: [], mcp_errors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRegistry = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const payload = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_MCP_SERVERS);
      setRegistry(normalizeMcpRegistry(payload));
    } catch (loadError) {
      setRegistry({ mcps: [], errors: [], mcp_errors: [] });
      setError(loadError?.message || 'Unable to load MCP servers.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const handleRefresh = useCallback(async () => {
    setError('');
    setIsRefreshing(true);
    try {
      const payload = await IpcBridge.invoke(INVOKE_CHANNELS.REFRESH_MCP_SERVERS);
      setRegistry(normalizeMcpRegistry(payload));
    } catch (refreshError) {
      setError(refreshError?.message || 'Unable to refresh MCP servers.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleToggle = useCallback(async (server, enabled) => {
    setError('');
    try {
      const payload = await IpcBridge.invoke(INVOKE_CHANNELS.SET_MCP_SERVER_ENABLED, {
        id: server.extension_id || server.mcp_id || server.id,
        enabled,
      });
      if (payload?.success === false) {
        throw new Error(payload.error || 'Unable to update MCP server.');
      }
      setRegistry(normalizeMcpRegistry(payload?.registry));
    } catch (toggleError) {
      setError(toggleError?.message || 'Unable to update MCP server.');
    }
  }, []);

  return (
    <div className="clone-model-panel">
      <div className="clone-panel-close-row">
        <button
          type="button"
          className="clone-panel-close"
          onClick={onClose}
          aria-label="Close MCPs"
        >
          <X size={18} />
        </button>
      </div>
      <div className="clone-panel-header">
        <h1>MCPs</h1>
        <p>Manage local protocol integrations.</p>
      </div>
      <div className="clone-panel-body">
        <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
          <div>
            <span>Servers</span>
            <p>{registry.mcps.length} configured</p>
          </div>
          <button
            type="button"
            className="clone-settings-secondary-button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh MCP servers"
            title="Refresh MCP servers"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        {error ? (
          <p className="clone-settings-action-status clone-settings-action-status-error">{error}</p>
        ) : null}

        {isLoading ? (
          <div className="clone-empty-state">Loading MCP servers...</div>
        ) : registry.mcps.length === 0 ? (
          <div className="clone-empty-state">No MCP servers configured.</div>
        ) : (
          <div className="clone-settings-layer-list">
            {registry.mcps.map((server) => (
              <section key={`${server.extension_id || server.id}`} className="clone-settings-tool-card">
                <div className="clone-settings-tool-toggle">
                  <span>
                    {server.name || server.id}
                    <small>{server.status?.label || 'Unknown'}</small>
                  </span>
                  <CloneToggle
                    checked={server.effective_enabled === true}
                    onChange={(enabled) => handleToggle(server, enabled)}
                    ariaLabel={`Enable ${server.name || server.id}`}
                  />
                </div>
                <p className={`clone-settings-tool-status${server.status?.state === 'error' ? ' clone-settings-tool-status-error' : ''}`}>
                  {server.status?.reason || server.command}
                </p>
                <pre>{JSON.stringify({
                  id: server.id,
                  command: server.command,
                  args: server.args || [],
                  tool_prefix: server.tool_prefix || null,
                  tools: (server.tools || []).map((tool) => tool.name),
                }, null, 2)}</pre>
              </section>
            ))}
          </div>
        )}

        {registry.errors.length > 0 ? registry.errors.map((registryError) => (
          <p
            key={`${registryError.kind || 'extension'}-${registryError.id || 'unknown'}-${registryError.reason}`}
            className="clone-settings-tool-status clone-settings-tool-status-error"
          >
            {registryError.kind || 'extension'} {registryError.id || 'unknown'}: {registryError.reason}
          </p>
        )) : null}
      </div>
    </div>
  );
}

McpsSection.propTypes = {
  onClose: PropTypes.func,
};

export default McpsSection;
