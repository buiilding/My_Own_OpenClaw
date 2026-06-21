/**
 * Provides the memory section module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  BookOpen,
  Clock,
  MessageSquare,
  Search,
  Workflow,
  X,
} from 'lucide-react';
import { DesktopMemoryRuntimeClient } from '../../../../app/runtime/desktopMemoryRuntimeClient';
import { desktopRuntimeSkin } from '../../../../app/skin/desktopRuntimeSkin';
import { DesktopMemoryRetrievalPreferenceRuntime } from '../../../../app/runtime/desktopMemoryRetrievalPreferenceRuntime';
import {
  DesktopMemoryPresentationRuntime,
} from '../../../../app/runtime/desktopMemoryPresentationRuntime';
import MemoryItem from './MemoryItem';

const memoryPanelSkin = desktopRuntimeSkin.memoryPanel;
const {
  getMemoryRetrievalInjectionEnabled,
  setMemoryRetrievalInjectionEnabled,
} = DesktopMemoryRetrievalPreferenceRuntime;
const {
  buildProceduralMemoriesForDashboard,
  filterDashboardMemoriesByQuery,
  getDashboardMemoryTypes,
  normalizeEpisodicMemoriesForDashboard,
  normalizeSemanticMemoriesForDashboard,
  resolveDashboardMemoryTypeInfo,
} = DesktopMemoryPresentationRuntime;
const MEMORY_TYPE_ICONS = Object.freeze({
  bookOpen: BookOpen,
  clock: Clock,
  workflow: Workflow,
});
const MEMORY_TYPES = getDashboardMemoryTypes();

function MemorySection({ onClose = () => {} }) {
  const [activeType, setActiveType] = useState('episodic');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [memoryRetrievalEnabled, setMemoryRetrievalEnabledState] = useState(
    () => getMemoryRetrievalInjectionEnabled(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [memoriesByType, setMemoriesByType] = useState({
    episodic: [],
    semantic: [],
    procedural: buildProceduralMemoriesForDashboard(),
  });

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [episodicMemories, semanticMemories] = await Promise.all([
        DesktopMemoryRuntimeClient.listEpisodicMemories(200),
        DesktopMemoryRuntimeClient.listSemanticMemories(200),
      ]);

      setMemoriesByType({
        episodic: normalizeEpisodicMemoriesForDashboard(episodicMemories),
        semantic: normalizeSemanticMemoriesForDashboard(semanticMemories),
        procedural: buildProceduralMemoriesForDashboard(),
      });
    } catch (error) {
      setLoadError(error?.message || memoryPanelSkin.loadFailureFallback);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    return DesktopMemoryRuntimeClient.onMemoryStoreChanged(() => {
      void loadMemories();
    });
  }, [loadMemories]);

  const activeTypeInfo = useMemo(() => {
    return resolveDashboardMemoryTypeInfo(activeType);
  }, [activeType]);

  const filteredMemories = useMemo(() => {
    return filterDashboardMemoriesByQuery(activeType, memoriesByType, searchQuery);
  }, [activeType, memoriesByType, searchQuery]);

  const handleDelete = useCallback(async (memory) => {
    if (!memory) {
      return;
    }

    const runtimeMemoryId = memory.runtimeMemoryId || memory.id || null;
    const runtimeMemoryKind = memory.runtimeMemoryKind || activeType;

    if (runtimeMemoryId && (runtimeMemoryKind === 'semantic' || runtimeMemoryKind === 'episodic')) {
      try {
        await DesktopMemoryRuntimeClient.deleteMemoryItem({
          memoryId: runtimeMemoryId,
          kind: runtimeMemoryKind,
        });
      } catch (error) {
        setLoadError(error?.message || `${memoryPanelSkin.deleteFailurePrefix} ${runtimeMemoryKind} memory`);
        return;
      }
    }

    setMemoriesByType((previous) => ({
      ...previous,
      [activeType]: (previous[activeType] || []).filter((item) => item.id !== memory.id),
    }));

    if (expandedItemId === memory.id) {
      setExpandedItemId(null);
    }
  }, [activeType, expandedItemId]);

  const handleMemoryRetrievalToggle = useCallback((event) => {
    const nextEnabled = setMemoryRetrievalInjectionEnabled(event.target.checked === true);
    setMemoryRetrievalEnabledState(nextEnabled);
  }, []);

  return (
    <div className="memory-surface-panel">
      <div className="dashboard-panel-close-row">
        <button
          type="button"
          className="dashboard-panel-close"
          onClick={onClose}
          aria-label={memoryPanelSkin.closeLabel}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dashboard-panel-header">
        <h1>{memoryPanelSkin.title}</h1>
        <p>{memoryPanelSkin.subtitle}</p>
      </div>

      <div className="dashboard-panel-body">
        <div className="memory-surface-type-row">
          {MEMORY_TYPES.map((type) => {
            const Icon = MEMORY_TYPE_ICONS[type.iconKey] || MessageSquare;
            const isActive = activeType === type.id;
            const count = (memoriesByType[type.id] || []).length;

            return (
              <button
                key={type.id}
                type="button"
                className={`memory-surface-type-btn${isActive ? ' active' : ''}`}
                onClick={() => {
                  setActiveType(type.id);
                  setExpandedItemId(null);
                }}
              >
                <Icon size={14} />
                <span>{type.label}</span>
                <span className="memory-surface-type-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="memory-surface-retrieval-row">
          <div className="memory-surface-retrieval-copy">
            <p className="memory-surface-retrieval-title">
              {memoryRetrievalEnabled
                ? memoryPanelSkin.retrievalStateLabel.enabled
                : memoryPanelSkin.retrievalStateLabel.disabled}
            </p>
          </div>
          <label
            className={`memory-surface-retrieval-toggle${memoryRetrievalEnabled ? ' checked' : ''}`.trim()}
          >
            <input
              type="checkbox"
              aria-label={memoryPanelSkin.retrievalToggleLabel}
              checked={memoryRetrievalEnabled}
              onChange={handleMemoryRetrievalToggle}
            />
            <span className="memory-surface-retrieval-toggle-thumb" />
          </label>
        </div>

        <div className="memory-surface-toolbar">
          <p>{activeTypeInfo.description}</p>

          <div className="memory-surface-toolbar-actions">
            <div className="memory-surface-search">
              <Search size={14} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={memoryPanelSkin.searchPlaceholder}
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} aria-label={memoryPanelSkin.clearSearchLabel}>
                  <X size={12} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="memory-surface-list">
          {isLoading ? (
            <div className="dashboard-empty-state">{memoryPanelSkin.loadingLabel}</div>
          ) : loadError ? (
            <div className="dashboard-empty-state error">{loadError}</div>
          ) : filteredMemories.length === 0 ? (
            <div className="dashboard-empty-state">
              <div className="icon-wrap">
                <MessageSquare size={18} />
              </div>
              <p className="title">{memoryPanelSkin.emptyTitle}</p>
              <p className="subtitle">
                {searchQuery
                  ? memoryPanelSkin.emptySearchSubtitle
                  : memoryPanelSkin.emptyDefaultSubtitle}
              </p>
            </div>
          ) : (
            filteredMemories.map((memory) => (
              <MemoryItem
                key={memory.id}
                memory={memory}
                type={activeType}
                expanded={expandedItemId === memory.id}
                onToggleExpand={() => setExpandedItemId((current) => (current === memory.id ? null : memory.id))}
                onDelete={() => {
                  void handleDelete(memory);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

MemorySection.propTypes = {
  onClose: PropTypes.func,
};

export default MemorySection;
