/**
 * Provides the memory section state module for the renderer UI.
 */

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
