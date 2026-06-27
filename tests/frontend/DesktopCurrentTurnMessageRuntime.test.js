import {
  DesktopCurrentTurnMessageRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildNoViewSdkLiveTurnMessages,
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

  test('does not synthesize legacy tool details from fallback tool names', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
      phase: 'tool_call',
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'read_file',
      }],
    });

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conv-1:turn-live:tool:tool-call-1',
        type: 'tool-call',
        text: 'Using read_file',
      }),
    ]));
    const toolMessage = messages.find((message) => message.id.endsWith(':tool:tool-call-1'));
    expect(toolMessage).not.toHaveProperty('toolCallDetails');
  });

  test('keeps legacy no-presentation tool-event attachments out of live rows', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_output',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-output-1',
        kind: 'tool_output',
        toolName: 'screenshot',
        status: 'success',
        text: 'captured screen',
        attachments: [{
          id: 'tool-output-1:attachment:000',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          screenshotRef: 'artifact-legacy-live',
        }],
      }],
    });

    const toolMessage = messages.find(message => message.type === 'tool-output');
    expect(toolMessage).toEqual(expect.objectContaining({
      text: 'captured screen',
      sourceChannel: 'sdk:current-turn',
    }));
    expect(toolMessage).not.toHaveProperty('attachments');
  });
});
