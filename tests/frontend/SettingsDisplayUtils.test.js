import {
  buildSpeechModeConfigUpdate,
  findDisplayById,
  resolveDisplaySelection,
  toDisplayOptions,
} from '../../frontend/src/renderer/features/dashboard/utils/settingsDisplayUtils';

describe('settingsDisplayUtils', () => {
  const displays = [
    { id: 1, label: 'Main Monitor', isPrimary: true },
    { id: 2, label: 'Side Monitor', isPrimary: false },
  ];

  test('toDisplayOptions maps display ids and labels', () => {
    expect(toDisplayOptions(displays)).toEqual([
      { value: '1', label: 'Main Monitor' },
      { value: '2', label: 'Side Monitor' },
    ]);
  });

  test('toDisplayOptions falls back to generated label when label missing', () => {
    expect(toDisplayOptions([{ id: 5 }])).toEqual([{ value: '5', label: 'Display 5' }]);
  });

  test('findDisplayById returns matched display or null', () => {
    expect(findDisplayById(displays, '2')).toEqual({ id: 2, label: 'Side Monitor', isPrimary: false });
    expect(findDisplayById(displays, '99')).toBeNull();
  });

  test('resolveDisplaySelection keeps selected display when id exists', () => {
    expect(resolveDisplaySelection(displays, '2')).toEqual({
      nextSelectedDisplayId: '2',
      selectedDisplay: { id: 2, label: 'Side Monitor', isPrimary: false },
    });
  });

  test('resolveDisplaySelection falls back to primary display when selected id missing', () => {
    expect(resolveDisplaySelection(displays, '99')).toEqual({
      nextSelectedDisplayId: '1',
      selectedDisplay: { id: 1, label: 'Main Monitor', isPrimary: true },
    });
  });

  test('resolveDisplaySelection falls back to first display when primary missing', () => {
    const secondaryOnly = [{ id: 4, label: 'Only', isPrimary: false }];
    expect(resolveDisplaySelection(secondaryOnly, '99')).toEqual({
      nextSelectedDisplayId: '4',
      selectedDisplay: { id: 4, label: 'Only', isPrimary: false },
    });
  });

  test('resolveDisplaySelection returns null state for empty displays', () => {
    expect(resolveDisplaySelection([], '99')).toEqual({
      nextSelectedDisplayId: '99',
      selectedDisplay: null,
    });
  });

  test('buildSpeechModeConfigUpdate preserves config fields and updates enabled value', () => {
    expect(buildSpeechModeConfigUpdate({
      model_mode: 'local',
      selected_model_id: 'qwen2.5',
      model_provider: 'ollama',
      interaction_mode: 'voice',
    }, true)).toEqual({
      model_mode: 'local',
      selected_model_id: 'qwen2.5',
      model_provider: 'ollama',
      speech_mode_enabled: true,
      interaction_mode: 'voice',
    });
  });

  test('buildSpeechModeConfigUpdate applies defaults when config values missing', () => {
    expect(buildSpeechModeConfigUpdate(null, false)).toEqual({
      model_mode: 'online',
      selected_model_id: '',
      model_provider: '',
      speech_mode_enabled: false,
      interaction_mode: 'chat',
    });
  });
});
