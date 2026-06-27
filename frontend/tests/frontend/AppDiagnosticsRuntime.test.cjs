/** @jest-environment node */

const {
  appendRendererInteractionDiagnostic,
  appendSurfaceVisibilityDiagnostic,
} = require('../../src/main/diagnostics/app_diagnostics_runtime.cjs');

describe('app diagnostics runtime', () => {
  test('surface visibility diagnostics ignore removed snake_case aliases', () => {
    const appendDiagnosticEvent = jest.fn(event => event);

    const snakeOnlyEvent = appendSurfaceVisibilityDiagnostic({
      action: 'hide-from-phase',
      conversation_ref: 'conv-snake',
      turn_ref: 'turn-snake',
      user_hidden: true,
      response_window_visible: false,
      stale_guard_ref: 'guard-snake',
    }, {
      appendDiagnosticEvent,
    });
    const event = appendSurfaceVisibilityDiagnostic({
      action: 'hide-from-phase',
      conversation_ref: 'conv-snake',
      turn_ref: 'turn-snake',
      user_hidden: true,
      response_window_visible: false,
      stale_guard_ref: 'guard-snake',
      conversationRef: 'conv-camel',
      turnRef: 'turn-camel',
      userHidden: false,
      responseWindowVisible: true,
      staleGuardRef: 'guard-camel',
    }, {
      appendDiagnosticEvent,
    });

    expect(snakeOnlyEvent).toEqual(expect.objectContaining({
      conversationRef: null,
      data: {
        action: 'hide-from-phase',
      },
    }));
    expect(event).toEqual(expect.objectContaining({
      conversationRef: 'conv-camel',
      data: expect.objectContaining({
        turnRef: 'turn-camel',
        userHidden: false,
        responseWindowVisible: true,
        staleGuardRef: 'guard-camel',
      }),
    }));
    expect(JSON.stringify(event)).not.toContain('conv-snake');
    expect(JSON.stringify(event)).not.toContain('turn-snake');
    expect(JSON.stringify(event)).not.toContain('guard-snake');
  });

  test('renderer interaction diagnostics ignore removed conversation_ref alias', () => {
    const appendDiagnosticEvent = jest.fn(event => event);

    const event = appendRendererInteractionDiagnostic({
      action: 'button_clicked',
      event: 'click',
      conversation_ref: 'conv-snake',
      conversationRef: 'conv-camel',
    }, {
      appendDiagnosticEvent,
    });

    expect(event).toEqual(expect.objectContaining({
      conversationRef: 'conv-camel',
    }));
    expect(JSON.stringify(event)).not.toContain('conv-snake');
  });
});
