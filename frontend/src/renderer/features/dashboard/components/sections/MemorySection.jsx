import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  MessageSquare,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../hooks/useTranscriptSessionInfo';
import { DEFAULT_USER_ID } from '../../utils/episodicMemoryUtils';
import {
  getMemoryRetrievalInjectionEnabled,
  setMemoryRetrievalInjectionEnabled,
} from '../../../../utils/memoryRetrievalPreference';
import MemoryItem from './MemoryItem';
import {
  buildProceduralMemories,
  formatDateLabel,
  MEMORY_TYPES,
  normalizeEpisodicMemories,
  normalizeSemanticMemories,
} from './memorySectionData';

function MemorySection({ onClose = () => {} }) {
  const sessionInfo = useTranscriptSessionInfo();
  const [activeType, setActiveType] = useState('episodic');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editedDetail, setEditedDetail] = useState('');
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

  const userId = sessionInfo.userId || DEFAULT_USER_ID;

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [episodicResult, semanticResult] = await Promise.all([
        IpcBridge.invoke(INVOKE_CHANNELS.LIST_EPISODIC_MEMORIES, {
          userId,
          limit: 200,
        }),
        IpcBridge.invoke(INVOKE_CHANNELS.LIST_SEMANTIC_MEMORIES, {
          userId,
          limit: 200,
        }),
      ]);

      if (!episodicResult || episodicResult.success === false) {
        throw new Error(episodicResult?.error || 'Failed to load episodic memories');
      }
      if (!semanticResult || semanticResult.success === false) {
        throw new Error(semanticResult?.error || 'Failed to load semantic memories');
      }

      setMemoriesByType({
        episodic: normalizeEpisodicMemories(episodicResult?.data?.memories ?? []),
        semantic: normalizeSemanticMemories(semanticResult?.data?.memories ?? []),
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

  const activeTypeInfo = useMemo(() => {
    return MEMORY_TYPES.find((type) => type.id === activeType) || MEMORY_TYPES[0];
  }, [activeType]);

  const filteredMemories = useMemo(() => {
    const source = memoriesByType[activeType] || [];
    if (!searchQuery.trim()) {
      return source;
    }

    const normalized = searchQuery.trim().toLowerCase();
    return source.filter((memory) => {
      const title = (memory.title || '').toLowerCase();
      const detail = (memory.detail || '').toLowerCase();
      return title.includes(normalized) || detail.includes(normalized);
    });
  }, [activeType, memoriesByType, searchQuery]);

  const handleDelete = useCallback(async (memory) => {
    if (!memory) {
      return;
    }

    const backendMemoryId = memory.backendMemoryId || memory.id || null;
    const backendType = memory.backendType || activeType;

    if (backendMemoryId && (backendType === 'semantic' || backendType === 'episodic')) {
      try {
        const deleteChannel = backendType === 'semantic'
          ? INVOKE_CHANNELS.DELETE_SEMANTIC_MEMORY
          : INVOKE_CHANNELS.DELETE_EPISODIC_MEMORY;
        const result = await IpcBridge.invoke(deleteChannel, {
          userId,
          memoryId: backendMemoryId,
        });
        if (!result || result.success === false) {
          throw new Error(result?.error || `Failed to delete ${backendType} memory`);
        }
        if (result?.data?.deleted === false) {
          throw new Error(`${backendType} memory was not deleted`);
        }
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
    if (editingItemId === memory.id) {
      setEditingItemId(null);
      setEditedDetail('');
    }
  }, [activeType, editingItemId, expandedItemId, userId]);

  const handleSaveEdit = useCallback((memoryId) => {
    setMemoriesByType((previous) => ({
      ...previous,
      [activeType]: (previous[activeType] || []).map((item) => {
        if (item.id !== memoryId) {
          return item;
        }
        return {
          ...item,
          detail: editedDetail,
        };
      }),
    }));

    setEditingItemId(null);
    setEditedDetail('');
  }, [activeType, editedDetail]);

  const handleAdd = useCallback(() => {
    if (!newTitle.trim()) {
      return;
    }

    const now = new Date();
    const localMemory = {
      id: `local-${activeType}-${Date.now()}`,
      title: newTitle.trim(),
      detail: newDetail.trim() || '(empty memory)',
      date: formatDateLabel(now.toISOString()),
      tokens: Math.max(newDetail.trim().split(/\s+/).filter(Boolean).length, 0),
      confidence: 'Medium',
      source: 'manual',
      timestamp: now.toISOString(),
      backendMemoryId: null,
      backendType: activeType,
    };

    setMemoriesByType((previous) => ({
      ...previous,
      [activeType]: [localMemory, ...(previous[activeType] || [])],
    }));

    setIsAdding(false);
    setNewTitle('');
    setNewDetail('');
  }, [activeType, newDetail, newTitle]);

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
                  setEditingItemId(null);
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
            <p className="clone-memory-retrieval-title">Inject memory into prompts</p>
            <p className="clone-memory-retrieval-subtitle">
              Keep storage and semanticization running, but skip retrieval search and prompt tags when disabled.
            </p>
          </div>
          <label
            className={`clone-memory-retrieval-toggle${memoryRetrievalEnabled ? ' checked' : ''}`.trim()}
          >
            <input
              type="checkbox"
              aria-label="Inject memory into prompts"
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

            <button type="button" className="clone-memory-add-btn" onClick={() => setIsAdding(true)}>
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>

        {isAdding ? (
          <div className="clone-memory-add-box">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Memory title..."
            />
            <textarea
              value={newDetail}
              onChange={(event) => setNewDetail(event.target.value)}
              placeholder="Details..."
              rows={2}
            />
            <div className="clone-memory-add-actions">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewTitle('');
                  setNewDetail('');
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={handleAdd} className="primary">
                <Plus size={12} />
                Add Memory
              </button>
            </div>
          </div>
        ) : null}

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
                editing={editingItemId === memory.id}
                editedDetail={editedDetail}
                onToggleExpand={() => setExpandedItemId((current) => (current === memory.id ? null : memory.id))}
                onStartEdit={() => {
                  setEditingItemId(memory.id);
                  setEditedDetail(memory.detail || '');
                  setExpandedItemId(memory.id);
                }}
                onDelete={() => {
                  void handleDelete(memory);
                }}
                onCancelEdit={() => {
                  setEditingItemId(null);
                  setEditedDetail('');
                }}
                onSaveEdit={() => handleSaveEdit(memory.id)}
                onEditedDetailChange={setEditedDetail}
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
