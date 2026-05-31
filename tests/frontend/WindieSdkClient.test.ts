import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createWindieAgentBackendTransport,
  createWindieAgentSession,
  createWindieLocalRuntimeProvider,
  moduleTool,
  SidecarDaemonHttpClient,
  SidecarConversationStore,
  WindieAgent,
  WindieClient,
  WindieSdkClient,
  windieBuiltins,
  type SdkPromptPreviewRequest,
  type SdkQueryPlanRequest,
  type WindieLocalRuntimeClient,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly sent: string[] = [];
  readonly url: string;
  readonly options?: unknown;
  readyState = 0;
  closed = false;

  constructor(url: string, options?: unknown) {
    this.url = url;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, listener: (payload: unknown) => void): void {
    const bucket = this.listeners.get(event) ?? new Set<(payload: unknown) => void>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
  }

  removeEventListener(event: string, listener: (payload: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = 3;
    this.closed = true;
    this.emit('close', { code: 1000, reason: 'closed', wasClean: true });
  }

  emit(event: string, payload: unknown): void {
    if (event === 'open') {
      this.readyState = 1;
    }
    if (event === 'close') {
      this.readyState = 3;
    }
    this.listeners.get(event)?.forEach(listener => listener(payload));
  }

  clearSent(): void {
    this.sent.length = 0;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
} {
  const status = init.status ?? 200;
  const statusText = init.statusText ?? 'OK';
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('WindieSdkClient', () => {
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    FakeWebSocket.reset();
    mockFetch.mockReset();
  });

  test('builds introspection requests against the existing sdk routes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      config: {
        model_mode: 'online',
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
        interaction_mode: 'agent',
      },
      system_prompt: 'prompt',
    }));

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com/',
      fetchImpl: mockFetch,
    });

    const response = await client.systemPrompt({
      userId: 'dev-user',
      interactionMode: 'agent',
    });

    expect(response.system_prompt).toBe('prompt');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/system-prompt?user_id=dev-user&interaction_mode=agent',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  test('posts prompt preview payloads without backend-specific imports', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      config: {
        model_mode: 'online',
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
        interaction_mode: 'agent',
      },
      system_prompt: 'prompt',
      prompt_messages: [],
      canonical_tool_schemas: [],
      provider_tool_schemas: [],
      user_message_full: null,
      prompt_token_count: 42,
      token_count_error: null,
    }));

    const payload = {
      user_query_raw: 'open file',
      renderer_only: true,
      agent_definition: {
        id: 'custom-agent',
        query_context: { should_not_reach_backend: true },
        system_prompt: { mode: 'replace', content: 'Custom prompt.' },
        runtime: {
          operating_system: 'macOS',
          unsupported: true,
        },
      },
      messages: [
        {
          role: 'user',
          content: '<user_query>open file</user_query>',
        },
      ],
    } as unknown as SdkPromptPreviewRequest;

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    const response = await client.promptPreview(payload);

    expect(response.prompt_token_count).toBe(42);
    const promptPreviewInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(promptPreviewInit.body))).toEqual({
      user_query_raw: 'open file',
      agent_definition: {
        id: 'custom-agent',
        system_prompt: { mode: 'replace', content: 'Custom prompt.' },
        runtime: { operating_system: 'macOS' },
      },
      messages: [
        {
          role: 'user',
          content: '<user_query>open file</user_query>',
        },
      ],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/prompt-preview',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  test('posts query plan payloads and returns first-turn transparency planning data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      config: {
        model_mode: 'online',
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
        interaction_mode: 'agent',
      },
      query_message: {
        type: 'query',
        payload: {
          text: 'open file',
          conversation_ref: 'conv-sdk',
        },
      },
      transparency_events: [
        { type: 'system-prompt', payload: { content: 'prompt' } },
        { type: 'tool-schemas', payload: { tool_schemas: [] } },
      ],
      system_prompt: 'prompt',
      prompt_messages: [],
      canonical_tool_schemas: [],
      provider_tool_schemas: [],
      user_message_full: null,
      prompt_token_count: 42,
      token_count_error: null,
    }));

    const payload = {
      user_query_raw: 'open file',
      conversation_ref: 'conv-sdk',
      turn_ref: 'turn-ui-only',
      agent_definition: {
        id: 'tui-agent',
        tool_manifest: { should_not_reach_backend: true },
        system_prompt: { mode: 'replace', content: 'TUI prompt.' },
        tools: {
          mode: 'default_plus_client',
          client_manifest: { version: 1, tools: [] },
          client_tools: ['bad'],
        },
      },
      messages: [],
    } as unknown as SdkQueryPlanRequest;

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    const response = await client.queryPlan(payload);

    expect(response.query_message).toEqual({
      type: 'query',
      payload: {
        text: 'open file',
        conversation_ref: 'conv-sdk',
      },
    });
    const queryPlanInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(queryPlanInit.body))).toEqual({
      user_query_raw: 'open file',
      conversation_ref: 'conv-sdk',
      agent_definition: {
        id: 'tui-agent',
        system_prompt: { mode: 'replace', content: 'TUI prompt.' },
        tools: {
          mode: 'default_plus_client',
          client_manifest: { version: 1, tools: [] },
        },
      },
      messages: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/query-plan',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  test('filters SDK HTTP route payloads before posting to strict backend models', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ image: {}, results: [] }) as any)
      .mockResolvedValueOnce(jsonResponse({ image: {}, description: 'button', matches: [] }) as any)
      .mockResolvedValueOnce(jsonResponse({ success: true, title: 'Filtered title' }) as any);

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    await client.ocr.inspect({
      image: {
        artifact_id: 'artifact-1',
        source: 'renderer-cache',
      },
      text: 'Submit',
      include_overlay: true,
      uiOnly: true,
    } as unknown as SdkOcrInspectRequest);
    await client.vision.locateAll({
      image: {
        image_base64: 'abc',
        mime_type: 'image/png',
      },
      description: 'button',
      max_results: 3,
      trace_id: 'trace-ui-only',
    } as unknown as SdkVisionLocateAllRequest);
    await client.generateConversationTitle({
      user_message: 'Hello',
      assistant_message: 'Hi',
      localRevisionId: 'rev-1',
    } as unknown as SdkGenerateTitleRequest);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.windieos.com/api/sdk/ocr/inspect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          image: { artifact_id: 'artifact-1' },
          text: 'Submit',
          include_overlay: true,
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.windieos.com/api/sdk/vision/locate-all',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          image: { image_base64: 'abc' },
          description: 'button',
          max_results: 3,
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.windieos.com/api/semantic/title',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          user_message: 'Hello',
          assistant_message: 'Hi',
        }),
      }),
    );
  });

  test('uploads artifacts through the existing artifact endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      artifact_id: 'shot.png',
      content_type: 'image/png',
      size_bytes: 128,
      sha256: 'abc123',
      url: 'https://api.windieos.com/api/artifacts/shot.png',
    }));

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    const response = await client.artifacts.upload(
      new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' }),
    );

    expect(response.artifact_id).toBe('shot.png');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/artifacts/',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });

  test('fetches artifacts and generates conversation titles through SDK helpers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ bytes: 'ok' }) as any)
      .mockResolvedValueOnce(jsonResponse({ success: true, title: 'Generated SDK title' }) as any);

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    await expect(client.artifacts.fetch('artifact-1')).resolves.toMatchObject({
      ok: true,
    });
    await expect(client.generateConversationTitle({
      user_message: 'How does SDK work?',
      assistant_message: 'It wraps the runtime.',
    })).resolves.toEqual({
      success: true,
      title: 'Generated SDK title',
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.windieos.com/api/artifacts/artifact-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.windieos.com/api/semantic/title',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('does not expose the old direct websocket agent authoring surface', () => {
    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    expect((client as any).agent).toBeUndefined();
    expect((client as any).connectAgent).toBeUndefined();
    expect((client as any).traceQuery).toBeUndefined();
  });

  test('WindieClient lists backend-owned models from the configured backend', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      config: { model_id: 'gpt-5.4' },
      models: [{ id: 'gpt-5.4' }],
    }));
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    const response = await client.listModels({ userId: 'dev-user' });

    expect(response.models).toEqual([{ id: 'gpt-5.4' }]);
    const [url, init] = mockFetch.mock.calls[0];
    if (String(url) !== 'https://api.windieos.com/api/sdk/models?user_id=dev-user') {
      throw new Error(`unexpected models URL: ${String(url)}`);
    }
    if (init?.method !== 'GET') {
      throw new Error(`unexpected models method: ${String(init?.method)}`);
    }
  });

  test('WindieClient auto-registers hosted install auth and attaches bearer headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'registered-user',
      install_id: 'install-1',
      install_token: 'install-token-1',
    }));
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
    });

    const wakePromise = client.wakeUp({ agentId: 'auth-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await wakePromise;

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/install/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(socket.options).toMatchObject({
      headers: {
        Authorization: 'Bearer install-token-1',
      },
    });
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'registered-user',
    });
  });

  test('agent.setModel sends a backend settings update with provider-safe model fields', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'model-agent',
      systemPrompt: 'Use selected models.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    await agent.setModel({
      modelProvider: 'openai',
      modelId: 'gpt-5.4@@gpt-5-4-high-thinking',
      modelMode: 'online',
      interactionMode: 'agent',
    });

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'update-settings',
      payload: {
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
        model_mode: 'online',
        interaction_mode: 'agent',
      },
      user_id: 'dev-user',
    });
  });

  test('agent exposes prompt, schema, memory, title, and artifact facades', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      rpc: jest.fn(async ({ method }) => ({ success: true, method, data: {} })),
    };
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        config: { model_mode: 'online', model_provider: 'openai', selected_model_id: 'gpt', interaction_mode: 'agent' },
        system_prompt: 'prompt',
      }) as any)
      .mockResolvedValueOnce(jsonResponse({
        config: { model_mode: 'online', model_provider: 'openai', selected_model_id: 'gpt', interaction_mode: 'agent' },
        canonical_tool_schemas: [{ name: 'read_file' }],
        provider_tool_schemas: [],
      }) as any)
      .mockResolvedValueOnce(jsonResponse({ success: true, title: 'Generated' }) as any)
      .mockResolvedValueOnce(jsonResponse({
        artifact_id: 'artifact-1',
        content_type: 'text/plain',
        size_bytes: 4,
        sha256: 'abc',
        url: 'https://api.windieos.com/api/artifacts/artifact-1',
      }) as any);
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({ agentId: 'facade-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    await expect(agent.getSystemPrompt()).resolves.toMatchObject({ system_prompt: 'prompt' });
    await expect(agent.listToolSchemas()).resolves.toMatchObject({
      canonical_tool_schemas: [{ name: 'read_file' }],
    });
    await expect(agent.generateConversationTitle({
      user_message: 'hello',
      assistant_message: 'world',
    })).resolves.toMatchObject({ title: 'Generated' });
    await agent.uploadArtifact(new File(['note'], 'note.txt', { type: 'text/plain' }));
    await agent.searchMemory('hello');
    await agent.storeMemory({
      userQuery: 'hello',
      assistantResponse: 'world',
      memoryType: 'semantic',
    });
    await agent.deleteMemory({ type: 'semantic', memoryId: 'mem-1' });
    await agent.updateConversationTitle('conv-1', 'Manual title');
    await agent.updateSystemPrompt('New prompt');
    await agent.updateToolSchemas([{ name: 'read_file' }]);

    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'search_memory',
    }));
    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'store_memory',
    }));
    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'delete_semantic_memory',
    }));
    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'update_conversation_title',
    }));
    expect(JSON.parse(socket.sent.at(-2) ?? '{}')).toMatchObject({
      type: 'update-settings',
      payload: {},
    });
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toMatchObject({
      type: 'update-settings',
      payload: {},
    });
  });

  test('SDK transport creates websocket-backed agent sessions from backend URLs', async () => {
    const session = createWindieAgentSession({
      backendUrl: 'https://api.windieos.com',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://api.windieos.com/ws');
    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'transport-user',
      operating_system: 'macOS',
      agent_definition: { id: 'transport-agent' },
    });
  });

  test('SDK backend transport exposes websocket model-list messages', async () => {
    const session = createWindieAgentSession({
      backendUrl: 'https://api.windieos.com',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createWindieAgentBackendTransport(session, 'conv-models');
    const messageId = await transport.listModels();

    expect(messageId).toEqual(expect.any(String));
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'list-models',
      payload: {},
      user_id: 'transport-user',
    });
  });

  test('SDK backend transport exposes typed compaction and wakeword messages', async () => {
    const session = createWindieAgentSession({
      backendUrl: 'https://api.windieos.com',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createWindieAgentBackendTransport(session, 'conv-commands');
    await transport.compactHistory({
      conversation_ref: 'conv-commands',
      force: true,
      turn_ref: 'renderer-only-turn',
    });
    await transport.wakewordDetected({
      source: 'voice',
    });

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'compact-history',
      payload: {
        conversation_ref: 'conv-commands',
        force: true,
      },
      user_id: 'transport-user',
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[1])).toMatchObject({
      type: 'wakeword-detected',
      payload: {},
      user_id: 'transport-user',
    });
  });

  test('SDK backend transport filters strict websocket command payloads', async () => {
    const session = createWindieAgentSession({
      backendUrl: 'https://api.windieos.com',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    await session.updateSettings({
      selected_model_id: 'gpt-test',
      appearance_theme: 'graphite',
      provider_api_keys: {
        openai: {
          enabled: true,
          api_key: 'sk-test',
          renderer_only: true,
        },
        future_provider: {
          enabled: true,
          api_key: 'future',
        },
      },
    });
    await session.rehydrateConversation({
      conversation_ref: 'conv-1',
      messages: [],
      agent_definition: { query_only: true },
    });
    await session.sendToolResultPayload({
      request_id: 'req-1',
      success: true,
      data: {
        llm_content: 'done',
        capture_meta: { capture_engine: 'partial' },
      },
    });

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'update-settings',
      payload: {
        selected_model_id: 'gpt-test',
        provider_api_keys: {
          openai: {
            enabled: true,
            api_key: 'sk-test',
          },
        },
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[1])).toMatchObject({
      type: 'rehydrate-conversation',
      payload: {
        conversation_ref: 'conv-1',
        messages: [],
        rehydrate_mode: 'replace',
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[2])).toMatchObject({
      type: 'tool-result',
      payload: {
        request_id: 'req-1',
        success: true,
        data: {
          llm_content: 'done',
        },
      },
    });
  });

  test('managed SDK agent sessions own reconnect fallback and command sends', async () => {
    const onFallback = jest.fn();
    const client = new WindieClient({
      backendSession: 'managed',
      backendUrl: 'https://primary.windie.test',
      fetchImpl: mockFetch,
      backendEndpoints: [
        { backendUrl: 'https://primary.windie.test' },
        { backendUrl: 'https://fallback.windie.test' },
      ],
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'managed-user',
      reconnectIntervalMs: 1,
      connectTimeoutMs: 100,
      onBackendFallback: onFallback,
    });

    const wakePromise = client.wakeUp({
      agentId: 'managed-agent',
      builtins: 'none',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeWebSocket.instances[0].url).toBe('wss://primary.windie.test/ws');

    FakeWebSocket.instances[0].emit('error', new Error('primary unavailable'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeWebSocket.instances[1].url).toBe('wss://fallback.windie.test/ws');
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      backendUrl: 'https://fallback.windie.test',
    }));

    FakeWebSocket.instances[1].emit('open', {});
    const agent = await wakePromise;

    expect(JSON.parse(FakeWebSocket.instances[1].sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'managed-user',
      agent_definition: expect.objectContaining({
        id: 'managed-agent',
      }),
    });

    FakeWebSocket.instances[1].clearSent();
    await agent.requestModelList();
    expect(JSON.parse(FakeWebSocket.instances[1].sent[0])).toMatchObject({
      type: 'list-models',
      payload: {},
      user_id: 'managed-user',
    });
  });

  test('WindieAgent.startDesktop uses the managed desktop backend session by default', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'desktop-user',
      install_id: 'desktop-install',
    }));
    const agentPromise = WindieAgent.startDesktop({
      apiKey: 'desktop-token',
      endpoint: 'https://api.windieos.com',
      builtins: 'none',
      testing: {
        fetchImpl: mockFetch,
        WebSocketImpl: FakeWebSocket as any,
        autoStartLocalRuntime: false,
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const desktopAgent = await agentPromise;

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'desktop-user',
    });

    socket.clearSent();
    await desktopAgent.requestModelList();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'list-models',
      user_id: 'desktop-user',
    });
    desktopAgent.close();
    expect(socket.closed).toBe(true);
  });

  test('WindieAgent.startDesktop accepts the public desktop bootstrap contract', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'desktop-user',
      install_id: 'desktop-install',
    }));
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          { name: 'read_file', schema: { type: 'object' } },
        ],
      })),
    };
    const agentPromise = WindieAgent.startDesktop({
      apiKey: 'desktop-install-token',
      appName: 'WindieOS',
      endpoint: {
        httpUrl: 'https://desktop.windie.test',
        wsUrl: 'wss://desktop.windie.test/ws',
      },
      workspace: '/Users/example/project',
      testing: {
        fetchImpl: mockFetch,
        WebSocketImpl: FakeWebSocket as any,
        sidecar: localRuntime,
      },
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://desktop.windie.test/ws');
    expect((socket.options as { headers?: Record<string, string> })?.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer desktop-install-token',
    }));
    const [identityUrl, identityInit] = mockFetch.mock.calls[0];
    expect(identityUrl).toBe('https://desktop.windie.test/api/install/me');
    expect(identityInit?.method).toBe('GET');
    expect((identityInit?.headers as Headers).get('Authorization')).toBe('Bearer desktop-install-token');
    socket.emit('open', {});
    const desktopAgent = await agentPromise;

    const handshake = JSON.parse(socket.sent[0]);
    expect(handshake).toMatchObject({
      type: 'handshake',
      user_id: 'desktop-user',
      operating_system: expect.any(String),
      agent_definition: {
        name: 'WindieOS',
        runtime: expect.objectContaining({
          workspace_path: '/Users/example/project',
        }),
        tools: {
          client_manifest: {
            tools: [
              expect.objectContaining({ name: 'read_file' }),
            ],
          },
        },
      },
    });
    expect(localRuntime.listTools).toHaveBeenCalledTimes(1);
    desktopAgent.close();
  });

  test('WindieAgent.startDesktop accepts advanced debug, connection, endpoint, and testing buckets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'advanced-user',
      install_id: 'advanced-install',
    }));
    const log = jest.fn();
    const agentPromise = WindieAgent.startDesktop({
      apiKey: 'advanced-token',
      appName: 'WindieOS',
      workspace: '/tmp/windie-workspace',
      endpoint: {
        primary: 'https://advanced.windie.test',
        fallbacks: ['https://advanced-fallback.windie.test'],
      },
      debug: { log },
      connection: {
        reconnectIntervalMs: 10,
        connectTimeoutMs: 50,
        idleDisconnectTimeoutMs: 100,
      },
      testing: {
        fetchImpl: mockFetch,
        WebSocketImpl: FakeWebSocket as any,
        autoStartLocalRuntime: false,
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://advanced.windie.test/ws');
    socket.emit('open', {});
    const desktopAgent = await agentPromise;
    const connectionEvents: unknown[] = [];
    const trafficEvents: unknown[] = [];
    desktopAgent.onConnection(event => connectionEvents.push(event));
    desktopAgent.onTraffic(event => trafficEvents.push(event));

    expect(connectionEvents).toEqual([
      expect.objectContaining({ type: 'open' }),
    ]);

    socket.clearSent();
    await desktopAgent.requestModelList();
    expect(trafficEvents).toEqual([
      expect.objectContaining({ type: 'list-models' }),
    ]);
    desktopAgent.close();
  });

  test('SDK backend event guard includes schema-backed control websocket events', async () => {
    const { isBackendEvent } = await import('../../packages/windie-sdk-js/src/events/backendEvents');

    expect(isBackendEvent({
      type: 'audio-chunk',
      payload: { audio: 'base64', sample_rate: 24000 },
    })).toBe(true);
    expect(isBackendEvent({
      type: 'wakeword-activated',
      payload: { greeting: 'Hello', activated: true },
    })).toBe(true);
    expect(isBackendEvent({
      type: 'wakeword-greeting',
      payload: { text: 'Hello' },
    })).toBe(true);
    expect(isBackendEvent({
      type: 'settings-loaded',
      payload: { config: { model_provider: 'openai' } },
    })).toBe(true);
    expect(isBackendEvent({
      type: 'settings-updated',
      payload: { updated_keys: ['model_provider'] },
    })).toBe(true);
    expect(isBackendEvent({
      type: 'models-listed',
      payload: [{ id: 'gpt-5.4@@gpt-5-4-none-thinking' }],
    })).toBe(true);
  });

  test('wakeUp applies an initial model selection after handshake', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'initial-model-agent',
      systemPrompt: 'Use selected models.',
      model: {
        modelProvider: 'openai',
        modelId: 'gpt-5.4@@gpt-5-4-medium-thinking',
        modelMode: 'online',
        interactionMode: 'agent',
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'update-settings',
      payload: {
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-medium-thinking',
        model_mode: 'online',
        interaction_mode: 'agent',
      },
      user_id: 'dev-user',
    });
  });

  test('agent.setModel validates SDK model selections before sending settings', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'invalid-model-agent',
      systemPrompt: 'Use selected models.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    await expect(agent.setModel({
      modelProvider: 'openai',
      modelId: '',
    })).rejects.toThrow('WindieAgent.setModel requires a non-empty modelId');
    expect(socket.sent).toHaveLength(0);
  });

  test('agent.ask applies per-call model selections before sending the query', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'ask-model-agent',
      systemPrompt: 'Use selected models.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    await agent.ask('Use the chosen model.', {
      conversationRef: 'conv-model-ask',
      model: {
        modelProvider: 'openai',
        modelId: 'gpt-5.4@@gpt-5-4-high-thinking',
        interactionMode: 'agent',
      },
    });

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'update-settings',
      payload: {
        model_provider: 'openai',
        selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
        interaction_mode: 'agent',
      },
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'query',
      payload: {
        text: 'Use the chosen model.',
        conversation_ref: 'conv-model-ask',
      },
    });
  });

  test('agent.ask sends attachment bodies through query_context', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'attachment-agent',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    await agent.ask('Summarize this file.', {
      conversationRef: 'conv-attachment',
      attachmentContext: 'file body',
      attachmentFilenames: ['notes.txt'],
    });

    const sent = JSON.parse(socket.sent[0]);
    expect(sent).toMatchObject({
      type: 'query',
      payload: {
        text: 'Summarize this file.',
        conversation_ref: 'conv-attachment',
        query_context: {
          memory_retrieval_enabled: true,
          attachment_context: 'file body',
        },
      },
    });
    expect(sent.payload).not.toHaveProperty('attachment_context');
    expect(sent.payload).not.toHaveProperty('attachment_filenames');
  });

  test('agent.chat sends the SDK agent definition with each backend query', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'prompt-agent',
      systemPrompt: 'You are a CLI assistant named ExampleBot.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    await agent.chat({ conversationRef: 'conv-prompt-agent' }).send('who are you?');

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'query',
      payload: {
        text: 'who are you?',
        conversation_ref: 'conv-prompt-agent',
        agent_definition: {
          id: 'prompt-agent',
          system_prompt: {
            mode: 'replace',
            content: 'You are a CLI assistant named ExampleBot.',
          },
        },
      },
    });
  });

  test('wakeUp defaults to no tool schemas for simple SDK chat agents', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'simple-agent',
      systemPrompt: 'You are a simple chat assistant.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await wakePromise;

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      agent_definition: {
        id: 'simple-agent',
        tools: {
          mode: 'client_only',
          client_manifest: {
            tools: [],
          },
        },
      },
    });
  });

  test('wakeUp can attach to a configured sidecar daemon HTTP runtime', async () => {
    mockFetch.mockImplementation(async (url, init) => {
      const parsedUrl = String(url);
      if (parsedUrl.endsWith('/status')) {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (parsedUrl.endsWith('/tools/register-module')) {
        return jsonResponse({ success: true }) as any;
      }
      if (parsedUrl.endsWith('/tools')) {
        return jsonResponse({
          version: 1,
          tools: [
            {
              name: 'save_note',
              description: 'Save a local note.',
              execution_target: 'sidecar',
              schema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false,
              },
            },
          ],
        }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecarDaemon: {
        baseUrl: 'http://127.0.0.1:43123',
        token: 'daemon-token',
      },
    });

    const wakePromise = client.wakeUp({
      systemPrompt: 'Use local tools.',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'my_project.tools:save_note',
          schema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    const agent = await wakePromise;

    const statusCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/status'));
    const registerCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/tools/register-module'));
    expect((statusCall?.[1]?.headers as Headers).get('x-windie-sidecar-token')).toBe('daemon-token');
    expect(registerCall?.[1]?.method).toBe('POST');
    expect((registerCall?.[1]?.headers as Headers).get('x-windie-sidecar-token')).toBe('daemon-token');
  });

  test('wakeUp can expose desktop builtin tools from the sidecar manifest', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          { name: 'read_file', schema: { type: 'object' } },
          { name: 'run_shell_command', schema: { type: 'object' } },
        ],
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'builtin-agent',
      ...windieBuiltins.desktop(),
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'handshake',
      agent_definition: {
        tools: {
          client_manifest: {
            tools: [
              expect.objectContaining({ name: 'read_file' }),
              expect.objectContaining({ name: 'run_shell_command' }),
            ],
          },
        },
      },
    });
  });

  test('wakeUp can expose selected builtin groups from the sidecar manifest', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          { name: 'read_file', schema: { type: 'object' } },
          { name: 'run_shell_command', schema: { type: 'object' } },
          { name: 'process', schema: { type: 'object' } },
          { name: 'screenshot', schema: { type: 'object' } },
        ],
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'selected-builtins-agent',
      builtins: ['filesystem', 'shell'],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'handshake',
      agent_definition: {
        tools: {
          mode: 'client_only',
          client_manifest: {
            tools: [
              expect.objectContaining({ name: 'read_file' }),
              expect.objectContaining({ name: 'run_shell_command' }),
              expect.objectContaining({ name: 'process' }),
            ],
          },
        },
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0]).agent_definition.tools.client_manifest.tools)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'screenshot' })]));
  });

  test('wakeUp can expose computer builtin tools from the sidecar manifest', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          { name: 'mouse_control', schema: { type: 'object' } },
          { name: 'keyboard_control', schema: { type: 'object' } },
          { name: 'screenshot', schema: { type: 'object' } },
          { name: 'scroll_control', schema: { type: 'object' } },
          { name: 'switch_window', schema: { type: 'object' } },
          { name: 'wait', schema: { type: 'object' } },
          { name: 'get_open_windows', schema: { type: 'object' } },
          { name: 'read_file', schema: { type: 'object' } },
        ],
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'computer-builtins-agent',
      builtins: ['computer'],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    const tools = JSON.parse(FakeWebSocket.instances[0].sent[0])
      .agent_definition.tools.client_manifest.tools;
    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'mouse_control' }),
      expect.objectContaining({ name: 'keyboard_control' }),
      expect.objectContaining({ name: 'screenshot' }),
      expect.objectContaining({ name: 'scroll_control' }),
      expect.objectContaining({ name: 'switch_window' }),
      expect.objectContaining({ name: 'wait' }),
      expect.objectContaining({ name: 'get_open_windows' }),
    ]));
    expect(tools).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'read_file' }),
    ]));
  });

  test('wakeUp keeps MCP definitions local instead of sending unsupported handshake fields', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerMcp: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'mcp-agent',
      mcps: [{ id: 'filesystem', command: 'filesystem-server' }],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    const handshake = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(localRuntime.registerMcp).toHaveBeenCalledWith({
      id: 'filesystem',
      command: 'filesystem-server',
    });
    expect(handshake.agent_definition).not.toHaveProperty('mcps');
  });

  test('wakeUp ensures a local runtime when module tools need sidecar execution', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
      })),
      shutdown: jest.fn(async () => undefined),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
    });

    const wakePromise = client.wakeUp({
      systemPrompt: 'Use local tools.',
      workspacePath: '/tmp/project',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'my_project.tools:save_note',
          schema: { type: 'object', properties: {} },
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    const agent = await wakePromise;

    expect(ensureLocalRuntime).toHaveBeenCalledWith({
      wakeUp: expect.objectContaining({
        systemPrompt: 'Use local tools.',
        workspacePath: '/tmp/project',
      }),
      needsLocalRuntime: true,
    });
    expect(localRuntime.registerModuleTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'save_note' }),
      { workspacePath: '/tmp/project' },
    );
    await expect(client.status()).resolves.toEqual({ status: 'ok' });
    await expect(agent.status()).resolves.toEqual({ status: 'ok' });
    await expect(agent.listTools()).resolves.toEqual({
      version: 1,
      tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
    });
    await agent.shutdownLocalRuntime();
    expect(localRuntime.shutdown).toHaveBeenCalledTimes(1);
    await client.shutdownLocalRuntime();
    expect(localRuntime.shutdown).toHaveBeenCalledTimes(2);
  });

  test('wakeUp automatically reuses a discovered sidecar daemon for local tools', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-sdk-daemon-'));
    const discoveryFile = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43123',
        token: 'auto-token',
      }),
      'utf8',
    );
    mockFetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/status')) {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url.endsWith('/tools/register-module')) {
        return jsonResponse({ success: true }) as any;
      }
      if (url.endsWith('/tools')) {
        return jsonResponse({
          version: 1,
          tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
        }) as any;
      }
      return jsonResponse({ ok: true, init }) as any;
    });
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      autoSidecar: {
        discoveryFile,
        startTimeoutMs: 50,
      },
    });

    const wakePromise = client.wakeUp({
      workspacePath: '/tmp/project',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'my_project.tools:save_note',
          schema: { type: 'object', properties: {} },
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    const registerCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/tools/register-module'));
    expect(registerCall?.[0]).toBe('http://127.0.0.1:43123/tools/register-module');
    expect((registerCall?.[1]?.headers as Headers).get('x-windie-sidecar-token')).toBe('auto-token');

    mockFetch.mockClear();
    const tools = await client.listTools();
    expect(tools?.tools?.[0]?.name).toBe('save_note');
    const listCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/tools'));
    expect(listCall?.[0]).toBe('http://127.0.0.1:43123/tools');
    expect((listCall?.[1]?.headers as Headers).get('x-windie-sidecar-token')).toBe('auto-token');
  });

  test('createWindieLocalRuntimeProvider reuses discovery metadata directly', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-sdk-provider-'));
    const discoveryFile = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43124',
        token: 'provider-token',
      }),
      'utf8',
    );
    mockFetch.mockResolvedValue(jsonResponse({ status: 'ok' }) as any);

    const provider = createWindieLocalRuntimeProvider({
      discoveryFile,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(runtime).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43124/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-windie-sidecar-token')).toBe('provider-token');
  });

  test('SidecarDaemonHttpClient subscribes to sidecar runtime events', async () => {
    const events: unknown[] = [];
    const client = new SidecarDaemonHttpClient({
      baseUrl: 'http://127.0.0.1:43126',
      token: 'event-token',
      fetchImpl: mockFetch as any,
      WebSocketImpl: FakeWebSocket as any,
    });

    const unsubscribe = client.subscribeEvents(event => {
      events.push(event);
    });
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://127.0.0.1:43126/events');
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'conversation-title-updated',
        payload: {
          conversation_id: 'conv-sdk-title',
          title: 'SDK Title',
        },
      }),
    });

    expect(events).toEqual([
      {
        type: 'conversation-title-updated',
        payload: {
          conversation_id: 'conv-sdk-title',
          title: 'SDK Title',
        },
      },
    ]);
    unsubscribe();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  test('SidecarConversationStore routes conversation commands through sidecar rpc', async () => {
    const rpc = jest.fn(async ({ method, params }) => {
      if (method === 'list_chat_conversations') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-sidecar',
                revision_id: 'rev-1',
                title: 'Sidecar',
                last_message: 'hello',
                last_timestamp: '2026-05-22T00:00:00.000Z',
                entry_count: 1,
              },
            ],
          },
        };
      }
      if (method === 'get_chat_events') {
        return {
          success: true,
          data: {
            events: [
              {
                event_payload: {
                  eventId: 'evt-1',
                  type: 'user_message',
                  conversationRef: params.conversation_id,
                  revisionId: 'rev-1',
                  timestamp: '2026-05-22T00:00:00.000Z',
                  source: 'ui',
                  payload: { text: 'hello' },
                },
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new SidecarConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await expect(store.listMetadata()).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-sidecar',
        title: 'Sidecar',
      }),
    ]);
    await expect(store.loadForDisplay('conv-sidecar')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({ text: 'hello' }),
      ],
    });
    await store.rewriteConversation({
      conversationRef: 'conv-sidecar',
      baseRevisionId: 'rev-1',
      newRevisionId: 'rev-2',
      preservedEvents: [
        {
          eventId: 'evt-rewrite',
          type: 'user_message',
          conversationRef: 'conv-sidecar',
          revisionId: 'rev-2',
          timestamp: '2026-05-22T00:01:00.000Z',
          source: 'sdk',
          payload: { text: 'edited' },
        },
      ],
      removedEventIds: ['evt-1'],
      reason: 'edit_resend',
    });
    await store.deleteConversation('conv-sidecar');

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'replace_chat_conversation',
      params: expect.objectContaining({
        conversation_id: 'conv-sidecar',
        revision_id: 'rev-2',
        revision_updated_at: expect.any(String),
        events: [
          expect.objectContaining({
            event_type: 'user_message',
            message_index: 1,
            event_payload: expect.objectContaining({
              eventId: 'evt-rewrite',
            }),
          }),
        ],
      }),
    }));
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'delete_chat_conversation',
    }));
  });

  test('SidecarConversationStore keeps rewrite revision metadata for old or empty events', async () => {
    const revisions = new Map<string, { revision_id: string; updated_at: string }>();
    const eventsByConversation = new Map<string, unknown[]>();
    const rpc = jest.fn(async ({ method, params }) => {
      if (method === 'replace_chat_conversation') {
        revisions.set(params.conversation_id, {
          revision_id: params.revision_id,
          updated_at: params.revision_updated_at,
        });
        eventsByConversation.set(params.conversation_id, params.events);
        return { success: true, data: {} };
      }
      if (method === 'get_chat_conversation_revision') {
        return {
          success: true,
          data: revisions.get(params.conversation_id) ?? {},
        };
      }
      if (method === 'get_chat_events') {
        return {
          success: true,
          data: {
            events: eventsByConversation.get(params.conversation_id) ?? [],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new SidecarConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await store.rewriteConversation({
      conversationRef: 'conv-preserved',
      baseRevisionId: 'rev-old',
      newRevisionId: 'rev-new',
      preservedEvents: [
        {
          eventId: 'evt-old',
          type: 'user_message',
          conversationRef: 'conv-preserved',
          revisionId: 'rev-old',
          timestamp: '2026-05-22T00:01:00.000Z',
          source: 'sdk',
          payload: { text: 'preserved' },
        },
      ],
      removedEventIds: [],
      reason: 'retry',
    });
    await store.rewriteConversation({
      conversationRef: 'conv-empty',
      baseRevisionId: 'rev-empty-old',
      newRevisionId: 'rev-empty-new',
      preservedEvents: [],
      removedEventIds: ['evt-removed'],
      reason: 'edit_resend',
    });

    await expect(store.getRevision('conv-preserved')).resolves.toMatchObject({
      conversationRef: 'conv-preserved',
      revisionId: 'rev-new',
    });
    await expect(store.getRevision('conv-empty')).resolves.toMatchObject({
      conversationRef: 'conv-empty',
      revisionId: 'rev-empty-new',
    });
  });

  test('SidecarConversationStore merges host write params before sidecar rpc', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: {} }));
    const store = new SidecarConversationStore({
      userId: 'user-1',
      runtime: { rpc },
      eventWriteParams: ({ event, defaultParams }) => ({
        ...defaultParams,
        workspace_path: '/work/WindieOS',
        tool_name: event.payload.toolName,
        metadata: {
          model_id: 'model-1',
        },
        attachments: [
          { kind: 'image', ref: 'artifact-1' },
        ],
      }),
    });

    await store.appendEvent({
      eventId: 'evt-host-write',
      type: 'tool_output',
      conversationRef: 'conv-host-write',
      revisionId: 'rev-1',
      timestamp: '2026-05-22T00:00:00.000Z',
      source: 'sdk',
      payload: {
        text: 'tool output',
        toolName: 'read_file',
      },
    });

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'store_chat_event',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-host-write',
        event_type: 'tool_output',
        content: 'tool output',
        role: 'tool',
        record_kind: 'chat_event',
        workspace_path: '/work/WindieOS',
        tool_name: 'read_file',
        metadata: {
          model_id: 'model-1',
        },
        attachments: [
          { kind: 'image', ref: 'artifact-1' },
        ],
      }),
    }));
  });

  test('createWindieLocalRuntimeProvider can start the daemon through a launcher prefix', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-sdk-launcher-'));
    const discoveryFile = path.join(tempDir, 'sidecar-daemon.json');
    const daemonScript = path.join(tempDir, 'sidecar_daemon.py');
    const launcherScript = path.join(tempDir, 'python-in-env');
    await fsPromises.writeFile(daemonScript, 'print("daemon")\n', 'utf8');
    await fsPromises.writeFile(
      launcherScript,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "if (process.argv[2] !== 'sidecar' || process.argv[3] !== 'python') process.exit(2);",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43125', token: 'launcher-token' }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    await fsPromises.chmod(launcherScript, 0o755);
    mockFetch.mockResolvedValue(jsonResponse({ status: 'ok' }) as any);
    const provider = createWindieLocalRuntimeProvider({
      discoveryFile,
      daemonScript,
      pythonCommand: launcherScript,
      pythonArgs: ['sidecar', 'python'],
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(runtime).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43125/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('wakeUp registers local module tools and sends agent definition in handshake', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      registerPlugin: jest.fn(async () => ({ success: true })),
      registerMcp: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          {
            name: 'save_note',
            description: 'Save a local note.',
            execution_target: 'sidecar',
            schema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        ],
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      systemPrompt: 'You are concise.',
      workspacePath: '/tmp/project',
      tools: [
        moduleTool({
          name: 'save_note',
          description: 'Save a local note.',
          module: 'my_project.tools:save_note',
          schema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        }),
      ],
      skills: [{ id: 'code-review', type: 'extension_skill', content: 'Lead with risks.' }],
      mcps: [{ id: 'fs', command: 'node', args: ['server.js'] }],
      plugins: [{ path: '/tmp/plugin' }],
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const handshake = JSON.parse(socket.sent[0]);

    expect(localRuntime.registerModuleTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'save_note',
        module: 'my_project.tools:save_note',
      }),
      { workspacePath: '/tmp/project' },
    );
    expect(localRuntime.registerPlugin).toHaveBeenCalledWith({ path: '/tmp/plugin' });
    expect(localRuntime.registerMcp).toHaveBeenCalledWith({
      id: 'fs',
      command: 'node',
      args: ['server.js'],
    });
    expect(handshake).toMatchObject({
      type: 'handshake',
      user_id: 'dev-user',
      agent_definition: {
        version: 1,
        system_prompt: { mode: 'replace', content: 'You are concise.' },
        tools: {
          mode: 'client_only',
          client_manifest: {
            version: 1,
            tools: [expect.objectContaining({ name: 'save_note' })],
          },
        },
        runtime: {
          workspace_path: '/tmp/project',
        },
      },
    });
    expect(agent.listAgents()).toHaveLength(1);
  });

  test('wakeUp registers local tools without making raw session queries execute tools', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          {
            name: 'save_note',
            execution_target: 'sidecar',
            schema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        ],
      })),
      executeTool: jest.fn(async () => ({
        success: true,
        data: { llm_content: 'saved:hello' },
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'fake-e2e-agent',
      systemPrompt: 'Use local notes.',
      workspacePath: '/tmp/project',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'my_project.tools:save_note',
          schema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    await agent.ask('save this note', { conversationRef: 'conv-fake' });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-call',
        payload: {
          tool_name: 'save_note',
          parameters: { text: 'hello' },
          request_id: 'req-fake-save',
        },
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      agent_definition: {
        id: 'fake-e2e-agent',
      },
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'query',
      payload: {
        text: 'save this note',
        conversation_ref: 'conv-fake',
      },
    });
    expect(socket.sent).toHaveLength(2);
    expect(localRuntime.executeTool).not.toHaveBeenCalled();
  });

  test('agent.stream yields normalized async events until completion', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          {
            name: 'save_note',
            execution_target: 'sidecar',
            schema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        ],
      })),
      executeTool: jest.fn(async () => ({
        success: true,
        data: { llm_content: 'saved:hello' },
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'stream-agent',
      systemPrompt: 'Stream events.',
      workspacePath: '/tmp/project',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'my_project.tools:save_note',
          schema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        }),
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    const iterator = agent.stream('save this note', { conversationRef: 'conv-stream' });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'sending',
        conversationRef: 'conv-stream',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'thinking',
        conversationRef: 'conv-stream',
      },
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'query',
      payload: {
        text: 'save this note',
        conversation_ref: 'conv-stream',
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'llm-thought',
        conversation_ref: 'conv-stream',
        payload: { status: 'checking notes' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'thinking',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'reasoning_delta',
        text: 'checking notes',
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-response',
        conversation_ref: 'conv-stream',
        payload: { text: 'partial' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'streaming',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'assistant_delta',
        text: 'partial',
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-call',
        conversation_ref: 'conv-stream',
        payload: {
          tool_name: 'save_note',
          parameters: { text: 'hello' },
          request_id: 'req-stream-save',
        },
      }),
    });
    const toolEvent = await iterator.next();
    expect(toolEvent).toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'tool_call',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'tool_calls',
        calls: [
          expect.objectContaining({
            toolName: 'save_note',
            args: { text: 'hello' },
            requestId: 'req-stream-save',
          }),
        ],
      },
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: 'tool-result',
      payload: {
        request_id: 'req-stream-save',
        success: true,
        data: { output: 'saved:hello' },
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'tool_output',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'tool_outputs',
        outputs: [
          expect.objectContaining({
            toolName: 'save_note',
            success: true,
            result: { output: 'saved:hello' },
          }),
        ],
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-stream',
        payload: { final_response: 'done' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'assistant_message',
        text: 'done',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'idle',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test('chat.stream exposes bundled tools as plural calls and outputs', async () => {
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
      executeTool: jest.fn(async (call) => ({
        success: true,
        data: { output: `${call.toolName}:${String(call.args.path ?? '')}` },
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'bundle-stream-agent',
      builtins: ['filesystem'],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const chat = agent.chat({ conversationRef: 'conv-bundle-stream' });
    const iterator = chat.stream('read files');

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'sending' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'thinking' },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-bundle',
        conversation_ref: 'conv-bundle-stream',
        payload: {
          bundle_id: 'bundle-read',
          tools: [
            {
              name: 'read_file',
              args: { path: 'README.md' },
              metadata: {
                model_facing_tool_call: {
                  id: 'call-readme',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"README.md"}',
                  },
                },
              },
            },
            {
              name: 'read_file',
              args: { path: 'package.json' },
              metadata: {
                model_facing_tool_call: {
                  id: 'call-package',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"package.json"}',
                  },
                },
              },
            },
          ],
        },
      }),
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'tool_call' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'tool_calls',
        calls: [
          expect.objectContaining({
            toolName: 'read_file',
            args: { path: 'README.md' },
            toolCallId: 'call-readme',
            index: 0,
          }),
          expect.objectContaining({
            toolName: 'read_file',
            args: { path: 'package.json' },
            toolCallId: 'call-package',
            index: 1,
          }),
        ],
      },
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-read',
        status: 'success',
        step_results: [
          expect.objectContaining({ tool: 'read_file', status: 'ok' }),
          expect.objectContaining({ tool: 'read_file', status: 'ok' }),
        ],
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'tool_output' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'tool_outputs',
        outputs: [
          expect.objectContaining({
            toolName: 'read_file',
            result: { output: 'read_file:README.md' },
            success: true,
            toolCallId: 'call-readme',
            index: 0,
          }),
          expect.objectContaining({
            toolName: 'read_file',
            result: { output: 'read_file:package.json' },
            success: true,
            toolCallId: 'call-package',
            index: 1,
          }),
        ],
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-bundle-stream',
        payload: { final_response: 'bundle done' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'assistant_message', text: 'bundle done' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'idle' },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test('chat.stream extracts large binary tool-output fields into attachments without changing backend transport', async () => {
    const screenshotPayload = 'a'.repeat(600);
    const nestedImagePayload = 'b'.repeat(650);
    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
      executeTool: jest.fn(async () => ({
        success: true,
        data: {
          output: 'captured',
          screenshot: screenshotPayload,
          screenshot_content_type: 'image/jpeg',
          nested: {
            image_base64: nestedImagePayload,
            content_type: 'image/png',
          },
        },
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      sidecar: localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'tool-output-attachments-agent',
      builtins: ['filesystem'],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const chat = agent.chat({ conversationRef: 'conv-tool-output-attachments' });
    const iterator = chat.stream('capture screen');

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'sending' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'thinking' },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-call',
        conversation_ref: 'conv-tool-output-attachments',
        payload: {
          tool_name: 'screenshot',
          parameters: {},
          request_id: 'req-capture',
        },
      }),
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'tool_call' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'tool_calls' },
    });

    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: 'tool-result',
      payload: {
        request_id: 'req-capture',
        success: true,
        data: {
          output: 'captured',
          screenshot: screenshotPayload,
          screenshot_content_type: 'image/jpeg',
          nested: {
            image_base64: nestedImagePayload,
            content_type: 'image/png',
          },
        },
      },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'tool_output' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'tool_outputs',
        outputs: [
          {
            toolName: 'screenshot',
            success: true,
            result: {
              output: 'captured',
              screenshot_content_type: 'image/jpeg',
              nested: {
                content_type: 'image/png',
              },
            },
            attachments: [
              {
                kind: 'image',
                fieldPath: 'screenshot',
                key: 'screenshot',
                contentType: 'image/jpeg',
                value: screenshotPayload,
                charLength: 600,
              },
              {
                kind: 'image',
                fieldPath: 'nested.image_base64',
                key: 'image_base64',
                contentType: 'image/png',
                value: nestedImagePayload,
                charLength: 650,
              },
            ],
            requestId: 'req-capture',
            toolCallId: null,
            index: 0,
          },
        ],
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-tool-output-attachments',
        payload: { final_response: 'done' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'assistant_message', text: 'done' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'idle' },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test('agent.stream surfaces backend errors with conversation routing fields', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({ agentId: 'stream-error-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    const iterator = agent.stream('bad payload', { conversationRef: 'conv-stream-error' });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'sending',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'thinking',
      },
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'error',
        id: null,
        conversation_ref: 'conv-stream-error',
        payload: { message: 'Invalid message format' },
      }),
    });

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'state',
        state: 'error',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'error',
        message: 'Invalid message format',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test('agent exposes raw backend events only through an explicit debug listener', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'raw-debug-agent',
      systemPrompt: 'Debug raw events.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const rawEvents: unknown[] = [];
    const unsubscribe = agent.subscribeRawBackendEvents((event) => {
      rawEvents.push(event);
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-response',
        conversation_ref: 'conv-debug',
        turn_ref: 'turn-debug',
        payload: { text: 'debug chunk' },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'not-a-backend-event',
        payload: { ignored: true },
      }),
    });
    unsubscribe();
    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-debug',
        turn_ref: 'turn-debug',
        payload: { final_response: 'done' },
      }),
    });

    expect(rawEvents).toEqual([
      expect.objectContaining({
        type: 'streaming-response',
        conversation_ref: 'conv-debug',
        payload: { text: 'debug chunk' },
      }),
    ]);
  });

  test('agent.conversation exposes the SDK conversation runtime over the agent session', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'conversation-runtime-agent',
      systemPrompt: 'Use the runtime.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    const conversation = agent.conversation({ conversationRef: 'conv-runtime-public' });
    await conversation.send({ text: 'hello runtime', turnRef: 'turn-runtime-public' });
    socket.emit('message', {
      data: JSON.stringify({
        id: 'backend-chunk-1',
        type: 'streaming-response',
        conversation_ref: 'conv-runtime-public',
        turn_ref: 'turn-runtime-public',
        payload: { text: 'partial' },
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    await conversation.rehydrate();

    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'turn-runtime-public',
      type: 'query',
      payload: {
        text: 'hello runtime',
        conversation_ref: 'conv-runtime-public',
      },
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: 'rehydrate-conversation',
      payload: {
        conversation_ref: 'conv-runtime-public',
        rehydrate_mode: 'replace',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'hello runtime',
          }),
        ],
      },
    });
    await expect(conversation.load()).resolves.toMatchObject({
      state: {
        phase: 'streaming',
      },
      display: {
        messages: [
          expect.objectContaining({
            sender: 'user',
            text: 'hello runtime',
          }),
        ],
      },
    });
    await expect(agent.listConversations()).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-runtime-public',
        lastMessage: 'hello runtime',
      }),
    ]);
    await expect(agent.loadConversation({
      conversationRef: 'conv-runtime-public',
    })).resolves.toMatchObject({
      display: {
        messages: [
          expect.objectContaining({
            text: 'hello runtime',
          }),
        ],
      },
    });
    await expect(agent.loadConversation('conv-runtime-public')).resolves.toMatchObject({
      display: {
        messages: [
          expect.objectContaining({
            text: 'hello runtime',
          }),
        ],
      },
    });
    await expect(agent.searchConversations({
      query: 'hello',
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-runtime-public',
        lastMessage: 'hello runtime',
      }),
    ]);
    await agent.deleteConversation('conv-runtime-public');
    await expect(agent.listConversations()).resolves.toEqual([]);
  });

  test('agent.chat exposes a UI-facing session facade', async () => {
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'chat-session-agent',
      systemPrompt: 'Use chat sessions.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const chat = agent.chat({ conversationRef: 'conv-chat-session' });
    const events: unknown[] = [];
    const unsubscribe = chat.onEvent((event) => events.push(event));

    const iterator = chat.stream('hello chat');
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'state',
        state: 'sending',
        conversationRef: 'conv-chat-session',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'state',
        state: 'thinking',
        conversationRef: 'conv-chat-session',
      },
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-chat-session',
        payload: { final_response: 'done' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'assistant_message',
        text: 'done',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'state',
        state: 'idle',
      },
    });

    await expect(chat.display()).resolves.toMatchObject({
      conversationRef: 'conv-chat-session',
      messages: [
        expect.objectContaining({ sender: 'user', text: 'hello chat' }),
      ],
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'user_message' }),
      expect.objectContaining({ type: 'turn_completed' }),
    ]));
    unsubscribe();
    chat.close();
  });
});
