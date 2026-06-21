/**
 * Covers desktop memory presentation runtime behavior in the frontend test suite.
 */

import {
  filterDashboardMemoriesByQuery,
  resolveDashboardMemoryTypeInfo,
} from '../../frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime';

const MEMORY_TYPES = Object.freeze([
  { id: 'episodic', label: 'Episodic' },
  { id: 'semantic', label: 'Semantic' },
  { id: 'procedural', label: 'Procedural' },
]);

describe('desktopMemoryPresentationRuntime', () => {
  test('resolveDashboardMemoryTypeInfo falls back to first type when missing', () => {
    expect(resolveDashboardMemoryTypeInfo('semantic', MEMORY_TYPES)).toEqual(
      expect.objectContaining({ id: 'semantic' }),
    );
    expect(resolveDashboardMemoryTypeInfo('missing', MEMORY_TYPES)).toEqual(MEMORY_TYPES[0]);
  });

  test('filterDashboardMemoriesByQuery includes episodic assistantResponse field', () => {
    const episodic = [
      {
        id: 'm-1',
        title: 'User asks about hiking',
        detail: 'pack list',
        assistantResponse: 'Bring trail shoes',
      },
    ];
    expect(filterDashboardMemoriesByQuery('episodic', { episodic }, 'trail shoes')).toHaveLength(1);
    expect(filterDashboardMemoriesByQuery('episodic', { episodic }, 'missing')).toHaveLength(0);
  });

  test('filterDashboardMemoriesByQuery uses title/detail for non-episodic types', () => {
    const semantic = [{ id: 'm-2', title: 'Prefers bullets', detail: 'short answers' }];
    expect(filterDashboardMemoriesByQuery('semantic', { semantic }, 'bullets')).toHaveLength(1);
    expect(filterDashboardMemoriesByQuery('semantic', { semantic }, 'short answers')).toHaveLength(1);
    expect(filterDashboardMemoriesByQuery('semantic', { semantic }, 'assistantResponse')).toHaveLength(0);
  });
});
