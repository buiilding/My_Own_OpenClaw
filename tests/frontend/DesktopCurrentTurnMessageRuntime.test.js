import {
  DesktopCurrentTurnMessageRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildConversationViewLiveTurnMessages,
  buildCurrentTurnMessagesFromPresentation,
} = DesktopCurrentTurnMessageRuntime;

describe('DesktopCurrentTurnMessageRuntime', () => {
  test('uses containing current-turn identity instead of live entry turn refs', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [{
          id: 'entry-live',
          type: 'llm-text',
          text: 'streaming',
          turnRef: 'turn-stale-entry',
        }],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'entry-live',
      turnRef: 'turn-live',
      sourceChannel: 'sdk:current-turn',
    });
  });

  test('does not recover live row identity from entry turn refs when context is invalid', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: ' turn-live ',
      presentation: {
        entries: [{
          id: 'entry-live',
          type: 'llm-text',
          text: 'streaming',
          turnRef: 'turn-entry',
        }],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].turnRef).toBeUndefined();
  });

  test('uses containing ConversationView live-turn identity for tool outputs', () => {
    const messages = buildConversationViewLiveTurnMessages({
      conversationRef: 'conv-1',
      liveTurn: {
        turnRef: 'turn-view',
        entries: [{
          id: 'entry-tool-output',
          type: 'tool-output',
          text: 'done',
          turnRef: 'turn-stale-entry',
          toolName: 'inspect',
        }],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'entry-tool-output',
      turnRef: 'turn-view',
      sourceChannel: 'sdk:conversation-view',
    });
  });
});
