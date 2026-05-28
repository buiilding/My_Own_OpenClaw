import {
  InMemoryConversationStore,
  SdkConversationRuntime,
  WindieDesktopAgent,
  type BackendEvent,
  type BackendTransport,
  type ConversationEvent,
  type ConversationRevision,
  type ConversationStore,
  type RehydrateSnapshot,
  type SdkDisplayRow,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

function createMockBackendTransport(
  overrides: Partial<BackendTransport> = {},
): BackendTransport {
  return {
    connect: jest.fn(async () => undefined),
    handshake: jest.fn(async () => undefined),
    sendQuery: jest.fn(async () => 'query-unused'),
    sendToolResult: jest.fn(async () => undefined),
    sendToolBundleResult: jest.fn(async () => undefined),
    rehydrateConversation: jest.fn(async () => undefined),
    compactHistory: jest.fn(async () => 'compact-unused'),
    updateSettings: jest.fn(async () => 'settings-unused'),
    listModels: jest.fn(async () => 'models-unused'),
    stop: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    close: jest.fn(async () => undefined),
    wakewordDetected: jest.fn(async () => 'wakeword-unused'),
    ...overrides,
  };
}

function createDesktopAgentHarness({
  agent = null,
  localRuntime,
  transportOverrides = {},
}: {
  agent?: ConstructorParameters<typeof WindieDesktopAgent>[0]['agent'];
  localRuntime?: ConstructorParameters<typeof SdkConversationRuntime>[0]['localRuntime'];
  transportOverrides?: Partial<BackendTransport>;
} = {}) {
  let backendListener: ((event: unknown) => void) | null = null;
  const store = new InMemoryConversationStore();
  const transport = createMockBackendTransport({
    subscribe: jest.fn(listener => {
      backendListener = listener;
      return () => {
        backendListener = null;
      };
    }),
    ...transportOverrides,
  });
  const runtime = new SdkConversationRuntime({
    conversationRef: 'conv-desktop-agent',
    store,
    localRuntime,
    transport,
  });
  runtime.attachTransport();
  const desktopAgent = new WindieDesktopAgent({
    agent,
    runtime,
    conversationRef: 'conv-desktop-agent',
    workspacePath: '/workspace',
  });
  return {
    desktopAgent,
    emitBackendEvent: (event: BackendEvent) => backendListener?.(event),
    store,
    transport,
  };
}

async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

class BlockingAppendConversationStore implements ConversationStore {
  events: ConversationEvent[] = [];
  appendCalls = 0;
  private releaseAppend: (() => void) | null = null;
  readonly appendStarted = new Promise<void>(resolve => {
    this.releaseAppend = resolve;
  });

  async appendEvent(event: ConversationEvent): Promise<void> {
    this.appendCalls += 1;
    await this.appendStarted;
    this.events.push(event);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    for (const event of events) {
      await this.appendEvent(event);
    }
  }

  async rewriteConversation(): Promise<void> {
    this.events = [];
  }

  async replaceCompactedReplay(): Promise<void> {
    return undefined;
  }

  async loadForDisplay() {
    return {
      conversationRef: 'conv-desktop-agent',
      revisionId: 'rev-blocking',
      messages: [],
      compaction: {
        status: 'idle',
      },
    };
  }

  async loadDisplayRows(): Promise<SdkDisplayRow[]> {
    return [];
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    return {
      conversationRef,
      revisionId: 'rev-blocking',
      messages: [],
    };
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    return {
      conversationRef,
      revisionId: 'rev-blocking',
      updatedAt: new Date(0).toISOString(),
    };
  }

  async loadEvents(): Promise<ConversationEvent[]> {
    return this.events;
  }

  async listMetadata() {
    return [];
  }

  release(): void {
    this.releaseAppend?.();
  }
}

describe('Windie desktop agent SDK facade', () => {
  test('emits SDK display rows from normalized backend events', async () => {
    const { desktopAgent, emitBackendEvent } = createDesktopAgentHarness();
    const rows: SdkDisplayRow[] = [];
    const events: string[] = [];
    const currentTurns: string[] = [];
    desktopAgent.onRows(nextRows => rows.push(...nextRows));
    desktopAgent.onConversationEvent(event => events.push(event.type));
    desktopAgent.onCurrentTurn(currentTurn => currentTurns.push(currentTurn.phase));

    emitBackendEvent({
      type: 'tool-call',
      conversation_ref: 'conv-desktop-agent',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { file_path: 'README.md' },
        metadata: {
          model_facing_tool_call: {
            id: 'call-read',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"file_path":"README.md"}',
            },
          },
        },
      },
    });
    await tick();

    expect(events).toEqual(['tool_call']);
    expect(currentTurns).toEqual(['tool_call']);
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        content: {
          id: 'call-read',
          name: 'read_file',
          arguments: { file_path: 'README.md' },
        },
      }),
    ]);
  });

  test('emits current-turn updates before durable transcript append finishes', () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new BlockingAppendConversationStore();
    const transport = createMockBackendTransport({
      subscribe: jest.fn(listener => {
        backendListener = listener;
        return () => {
          backendListener = null;
        };
      }),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-desktop-agent',
      store,
      transport,
    });
    runtime.attachTransport();
    const desktopAgent = new WindieDesktopAgent({
      runtime,
      conversationRef: 'conv-desktop-agent',
      workspacePath: '/workspace',
    });
    const currentTurns: string[] = [];
    desktopAgent.onCurrentTurn(currentTurn => currentTurns.push(currentTurn.phase));

    backendListener?.({
      type: 'streaming-response',
      conversation_ref: 'conv-desktop-agent',
      turn_ref: 'turn-live',
      payload: {
        text: 'hello',
      },
    });

    expect(store.appendCalls).toBe(1);
    expect(store.events).toEqual([]);
    expect(currentTurns).toEqual(['streaming']);
    store.release();
  });

  test('executes single local tool calls and emits paired output rows', async () => {
    const sentToolResults: unknown[] = [];
    const { desktopAgent, emitBackendEvent, transport } = createDesktopAgentHarness({
      localRuntime: {
        executeTool: jest.fn(async call => ({
          success: true,
          data: {
            output: `read ${String(call.args.file_path)}`,
          },
        })),
      },
      transportOverrides: {
        sendToolResult: jest.fn(async payload => {
          sentToolResults.push(payload);
        }),
      },
    });
    const rows: SdkDisplayRow[] = [];
    desktopAgent.onRows(nextRows => rows.push(...nextRows));

    emitBackendEvent({
      type: 'tool-call',
      conversation_ref: 'conv-desktop-agent',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { file_path: 'README.md' },
      },
    });
    await tick();
    await tick();

    expect(transport.sendToolResult).toHaveBeenCalledTimes(1);
    expect(sentToolResults[0]).toMatchObject({
      request_id: 'req-read',
      success: true,
      data: {
        output: 'read README.md',
      },
    });
    expect(rows.map(row => row.type)).toEqual(['tool_call', 'tool_output']);
    expect(rows[1]).toMatchObject({
      type: 'tool_output',
      content: 'read README.md',
      metadata: {
        requestId: 'req-read',
        toolName: 'read_file',
      },
    });
  });

  test('executes bundled local tools and emits one bundle output row', async () => {
    const sentBundleResults: unknown[] = [];
    const { desktopAgent, emitBackendEvent, transport } = createDesktopAgentHarness({
      localRuntime: {
        executeTool: jest.fn(async call => ({
          success: true,
          data: {
            output: `output for ${String(call.toolName)}`,
          },
        })),
      },
      transportOverrides: {
        sendToolBundleResult: jest.fn(async payload => {
          sentBundleResults.push(payload);
        }),
      },
    });
    const rows: SdkDisplayRow[] = [];
    desktopAgent.onRows(nextRows => rows.push(...nextRows));

    emitBackendEvent({
      type: 'tool-bundle',
      conversation_ref: 'conv-desktop-agent',
      turn_ref: 'turn-tool',
      payload: {
        bundle_id: 'bundle-read',
        tools: [
          {
            id: 'call-readme',
            name: 'read_file',
            args: { file_path: 'README.md' },
            metadata: {
              model_facing_tool_call: {
                id: 'call-readme',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"file_path":"README.md"}',
                },
              },
            },
          },
          {
            id: 'call-package',
            name: 'read_file',
            args: { file_path: 'package.json' },
            metadata: {
              model_facing_tool_call: {
                id: 'call-package',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"file_path":"package.json"}',
                },
              },
            },
          },
        ],
      },
    });
    await tick();
    await tick();

    expect(transport.sendToolBundleResult).toHaveBeenCalledTimes(1);
    expect(sentBundleResults[0]).toMatchObject({
      bundle_id: 'bundle-read',
      status: 'success',
      step_results: [
        expect.objectContaining({ tool: 'read_file', status: 'ok' }),
        expect.objectContaining({ tool: 'read_file', status: 'ok' }),
      ],
    });
    expect(rows.map(row => row.type)).toEqual(['tool_bundle_call', 'tool_bundle_output']);
    expect(rows[0]).toMatchObject({
      type: 'tool_bundle_call',
      content: {
        bundleId: 'bundle-read',
        tool_calls: [
          expect.objectContaining({ id: 'call-readme' }),
          expect.objectContaining({ id: 'call-package' }),
        ],
      },
    });
    expect(rows[1]).toMatchObject({
      type: 'tool_bundle_output',
      content: {
        bundleId: 'bundle-read',
        step_results: [
          expect.objectContaining({ toolCallId: 'call-readme' }),
          expect.objectContaining({ toolCallId: 'call-package' }),
        ],
      },
    });
  });

  test('run sends through the SDK conversation runtime and updates status', async () => {
    const statuses: string[] = [];
    const { desktopAgent, transport } = createDesktopAgentHarness({
      transportOverrides: {
        sendQuery: jest.fn(async () => 'turn-sent'),
      },
    });
    desktopAgent.onStatus(status => statuses.push(status.phase));

    const result = await desktopAgent.run('hello');

    expect(result.turnRef).toMatch(/^turn/);
    expect(result.queryMessageId).toBe('turn-sent');
    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'hello',
        conversation_ref: 'conv-desktop-agent',
      }),
      expect.objectContaining({
        messageId: result.turnRef,
      }),
    );
    expect(statuses).toEqual(['ready', 'running', 'running']);
  });

  test('exposes runtime commands needed by a desktop host without Electron command routing', async () => {
    const rehydrateConversation = jest.fn(async () => undefined);
    const compactHistory = jest.fn(async () => 'compact-id');
    const updateSettings = jest.fn(async () => 'settings-id');
    const listModels = jest.fn(async () => 'models-id');
    const wakewordDetected = jest.fn(async () => 'wakeword-id');
    const connect = jest.fn(async () => undefined);
    const { desktopAgent } = createDesktopAgentHarness({
      transportOverrides: {
        rehydrateConversation,
        compactHistory,
        updateSettings,
        listModels,
        wakewordDetected,
        connect,
      },
    });

    await desktopAgent.ensureConnected();
    await desktopAgent.rehydrateMessages({
      conversation_ref: 'conv-desktop-agent',
      messages: [{ role: 'user', content: 'hello' }],
      rehydrate_mode: 'replace',
    });
    await desktopAgent.compactHistory({
      force: false,
      conversation_ref: 'conv-desktop-agent',
    });
    await desktopAgent.updateSettings({
      model_provider: 'openai',
      selected_model_id: 'gpt-5',
    });
    await desktopAgent.requestModelList();
    await desktopAgent.wakewordDetected({ source: 'test' });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(rehydrateConversation).toHaveBeenCalledWith({
      conversation_ref: 'conv-desktop-agent',
      messages: [{ role: 'user', content: 'hello' }],
      rehydrate_mode: 'replace',
    });
    expect(compactHistory).toHaveBeenCalledWith({
      force: false,
      conversation_ref: 'conv-desktop-agent',
    });
    expect(updateSettings).toHaveBeenCalledWith({
      model_provider: 'openai',
      selected_model_id: 'gpt-5',
    });
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(wakewordDetected).toHaveBeenCalledWith({ source: 'test' });
  });

  test('delegates host-level APIs to a started WindieAgent when available', async () => {
    const agent = {
      compactHistory: jest.fn(),
      ensureConnected: jest.fn(async () => undefined),
      isConnected: jest.fn(() => true),
      listModels: jest.fn(async () => ({
        config: {
          model_mode: 'cloud',
          model_provider: 'openai',
          selected_model_id: 'gpt-5',
          interaction_mode: 'agent',
        },
        models: [{ id: 'gpt-5' }],
      })),
      requestModelList: jest.fn(async () => 'models-message-id'),
      rehydrateConversation: jest.fn(),
      shutdownLocalRuntime: jest.fn(),
      sleep: jest.fn(),
      status: jest.fn(async () => ({ ready: true })),
      updateSettings: jest.fn(async () => 'settings-message-id'),
      wakewordDetected: jest.fn(async () => 'wakeword-message-id'),
    };
    const { desktopAgent } = createDesktopAgentHarness({ agent });

    await desktopAgent.ensureConnected();
    expect(desktopAgent.isConnected()).toBe(true);
    await expect(desktopAgent.listModels()).resolves.toEqual(expect.objectContaining({
      models: [{ id: 'gpt-5' }],
    }));
    await expect(desktopAgent.requestModelList()).resolves.toBe('models-message-id');
    await expect(desktopAgent.updateSettings({ model_provider: 'openai' })).resolves.toBe('settings-message-id');
    await expect(desktopAgent.wakewordDetected({ source: 'mic' })).resolves.toBe('wakeword-message-id');
    await expect(desktopAgent.localStatus()).resolves.toEqual({ ready: true });

    expect(agent.ensureConnected).toHaveBeenCalledTimes(1);
    expect(agent.listModels).toHaveBeenCalledTimes(1);
    expect(agent.requestModelList).toHaveBeenCalledTimes(1);
    expect(agent.updateSettings).toHaveBeenCalledWith({ model_provider: 'openai' });
    expect(agent.wakewordDetected).toHaveBeenCalledWith({ source: 'mic' });
  });
});
