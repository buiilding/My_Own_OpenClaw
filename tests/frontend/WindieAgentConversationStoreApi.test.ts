import {
  WindieAgent,
  SidecarConversationStore,
  createConversationEvent,
  type ConversationEvent,
  type ConversationRewritePlan,
  type CompactedReplaySnapshot,
} from '../../packages/windie-sdk-js/src';

function createAgentWithStore(store: Record<string, jest.Mock>) {
  return new WindieAgent(
    'agent-test',
    {
      waitForOpen: jest.fn(),
      isOpen: jest.fn(() => true),
      close: jest.fn(),
      on: jest.fn(() => () => {}),
    } as never,
    {},
    {} as never,
    { listAgents: jest.fn(() => []) } as never,
    undefined,
    'user-1',
    store as never,
  );
}

describe('WindieAgent public conversation store APIs', () => {
  test('routes revision reads and writes through the configured conversation store', async () => {
    const event = createConversationEvent({
      eventId: 'evt-1',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: { text: 'hello' },
    });
    const plan: ConversationRewritePlan = {
      conversationRef: 'conv-1',
      baseRevisionId: 'rev-1',
      newRevisionId: 'rev-2',
      preservedEvents: [event],
      removedEventIds: [],
      reason: 'retry',
    };
    const snapshot: CompactedReplaySnapshot = {
      generationId: 'gen-1',
      conversationRef: 'conv-1',
      sourceRevisionId: 'rev-1',
      sourceTurnRef: null,
      createdAt: '2026-06-05T12:00:00.000Z',
      entries: [{ role: 'assistant', content: 'summary' }],
      entryCount: 1,
      complete: true,
      active: true,
    };
    const store = {
      getRevision: jest.fn(async () => ({
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        updatedAt: '2026-06-05T12:00:00.000Z',
      })),
      appendEvent: jest.fn(async () => undefined),
      rewriteConversation: jest.fn(async () => undefined),
      replaceCompactedReplay: jest.fn(async () => undefined),
    };
    const agent = createAgentWithStore(store);

    await expect(agent.getConversationRevision('conv-1')).resolves.toEqual({
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });
    await agent.appendConversationEvent(event);
    await agent.rewriteConversation(plan);
    await agent.replaceCompactedReplay(snapshot);

    expect(store.getRevision).toHaveBeenCalledWith('conv-1');
    expect(store.appendEvent).toHaveBeenCalledWith(event);
    expect(store.rewriteConversation).toHaveBeenCalledWith(plan);
    expect(store.replaceCompactedReplay).toHaveBeenCalledWith(snapshot);
  });

  test('accepts explicit store overrides for conversation mutations', async () => {
    const defaultStore = {
      appendEvent: jest.fn(),
      rewriteConversation: jest.fn(),
      replaceCompactedReplay: jest.fn(),
      getRevision: jest.fn(),
    };
    const overrideStore = {
      appendEvent: jest.fn(async () => undefined),
      rewriteConversation: jest.fn(async () => undefined),
      replaceCompactedReplay: jest.fn(async () => undefined),
      getRevision: jest.fn(async () => ({
        conversationRef: 'conv-override',
        revisionId: 'rev-override',
        updatedAt: '2026-06-05T12:00:00.000Z',
      })),
    };
    const agent = createAgentWithStore(defaultStore);
    const event = createConversationEvent({
      eventId: 'evt-override',
      type: 'user_message',
      conversationRef: 'conv-override',
      revisionId: 'rev-override',
      payload: { text: 'override' },
    });

    await agent.appendConversationEvent({ event, store: overrideStore as never });
    await expect(agent.getConversationRevision({
      conversationRef: 'conv-override',
      store: overrideStore as never,
    })).resolves.toMatchObject({ revisionId: 'rev-override' });

    expect(defaultStore.appendEvent).not.toHaveBeenCalled();
    expect(defaultStore.getRevision).not.toHaveBeenCalled();
    expect(overrideStore.appendEvent).toHaveBeenCalledWith(event);
    expect(overrideStore.getRevision).toHaveBeenCalledWith('conv-override');
  });
});

describe('SidecarConversationStore event payload write params', () => {
  test('extracts UI-supplied event payload metadata before calling sidecar RPC', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: { message_index: 1 } }));
    const store = new SidecarConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });
    const event: ConversationEvent = createConversationEvent({
      eventId: 'evt-tool',
      type: 'tool_output',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: {
        text: 'clicked',
        toolName: 'mouse_control',
        toolCallId: 'call-1',
        workspacePath: '/repo',
        workspaceName: 'WindieOS',
        modelId: 'model-1',
        modelProvider: 'provider-1',
        screenshotRef: 'artifact-1',
        attachments: [{
          kind: 'image',
          ref: 'artifact-1',
        }],
      },
    });

    await store.appendEvent(event);

    expect(rpc).toHaveBeenCalledWith({
      method: 'store_chat_event',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-1',
        event_type: 'tool_output',
        tool_name: 'mouse_control',
        correlation_id: 'call-1',
        workspace_path: '/repo',
        workspace_name: 'WindieOS',
        attachments: [
          expect.objectContaining({
            kind: 'image',
            ref: 'artifact-1',
          }),
        ],
        metadata: expect.objectContaining({
          model_id: 'model-1',
          model_provider: 'provider-1',
          screenshot: 'artifact-1',
        }),
        event_payload: event,
      }),
    });
  });

  test('logs successful compaction event storage after sidecar RPC succeeds', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: { message_index: 7 } }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const store = new SidecarConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });
    const event: ConversationEvent = createConversationEvent({
      eventId: 'evt-compaction',
      type: 'compaction_applied',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        generationId: 'gen-1',
        skippedReason: null,
        summaryText: 'full summary should remain out of the log',
      },
    });

    await store.appendEvent(event);

    expect(logSpy).toHaveBeenCalledWith(
      '[Windie SDK][Compaction] store_chat_event succeeded',
      expect.objectContaining({
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        revisionId: 'rev-1',
        eventId: 'evt-compaction',
        eventType: 'compaction_applied',
        source: 'backend',
        userId: 'user-1',
        messageIndex: 7,
        generationId: 'gen-1',
        hasCompactionCheckpoint: true,
      }),
    );
    expect(logSpy.mock.calls[0][1]).not.toHaveProperty('summaryText');
    logSpy.mockRestore();
  });
});
