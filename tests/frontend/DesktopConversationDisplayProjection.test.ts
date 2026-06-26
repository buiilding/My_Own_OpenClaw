/**
 * Covers renderer app-runtime SDK display projection merge rules.
 */

import {
  DesktopConversationDisplayProjection,
} from '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection';
import type { ChatMessage } from '../../frontend/src/renderer/app/runtime/desktopChatMessageTypes';

const {
  buildConversationViewChatMessages,
  buildDisplayProjectionTraceSummary,
  selectRendererMessageAnnotations,
} = DesktopConversationDisplayProjection;

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
    liveTurn: null,
    surfaces: {},
    actions: {},
  };
}

describe('desktopConversationDisplayProjection', () => {
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
        liveTurn: null,
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

  test('merges renderer-only annotations back into matching SDK messages', () => {
    const currentAssistant = message({
      id: 'assistant-1',
      sender: 'assistant',
      text: 'Old answer',
      turnRef: 'turn-1',
      systemPrompt: {
        content: 'System prompt',
      },
      toolSchemas: [{
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {},
        },
      }],
      fullAssistantMessage: {
        content: 'Full assistant text',
      },
      feedback: 'like',
      tokenCounts: {
        usage_source: 'provider',
        total_tokens: 42,
      },
    });

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
      preserveRendererAnnotations: true,
      rendererAnnotations: selectRendererMessageAnnotations([currentAssistant]),
    })).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'Visible answer',
        systemPrompt: currentAssistant.systemPrompt,
        toolSchemas: currentAssistant.toolSchemas,
        fullAssistantMessage: currentAssistant.fullAssistantMessage,
        feedback: 'like',
        tokenCounts: currentAssistant.tokenCounts,
      }),
    ]);
  });

  test('selects only renderer annotations for ConversationView merges', () => {
    const annotations = selectRendererMessageAnnotations([
      message({
        id: 'assistant-1',
        sender: 'assistant',
        text: 'stale visible text',
        turnRef: 'turn-stale',
        sourceEventType: 'assistant_message',
        feedback: 'like',
        tokenCounts: {
          usage_source: 'provider',
          total_tokens: 42,
        },
      }),
      message({
        id: 'assistant-2',
        sender: 'assistant',
        text: 'no annotations',
        turnRef: 'turn-stale',
        sourceEventType: 'assistant_message',
      }),
    ]);

    expect(annotations).toEqual([{
      id: 'assistant-1',
      feedback: 'like',
      tokenCounts: {
        usage_source: 'provider',
        total_tokens: 42,
      },
    }]);
    expect(annotations[0]).not.toHaveProperty('text');
    expect(annotations[0]).not.toHaveProperty('turnRef');
    expect(annotations[0]).not.toHaveProperty('sourceEventType');
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
      preserveRendererAnnotations: true,
      rendererAnnotations: selectRendererMessageAnnotations([message({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'inspect recent commits',
        turnRef: 'turn-1',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        isComplete: true,
      })]),
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
        turnRef: 'turn-1',
        userMessageId: 'turn-1-sdk-evt-000002-user_message',
        text: 'inspect recent commits',
      },
      preserveRendererAnnotations: true,
    })).toEqual([
      expect.objectContaining(pendingUser),
      expect.objectContaining({
        id: sdkToolCall.id,
        sender: sdkToolCall.sender,
        turnRef: sdkToolCall.turnRef,
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
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
      },
      preserveRendererAnnotations: true,
    })).toEqual([expect.objectContaining(sdkUserSameTurn)]);
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
      liveTurn: null,
      surfaces: {},
      actions: {},
    };

    expect(buildConversationViewChatMessages({
      conversationView,
      pendingTurn: {
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
      },
      preserveRendererAnnotations: true,
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
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
      },
      preserveRendererAnnotations: true,
    })[0]).not.toHaveProperty('attachments');
    expect(buildConversationViewChatMessages({
      conversationView,
      preserveRendererAnnotations: false,
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
      liveTurn: null,
      surfaces: {},
      actions: {},
    };

    expect(buildConversationViewChatMessages({
      conversationView,
      rendererAnnotations: [{
        id: 'assistant-1',
        feedback: 'like',
      }],
      preserveRendererAnnotations: true,
    })).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'SDK answer',
        turnRef: 'turn-view',
        feedback: 'like',
      }),
    ]);
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
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'Please review the attached files.',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      attachmentFilenames: ['clipboard-image.png'],
      attachments: [{
        id: 'turn-1:attachment:000',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,inline-optimistic-base64',
      }],
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
      preserveRendererAnnotations: true,
      rendererAnnotations: selectRendererMessageAnnotations([optimisticUser]),
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
    expect(buildDisplayProjectionTraceSummary({
      rows: [{
        id: 'turn-1-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        metadata: {
          screenshot: null,
        },
      }],
      sdkMessages: [sdkTextOnlyUser],
      mergedMessages: projectedMessages,
    })).toEqual(expect.objectContaining({
      sdkUserImageCount: 0,
      sdkProjectedUserImageCount: 0,
      mergedUserImageCount: 0,
    }));
  });

  test('summarizes SDK attachment descriptors as projected user images', () => {
    const sdkUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      attachments: [
        {
          id: 'turn-1:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'materializing',
          previewSrc: 'data:image/png;base64,preview',
        },
        {
          id: 'turn-1:attachment:001',
          kind: 'screenshot_request',
          source: 'camera_button',
          status: 'pending_capture',
        },
      ],
      isComplete: true,
    });

    expect(buildDisplayProjectionTraceSummary({
      rows: [{
        id: 'turn-1-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        metadata: {
          attachments: sdkUser.attachments,
        },
      }],
      sdkMessages: [sdkUser],
      mergedMessages: [sdkUser],
    })).toEqual(expect.objectContaining({
      sdkUserImageCount: 1,
      sdkProjectedUserImageCount: 1,
      mergedUserImageCount: 1,
      userAttachmentCount: 2,
      attachmentSources: ['camera_button', 'user_included'],
      attachmentStatuses: ['materializing', 'pending_capture'],
      materializingPreviewCount: 1,
      pendingScreenshotRequestCount: 1,
    }));
  });

  test('summarizes display projection attachment image counts without exposing content', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      attachments: [
        {
          id: 'turn-1:attachment:000',
          kind: 'image',
          source: 'replay',
          status: 'ready',
          screenshotRef: 'artifact-1',
          screenshotUrl: '/api/artifacts/artifact-1',
        },
      ],
      isComplete: true,
    });

    expect(buildDisplayProjectionTraceSummary({
      rows: [{
        id: 'turn-1-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        metadata: {
          attachments: sdkUser.attachments,
        },
      }],
      sdkMessages: [sdkUser],
      mergedMessages: [sdkUser],
    })).toEqual(expect.objectContaining({
      sdkUserImageCount: 1,
      sdkProjectedUserImageCount: 1,
      mergedUserImageCount: 1,
    }));
  });

  test('does not count legacy screenshot aliases as SDK-owned user attachment coverage', () => {
    expect(buildDisplayProjectionTraceSummary({
      rows: [{
        id: 'turn-1-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        metadata: {
          screenshotRefs: ['artifact-1'],
        },
      }],
      sdkMessages: [message({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'legacy alias only',
        turnRef: 'turn-1',
        screenshotRef: 'artifact-1',
      })],
      mergedMessages: [],
    })).toEqual(expect.objectContaining({
      sdkUserImageCount: 0,
      sdkProjectedUserImageCount: 0,
      mergedUserImageCount: 0,
    }));
  });
});
