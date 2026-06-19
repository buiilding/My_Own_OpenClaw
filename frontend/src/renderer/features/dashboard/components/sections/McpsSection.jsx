/**
 * Provides the mcps section module for the renderer UI.
 */

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  RefreshCcw,
  X,
} from 'lucide-react';
import {
  DesktopMcpRuntimeClient,
  EMPTY_DESKTOP_MCP_REGISTRY,
} from '../../../../app/runtime/desktopMcpRuntimeClient';
import { CloneToggle } from './settings/settingsControls';

function McpsSection({ onClose = () => {} }) {
  const [registry, setRegistry] = useState(EMPTY_DESKTOP_MCP_REGISTRY);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRegistry = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      setRegistry(await DesktopMcpRuntimeClient.listMcpServers());
    } catch (loadError) {
      setRegistry(EMPTY_DESKTOP_MCP_REGISTRY);
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
      setRegistry(await DesktopMcpRuntimeClient.refreshMcpServers());
    } catch (refreshError) {
      setError(refreshError?.message || 'Unable to refresh MCP servers.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleToggle = useCallback(async (id, enabled) => {
    setError('');
    try {
      setRegistry(await DesktopMcpRuntimeClient.setMcpServerEnabled({
        id,
        enabled,
      }));
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
            {registry.mcps.map((server) => {
              const presentation = DesktopMcpRuntimeClient.getMcpServerPresentation(server);
              return (
                <section key={presentation.key} className="clone-settings-tool-card">
                  <div className="clone-settings-tool-toggle">
                    <span>
                      {presentation.name}
                      <small>{presentation.statusLabel}</small>
                    </span>
                    <CloneToggle
                      checked={presentation.enabled}
                      onChange={(enabled) => handleToggle(presentation.enablementId, enabled)}
                      ariaLabel={`Enable ${presentation.name}`}
                    />
                  </div>
                  <p className={presentation.statusClassName}>
                    {presentation.statusText}
                  </p>
                  <pre>{JSON.stringify(presentation.debugSpec, null, 2)}</pre>
                </section>
              );
            })}
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
