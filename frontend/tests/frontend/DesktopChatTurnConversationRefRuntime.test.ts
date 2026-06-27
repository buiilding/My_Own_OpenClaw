import {
  DesktopChatTurnConversationRefRuntime,
} from '../../src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';

const {
  getRendererTurnConversationRefsSnapshot,
  mergeTurnConversationRefs,
  normalizeTurnRef,
  recordRendererTurnConversationRefs,
  registerTurnConversationRef,
  registerRendererTurnConversationRef,
  resolveConversationRefForTurn,
  resolveRendererConversationRefForTurn,
  resetRendererTurnConversationRefs,
} = DesktopChatTurnConversationRefRuntime;

describe('DesktopChatTurnConversationRefRuntime', () => {
  beforeEach(() => {
    resetRendererTurnConversationRefs();
  });

  test('normalizes turn refs', () => {
    expect(normalizeTurnRef(undefined)).toBeNull();
    expect(normalizeTurnRef(null)).toBeNull();
    expect(normalizeTurnRef('   ')).toBeNull();
    expect(normalizeTurnRef(' turn-1 ')).toBe('turn-1');
  });

  test('registers normalized turn to conversation refs without rewriting identical maps', () => {
    const current = {};

    expect(registerTurnConversationRef(current, '', 'conv-a')).toBe(current);
    expect(registerTurnConversationRef(current, 'turn-1', '')).toBe(current);

    const next = registerTurnConversationRef(current, ' turn-1 ', ' conv-a ');

    expect(next).toEqual({ 'turn-1': 'conv-a' });
    expect(registerTurnConversationRef(next, 'turn-1', 'conv-a')).toBe(next);
  });

  test('merges message turn refs and resolves trimmed lookups', () => {
    const current = { 'turn-existing': 'conv-old' };
    const next = mergeTurnConversationRefs(
      current,
      [
        {
          id: 'message-1',
          sender: 'assistant',
          text: 'hello',
          turnRef: ' turn-1 ',
        },
        {
          id: 'message-2',
          sender: 'assistant',
          text: 'blank',
          turnRef: '   ',
        },
      ],
      ' conv-a ',
    );

    expect(next).toEqual({
      'turn-existing': 'conv-old',
      'turn-1': 'conv-a',
    });
    expect(resolveConversationRefForTurn(next, ' turn-1 ')).toBe('conv-a');
    expect(resolveConversationRefForTurn(next, '')).toBeNull();
  });

  test('does not rewrite maps when no messages add routable refs', () => {
    const current = { 'turn-existing': 'conv-a' };
    const next = mergeTurnConversationRefs(
      current,
      [
        {
          id: 'message-1',
          sender: 'assistant',
          text: 'hello',
          turnRef: ' turn-existing ',
        },
        {
          id: 'message-2',
          sender: 'assistant',
          text: 'blank',
        },
      ],
      'conv-a',
    );

    expect(next).toBe(current);
  });

  test('stores renderer turn routing outside chat store state', () => {
    registerRendererTurnConversationRef(' turn-explicit ', ' conv-a ');
    recordRendererTurnConversationRefs(
      [{
        id: 'message-1',
        sender: 'assistant',
        text: 'hello',
        turnRef: ' turn-from-message ',
      }],
      ' conv-b ',
    );

    expect(resolveRendererConversationRefForTurn('turn-explicit')).toBe('conv-a');
    expect(resolveRendererConversationRefForTurn('turn-from-message')).toBe('conv-b');
    expect(getRendererTurnConversationRefsSnapshot()).toEqual({
      'turn-explicit': 'conv-a',
      'turn-from-message': 'conv-b',
    });

    resetRendererTurnConversationRefs();

    expect(resolveRendererConversationRefForTurn('turn-explicit')).toBeNull();
    expect(getRendererTurnConversationRefsSnapshot()).toEqual({});
  });
});
