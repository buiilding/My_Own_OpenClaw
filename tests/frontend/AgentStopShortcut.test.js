import {
  getAgentStopShortcutLabel,
  isAgentStopShortcutEvent,
} from '../../frontend/src/renderer/infrastructure/shortcuts/agentStopShortcut';

describe('agent stop shortcut helper', () => {
  test('matches Escape with no modifiers', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });

    expect(getAgentStopShortcutLabel()).toBe('Esc');
    expect(isAgentStopShortcutEvent(event)).toBe(true);
  });

  test('rejects Escape with modifiers', () => {
    const modifiedEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });

    expect(isAgentStopShortcutEvent(modifiedEvent)).toBe(false);
  });
});
