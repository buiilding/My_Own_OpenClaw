import {
  filterMemoriesByQuery,
  resolveActiveMemoryTypeInfo,
} from '../../frontend/src/renderer/features/dashboard/components/sections/memorySectionState';
import { MEMORY_TYPES } from '../../frontend/src/renderer/features/dashboard/components/sections/memorySectionData';

describe('memorySectionState', () => {
  test('resolveActiveMemoryTypeInfo falls back to first type when missing', () => {
    expect(resolveActiveMemoryTypeInfo('semantic', MEMORY_TYPES)).toEqual(
      expect.objectContaining({ id: 'semantic' }),
    );
    expect(resolveActiveMemoryTypeInfo('missing', MEMORY_TYPES)).toEqual(MEMORY_TYPES[0]);
  });

  test('filterMemoriesByQuery includes episodic assistantResponse field', () => {
    const episodic = [
      {
        id: 'm-1',
        title: 'User asks about hiking',
        detail: 'pack list',
        assistantResponse: 'Bring trail shoes',
      },
    ];
    expect(filterMemoriesByQuery('episodic', { episodic }, 'trail shoes')).toHaveLength(1);
    expect(filterMemoriesByQuery('episodic', { episodic }, 'missing')).toHaveLength(0);
  });

  test('filterMemoriesByQuery uses title/detail for non-episodic types', () => {
    const semantic = [{ id: 'm-2', title: 'Prefers bullets', detail: 'short answers' }];
    expect(filterMemoriesByQuery('semantic', { semantic }, 'bullets')).toHaveLength(1);
    expect(filterMemoriesByQuery('semantic', { semantic }, 'short answers')).toHaveLength(1);
    expect(filterMemoriesByQuery('semantic', { semantic }, 'assistantResponse')).toHaveLength(0);
  });
});
