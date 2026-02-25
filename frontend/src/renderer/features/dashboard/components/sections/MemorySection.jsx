import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../hooks/useTranscriptSessionInfo';
import { DEFAULT_USER_ID } from '../../utils/episodicMemoryUtils';

const MEMORY_TYPES = Object.freeze([
  {
    id: 'episodic',
    label: 'Episodic',
    icon: Clock,
    description: 'Interaction memories and short-lived context snapshots',
  },
  {
    id: 'semantic',
    label: 'Semantic',
    icon: BookOpen,
    description: 'Facts, preferences and distilled long-term knowledge',
  },
  {
    id: 'procedural',
    label: 'Procedural',
    icon: Workflow,
    description: 'Skills, routines and workflows',
  },
]);

function parseSemanticContent(content) {
  const normalized = (content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { summary: '(empty)', facts: [] };
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  let summary = '';
  let inFacts = false;
  const facts = [];

  lines.forEach((line) => {
    if (/^summary:/i.test(line)) {
      summary = line.replace(/^summary:/i, '').trim();
      inFacts = false;
      return;
    }
    if (/^facts:/i.test(line)) {
      inFacts = true;
      return;
    }
    if (inFacts) {
      facts.push(line.replace(/^-/, '').trim());
    } else if (!summary) {
      summary = line;
    }
  });

  return {
    summary: summary || lines[0],
    facts: facts.filter(Boolean),
  };
}

function formatDateLabel(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildEpisodicTitle(content, fallbackIndex) {
  const raw = (content || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (!raw) {
    return `Episodic memory ${fallbackIndex + 1}`;
  }
  const normalized = raw
    .replace(/^user:\s*/i, '')
    .replace(/^assistant:\s*/i, '')
    .trim();
  return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
}

function normalizeEpisodicMemories(memories = []) {
  return memories.map((memory, index) => {
    const detail = (memory?.content || '').trim() || '(empty memory)';
    const words = detail.split(/\s+/).filter(Boolean).length;

    return {
      id: memory?.id || `episodic-${index}`,
      title: buildEpisodicTitle(memory?.content, index),
      detail,
      date: formatDateLabel(memory?.timestamp),
      tokens: Math.max(words, 0),
      source: memory?.metadata?.source || 'memory_store',
      timestamp: memory?.timestamp || null,
      backendMemoryId: memory?.id || null,
      backendType: 'episodic',
    };
  });
}

function normalizeSemanticMemories(memories = []) {
  return memories.map((memory, index) => {
    const parsed = parseSemanticContent(memory?.content || '');
    const detail = parsed.facts.length > 0
      ? `${parsed.summary}\n\n${parsed.facts.map((fact) => `- ${fact}`).join('\n')}`
      : parsed.summary;

    return {
      id: memory?.id || `semantic-${index}`,
      title: parsed.summary || `Semantic memory ${index + 1}`,
      detail,
      confidence: memory?.metadata?.source === 'manual' ? 'Medium' : 'High',
      source: memory?.metadata?.source || 'semantic_summary',
      timestamp: memory?.timestamp || null,
      backendMemoryId: memory?.id || null,
      backendType: 'semantic',
    };
  });
}

function buildProceduralMemories() {
  return [];
}

function MemoryItem({
  memory,
  type,
  expanded,
  editing,
  editedDetail,
  onToggleExpand,
  onStartEdit,
  onDelete,
  onCancelEdit,
  onSaveEdit,
  onEditedDetailChange,
}) {
  return (
    <div className="clone-memory-item">
      <div
        className="clone-memory-item-header"
        onClick={() => {
          if (!editing) {
            onToggleExpand();
          }
        }}
      >
        <button type="button" className="clone-memory-expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="clone-memory-item-main">
          <div className="clone-memory-item-title-row">
            <h4 className="clone-memory-item-title">{memory.title}</h4>
          </div>

          <div className="clone-memory-item-meta-row">
            {type === 'episodic' ? (
              <>
                <span>{memory.date}</span>
                <span className="clone-memory-separator">·</span>
                <span>{memory.tokens} tokens</span>
              </>
            ) : null}

            {type === 'semantic' ? (
              <>
                <span className={`clone-memory-confidence ${memory.confidence === 'High' ? 'high' : 'medium'}`}>
                  {memory.confidence}
                </span>
                <span>{memory.source}</span>
              </>
            ) : null}

            {type === 'procedural' ? (
              <span>No procedural memory entries yet.</span>
            ) : null}
          </div>
        </div>

        <div className="clone-memory-item-actions">
          <button type="button" className="clone-memory-action-btn" onClick={(event) => {
            event.stopPropagation();
            onStartEdit();
          }} aria-label="Edit">
            <Pencil size={12} />
          </button>
          <button type="button" className="clone-memory-action-btn delete" onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }} aria-label="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="clone-memory-item-body">
          {editing ? (
            <div className="clone-memory-editor">
              <textarea
                value={editedDetail}
                onChange={(event) => onEditedDetailChange(event.target.value)}
                className="clone-memory-editor-textarea"
                rows={3}
                autoFocus
              />
              <div className="clone-memory-editor-actions">
                <button type="button" className="clone-memory-editor-btn" onClick={onCancelEdit}>Cancel</button>
                <button type="button" className="clone-memory-editor-btn save" onClick={onSaveEdit}>
                  <Check size={12} />
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="clone-memory-item-detail">{memory.detail}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

MemoryItem.propTypes = {
  memory: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    detail: PropTypes.string.isRequired,
    date: PropTypes.string,
    tokens: PropTypes.number,
    confidence: PropTypes.string,
    source: PropTypes.string,
  }).isRequired,
  type: PropTypes.oneOf(['episodic', 'semantic', 'procedural']).isRequired,
  expanded: PropTypes.bool.isRequired,
  editing: PropTypes.bool.isRequired,
  editedDetail: PropTypes.string.isRequired,
  onToggleExpand: PropTypes.func.isRequired,
  onStartEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveEdit: PropTypes.func.isRequired,
  onEditedDetailChange: PropTypes.func.isRequired,
};

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

    const shouldDelete = window.confirm('Delete this memory? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    if (activeType === 'semantic' && memory.backendMemoryId) {
      try {
        const result = await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_SEMANTIC_MEMORY, {
          userId,
          memoryId: memory.backendMemoryId,
        });
        if (!result || result.success === false) {
          throw new Error(result?.error || 'Failed to delete semantic memory');
        }
      } catch (error) {
        setLoadError(error?.message || 'Failed to delete semantic memory');
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
