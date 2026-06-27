/**
 * Covers renderer app-runtime SDK display projection merge rules.
 */

import {
  DesktopConversationDisplayProjection,
} from '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection';
import {
  DesktopConversationDisplayRowLookupRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopConversationDisplayRowLookupRuntime';
import type { ChatMessage } from '../../frontend/src/renderer/app/runtime/desktopChatMessageTypes';

const {
  buildConversationViewChatMessages,
  buildConversationViewTraceSummary,
  buildConversationViewTurnChatMessages,
  buildPendingBridgeChatMessages,
} = DesktopConversationDisplayProjection;
const {
  findConversationViewUserDisplayRowForTurn,
  hasConversationViewUserDisplayRows,
} = DesktopConversationDisplayRowLookupRuntime;

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? 'message-id',
    sender: overrides.sender ?? 'assistant',
    text: overrides.text ?? '',
    ...overrides,
  };
}

function conversationViewWithRows(displayRows: unknown[]) {
  return {
    conversationRef: 'conv-1',
    revisionId: 'rev-1',
    displayRows,
    liveTurn: {},
    surfaces: {},
    actions: {},
  };
}

describe('desktopConversationDisplayProjection', () => {
  test('owns no-view pending bridge user row projection', () => {
    expect(buildPendingBridgeChatMessages({
      messages: [message({
        id: 'existing-assistant',
        sender: 'assistant',
        text: 'old response',
      })],
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt',
        timestamp: '2026-06-26T00:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'existing-assistant',
      }),
      expect.objectContaining({
        id: 'pending-user',
        sender: 'user',
        text: 'pending prompt',
        turnRef: 'turn-pending',
      }),
    ]);

    expect(buildPendingBridgeChatMessages({
      messages: [message({
        id: 'existing-user',
        sender: 'user',
        text: 'existing prompt',
        turnRef: 'turn-pending',
      })],
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'existing-user',
        turnRef: 'turn-pending',
      }),
    ]);
  });

  test('projects SDK display rows only through ConversationView messages', () => {
    expect(buildConversationViewChatMessages({
      conversationView: {
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        displayRows: [{
          id: 'row-user',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'inspect recent commits',
        }],
        liveTurn: {},
        surfaces: {},
        actions: {},
      },
    })).toEqual([
      expect.objectContaining({
        id: 'row-user',
        sender: 'user',
        text: 'inspect recent commits',
      }),
    ]);
  });

  test('projects only SDK display rows for the requested ConversationView turn', () => {
    expect(buildConversationViewTurnChatMessages({
      conversationView: conversationViewWithRows([
        {
          id: 'row-user-turn-1',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'first turn',
        },
        {
          id: 'row-assistant-turn-2',
          conversationRef: 'conv-1',
          turnRef: 'turn-2',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'second turn',
        },
      ]),
      turnRef: 'turn-2',
    })).toEqual([
      expect.objectContaining({
        id: 'row-assistant-turn-2',
        sender: 'assistant',
        text: 'second turn',
      }),
    ]);
    expect(buildConversationViewTurnChatMessages({
      conversationView: conversationViewWithRows([]),
      turnRef: 'turn-2',
    })).toEqual([]);
  });

  test('refuses partial ConversationView objects as direct projection input', () => {
    const partialView = {
      conversationRef: 'conv-1',
      displayRows: [{
        id: 'row-user',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'partial display row',
      }],
    };

    expect(buildConversationViewChatMessages({
      conversationView: partialView as never,
    })).toEqual([]);
    expect(buildConversationViewTurnChatMessages({
      conversationView: partialView as never,
      turnRef: 'turn-1',
    })).toEqual([]);
    expect(buildConversationViewTraceSummary(partialView as never)).toEqual({
      displayRowCount: 0,
      liveTurnPhase: null,
      liveTurnRef: null,
      lastMessage: null,
    });
  });

  test('does not repair padded turn refs when projecting a ConversationView turn', () => {
    expect(buildConversationViewTurnChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'row-user-turn-1',
        conversationRef: 'conv-1',
        turnRef: ' turn-1 ',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'first turn',
      }]),
      turnRef: 'turn-1',
    })).toEqual([]);
    expect(buildConversationViewTurnChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'row-user-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'first turn',
      }]),
      turnRef: ' turn-1 ',
    })).toEqual([]);
  });

  test('finds the last same-turn SDK user display row with a stable row id', () => {
    const conversationView = conversationViewWithRows([
      {
        id: 'first-user-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'first prompt',
      },
      {
        id: 'assistant-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'answer',
      },
      {
        id: '',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 2,
        role: 'user',
        type: 'user_message',
        content: 'invalid duplicate prompt',
      },
      {
        id: 'padded-user-turn-1',
        conversationRef: 'conv-1',
        turnRef: ' turn-1 ',
        index: 3,
        role: 'user',
        type: 'user_message',
        content: 'padded prompt',
      },
    ]);

    expect(findConversationViewUserDisplayRowForTurn(conversationView, 'turn-1')).toEqual(
      expect.objectContaining({
        id: 'first-user-turn-1',
        content: 'first prompt',
      }),
    );
  });

  test('rejects padded turn refs in ConversationView user row lookup', () => {
    expect(findConversationViewUserDisplayRowForTurn(conversationViewWithRows([{
      id: 'padded-user-turn-1',
      conversationRef: 'conv-1',
      turnRef: ' turn-1 ',
      index: 0,
      role: 'user',
      type: 'user_message',
      content: 'padded prompt',
    }]), 'turn-1')).toBeNull();
    expect(findConversationViewUserDisplayRowForTurn(conversationViewWithRows([{
      id: 'user-turn-1',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      index: 0,
      role: 'user',
      type: 'user_message',
      content: 'prompt',
    }]), ' turn-1 ')).toBeNull();
  });

  test('does not find assistant, missing-id, or wrong-turn display rows as SDK user rows', () => {
    expect(findConversationViewUserDisplayRowForTurn(conversationViewWithRows([
      {
        id: 'assistant-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'answer',
      },
      {
        id: '',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 1,
        role: 'user',
        type: 'user_message',
        content: 'missing id',
      },
      {
        id: 'mismatched-type-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 2,
        role: 'user',
        type: 'assistant_message',
        content: 'mismatched row type',
      },
      {
        id: 'mismatched-role-turn-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 3,
        role: 'assistant',
        type: 'user_message',
        content: 'mismatched row role',
      },
      {
        id: 'wrong-turn-user',
        conversationRef: 'conv-1',
        turnRef: 'turn-2',
        index: 4,
        role: 'user',
        type: 'user_message',
        content: 'wrong turn',
      },
    ]), 'turn-1')).toBeNull();
    expect(findConversationViewUserDisplayRowForTurn(conversationViewWithRows([]), 'turn-1')).toBeNull();
    expect(findConversationViewUserDisplayRowForTurn(null, 'turn-1')).toBeNull();
  });

  test('detects whether a ConversationView contains SDK user display rows', () => {
    expect(hasConversationViewUserDisplayRows(conversationViewWithRows([
      {
        id: 'assistant-row',
        role: 'assistant',
        type: 'assistant_message',
      },
      {
        id: 'typed-user-row',
        role: 'user',
        type: 'user_message',
      },
    ]))).toBe(true);
    expect(hasConversationViewUserDisplayRows(conversationViewWithRows([
      {
        id: 'assistant-row',
        role: 'assistant',
        type: 'assistant_message',
      },
      {
        id: 'mismatched-type-row',
        role: 'user',
        type: 'assistant_message',
      },
      {
        id: 'mismatched-role-row',
        role: 'assistant',
        type: 'user_message',
      },
      {
        id: '',
        role: 'user',
        type: 'user_message',
      },
      {
        role: 'user',
        type: 'user_message',
      },
    ]))).toBe(false);
    expect(hasConversationViewUserDisplayRows({} as never)).toBe(false);
  });

  test('builds ConversationView trace summaries without raw workspace message fallback', () => {
    expect(buildConversationViewTraceSummary({
      ...conversationViewWithRows([
        {
          id: 'view-user',
          conversationRef: 'conv-1',
          turnRef: 'turn-view',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'prompt',
        },
        {
          id: 'view-assistant',
          conversationRef: 'conv-1',
          turnRef: ' turn-view ',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'visible answer',
          sourceEventType: 'assistant-message-full',
        },
      ]),
      liveTurn: {
        turnRef: ' turn-view ',
        phase: 'complete',
      },
    } as never)).toEqual({
      displayRowCount: 2,
      liveTurnPhase: 'complete',
      liveTurnRef: null,
      lastMessage: {
        sender: 'assistant',
        sourceEventType: 'assistant-message-full',
        textLength: 'visible answer'.length,
        turnRef: null,
        type: 'assistant_message',
      },
    });

    expect(buildConversationViewTraceSummary(conversationViewWithRows([]))).toEqual({
      displayRowCount: 0,
      liveTurnPhase: null,
      liveTurnRef: null,
      lastMessage: null,
    });
  });

  test('keeps malformed SDK trace labels out of ConversationView diagnostics', () => {
    expect(buildConversationViewTraceSummary({
      ...conversationViewWithRows([
        {
          id: 'view-assistant',
          conversationRef: 'conv-1',
          turnRef: ' turn-view ',
          index: 0,
          role: ' assistant ',
          sender: ' sdk-assistant ',
          type: ' assistant_message ',
          content: 'visible answer',
          sourceEventType: ' assistant-message-full ',
        },
      ]),
      liveTurn: {
        turnRef: ' turn-view ',
        phase: ' complete ',
      },
    } as never)).toEqual({
      displayRowCount: 1,
      liveTurnPhase: null,
      liveTurnRef: null,
      lastMessage: {
        sender: null,
        sourceEventType: null,
        textLength: 'visible answer'.length,
        turnRef: null,
        type: null,
      },
    });
  });

  test('merges renderer-only feedback back into matching SDK messages', () => {
    const rendererAnnotations = [{
      id: 'assistant-1',
      feedback: 'like' as const,
    }];

    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'assistant-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Visible answer',
      }]),
      rendererAnnotations,
    })).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'Visible answer',
        feedback: 'like',
      }),
    ]);
    const projected = buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'assistant-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Visible answer',
      }]),
      rendererAnnotations,
    })[0];
    expect(projected).not.toHaveProperty('systemPrompt');
    expect(projected).not.toHaveProperty('toolSchemas');
    expect(projected).not.toHaveProperty('fullAssistantMessage');
    expect(projected).not.toHaveProperty('tokenCounts');
  });

  test('does not merge renderer feedback annotations into SDK user rows', () => {
    const projected = buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'user-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'user prompt',
      }]),
      rendererAnnotations: [{
        id: 'user-1',
        feedback: 'like',
      }],
    })[0];

    expect(projected).toEqual(expect.objectContaining({
      id: 'user-1',
      sender: 'user',
      text: 'user prompt',
    }));
    expect(projected).not.toHaveProperty('feedback');
  });

  test('preserves explicit feedback clears for ConversationView merges', () => {
    const annotations = [{
      id: 'assistant-1',
      feedback: null,
    }];

    expect(annotations).toEqual([{
      id: 'assistant-1',
      feedback: null,
    }]);
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'assistant-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Visible answer',
        feedback: 'like',
      }]),
      rendererAnnotations: annotations,
    })[0]).toEqual(expect.objectContaining({
      id: 'assistant-1',
      feedback: null,
    }));
  });

  test('ignores renderer optimistic user rows once SDK display rows own the projection', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: '',
      }]),
      rendererAnnotations: [{
        id: 'turn-1-sdk-evt-000002-user_message',
        feedback: 'like',
      }],
    })).toEqual([
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('keeps only the explicit pending bridge until SDK projects the pending turn', () => {
    const pendingUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkToolCall = message({
      id: 'tool-row',
      sender: 'assistant',
      type: 'tool-call',
      text: '',
      turnRef: 'turn-1',
      sourceEventType: 'tool_call',
    });

    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: '',
      }]),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'turn-1-sdk-evt-000002-user_message',
        text: 'inspect recent commits',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining(pendingUser),
      expect.objectContaining({
        id: sdkToolCall.id,
        sender: sdkToolCall.sender,
        turnRef: sdkToolCall.turnRef,
      }),
    ]);
  });

  test('keeps the pending bridge independent from renderer annotation merging', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: '',
      }]),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'turn-1-sdk-evt-000002-user_message',
        text: 'inspect recent commits',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'inspect recent commits',
        turnRef: 'turn-1',
      }),
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('does not append cross-conversation pending bridge rows to ConversationView messages', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'view-assistant',
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'view answer',
      }]),
      pendingTurn: {
        conversationRef: 'conv-other',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt from another conversation',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'view-assistant',
        text: 'view answer',
      }),
    ]);
  });

  test('does not repair padded pending conversation refs beside ConversationView messages', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'view-assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-view',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'view answer',
      }]),
      pendingTurn: {
        conversationRef: ' conv-1 ',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt with repaired ref',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'view-assistant',
        text: 'view answer',
      }),
    ]);
  });

  test('does not synthesize a pending bridge from partial pending state', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: '',
      }]),
      pendingTurn: {
        turnRef: 'turn-1',
        userMessageId: 'pending-user',
        text: 'partial pending prompt',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('uses SDK user rows when SDK echoes the pending user turn', () => {
    const sdkUserSameTurn = message({
      id: 'sdk-user-edit',
      sender: 'user',
      text: 'edited prompt',
      turnRef: 'turn-edit',
      sourceEventType: 'user_message',
      sourceChannel: 'sdk:display-rows',
      isComplete: true,
    });

    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'sdk-user-edit',
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'edited prompt',
      }]),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([expect.objectContaining(sdkUserSameTurn)]);
  });

  test('keeps pending bridge when SDK user row has repaired turn identity', () => {
    expect(buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'sdk-user-edit',
        conversationRef: 'conv-1',
        turnRef: ' turn-edit ',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'edited prompt',
      }]),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'sdk-user-edit',
        sender: 'user',
        turnRef: null,
      }),
      expect.objectContaining({
        id: 'renderer-user-edit',
        sender: 'user',
        turnRef: 'turn-edit',
      }),
    ]);
  });

  test('builds conversation-view messages without replacing SDK user rows with pending bridge rows', () => {
    const conversationView = {
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      displayRows: [{
        id: 'sdk-user-edit',
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'edited prompt',
      }],
      liveTurn: {},
      surfaces: {},
      actions: {},
    };

    expect(buildConversationViewChatMessages({
      conversationView,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'sdk-user-edit',
        sender: 'user',
        sourceChannel: 'sdk:display-rows',
      }),
    ]);
    expect(buildConversationViewChatMessages({
      conversationView,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    })[0]).not.toHaveProperty('attachments');
    expect(buildConversationViewChatMessages({
      conversationView,
    })).toEqual([
      expect.objectContaining({
        id: 'sdk-user-edit',
        sender: 'user',
        sourceChannel: 'sdk:display-rows',
      }),
    ]);
  });

  test('builds conversation-view messages from annotation records without raw message fallback', () => {
    const conversationView = {
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      displayRows: [{
        id: 'assistant-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-view',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'SDK answer',
      }],
      liveTurn: {},
      surfaces: {},
      actions: {},
    };

    expect(buildConversationViewChatMessages({
      conversationView,
      rendererAnnotations: [{
        id: 'assistant-1',
        feedback: 'like',
      }],
    })).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'SDK answer',
        turnRef: 'turn-view',
        feedback: 'like',
      }),
    ]);
  });

  test('does not copy non-feedback annotation fields into SDK rows', () => {
    const projected = buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'assistant-1',
        conversationRef: 'conv-1',
        turnRef: 'turn-view',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'SDK answer',
      }]),
      rendererAnnotations: [{
        id: 'assistant-1',
        feedback: 'like',
        text: 'stale renderer text',
        tokenCounts: { total_tokens: 42 },
      } as never],
    })[0];

    expect(projected).toEqual(expect.objectContaining({
      id: 'assistant-1',
      text: 'SDK answer',
      feedback: 'like',
    }));
    expect(projected).not.toHaveProperty('tokenCounts');
  });

  test('does not copy renderer screenshot metadata into text-only SDK user projections', () => {
    const sdkTextOnlyUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'Please review the attached files.',
      turnRef: 'turn-1',
      sourceEventType: 'user_message',
      sourceChannel: 'sdk:conversation-event',
      isComplete: true,
    });

    const projectedMessages = buildConversationViewChatMessages({
      conversationView: conversationViewWithRows([{
        id: 'turn-1-sdk-evt-000002-user_message',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'Please review the attached files.',
      }]),
      rendererAnnotations: [],
    });

    expect(projectedMessages).toEqual([expect.objectContaining({
      id: sdkTextOnlyUser.id,
      sender: sdkTextOnlyUser.sender,
      sourceChannel: 'sdk:display-rows',
      text: sdkTextOnlyUser.text,
      turnRef: sdkTextOnlyUser.turnRef,
    })]);
    expect(projectedMessages[0]).not.toHaveProperty('attachments');
    expect(projectedMessages[0]).not.toHaveProperty('attachmentFilenames');
  });
});
