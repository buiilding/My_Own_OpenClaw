/**
 * Covers desktop memory presentation runtime behavior in the frontend test suite.
 */

import {
  DesktopMemoryPresentationRuntime,
} from '../../src/renderer/app/runtime/desktopMemoryPresentationRuntime';

const {
  filterDashboardMemoriesByQuery,
  getDashboardMemoryTypes,
  resolveDashboardMemoryTypeInfo,
} = DesktopMemoryPresentationRuntime;

describe('desktopMemoryPresentationRuntime', () => {
  test('provides dashboard memory type descriptors', () => {
    expect(getDashboardMemoryTypes()).toEqual([
      expect.objectContaining({
        id: 'episodic',
        label: 'Episodic',
        iconKey: 'clock',
      }),
      expect.objectContaining({
        id: 'semantic',
        label: 'Semantic',
        iconKey: 'bookOpen',
      }),
      expect.objectContaining({
        id: 'procedural',
        label: 'Procedural',
        iconKey: 'workflow',
      }),
    ]);
  });

  test('resolveDashboardMemoryTypeInfo falls back to first type when missing', () => {
    expect(resolveDashboardMemoryTypeInfo('semantic')).toEqual(
      expect.objectContaining({ id: 'semantic' }),
    );
    expect(resolveDashboardMemoryTypeInfo('missing')).toEqual(getDashboardMemoryTypes()[0]);
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
