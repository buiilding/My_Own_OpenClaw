import {
  DesktopCurrentTurnMessageRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildNoViewSdkLiveTurnMessages,
  buildConversationViewLiveTurnMessages,
  buildCurrentTurnMessagesFromPresentation,
  buildSdkLiveTurnMessages,
} = DesktopCurrentTurnMessageRuntime;

describe('DesktopCurrentTurnMessageRuntime', () => {
  function conversationViewWithLiveEntries(entries) {
    return {
      conversationRef: 'conv-view',
      displayRows: [],
      liveTurn: {
        turnRef: 'turn-view',
        entries,
      },
      surfaces: {},
      actions: {},
    };
  }

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

  test('drops no-view live entries with malformed SDK row ids', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [
          {
            id: ' entry-padded ',
            type: 'llm-text',
            text: 'padded id',
          },
          {
            id: '',
            type: 'llm-text',
            text: 'empty id',
          },
          {
            id: { value: 'entry-object' },
            type: 'llm-text',
            text: 'object id',
          },
          {
            id: 'entry-exact',
            type: 'llm-text',
            text: 'exact id',
          },
        ],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'entry-exact',
      text: 'exact id',
      sourceChannel: 'sdk:current-turn',
    });
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

  test('drops ConversationView live entries with malformed SDK row ids', () => {
    const messages = buildConversationViewLiveTurnMessages({
      conversationRef: 'conv-1',
      liveTurn: {
        turnRef: 'turn-view',
        entries: [
          {
            id: ' entry-padded ',
            type: 'llm-text',
            text: 'padded id',
          },
          {
            id: 'entry-exact',
            type: 'llm-text',
            text: 'exact id',
          },
        ],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'entry-exact',
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

  test('drops legacy no-presentation tool events with malformed SDK row ids', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
      phase: 'tool_call',
      toolEvents: [
        {
          id: ' tool-padded ',
          kind: 'tool_call',
          toolName: 'read_file',
        },
        {
          id: '',
          kind: 'tool_output',
          toolName: 'read_file',
          text: 'empty id output',
        },
        {
          id: { value: 'tool-object' },
          kind: 'tool_progress',
          text: 'object id progress',
        },
        {
          id: 'tool-exact',
          kind: 'tool_call',
          toolName: 'read_file',
        },
      ],
    });

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conv-1:turn-live:tool:tool-exact',
        type: 'tool-call',
      }),
    ]));
    expect(messages.map((message) => message.id)).not.toContain('conv-1:turn-live:tool: tool-padded ');
    expect(messages.map((message) => message.text)).not.toContain('empty id output');
    expect(messages.map((message) => message.text)).not.toContain('object id progress');
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

  test('keeps legacy no-presentation tool-event detail payloads out of live rows', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_output',
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'read_file',
        text: 'Using read_file',
        toolCallDetails: {
          toolName: 'read_file',
          requestId: 'req-1',
        },
      }, {
        id: 'tool-output-1',
        kind: 'tool_output',
        toolName: 'read_file',
        text: 'done',
        toolMetadata: {
          requestId: 'req-1',
        },
        toolOutputDetails: {
          toolName: 'read_file',
          requestId: 'req-1',
        },
      }, {
        id: 'tool-progress-1',
        kind: 'tool_progress',
        text: 'Reading',
        toolMetadata: {
          requestId: 'req-1',
        },
      }],
    });

    expect(messages.find(message => message.id.endsWith(':tool:tool-call-1')))
      .not.toHaveProperty('toolCallDetails');
    const toolOutputMessage = messages.find(message => message.id.endsWith(':tool:tool-output-1'));
    expect(toolOutputMessage).not.toHaveProperty('toolMetadata');
    expect(toolOutputMessage).not.toHaveProperty('toolOutputDetails');
    expect(messages.find(message => message.id.endsWith(':tool:tool-progress-1')))
      .not.toHaveProperty('toolMetadata');
  });

  test('buildSdkLiveTurnMessages falls back to no-view live turn for partial ConversationView input', () => {
    const messages = buildSdkLiveTurnMessages({
      conversationView: {
        conversationRef: 'conv-partial',
        displayRows: [],
        liveTurn: {
          entries: [],
        },
        surfaces: {},
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'entry-raw',
            type: 'llm-text',
            text: 'raw current turn still owns no-view path',
          }],
        },
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'entry-raw',
        sourceChannel: 'sdk:current-turn',
        text: 'raw current turn still owns no-view path',
      }),
    ]);
  });

  test('buildSdkLiveTurnMessages suppresses no-view fallback for a complete empty ConversationView', () => {
    const messages = buildSdkLiveTurnMessages({
      conversationView: conversationViewWithLiveEntries([]),
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'entry-raw',
            type: 'llm-text',
            text: 'stale raw current turn',
          }],
        },
      },
    });

    expect(messages).toEqual([]);
  });
});
