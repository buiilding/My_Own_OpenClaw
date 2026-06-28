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
    expect(messages[0]).not.toHaveProperty('turnRef');
  });

  test('omits live-entry base metadata when SDK does not provide exact strings', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: ' turn-live ',
      presentation: {
        entries: [{
          id: 'entry-live',
          type: 'llm-text',
          text: 'streaming',
          sourceEventType: ' assistant_delta ',
          modelId: ' gpt-padded ',
          modelProvider: ' openai ',
        }],
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toHaveProperty('turnRef');
    expect(messages[0]).not.toHaveProperty('sourceEventType');
    expect(messages[0]).not.toHaveProperty('modelId');
    expect(messages[0]).not.toHaveProperty('modelProvider');
  });

  test('omits synthesized source labels for live thinking and tool-output entries', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [{
          id: 'entry-thinking-missing-source',
          type: 'thinking',
          text: 'thinking',
        }, {
          id: 'entry-tool-output-padded-source',
          type: 'tool-output',
          text: 'done',
          sourceEventType: ' tool_output ',
        }, {
          id: 'entry-tool-output-exact-source',
          type: 'tool-output',
          text: 'exact done',
          sourceEventType: 'tool_output',
        }],
      },
    });

    expect(messages.find(message => message.id === 'entry-thinking-missing-source')).toEqual(
      expect.objectContaining({
        type: 'llm-text',
        thinkingText: 'thinking',
      }),
    );
    expect(messages.find(message => message.id === 'entry-thinking-missing-source'))
      .not.toHaveProperty('thinkingSourceEventType');
    expect(messages.find(message => message.id === 'entry-thinking-missing-source'))
      .not.toHaveProperty('sourceEventType');
    expect(messages.find(message => message.id === 'entry-tool-output-padded-source'))
      .not.toHaveProperty('sourceEventType');
    expect(messages.find(message => message.id === 'entry-tool-output-exact-source')).toEqual(
      expect.objectContaining({
        sourceEventType: 'tool_output',
      }),
    );
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

  test('drops live entries with malformed SDK presentation types', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [
          {
            id: 'entry-missing-type',
            text: 'legacy missing type still renders',
          },
          {
            id: 'entry-padded-type',
            type: ' tool-output ',
            text: 'renderer must not repair this',
          },
          {
            id: 'entry-unknown-type',
            type: 'search-source',
            text: 'renderer must not map old labels here',
          },
          {
            id: 'entry-legacy-tool-explanation',
            type: 'tool-explanation',
            text: 'renderer must not map legacy UI labels here',
          },
          {
            id: 'entry-exact-type',
            type: 'tool-output',
            text: 'exact tool output',
          },
        ],
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'entry-missing-type',
        type: 'llm-text',
        text: 'legacy missing type still renders',
      }),
      expect.objectContaining({
        id: 'entry-exact-type',
        type: 'tool-output',
        text: 'exact tool output',
      }),
    ]);
    expect(messages.map(message => message.id)).not.toContain('entry-padded-type');
    expect(messages.map(message => message.id)).not.toContain('entry-unknown-type');
    expect(messages.map(message => message.id)).not.toContain('entry-legacy-tool-explanation');
  });

  test('does not expose padded live-entry model metadata as renderer props', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [{
          id: 'entry-assistant',
          type: 'llm-text',
          text: 'streaming',
          modelId: ' gpt-padded ',
          modelProvider: ' openai ',
        }, {
          id: 'entry-tool-output',
          type: 'tool-output',
          text: 'done',
          modelId: ' gpt-padded ',
          modelProvider: ' openai ',
        }, {
          id: 'entry-assistant-exact',
          type: 'llm-text',
          text: 'exact model',
          modelId: 'gpt-exact',
          modelProvider: 'openai',
        }],
      },
    });

    expect(messages.find(message => message.id === 'entry-assistant')).not.toHaveProperty('modelId');
    expect(messages.find(message => message.id === 'entry-assistant')).not.toHaveProperty('modelProvider');
    const toolOutputMessage = messages.find(message => message.id === 'entry-tool-output');
    expect(toolOutputMessage).not.toHaveProperty('modelId');
    expect(toolOutputMessage).not.toHaveProperty('modelProvider');
    expect(messages.find(message => message.id === 'entry-assistant-exact')).toEqual(expect.objectContaining({
      modelId: 'gpt-exact',
      modelProvider: 'openai',
    }));
  });

  test('ignores live presentation tool metadata while preserving explicit details', () => {
    const messages = buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [{
          id: 'entry-tool-output',
          type: 'tool-output',
          text: 'done',
          toolOutputDetails: {
            requestId: 'req-output',
            toolName: 'read_file',
            success: true,
            rawPayload: { hidden: true },
          },
          toolMetadata: {
            requestId: 'req-1',
            toolName: 'read_file',
            success: true,
            payload: { raw: true },
            screenshotRef: 'artifact-raw',
          },
        }, {
          id: 'entry-tool-progress',
          type: 'tool-progress',
          text: 'Reading',
          toolMetadata: {
            requestId: ' req-padded ',
            displayCorrelationId: 'progress-1',
            raw: { hidden: true },
          },
        }],
      },
    });

    expect(messages.find(message => message.id === 'entry-tool-output')).toEqual(
      expect.objectContaining({
        toolOutputDetails: {
          requestId: 'req-output',
          toolName: 'read_file',
          success: true,
        },
      }),
    );
    expect(messages.find(message => message.id === 'entry-tool-output')).not.toHaveProperty('toolMetadata');
    expect(messages.find(message => message.id === 'entry-tool-output')?.toolOutputDetails)
      .not.toHaveProperty('rawPayload');
    expect(buildCurrentTurnMessagesFromPresentation({
      turnRef: 'turn-live',
      presentation: {
        entries: [{
          id: 'entry-tool-output-without-details',
          type: 'tool-output',
          text: 'done without details',
        }, {
          id: 'entry-tool-output-padded-details',
          type: 'tool-output',
          text: 'done padded details',
          toolOutputDetails: {
            requestId: ' req-output ',
            toolName: '',
          },
        }],
      },
    })).toEqual([
      expect.not.objectContaining({ toolOutputDetails: expect.anything() }),
      expect.not.objectContaining({ toolOutputDetails: expect.anything() }),
    ]);
    expect(messages.find(message => message.id === 'entry-tool-progress')).toEqual(
      expect.objectContaining({
        id: 'entry-tool-progress',
        type: 'tool-progress',
      }),
    );
    expect(messages.find(message => message.id === 'entry-tool-progress')).not.toHaveProperty('toolMetadata');
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
    expect(messages[0]).not.toHaveProperty('modelFacingToolOutput');
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

  test('ignores legacy no-presentation raw tool events in renderer live rows', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
      phase: 'tool_output',
      assistantText: '',
      reasoningText: null,
      lastError: null,
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
        toolName: 'screenshot',
        text: 'captured screen',
        toolOutputDetails: {
          toolName: 'screenshot',
          requestId: 'req-1',
        },
        attachments: [{
          id: 'tool-output-1:attachment:000',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          screenshotRef: 'artifact-legacy-live',
        }],
      }, {
        id: 'tool-progress-1',
        kind: 'tool_progress',
        text: 'Reading',
      }],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-live:user-marker',
        sourceChannel: 'sdk:current-turn',
      }),
    ]);
    expect(messages.map((message) => message.type)).not.toEqual(expect.arrayContaining([
      'tool-call',
      'tool-output',
      'tool-progress',
    ]));
    expect(JSON.stringify(messages)).not.toContain('artifact-legacy-live');
    expect(JSON.stringify(messages)).not.toContain('captured screen');
  });

  test('does not repair padded legacy no-presentation lastError into a live row', () => {
    expect(buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      lastError: ' padded error ',
      toolEvents: [],
    })).toEqual([]);

    expect(buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      lastError: 'exact error',
      toolEvents: [],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conv-1:turn-1:error',
        text: 'exact error',
        type: 'error',
      }),
    ]));
  });

  test('omits legacy no-presentation assistant thinking metadata when reasoning is absent', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'streamed answer',
      reasoningText: null,
      lastError: null,
      toolEvents: [],
    });

    const assistantMessage = messages.find(message => message.type === 'llm-text' && message.text === 'streamed answer');
    expect(assistantMessage).toEqual(expect.objectContaining({
      id: 'conv-1:turn-1:assistant',
      sourceEventType: 'assistant_delta',
    }));
    expect(assistantMessage).not.toHaveProperty('thinkingText');
  });

  test('requires exact no-view live-turn refs before projecting SDK presentation rows', () => {
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      presentation: {
        entries: [{
          id: 'entry-raw',
          type: 'llm-text',
          text: 'raw current turn',
        }],
      },
    };

    expect(buildNoViewSdkLiveTurnMessages({
      ...sdkLiveTurn,
      conversationRef: undefined,
    })).toEqual([]);
    expect(buildNoViewSdkLiveTurnMessages({
      ...sdkLiveTurn,
      conversationRef: ' conv-1 ',
    })).toEqual([]);
    expect(buildNoViewSdkLiveTurnMessages({
      ...sdkLiveTurn,
      turnRef: undefined,
    })).toEqual([]);
    expect(buildNoViewSdkLiveTurnMessages({
      ...sdkLiveTurn,
      turnRef: ' turn-1 ',
    })).toEqual([]);
    expect(buildNoViewSdkLiveTurnMessages(sdkLiveTurn)).toEqual([
      expect.objectContaining({
        id: 'entry-raw',
        sourceChannel: 'sdk:current-turn',
      }),
    ]);
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
