/**
 * Covers desktop transcript projection runtime client. behavior in the frontend test suite.
 */

const mockInvokeWindieCommand = jest.fn();
const mockReplaceCompactedReplay = jest.fn();
const mockRewriteDesktopTranscriptProjection = jest.fn();

function loadDesktopTranscriptProjectionRuntime() {
  jest.resetModules();
  mockInvokeWindieCommand.mockReset();
  mockReplaceCompactedReplay.mockReset();
  mockRewriteDesktopTranscriptProjection.mockReset();

  jest.doMock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => ({
    invokeWindieCommand: mockInvokeWindieCommand,
  }));

  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/desktopConversationStore', () => ({
    createDesktopConversationStore: jest.fn(() => ({
      replaceCompactedReplay: mockReplaceCompactedReplay,
    })),
    rewriteTranscriptProjection: mockRewriteDesktopTranscriptProjection,
  }));

  const { DesktopTranscriptProjectionRuntimeClient } = require(
    '../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient',
  );
  return DesktopTranscriptProjectionRuntimeClient;
}

describe('DesktopTranscriptProjectionRuntimeClient', () => {
  test('loads conversation metadata through SDK-shaped commands', async () => {
    const projectionClient = loadDesktopTranscriptProjectionRuntime();
    mockInvokeWindieCommand.mockResolvedValue([
      {
        conversationRef: 'conv-1',
        title: 'Hello',
      },
    ]);

    await expect(projectionClient.listMetadata('user-1', { limit: 10 })).resolves.toEqual([
      {
        conversationRef: 'conv-1',
        title: 'Hello',
      },
    ]);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.list', {
      userId: 'user-1',
      limit: 10,
    });
  });

  test('loads display snapshots through the display SDK projection', async () => {
    const projectionClient = loadDesktopTranscriptProjectionRuntime();
    mockInvokeWindieCommand.mockResolvedValue({
      display: {
        conversationRef: 'conv-display',
        revisionId: 'rev-display',
        messages: [],
        compaction: { status: 'idle' },
      },
    });

    await expect(projectionClient.loadForDisplay('user-1', 'conv-display')).resolves.toEqual(
      expect.objectContaining({
        conversationRef: 'conv-display',
        revisionId: 'rev-display',
      }),
    );

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.loadDisplay', {
      userId: 'user-1',
      conversationRef: 'conv-display',
    });
  });

  test('keeps replay/admin writes behind explicit SDK store operations', async () => {
    const projectionClient = loadDesktopTranscriptProjectionRuntime();
    mockRewriteDesktopTranscriptProjection.mockResolvedValue({
      conversationRef: 'conv-rewrite',
      revisionId: 'rev-new',
      messages: [],
    });

    await projectionClient.replaceCompactedReplay({
      conversationRef: 'conv-compact',
      revisionId: 'rev-compact',
      messages: [],
    }, 'user-1');
    await expect(projectionClient.rewriteTranscriptProjection({
      conversationRef: 'conv-rewrite',
      userId: 'user-1',
      transcriptEntries: [{ content: 'visible' }],
      rehydrateEntries: [{ content: 'rehydrate' }],
    })).resolves.toEqual(expect.objectContaining({
      conversationRef: 'conv-rewrite',
      revisionId: 'rev-new',
    }));

    expect(mockReplaceCompactedReplay).toHaveBeenCalledWith({
      conversationRef: 'conv-compact',
      revisionId: 'rev-compact',
      messages: [],
    });
    expect(mockRewriteDesktopTranscriptProjection).toHaveBeenCalledWith({
      conversationRef: 'conv-rewrite',
      userId: 'user-1',
      entries: [{ content: 'visible' }],
      rehydrateEntries: [{ content: 'rehydrate' }],
    });
  });

  test('deletes conversations through SDK-shaped command routing', async () => {
    const projectionClient = loadDesktopTranscriptProjectionRuntime();
    mockInvokeWindieCommand.mockResolvedValue(undefined);

    await projectionClient.deleteConversation('user-1', 'conv-delete');

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-delete',
    });
  });
});
