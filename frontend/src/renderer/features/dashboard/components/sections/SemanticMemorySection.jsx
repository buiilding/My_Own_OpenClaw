import { useCallback, useEffect, useMemo, useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { getTranscriptSessionInfo } from '../../../../infrastructure/transcript/TranscriptWriter';
import {
  DEFAULT_USER_ID,
  formatTimestamp,
  toTimestampValue,
} from '../../utils/episodicMemoryUtils';
import '../../../../styles/SettingsPanel.css';

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

function buildSemanticItem(memory) {
  const parsed = parseSemanticContent(memory?.content || '');
  return {
    ...memory,
    summary: parsed.summary,
    facts: parsed.facts,
    factsCount: parsed.facts.length,
  };
}

function SemanticMemorySection() {
  const [memories, setMemories] = useState([]);
  const [selectedMemoryId, setSelectedMemoryId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(() => getTranscriptSessionInfo());

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const loadSemanticMemories = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const userId = sessionInfo.userId || DEFAULT_USER_ID;
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.LIST_SEMANTIC_MEMORIES, {
        userId,
        limit: 200,
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to load semantic memories');
      }

      const list = (result?.data?.memories ?? []).map(buildSemanticItem);
      list.sort((a, b) => toTimestampValue(b.timestamp) - toTimestampValue(a.timestamp));
      setMemories(list);

      const hasSelected = selectedMemoryId && list.some((memory) => memory.id === selectedMemoryId);
      if (!hasSelected) {
        setSelectedMemoryId(list[0]?.id || null);
      }
    } catch (error) {
      setLoadError(error.message || 'Failed to load semantic memories');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMemoryId, sessionInfo.userId]);

  const deleteSemanticMemory = useCallback(async (memory) => {
    if (!memory?.id) {
      return;
    }

    const shouldDelete = window.confirm('Delete this semantic memory? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setLoadError(null);

    try {
      const userId = sessionInfo.userId || DEFAULT_USER_ID;
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_SEMANTIC_MEMORY, {
        userId,
        memoryId: memory.id,
      });

      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to delete semantic memory');
      }

      closeContextMenu();
      if (selectedMemoryId === memory.id) {
        setSelectedMemoryId(null);
      }
      await loadSemanticMemories();
    } catch (error) {
      setLoadError(error.message || 'Failed to delete semantic memory');
    } finally {
      setIsDeleting(false);
    }
  }, [closeContextMenu, loadSemanticMemories, selectedMemoryId, sessionInfo.userId]);

  useEffect(() => {
    loadSemanticMemories();
  }, [loadSemanticMemories]);

  useEffect(() => {
    if (!contextMenu) {
      return () => undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
        return;
      }
      if (event.key === 'Delete' && contextMenu?.memory) {
        deleteSemanticMemory(contextMenu.memory);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeContextMenu, contextMenu, deleteSemanticMemory]);

  useEffect(() => {
    const handleSessionUpdate = (event) => {
      if (event?.detail) {
        setSessionInfo({
          sessionId: event.detail.sessionId || null,
          userId: event.detail.userId || null,
        });
      }
    };
    window.addEventListener('transcript-session-update', handleSessionUpdate);
    return () => window.removeEventListener('transcript-session-update', handleSessionUpdate);
  }, []);

  const selectedMemory = useMemo(
    () => memories.find((memory) => memory.id === selectedMemoryId) || null,
    [memories, selectedMemoryId],
  );

  const memoryCountLabel = memories.length === 1
    ? '1 memory'
    : `${memories.length} memories`;

  return (
    <div className="settings-panel memory-panel">
      <div className="settings-header">
        <div>
          <h2>Semantic Memory</h2>
          <p>Long-term facts and distilled summaries.</p>
        </div>
      </div>
      <section className="settings-section memory-section">
        <div className="memory-grid">
          <div className="memory-column">
            <div className="memory-column-header">
              <h3>Entries</h3>
              <span className="memory-count">{memoryCountLabel}</span>
            </div>
            {isLoading ? (
              <div className="memory-muted">Loading semantic memories...</div>
            ) : isDeleting ? (
              <div className="memory-muted">Deleting semantic memory...</div>
            ) : loadError ? (
              <div className="memory-error">{loadError}</div>
            ) : memories.length === 0 ? (
              <div className="memory-muted">No semantic memories yet.</div>
            ) : (
              <div className="memory-list-scroll">
                {memories.map((memory, index) => (
                  <button
                    key={memory.id || `semantic-${index}`}
                    type="button"
                    className={`memory-item ${memory.id === selectedMemoryId ? 'active' : ''}`}
                    onClick={() => setSelectedMemoryId(memory.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        memory,
                        index,
                      });
                    }}
                  >
                    <div className="memory-item-title">{memory.summary || `Entry ${index + 1}`}</div>
                    <div className="memory-item-meta">{formatTimestamp(memory.timestamp)}</div>
                    <div className="memory-item-meta">Facts: {memory.factsCount}</div>
                    {memory.id ? (
                      <div className="memory-item-id">{memory.id.slice(0, 8)}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="memory-column memory-conversation-body">
            <div className="memory-column-header">
              <h3>Details</h3>
            </div>
            {!selectedMemory ? (
              <div className="settings-card">
                <div className="settings-card-title">No selection</div>
                <div className="settings-card-desc">Select a semantic memory to inspect details.</div>
              </div>
            ) : (
              <div className="settings-card">
                <div className="settings-card-title">{selectedMemory.summary || 'Summary unavailable'}</div>
                <div className="settings-card-desc">
                  Created: {formatTimestamp(selectedMemory.timestamp)}
                </div>
                {selectedMemory.facts.length > 0 ? (
                  <div className="memory-card-meta">
                    {selectedMemory.facts.map((fact, idx) => (
                      <div key={`${selectedMemory.id || 'fact'}-${idx}`} className="memory-card-row">
                        - {fact}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="settings-card-desc">No extracted facts stored for this entry.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      {contextMenu ? (
        <div
          className="memory-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="danger"
            disabled={isDeleting}
            onClick={() => deleteSemanticMemory(contextMenu.memory)}
          >
            Delete
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={closeContextMenu}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
          }}
          onMouseDown={closeContextMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeContextMenu();
          }}
        />
      ) : null}
    </div>
  );
}

export default SemanticMemorySection;
