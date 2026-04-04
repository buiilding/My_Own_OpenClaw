import {
  resolveCurrentTurnPresentationState,
} from '../../frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState';
import { OVERLAY_TURN_LIFECYCLE } from '../../frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract';

describe('chatTurnPresentationState chatbox projection', () => {
  test('shows awaiting state while user message is still sending', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'idle',
      lifecycle: OVERLAY_TURN_LIFECYCLE.PREFLIGHT,
      messages: [{ id: 'user-1', sender: 'user', text: 'hello', type: 'user' }],
    });

    expect(state.chatboxSurfaceState).toBe('awaiting-reply');
    expect(state.showChatboxAwaitingReply).toBe(true);
    expect(state.showChatboxResponse).toBe(false);
  });

  test('shows response state after first visible chunk arrives', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'streaming',
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      messages: [
        { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
      ],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
    });

    expect(state.chatboxSurfaceState).toBe('response');
    expect(state.showChatboxResponse).toBe(true);
    expect(state.showChatboxAwaitingReply).toBe(false);
  });

  test('returns to awaiting state when tool output resumes the loop', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'tool-output',
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      messages: [
        { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
      ],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
    });

    expect(state.chatboxSurfaceState).toBe('awaiting-reply');
    expect(state.showChatboxAwaitingReply).toBe(true);
  });

  test('keeps compact state when no response is visible and loop is terminal', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'complete',
      lifecycle: OVERLAY_TURN_LIFECYCLE.TERMINAL,
      messages: [{ id: 'user-1', sender: 'user', text: 'task', type: 'user' }],
    });

    expect(state.chatboxSurfaceState).toBe('compact');
    expect(state.showChatboxAwaitingReply).toBe(false);
    expect(state.showChatboxResponse).toBe(false);
  });

  test('treats dismissed responses as hidden in presentation state', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'streaming',
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      messages: [{ id: 'user-1', sender: 'user', text: 'task', type: 'user' }],
      activeResponse: { id: 'assistant-1', type: 'llm-text', sender: 'assistant', text: 'done' },
      dismissedResponseId: 'assistant-1',
    });

    expect(state.visibleResponse).toBeNull();
    expect(state.showChatboxResponse).toBe(false);
  });

  test('keeps tool rows from suppressing awaiting state after the latest user turn', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'tool-output',
      lifecycle: OVERLAY_TURN_LIFECYCLE.ACTIVE,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
        { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
        { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
        { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
      ],
    });

    expect(state.hasVisibleReply).toBe(false);
    expect(state.showAssistantAwaitingDot).toBe(true);
    expect(state.showChatboxAwaitingReply).toBe(true);
    expect(state.showChatboxResponse).toBe(false);
  });
});
