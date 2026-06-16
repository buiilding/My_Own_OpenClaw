/**
 * Provides the memory section module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  MessageSquare,
  Search,
  X,
} from 'lucide-react';
import { DesktopMemoryRuntimeClient } from '../../../../app/runtime/desktopMemoryRuntimeClient';
import { windieDesktopSkin } from '../../../../app/skin/windieDesktopSkin';
import { ON_CHANNELS } from '../../../../infrastructure/ipc/channels';
import {
  getMemoryRetrievalInjectionEnabled,
  setMemoryRetrievalInjectionEnabled,
} from '../../../../utils/memoryRetrievalPreference';
import MemoryItem from './MemoryItem';
import {
  buildProceduralMemories,
  MEMORY_TYPES,
  normalizeEpisodicMemories,
  normalizeSemanticMemories,
} from './memorySectionData';
import {
  filterMemoriesByQuery,
  resolveActiveMemoryTypeInfo,
} from './memorySectionState';

const memoryPanelSkin = windieDesktopSkin.memoryPanel;

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
    procedural: buildProceduralMemories(),
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
        episodic: normalizeEpisodicMemories(episodicMemories),
        semantic: normalizeSemanticMemories(semanticMemories),
        procedural: buildProceduralMemories(),
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
    if (!window.ipc?.on) {
      return undefined;
    }

    return window.ipc.on(ON_CHANNELS.WINDIE_MEMORY_STORE_CHANGED, () => {
      void loadMemories();
    });
  }, [loadMemories]);

  const activeTypeInfo = useMemo(() => {
    return resolveActiveMemoryTypeInfo(activeType, MEMORY_TYPES);
  }, [activeType]);

  const filteredMemories = useMemo(() => {
    return filterMemoriesByQuery(activeType, memoriesByType, searchQuery);
  }, [activeType, memoriesByType, searchQuery]);

  const handleDelete = useCallback(async (memory) => {
    if (!memory) {
      return;
    }

    const backendMemoryId = memory.backendMemoryId || memory.id || null;
    const backendType = memory.backendType || activeType;

    if (backendMemoryId && (backendType === 'semantic' || backendType === 'episodic')) {
      try {
        await DesktopMemoryRuntimeClient.deleteMemoryItem({
          memoryId: backendMemoryId,
          kind: backendType,
        });
      } catch (error) {
        setLoadError(error?.message || `${memoryPanelSkin.deleteFailurePrefix} ${backendType} memory`);
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
    <div className="clone-memory-panel">
      <div className="clone-panel-close-row">
        <button
          type="button"
          className="clone-panel-close"
          onClick={onClose}
          aria-label={memoryPanelSkin.closeLabel}
        >
          <X size={18} />
        </button>
      </div>
      <div className="clone-panel-header">
        <h1>{memoryPanelSkin.title}</h1>
        <p>{memoryPanelSkin.subtitle}</p>
      </div>

      <div className="clone-panel-body">
        <div className="clone-memory-type-row">
          {MEMORY_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = activeType === type.id;
            const count = (memoriesByType[type.id] || []).length;

            return (
              <button
                key={type.id}
                type="button"
                className={`clone-memory-type-btn${isActive ? ' active' : ''}`}
                onClick={() => {
                  setActiveType(type.id);
                  setExpandedItemId(null);
                }}
              >
                <Icon size={14} />
                <span>{type.label}</span>
                <span className="clone-memory-type-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="clone-memory-retrieval-row">
          <div className="clone-memory-retrieval-copy">
            <p className="clone-memory-retrieval-title">
              {memoryRetrievalEnabled
                ? memoryPanelSkin.retrievalStateLabel.enabled
                : memoryPanelSkin.retrievalStateLabel.disabled}
            </p>
          </div>
          <label
            className={`clone-memory-retrieval-toggle${memoryRetrievalEnabled ? ' checked' : ''}`.trim()}
          >
            <input
              type="checkbox"
              aria-label={memoryPanelSkin.retrievalToggleLabel}
              checked={memoryRetrievalEnabled}
              onChange={handleMemoryRetrievalToggle}
            />
            <span className="clone-memory-retrieval-toggle-thumb" />
          </label>
        </div>

        <div className="clone-memory-toolbar">
          <p>{activeTypeInfo.description}</p>

          <div className="clone-memory-toolbar-actions">
            <div className="clone-memory-search">
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

        <div className="clone-memory-list">
          {isLoading ? (
            <div className="clone-empty-state">{memoryPanelSkin.loadingLabel}</div>
          ) : loadError ? (
            <div className="clone-empty-state error">{loadError}</div>
          ) : filteredMemories.length === 0 ? (
            <div className="clone-empty-state">
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
