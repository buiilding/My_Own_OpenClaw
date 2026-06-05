import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  MessageSquare,
  Search,
  X,
} from 'lucide-react';
import { DesktopMemoryRuntimeClient } from '../../../../app/runtime/desktopMemoryRuntimeClient';
import { ON_CHANNELS } from '../../../../infrastructure/ipc/channels';
import { useTranscriptSessionInfo } from '../../hooks/useTranscriptSessionInfo';
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

function MemorySection({ onClose = () => {} }) {
  const sessionInfo = useTranscriptSessionInfo();
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

  const userId = sessionInfo.userId || '';

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    if (!userId || userId === 'default_user') {
      setMemoriesByType({
        episodic: [],
        semantic: [],
        procedural: buildProceduralMemories(),
      });
      setLoadError('Connect WindieOS to load saved memories.');
      setIsLoading(false);
      return;
    }

    try {
      const [episodicMemories, semanticMemories] = await Promise.all([
        DesktopMemoryRuntimeClient.listEpisodicMemories(userId, 200),
        DesktopMemoryRuntimeClient.listSemanticMemories(userId, 200),
      ]);

      setMemoriesByType({
        episodic: normalizeEpisodicMemories(episodicMemories),
        semantic: normalizeSemanticMemories(semanticMemories),
        procedural: buildProceduralMemories(),
      });
    } catch (error) {
      setLoadError(error?.message || 'Failed to load memories');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    if (!userId || userId === 'default_user' || !window.ipc?.on) {
      return undefined;
    }

    return window.ipc.on(ON_CHANNELS.WINDIE_MEMORY_STORE_CHANGED, (event) => {
      const eventUserId = event?.payload?.userId ?? event?.userId;
      if (eventUserId === userId) {
        void loadMemories();
      }
    });
  }, [loadMemories, userId]);

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

    if (!userId || userId === 'default_user') {
      setLoadError('Connect WindieOS before deleting saved memories.');
      return;
    }

    if (backendMemoryId && (backendType === 'semantic' || backendType === 'episodic')) {
      try {
        await DesktopMemoryRuntimeClient.deleteMemoryItem({
          userId,
          memoryId: backendMemoryId,
          kind: backendType,
        });
      } catch (error) {
        setLoadError(error?.message || `Failed to delete ${backendType} memory`);
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
  }, [activeType, expandedItemId, userId]);

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
          aria-label="Close memory"
        >
          <X size={18} />
        </button>
      </div>
      <div className="clone-panel-header">
        <h1>Memory</h1>
        <p>WindieOS builds understanding from every interaction</p>
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
              {`Memory ${memoryRetrievalEnabled ? 'On' : 'Off'}`}
            </p>
          </div>
          <label
            className={`clone-memory-retrieval-toggle${memoryRetrievalEnabled ? ' checked' : ''}`.trim()}
          >
            <input
              type="checkbox"
              aria-label="Memory on or off"
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
                placeholder="Search memories..."
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <X size={12} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="clone-memory-list">
          {isLoading ? (
            <div className="clone-empty-state">Loading memories...</div>
          ) : loadError ? (
            <div className="clone-empty-state error">{loadError}</div>
          ) : filteredMemories.length === 0 ? (
            <div className="clone-empty-state">
              <div className="icon-wrap">
                <MessageSquare size={18} />
              </div>
              <p className="title">No memories found</p>
              <p className="subtitle">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Memories will appear as you interact with WindieOS'}
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
