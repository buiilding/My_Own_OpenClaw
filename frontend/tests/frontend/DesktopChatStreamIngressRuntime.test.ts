/**
 * Covers desktop chat stream ingress runtime. behavior in the frontend test suite.
 */

import { DesktopChatStreamIngressRuntime } from '../../src/renderer/app/runtime/desktopChatStreamIngressRuntime';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

const {
  handleConversationEventIngress,
} = DesktopChatStreamIngressRuntime;

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
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
  beforeEach(() => {
    jest.clearAllMocks();
    (DesktopTranscriptSessionRuntimeClient.getActiveConversationRef as jest.Mock).mockReturnValue('conv-active');
    (DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock).mockReturnValue(undefined);
  });

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

  test('normalizes ingress identity and transcript user binding through runtime helpers', () => {
    const deps = createDeps({
      enableTranscript: true,
      getActiveConversationRef: jest.fn(() => 'conv-current'),
    });
    (DesktopTranscriptSessionRuntimeClient.getActiveConversationRef as jest.Mock).mockReturnValue('conv-active');

    handleConversationEventIngress({
      type: 'user_message',
      conversationRef: ' conv-next ',
      turnRef: ' turn-1 ',
      payload: { userId: ' user-1 ' },
    } as any, deps);

    expect(deps.setActiveConversationRef).toHaveBeenCalledWith('conv-next');
    expect(deps.registerTurnConversationRef).toHaveBeenCalledWith('turn-1', 'conv-next');
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith(
      'conv-next',
      'user-1',
    );
    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: ' conv-next ' }),
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

  test('dispatches conversation events when projection sync throws', () => {
    const deps = createDeps({
      getActiveConversationRef: jest.fn(() => 'conv-current'),
      setActiveConversationRef: jest.fn(() => {
        throw new Error('projection failed');
      }),
    });

    expect(handleConversationEventIngress({
      type: 'user_message',
      conversationRef: 'conv-next',
      turnRef: 'turn-1',
      payload: {},
    } as any, deps)).toBe(true);

    expect(deps.registerTurnConversationRef).toHaveBeenCalledWith('turn-1', 'conv-next');
    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-next' }),
      'conv-next',
    );
  });

  test('dispatches conversation events when turn-map registration throws', () => {
    const deps = createDeps({
      registerTurnConversationRef: jest.fn(() => {
        throw new Error('turn map failed');
      }),
    });

    expect(handleConversationEventIngress({
      type: 'assistant_message',
      conversationRef: 'conv-stream',
      turnRef: 'turn-1',
      payload: {},
    } as any, deps)).toBe(true);

    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-stream' }),
      'conv-stream',
    );
  });

  test('dispatches conversation events when transcript session sync throws', () => {
    (DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock).mockImplementation(() => {
      throw new Error('transcript sync failed');
    });
    const deps = createDeps({
      enableTranscript: true,
    });

    expect(handleConversationEventIngress({
      type: 'assistant_message',
      conversationRef: 'conv-stream',
      turnRef: 'turn-1',
      payload: { userId: 'user-1' },
    } as any, deps)).toBe(true);

    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith(
      'conv-active',
      'user-1',
    );
    expect(deps.dispatchConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationRef: 'conv-stream' }),
      'conv-stream',
    );
  });
});
