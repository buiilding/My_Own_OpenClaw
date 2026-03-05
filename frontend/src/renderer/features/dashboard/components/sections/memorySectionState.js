import { formatDateLabel } from './memorySectionData';

export function resolveActiveMemoryTypeInfo(activeType, memoryTypes) {
  return memoryTypes.find((type) => type.id === activeType) || memoryTypes[0];
}

export function filterMemoriesByQuery(activeType, memoriesByType, searchQuery) {
  const source = memoriesByType[activeType] || [];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return source;
  }

  return source.filter((memory) => {
    const title = (memory.title || '').toLowerCase();
    const detail = (memory.detail || '').toLowerCase();
    if (activeType !== 'episodic') {
      return title.includes(normalizedQuery) || detail.includes(normalizedQuery);
    }
    const assistantResponse = (memory.assistantResponse || '').toLowerCase();
    return (
      title.includes(normalizedQuery)
      || detail.includes(normalizedQuery)
      || assistantResponse.includes(normalizedQuery)
    );
  });
}

export function buildLocalMemoryDraft(activeType, newTitle, newDetail, now = new Date()) {
  const normalizedTitle = newTitle.trim();
  if (!normalizedTitle) {
    return null;
  }

  const normalizedDetail = newDetail.trim();
  const isoTimestamp = now.toISOString();
  return {
    id: `local-${activeType}-${now.getTime()}`,
    title: normalizedTitle,
    detail: normalizedDetail || '(empty memory)',
    date: formatDateLabel(isoTimestamp),
    tokens: Math.max(normalizedDetail.split(/\s+/).filter(Boolean).length, 0),
    confidence: 'Medium',
    source: 'manual',
    timestamp: isoTimestamp,
    backendMemoryId: null,
    backendType: activeType,
  };
}
