/**
 * Covers renderer app-runtime SDK display projection merge rules.
 */

import {
  DesktopConversationDisplayProjection,
} from '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection';
import type { ChatMessage } from '../../frontend/src/renderer/app/runtime/desktopChatMessageTypes';

const {
  buildConversationViewChatMessages,
  buildChatMessagesFromSdkDisplayRows,
  buildDisplayProjectionTraceSummary,
  mergeRendererAnnotationsIntoSdkMessages,
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

describe('desktopConversationDisplayProjection', () => {
  test('projects SDK display rows through the renderer app-runtime facade', () => {
    expect(buildChatMessagesFromSdkDisplayRows([{
      id: 'row-user',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      index: 0,
      role: 'user',
      type: 'user_message',
      content: 'inspect recent commits',
    }])).toEqual([
      expect.objectContaining({
        id: 'row-user',
        sender: 'user',
        text: 'inspect recent commits',
      }),
    ]);
  });

  test('merges renderer-only annotations back into matching SDK messages', () => {
    const sdkAssistant = message({
      id: 'assistant-1',
      sender: 'assistant',
      text: 'Visible answer',
      turnRef: 'turn-1',
    });
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

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkAssistant],
      [currentAssistant],
    )).toEqual([
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
    const sdkToolCall = message({
      id: 'tool-row',
      sender: 'assistant',
      type: 'tool-call',
      text: '',
      turnRef: 'turn-1',
      sourceEventType: 'tool_call',
    });

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkToolCall],
      [message({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'inspect recent commits',
        turnRef: 'turn-1',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        isComplete: true,
      })],
    )).toEqual([sdkToolCall]);
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

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkToolCall],
      [],
      {
        pendingTurn: {
          turnRef: 'turn-1',
          userMessageId: 'turn-1-sdk-evt-000002-user_message',
          text: 'inspect recent commits',
        },
      },
    )).toEqual([
      expect.objectContaining(pendingUser),
      sdkToolCall,
    ]);
  });

  test('uses SDK user rows when SDK echoes the pending user turn', () => {
    const optimisticUser = message({
      id: 'renderer-user-edit',
      sender: 'user',
      text: 'edited prompt',
      turnRef: 'turn-edit',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      attachments: [{
        id: 'artifact-one',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        filename: 'one.png',
      }],
      isComplete: true,
    });
    const sdkUserSameTurn = message({
      id: 'sdk-user-edit',
      sender: 'user',
      text: 'edited prompt',
      turnRef: 'turn-edit',
      sourceEventType: 'user_message',
      sourceChannel: 'sdk:display-rows',
      isComplete: true,
    });

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkUserSameTurn],
      [optimisticUser],
      {
        pendingTurn: {
          turnRef: 'turn-edit',
          userMessageId: 'renderer-user-edit',
          text: 'edited prompt',
        },
      },
    )).toEqual([sdkUserSameTurn]);
  });

  test('builds conversation-view messages without replacing SDK user rows with pending bridge rows', () => {
    const optimisticUser = message({
      id: 'renderer-user-edit',
      sender: 'user',
      text: 'edited prompt',
      turnRef: 'turn-edit',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      attachments: [{
        id: 'renderer-only-attachment',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
      }],
      isComplete: true,
    });
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
      currentMessages: [optimisticUser],
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
      currentMessages: [optimisticUser],
      pendingTurn: {
        turnRef: 'turn-edit',
        userMessageId: 'renderer-user-edit',
        text: 'edited prompt',
      },
      preserveRendererAnnotations: true,
    })[0]).not.toHaveProperty('attachments');
    expect(buildConversationViewChatMessages({
      conversationView,
      currentMessages: [optimisticUser],
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
      currentMessages: [message({
        id: 'assistant-1',
        sender: 'assistant',
        text: 'stale renderer answer',
        turnRef: 'turn-stale',
      })],
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

    const firstMerge = mergeRendererAnnotationsIntoSdkMessages(
      [sdkTextOnlyUser],
      [optimisticUser],
    );
    expect(firstMerge).toEqual([sdkTextOnlyUser]);

    const secondMerge = mergeRendererAnnotationsIntoSdkMessages(
      [sdkTextOnlyUser],
      firstMerge,
    );
    expect(secondMerge).toEqual([sdkTextOnlyUser]);
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
      currentMessages: firstMerge,
      mergedMessages: secondMerge,
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
      currentMessages: [],
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
      currentMessages: [optimisticUser],
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
      currentMessages: [],
      mergedMessages: [],
    })).toEqual(expect.objectContaining({
      sdkUserImageCount: 0,
      sdkProjectedUserImageCount: 0,
      mergedUserImageCount: 0,
    }));
  });
});
