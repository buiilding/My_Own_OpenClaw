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
    this.closed = true;
    this.emit('close', { code: 1000, reason: 'closed', wasClean: true });
  }

  emit(event: string, payload: unknown): void {
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

    const payload: SdkPromptPreviewRequest = {
      user_query_raw: 'open file',
      agent_definition: {
        id: 'custom-agent',
        system_prompt: { mode: 'replace', content: 'Custom prompt.' },
      },
      messages: [
        {
          role: 'user',
          content: '<user_query>open file</user_query>',
        },
      ],
    };

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
    });

    const response = await client.promptPreview(payload);

    expect(response.prompt_token_count).toBe(42);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/prompt-preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
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

    const payload: SdkQueryPlanRequest = {
      user_query_raw: 'open file',
      conversation_ref: 'conv-sdk',
      agent_definition: {
        id: 'tui-agent',
        system_prompt: { mode: 'replace', content: 'TUI prompt.' },
      },
      messages: [],
    };

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
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/query-plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
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

  test('WindieClient can register hosted install auth and attach bearer headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'registered-user',
      install_id: 'install-1',
      install_token: 'install-token-1',
    }));
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      installAuth: { autoRegister: true },
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
      payload: {
        system_prompt: {
          mode: 'replace',
          content: 'New prompt',
        },
      },
    });
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toMatchObject({
      type: 'update-settings',
      payload: {
        tools: {
          mode: 'replace_client_manifest',
        },
      },
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
      payload: {
        source: 'voice',
      },
      user_id: 'transport-user',
    });
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
          { name: 'screenshot', schema: { type: 'object' } },
        ],
      })),
    };
    const client = new WindieClient({
      backendUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
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
            ],
          },
        },
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0]).agent_definition.tools.client_manifest.tools)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'screenshot' })]));
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
    await store.deleteConversation('conv-sidecar');

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'delete_chat_conversation',
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
        type: 'start',
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
        type: 'streaming-response',
        conversation_ref: 'conv-stream',
        payload: { text: 'partial' },
      }),
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: 'text',
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
        type: 'tool_call',
        toolName: 'save_note',
      },
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      type: 'tool-result',
      payload: {
        request_id: 'req-stream-save',
        success: true,
        data: { llm_content: 'saved:hello' },
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
        type: 'complete',
        finalResponse: 'done',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  test('agent.stream surfaces backend errors without conversation routing fields', async () => {
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
      value: { type: 'start' },
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'error',
        id: null,
        payload: { message: 'Invalid message format' },
      }),
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
        type: 'start',
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
        type: 'complete',
        finalResponse: 'done',
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
