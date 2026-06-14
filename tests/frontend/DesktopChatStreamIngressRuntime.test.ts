/**
 * Covers desktop chat stream ingress runtime. behavior in the frontend test suite.
 */

import { handleConversationEventIngress } from '../../frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime';

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => 'conv-active'),
    updateTranscriptSession: jest.fn(),
  },
}));

function createDeps(overrides = {}) {
  return {
    getActiveConversationRef: jest.fn(() => 'conv-active'),
    setActiveConversationRef: jest.fn(),
    registerTurnConversationRef: jest.fn(),
    enableTranscript: false,
    dispatchConversationEvent: jest.fn(() => true),
    ...overrides,
  };
}

describe('desktopChatStreamIngressRuntime', () => {
  test('promotes explicit user-message conversation refs through session projection', () => {
    const deps = createDeps({
      getActiveConversationRef: jest.fn(() => 'conv-current'),
    });

    handleConversationEventIngress({
      type: 'user_message',
      conversationRef: 'conv-next',
      turnRef: 'turn-1',
      payload: {},
    } as any, deps);

    expect(deps.setActiveConversationRef).toHaveBeenCalledWith('conv-next');
    expect(deps.registerTurnConversationRef).toHaveBeenCalledWith('turn-1', 'conv-next');
    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-next' }),
      'conv-next',
    );
  });

  test('does not let late non-user events steal the active conversation', () => {
    const deps = createDeps({
      getActiveConversationRef: jest.fn(() => 'conv-current'),
    });

    handleConversationEventIngress({
      type: 'assistant_message',
      conversationRef: 'conv-late',
      turnRef: 'turn-late',
      payload: {},
    } as any, deps);

    expect(deps.setActiveConversationRef).not.toHaveBeenCalled();
    expect(deps.registerTurnConversationRef).toHaveBeenCalledWith('turn-late', 'conv-late');
    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-late' }),
      'conv-late',
    );
  });

  test('reports rejected or unhandled ingress events as not accepted', () => {
    const rejectedDeps = createDeps({
      dispatchConversationEvent: jest.fn(() => false),
    });
    const missingConversationDeps = createDeps();

    expect(handleConversationEventIngress({
      type: 'assistant_message',
      conversationRef: 'conv-rejected',
      payload: {},
    } as any, rejectedDeps)).toBe(false);
    expect(handleConversationEventIngress({
      type: 'assistant_message',
      payload: {},
    } as any, missingConversationDeps)).toBe(false);

    expect(rejectedDeps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-rejected' }),
      'conv-rejected',
    );
    expect(missingConversationDeps.dispatchConversationEvent).not.toHaveBeenCalled();
  });
});
