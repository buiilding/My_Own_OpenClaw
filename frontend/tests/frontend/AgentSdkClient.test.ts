/**
 * Covers Agent SDK client behavior in the frontend test suite.
 */

import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  buildAgentDefinition,
  isDefaultAgentDefinition,
  createAgentBackendSocket,
  createAgentRuntimeTransport,
  createAgentSession,
  createConversationEvent,
  createAgentLocalRuntimeProvider,
  AgentLocalRuntimeHttpClient,
  InMemoryConversationStore,
  LocalRuntimeConversationStore,
  moduleTool,
  Agent,
  AgentClient as AgentClientClass,
  AgentHostedBackendClient,
  agentBuiltins,
  type SdkPromptPreviewRequest,
  type SdkQueryPlanRequest,
  type AgentLocalRuntimeClient,
} from '../../packages/windie-sdk-js/src';

const AgentClient = function AgentClient(
  options: ConstructorParameters<typeof AgentClientClass>[0] = {},
) {
  return new AgentClientClass({
    memory: false,
    persistence: false,
    ...options,
  });
} as unknown as typeof AgentClientClass;

async function waitForExpect(assertion: () => void | Promise<void>, attempts = 25): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

function sentMessages(socket: FakeWebSocket): Array<Record<string, any>> {
  return socket.sent.map(frame => JSON.parse(frame));
}

function sentMessageOfType(socket: FakeWebSocket, type: string): Record<string, any> | undefined {
  return sentMessages(socket).find(message => message.type === type);
}

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

describe('Agent SDK client behavior', () => {
  const mockFetch = jest.fn<typeof fetch>();

  beforeEach(() => {
    FakeWebSocket.reset();
    mockFetch.mockReset();
  });

  test('transport constructors use generic agent SDK dependency diagnostics', () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      expect(() => new AgentHostedBackendClient({
        httpBaseUrl: 'https://backend.example.test',
      })).toThrow('Agent SDK HTTP client requires a fetch implementation');

      expect(() => new AgentLocalRuntimeHttpClient({
        baseUrl: 'http://127.0.0.1:8765',
        token: 'test-token',
      })).toThrow('Agent SDK local runtime client requires a fetch implementation');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        value: originalFetch,
        configurable: true,
        writable: true,
      });
    }

    expect(() => createAgentBackendSocket({
      WebSocketImpl: undefined as any,
      wsUrl: 'ws://backend.test/ws',
    })).toThrow('Agent SDK backend socket requires WebSocketImpl');

    expect(() => createAgentBackendSocket({
      WebSocketImpl: FakeWebSocket as any,
      wsUrl: '',
    })).toThrow('Agent SDK backend socket requires wsUrl');
  });

  test('builds data-only agent definitions with capability metadata', () => {
    const definition = buildAgentDefinition({
      id: 'custom-agent',
      name: 'Custom Agent',
      systemPrompt: 'Follow the desktop contract.',
      clientToolManifest: {
        version: 1,
        tools: [{ name: 'screenshot', schema: { type: 'object' } }],
      },
      availableTools: ['screenshot', 'screenshot', ' '],
      enabledRemoteTools: ['web_search'],
      disabledTools: ['shell'],
      disabledCapabilities: ['vision'],
      customInstructions: 'Use local context.',
      promptLayers: [
        { type: 'skill', priority: '40', content: 'Layer one.' },
        { id: 'empty-layer', content: ' ' },
      ],
      skills: [{ id: 'skill-1', type: 'skill', priority: 20, content: 'Skill prompt.' }],
      agentsMd: [{ id: 'repo', type: 'agents_md', priority: 10, content: 'Repo rules.' }],
      plugins: [{
        id: 'plugin-1',
        prompt_layers: [{ id: 'plugin-layer', type: 'plugin', content: 'Plugin prompt.' }],
      }],
      workspacePath: '/tmp/project-alpha',
      operatingSystem: 'macOS',
    });

    expect(definition).toMatchObject({
      version: 1,
      id: 'custom-agent',
      name: 'Custom Agent',
      mode: 'default_plus_overrides',
      system_prompt: {
        mode: 'replace',
        content: 'Follow the desktop contract.',
      },
      tools: {
        mode: 'explicit',
        available_tools: ['screenshot'],
        enabled_remote_tools: ['web_search'],
        disabled_tools: ['shell'],
        disabled_capabilities: ['vision'],
        client_manifest: {
          version: 1,
          tools: [expect.objectContaining({ name: 'screenshot' })],
        },
      },
      prompt_layers: [
        {
          id: 'custom-instructions',
          type: 'custom_instructions',
          priority: 60,
          content: 'Use local context.',
        },
        {
          id: 'client-layer-1',
          type: 'skill',
          priority: 40,
          content: 'Layer one.',
        },
      ],
      agents_md: [expect.objectContaining({ id: 'repo' })],
      skills: [expect.objectContaining({ id: 'skill-1' })],
      runtime: {
        operating_system: 'macOS',
        workspace_path: '/tmp/project-alpha',
      },
      metadata: {
        client_capability_revision: expect.stringMatching(/^cap_/),
        client_capability: expect.objectContaining({
          tool_count: 1,
          prompt_layer_count: 5,
          skill_count: 1,
          plugin_count: 1,
        }),
      },
    });
    expect(definition).not.toHaveProperty('contributionsDir');
  });

  test('buildAgentDefinition keeps tool-policy-only definitions non-default', () => {
    expect(buildAgentDefinition({
      includeToolManifest: false,
      disabledTools: ['browser'],
    })).toMatchObject({
      mode: 'default_plus_overrides',
      tools: expect.objectContaining({
        disabled_tools: ['browser'],
      }),
    });

    expect(buildAgentDefinition({
      includeToolManifest: false,
      availableTools: ['web_search'],
      enabledRemoteTools: ['web_search'],
    })).toMatchObject({
      mode: 'default_plus_overrides',
      tools: expect.objectContaining({
        mode: 'explicit',
        available_tools: ['web_search'],
        enabled_remote_tools: ['web_search'],
      }),
    });
  });

  test('buildAgentDefinition uses generic display defaults', () => {
    const definition = buildAgentDefinition();

    expect(definition).toMatchObject({
      id: 'agent-default',
      name: 'Agent',
      mode: 'default',
    });
    expect(isDefaultAgentDefinition(definition)).toBe(true);
    expect(isDefaultAgentDefinition({
      ...definition,
      mode: 'windie_default',
    })).toBe(false);
    expect(isDefaultAgentDefinition({
      ...definition,
      mode: 'default_plus_overrides',
    })).toBe(false);
    expect(isDefaultAgentDefinition(null)).toBe(false);
  });

  test('buildAgentDefinition rejects removed AGENTS.md input aliases', () => {
    expect(() => buildAgentDefinition({
      // @ts-expect-error snake_case agents_md is the backend wire field, not the SDK builder input
      agents_md: [{ id: 'repo', type: 'agents_md', priority: 10, content: 'Repo rules.' }],
    })).toThrow('buildAgentDefinition accepts agentsMd; snake_case agents_md input is not supported.');
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

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test/',
      fetchImpl: mockFetch,
    });

    const response = await client.systemPrompt({
      userId: 'dev-user',
      interactionMode: 'agent',
    });

    expect(response.system_prompt).toBe('prompt');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://backend.example.test/api/sdk/system-prompt?user_id=dev-user&interaction_mode=agent',
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
        legacy_context: { should_not_reach_backend: true },
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

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
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
      'https://backend.example.test/api/sdk/prompt-preview',
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

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
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
      'https://backend.example.test/api/sdk/query-plan',
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

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
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
      'https://backend.example.test/api/sdk/ocr/inspect',
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
      'https://backend.example.test/api/sdk/vision/locate-all',
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
      'https://backend.example.test/api/semantic/title',
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
      url: 'https://backend.example.test/api/artifacts/shot.png',
    }));

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
    });

    const response = await client.artifacts.upload(
      new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' }),
    );

    expect(response.artifact_id).toBe('shot.png');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://backend.example.test/api/artifacts/',
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

    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
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
      'https://backend.example.test/api/artifacts/artifact-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://backend.example.test/api/semantic/title',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('does not expose the old direct websocket agent authoring surface', () => {
    const client = new AgentHostedBackendClient({
      httpBaseUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
    });

    expect((client as any).agent).toBeUndefined();
    expect((client as any).connectAgent).toBeUndefined();
    expect((client as any).traceQuery).toBeUndefined();
  });

  test('AgentClient lists backend-owned models from the configured backend', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      config: { model_id: 'gpt-5.4' },
      models: [{ id: 'gpt-5.4' }],
    }));
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
    });

    const response = await client.listModels({ userId: 'dev-user' });

    expect(response.models).toEqual([{ id: 'gpt-5.4' }]);
    const [url, init] = mockFetch.mock.calls[0];
    if (String(url) !== 'https://backend.example.test/api/sdk/models?user_id=dev-user') {
      throw new Error(`unexpected models URL: ${String(url)}`);
    }
    if (init?.method !== 'GET') {
      throw new Error(`unexpected models method: ${String(init?.method)}`);
    }
  });

  test('AgentClient auto-registers hosted install auth and attaches bearer headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'registered-user',
      install_id: 'install-1',
      install_token: 'install-token-1',
    }));
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      installAuth: {
        autoRegister: true,
      },
    });

    const wakePromise = client.wakeUp({ agentId: 'auth-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await wakePromise;

    expect(mockFetch).toHaveBeenCalledWith(
      'https://backend.example.test/api/install/register',
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
      agent_definition: expect.objectContaining({
        name: 'Agent',
      }),
    });
  });

  test('AgentClient does not infer install registration from the hosted endpoint', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
    });

    const wakePromise = client.wakeUp({ agentId: 'auth-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await wakePromise;

    expect(mockFetch).not.toHaveBeenCalled();
    expect(socket.options?.headers).toBeUndefined();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'local-sdk-user',
    });
  });

  test('AgentClient auto-registers hosted install auth with an explicit install user id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'registered-user',
      install_id: 'install-1',
      install_token: 'install-token-1',
    }));
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      installAuth: {
        autoRegister: true,
      },
    });

    const wakePromise = client.wakeUp({
      agentId: 'auth-agent',
      installAuth: {
        autoRegister: true,
        userId: 'peter',
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await wakePromise;

    expect(mockFetch).toHaveBeenCalledWith(
      'https://backend.example.test/api/install/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(socket.options).toMatchObject({
      headers: {
        Authorization: 'Bearer install-token-1',
      },
    });
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'peter',
    });
  });

  test('AgentClient reports generic install registration failures', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(
      { error: 'registration unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    ));
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      installAuth: {
        autoRegister: true,
      },
    });

    await expect(client.wakeUp({ agentId: 'auth-agent' })).rejects.toThrow(
      'Install registration failed (503 Service Unavailable): {"error":"registration unavailable"}',
    );
  });

  test('AgentClient reports generic invalid install registration payloads', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      user_id: 'registered-user',
      install_id: 'install-1',
      install_token: '',
    }));
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      installAuth: {
        autoRegister: true,
      },
    });

    await expect(client.wakeUp({ agentId: 'auth-agent' })).rejects.toThrow(
      'Install registration returned an invalid auth payload',
    );
  });

  test('AgentClient source keeps install registration policy explicit', async () => {
    const sdkSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/AgentClient.ts'),
      'utf8',
    );
    const sdkCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/AgentClient.js'),
      'utf8',
    );

    expect(sdkSource).toContain('configured.autoRegister === true');
    expect(sdkCjsSource).toContain('configured.autoRegister === true');
    expect(sdkSource).not.toContain('isHostedDefaultBackendUrl');
    expect(sdkCjsSource).not.toContain('isHostedDefaultBackendUrl');
  });

  test('AgentClient requires an explicit backend URL for hosted runtime calls', async () => {
    const previousAgentBackendUrl = process.env.AGENT_BACKEND_URL;
    const previousBackendUrl = process.env.WINDIE_BACKEND_URL;
    delete process.env.AGENT_BACKEND_URL;
    delete process.env.WINDIE_BACKEND_URL;
    try {
      const client = new AgentClient({
        fetchImpl: mockFetch,
        WebSocketImpl: FakeWebSocket as any,
      });

      await expect(client.wakeUp({ agentId: 'missing-backend-agent' })).rejects.toThrow(
        'Agent SDK backend URL is required. Pass backendUrl, httpBaseUrl, or set AGENT_BACKEND_URL',
      );
      await expect(client.listModels()).rejects.toThrow(
        'Agent SDK backend URL is required. Pass backendUrl, httpBaseUrl, or set AGENT_BACKEND_URL',
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(FakeWebSocket.instances).toHaveLength(0);
    } finally {
      if (previousAgentBackendUrl === undefined) {
        delete process.env.AGENT_BACKEND_URL;
      } else {
        process.env.AGENT_BACKEND_URL = previousAgentBackendUrl;
      }
      if (previousBackendUrl === undefined) {
        delete process.env.WINDIE_BACKEND_URL;
      } else {
        process.env.WINDIE_BACKEND_URL = previousBackendUrl;
      }
    }
  });

  test('AgentClient source keeps hosted endpoint selection caller supplied', async () => {
    const sdkSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/AgentClient.ts'),
      'utf8',
    );
    const sdkCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/AgentClient.js'),
      'utf8',
    );
    const runtimeEnvSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/RuntimeEnv.ts'),
      'utf8',
    );
    const runtimeEnvCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/RuntimeEnv.js'),
      'utf8',
    );

    expect(runtimeEnvSource).toContain('Agent SDK backend URL is required');
    expect(runtimeEnvCjsSource).toContain('Agent SDK backend URL is required');
    expect(sdkSource).toContain('AGENT_BACKEND_URL_REQUIRED_MESSAGE');
    expect(sdkCjsSource).toContain('AGENT_BACKEND_URL_REQUIRED_MESSAGE');
    expect(sdkSource).not.toContain(['https://api', 'windieos.com'].join('.'));
    expect(sdkCjsSource).not.toContain(['https://api', 'windieos.com'].join('.'));
  });

  test('Agent SDK client tests use neutral hosted endpoint fixtures', async () => {
    const testSource = await fsPromises.readFile(__filename, 'utf8');
    const retiredFixtureUrls = [
      ['https://api', 'windieos.com'].join('.'),
      ['https://sdk', 'windie.test'].join('.'),
      ['https://primary', 'windie.test'].join('.'),
      ['https://fallback', 'windie.test'].join('.'),
      ['https://legacy', 'windie.test'].join('.'),
    ];

    for (const fixtureUrl of retiredFixtureUrls) {
      expect(testSource).not.toContain(fixtureUrl);
    }
    expect(testSource).toContain('https://backend.example.test');
    expect(testSource).toContain('https://sdk.example.test');
    expect(testSource).toContain('https://primary.example.test');
    expect(testSource).toContain('https://fallback.example.test');
    expect(testSource).toContain('https://legacy.example.test');
  });

  test('AgentClient source uses localRuntime for explicit local runtime clients', async () => {
    const sdkSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/AgentClient.ts'),
      'utf8',
    );
    const sdkCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/AgentClient.js'),
      'utf8',
    );
    const localRuntimeSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/LocalRuntime.ts'),
      'utf8',
    );
    const localRuntimeCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/LocalRuntime.js'),
      'utf8',
    );
    const runtimeEnvSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/src/runtime/RuntimeEnv.ts'),
      'utf8',
    );
    const runtimeEnvCjsSource = await fsPromises.readFile(
      path.join(__dirname, '../../packages/windie-sdk-js/cjs/runtime/RuntimeEnv.js'),
      'utf8',
    );

    expect(sdkSource).toContain('localRuntime?: AgentLocalRuntimeClient');
    expect(sdkSource).toContain('this.defaultOptions.localRuntime');
    expect(sdkSource).toContain('autoLocalRuntime?: AgentAutoLocalRuntimeOptions');
    expect(sdkSource).toContain('this.defaultOptions.autoLocalRuntime');
    expect(sdkSource).not.toContain('sidecar?: AgentLocalRuntimeClient');
    expect(sdkSource).not.toContain('this.defaultOptions.sidecar');
    expect(sdkSource).not.toContain('autoSidecar?: AgentAutoSidecarOptions');
    expect(sdkSource).not.toContain('this.defaultOptions.autoSidecar');
    expect(sdkCjsSource).toContain('this.defaultOptions.autoLocalRuntime');
    expect(sdkCjsSource).not.toContain('this.defaultOptions.autoSidecar');
    expect(localRuntimeSource).toContain('AgentAutoLocalRuntimeOptions');
    expect(localRuntimeSource).not.toContain('AgentAutoSidecarOptions');
    expect(localRuntimeSource).toContain('AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT');
    expect(localRuntimeSource).not.toContain('WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT');
    expect(localRuntimeSource).not.toContain('WINDIE_SIDECAR_DAEMON_SCRIPT');
    expect(runtimeEnvCjsSource).toContain('autoLocalRuntime.daemonScript');
    expect(localRuntimeCjsSource).not.toContain('autoSidecar.daemonScript');
    expect(localRuntimeCjsSource).toContain('AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT');
    expect(localRuntimeCjsSource).not.toContain('WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT');
    expect(localRuntimeCjsSource).not.toContain('WINDIE_SIDECAR_DAEMON_SCRIPT');
    expect(runtimeEnvSource).toContain('WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT');
    expect(runtimeEnvCjsSource).toContain('WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT');
  });

  test('AgentClient uses generic env backend URL and install token when constructor options omit them', async () => {
    const previousAgentBackendUrl = process.env.AGENT_BACKEND_URL;
    const previousAgentInstallToken = process.env.AGENT_INSTALL_TOKEN;
    const previousBackendUrl = process.env.WINDIE_BACKEND_URL;
    const previousApiKey = process.env.WINDIE_API_KEY;
    process.env.AGENT_BACKEND_URL = 'https://env.agent.test';
    process.env.AGENT_INSTALL_TOKEN = 'env-install-token';
    process.env.WINDIE_BACKEND_URL = 'https://legacy.example.test';
    process.env.WINDIE_API_KEY = 'legacy-install-token';
    try {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        user_id: 'env-user',
        install_id: 'env-install',
      }));
      const client = new AgentClient({
        fetchImpl: mockFetch,
        WebSocketImpl: FakeWebSocket as any,
      });

      const wakePromise = client.wakeUp({ agentId: 'env-agent' });
      await new Promise(resolve => setTimeout(resolve, 0));
      const socket = FakeWebSocket.instances[0];
      expect(socket.url).toBe('wss://env.agent.test/ws');
      expect(socket.options).toMatchObject({
        headers: {
          Authorization: 'Bearer env-install-token',
        },
      });
      socket.emit('open', {});
      await wakePromise;

      expect(mockFetch).toHaveBeenCalledWith(
        'https://env.agent.test/api/install/me',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.parse(socket.sent[0])).toMatchObject({
        type: 'handshake',
        user_id: 'env-user',
      });
    } finally {
      if (previousAgentBackendUrl === undefined) {
        delete process.env.AGENT_BACKEND_URL;
      } else {
        process.env.AGENT_BACKEND_URL = previousAgentBackendUrl;
      }
      if (previousAgentInstallToken === undefined) {
        delete process.env.AGENT_INSTALL_TOKEN;
      } else {
        process.env.AGENT_INSTALL_TOKEN = previousAgentInstallToken;
      }
      if (previousBackendUrl === undefined) {
        delete process.env.WINDIE_BACKEND_URL;
      } else {
        process.env.WINDIE_BACKEND_URL = previousBackendUrl;
      }
      if (previousApiKey === undefined) {
        delete process.env.WINDIE_API_KEY;
      } else {
        process.env.WINDIE_API_KEY = previousApiKey;
      }
    }
  });

  test('wakeUp enables memory and persistence by default and resolves the local runtime', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async () => ({ success: true, data: {} })),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
    });

    const wakePromise = client.wakeUp({ agentId: 'default-local-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    expect(ensureLocalRuntime).toHaveBeenCalledWith({
      wakeUp: expect.objectContaining({ agentId: 'default-local-agent' }),
      needsLocalRuntime: true,
    });
  });

  test('wakeUp skips local runtime when memory, persistence, and local tools are disabled', async () => {
    const ensureLocalRuntime = jest.fn();
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'stateless-agent',
      builtins: 'none',
      memory: false,
      persistence: false,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    expect(ensureLocalRuntime).not.toHaveBeenCalled();
  });

  test('wakeUp still resolves local runtime for builtins none when memory and persistence stay enabled', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async () => ({ success: true, data: {} })),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'builtin-none-memory-agent',
      builtins: 'none',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    await wakePromise;

    expect(ensureLocalRuntime).toHaveBeenCalledWith({
      wakeUp: expect.objectContaining({
        agentId: 'builtin-none-memory-agent',
        builtins: 'none',
      }),
      needsLocalRuntime: true,
    });
  });

  test('localRuntime starts the SDK local runtime without creating an agent session', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
      executeTool: jest.fn(async () => ({ success: true, data: { connected: true } })),
      rpc: jest.fn(async () => ({ success: true, data: {} })),
      shutdown: jest.fn(async () => undefined),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
      memory: false,
      persistence: false,
    });

    await expect(client.localRuntime({ reason: 'browser-control' })).resolves.toBe(localRuntime);

    expect(ensureLocalRuntime).toHaveBeenCalledWith({
      wakeUp: {},
      needsLocalRuntime: true,
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test('executeTool and rpc use standalone SDK local runtime execution', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      executeTool: jest.fn(async () => ({ success: true, data: { output: 'ran' } })),
      rpc: jest.fn(async ({ method }) => ({ success: true, data: { method } })),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
      memory: false,
      persistence: false,
    });

    await expect(client.executeTool({
      toolName: 'browser',
      args: { action: 'connect' },
    })).resolves.toEqual({ success: true, data: { output: 'ran' } });
    await expect(client.rpc({
      method: 'browser.status',
      params: { detailed: true },
    })).resolves.toEqual({ success: true, data: { method: 'browser.status' } });

    expect(localRuntime.executeTool).toHaveBeenCalledWith({
      toolName: 'browser',
      args: { action: 'connect' },
    });
    expect(localRuntime.rpc).toHaveBeenCalledWith({
      method: 'browser.status',
      params: { detailed: true },
    });
    expect(ensureLocalRuntime).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test('wakeUp reuses a standalone SDK local runtime instead of resolving another one', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
      })),
      rpc: jest.fn(async () => ({ success: true, data: {} })),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      ensureLocalRuntime,
      memory: false,
      persistence: false,
    });

    await client.localRuntime({ reason: 'preconversation-browser' });
    const wakePromise = client.wakeUp({
      agentId: 'tool-agent',
      memory: false,
      persistence: false,
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

    expect(ensureLocalRuntime).toHaveBeenCalledTimes(1);
    expect(localRuntime.registerModuleTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'save_note' }),
      expect.objectContaining({ workspacePath: expect.any(String) }),
    );
  });

  test('standalone localRuntime fails closed when auto-start is disabled and no runtime is configured', async () => {
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      autoStartLocalRuntime: false,
      memory: false,
      persistence: false,
    });

    await expect(client.localRuntime({ reason: 'browser-control' })).rejects.toThrow(
      'Agent SDK local runtime is required for browser-control, but autoStartLocalRuntime is false.',
    );
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test('agent.chat uses local-runtime persistence by default', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async () => ({ success: true, data: {} })),
    };
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'durable-chat-agent',
      memory: false,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;

    await agent.chat({ conversationRef: 'conv-durable-chat' }).send('persist me');

    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.append_event',
      params: expect.objectContaining({
        user_id: 'dev-user',
        conversation_id: 'conv-durable-chat',
        event_type: 'user_message',
        content: 'persist me',
        producer: 'sdk',
        record_kind: 'chat_event',
      }),
    }));
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'query',
      payload: {
        text: 'persist me',
        conversation_ref: 'conv-durable-chat',
      },
    });
  });

  test('agent.chat searches memory before sending and stores completed-turn memory by default', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        embedding: [0.1, 0.2, 0.3],
        provider_id: 'test-provider',
        model_id: 'test-model',
        model_name: 'default',
        dimension: 3,
        embedding_space_version: 'test-space',
      }))
      .mockResolvedValueOnce(jsonResponse({
        embedding: [0.4, 0.5, 0.6],
        provider_id: 'test-provider',
        model_id: 'test-model',
        model_name: 'default',
        dimension: 3,
        embedding_space_version: 'test-space',
      }));
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async ({ method }) => {
        if (method === 'search_memory_by_embedding') {
          return {
            success: true,
            data: {
              memories: {
                episodic: ['remember this'],
                semantic: ['stable fact'],
              },
            },
          };
        }
        return { success: true, data: {} };
      }),
    };
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({ agentId: 'memory-chat-agent' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const chat = agent.chat({ conversationRef: 'conv-memory-chat' });
    const turn = await chat.send('use memory');

    const rpc = localRuntime.rpc as jest.Mock;
    const searchCallIndex = rpc.mock.calls.findIndex(([call]) => call.method === 'search_memory_by_embedding');
    const queryMessage = sentMessageOfType(socket, 'query');
    expect(searchCallIndex).toBeGreaterThanOrEqual(0);
    expect(queryMessage).toMatchObject({
      type: 'query',
      payload: {
        text: 'use memory',
        conversation_ref: 'conv-memory-chat',
        content: expect.stringContaining('- remember this'),
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: 'conv-memory-chat',
        turn_ref: turn.turnRef,
        event_id: `${turn.turnRef}-evt-000001-streaming-complete`,
        sequence: 1,
        payload: { final_response: 'stored answer' },
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const storeMemoryIndex = rpc.mock.calls.findIndex(([call]) => call.method === 'store_memory_by_embedding');
    expect(storeMemoryIndex).toBeGreaterThan(searchCallIndex);
    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'store_memory_by_embedding',
      params: expect.objectContaining({
        user_id: 'dev-user',
        content: 'User: use memory\nAssistant: stored answer',
        embedding: [0.4, 0.5, 0.6],
        embedding_space_version: 'test-space',
        memory_type: 'episodic',
        conversation_id: 'conv-memory-chat',
      }),
    }));
  });

  test('persistence disabled keeps chat events out of the local-runtime conversation store', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      embedding: [0.4, 0.5, 0.6],
      provider_id: 'test-provider',
      model_id: 'test-model',
      model_name: 'default',
      dimension: 3,
      embedding_space_version: 'test-space',
    }));
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async () => ({ success: true, data: { memories: {} } })),
    };
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'memory-only-agent',
      persistence: false,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    const agent = await wakePromise;

    await agent.chat({ conversationRef: 'conv-memory-only' }).send('no chat storage');

    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'search_memory_by_embedding',
    }));
    expect(localRuntime.rpc).not.toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.append_event',
    }));
  });

  test('explicit custom conversation store overrides the default local-runtime store', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      rpc: jest.fn(async () => ({ success: true, data: {} })),
    };
    const customStore = {
      appendEvent: jest.fn(async () => undefined),
      appendEvents: jest.fn(async () => undefined),
      loadEvents: jest.fn(async () => []),
      loadForDisplay: jest.fn(async () => ({
        conversationRef: 'conv-custom-store',
        messages: [],
      })),
      loadForRehydrate: jest.fn(async () => ({
        conversationRef: 'conv-custom-store',
        messages: [],
      })),
      listMetadata: jest.fn(async () => []),
    };
    const client = new AgentClientClass({
      backendUrl: 'https://sdk.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'custom-store-agent',
      memory: false,
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    const agent = await wakePromise;

    await agent.chat({
      conversationRef: 'conv-custom-store',
      store: customStore as never,
    }).send('custom store');

    expect(customStore.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'user_message',
      conversationRef: 'conv-custom-store',
    }));
    expect(localRuntime.rpc).not.toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.append_event',
    }));
  });

  test('agent.setModel sends a backend settings update with provider-safe model fields', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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

  test('agent global helpers persist sanitized feature path traces', async () => {
    const store = new InMemoryConversationStore();
    const localRuntime = {
      status: jest.fn(async () => ({
        ready: true,
        running: true,
        secretStatus: 'do not persist status detail',
      })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{ name: 'browser', description: 'do not persist tool schema' }],
      })),
      shutdown: jest.fn(async () => undefined),
    };
    const sdkClient = {
      artifacts: {
        fetch: jest.fn(async () => ({
          status: 200,
          ok: true,
          headers: {
            get: (name: string) => {
              if (name === 'content-type') {
                return 'image/png';
              }
              if (name === 'content-length') {
                return '12';
              }
              return null;
            },
          },
        })),
      },
      installIdentity: jest.fn(async () => ({
        user_id: 'user-secret',
        install_id: 'install-secret',
      })),
      toolSchemas: jest.fn(async () => ({
        canonical_tool_schemas: [{ name: 'read_file', description: 'do not persist schema body' }],
        provider_tool_schemas: [],
      })),
    };
    const agent = new Agent(
      'feature-agent',
      { on: jest.fn(() => () => undefined), close: jest.fn() } as any,
      {},
      sdkClient as any,
      { listAgents: jest.fn(() => []) },
      localRuntime as any,
      'user-1',
      store,
    );
    const traceOptions = { conversationRef: 'conv-feature-agent' };

    await agent.fetchArtifact('artifact-secret-id', traceOptions);
    await agent.installIdentity(traceOptions);
    await agent.listToolSchemas(traceOptions);
    await agent.status(traceOptions);
    await agent.listTools(traceOptions);
    await agent.shutdownLocalRuntime(traceOptions);

    const events = await store.loadEvents('conv-feature-agent');
    const timelineByPath = (pathName: string) => events
      .filter(event => event.type === 'trace_event' && event.payload.path === pathName)
      .map(event => event.payload);

    expect(timelineByPath('artifact.fetch').map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'http_get:started',
      'http_get:succeeded',
    ]);
    expect(timelineByPath('artifact.fetch')[1].data).toEqual(expect.objectContaining({
      hasArtifactId: true,
      statusCode: 200,
      ok: true,
      contentType: 'image/png',
      contentLength: '12',
    }));
    expect(timelineByPath('install.auth').map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'identity:started',
      'identity:succeeded',
    ]);
    expect(timelineByPath('install.auth')[1].data).toEqual(expect.objectContaining({
      hasInstallId: true,
      responseKeyCount: 2,
    }));
    expect(timelineByPath('tool.schema.policy').map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'sdk_list:started',
      'sdk_list:succeeded',
    ]);
    expect(timelineByPath('tool.schema.policy')[1].data).toEqual(expect.objectContaining({
      toolSchemaCount: 1,
      hasToolSchemas: true,
    }));
    expect(timelineByPath('local_runtime.lifecycle').map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'status:started',
      'status:succeeded',
      'list_tools:started',
      'list_tools:succeeded',
      'shutdown:started',
      'shutdown:succeeded',
    ]);
    expect(timelineByPath('local_runtime.lifecycle')[1].data).toEqual(expect.objectContaining({
      responseKeyCount: 3,
      ready: true,
      running: true,
    }));
    expect(timelineByPath('local_runtime.lifecycle')[3].data).toEqual(expect.objectContaining({
      toolCount: 1,
      hasVersion: true,
    }));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('artifact-secret-id');
    expect(serialized).not.toContain('artifact bytes must not persist');
    expect(serialized).not.toContain('install-secret');
    expect(serialized).not.toContain('user-secret');
    expect(serialized).not.toContain('do not persist schema body');
    expect(serialized).not.toContain('do not persist tool schema');
    expect(serialized).not.toContain('do not persist status detail');
  });

  test('agent exposes prompt, schema, memory, title, and artifact facades', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
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
        url: 'https://backend.example.test/api/artifacts/artifact-1',
      }) as any)
      .mockResolvedValueOnce(jsonResponse({
        embedding: [0.1, 0.2, 0.3],
        provider_id: 'test-provider',
        model_id: 'test-model',
        model_name: 'default',
        dimension: 3,
        embedding_space_version: 'test-space',
      }) as any)
      .mockResolvedValueOnce(jsonResponse({
        embedding: [0.4, 0.5, 0.6],
        provider_id: 'test-provider',
        model_id: 'test-model',
        model_name: 'default',
        dimension: 3,
        embedding_space_version: 'test-space',
      }) as any);
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
      method: 'search_memory_by_embedding',
      params: expect.objectContaining({
        embedding: [0.1, 0.2, 0.3],
        embedding_space_version: 'test-space',
      }),
    }));
    expect(localRuntime.rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'store_memory_by_embedding',
      params: expect.objectContaining({
        content: 'User: hello\nAssistant: world',
        embedding: [0.4, 0.5, 0.6],
        embedding_space_version: 'test-space',
      }),
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
      payload: {
        tools: {
          mode: 'replace_client_manifest',
          client_manifest: {
            version: 1,
            tools: [{ name: 'read_file' }],
          },
        },
      },
    });
  });

  test('SDK transport creates websocket-backed agent sessions from backend URLs', async () => {
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://backend.example.test/ws');
    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;

    const handshake = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(handshake).toMatchObject({
      type: 'handshake',
      user_id: 'transport-user',
      agent_definition: {
        id: 'transport-agent',
        runtime: { operating_system: 'macOS' },
      },
    });
    expect(handshake).not.toHaveProperty('operating_system');
  });

  test('SDK backend transport exposes websocket model-list messages', async () => {
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createAgentRuntimeTransport(session, 'conv-models');
    const messageId = await transport.listModels();

    expect(messageId).toEqual(expect.any(String));
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'list-models',
      payload: {},
      user_id: 'transport-user',
    });
  });

  test('SDK backend transport preserves agent tool manifest when query context supplies a partial agent definition', async () => {
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: {
        id: 'transport-agent',
        tools: {
          mode: 'client_only',
          client_manifest: {
            version: 1,
            tools: [{
              name: 'cua_driver__get_open_windows',
              mcp_server_id: 'cua-driver',
              schema: { type: 'object', properties: {} },
            }],
          },
        },
      },
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createAgentRuntimeTransport(session, 'conv-agent-context', {
      id: 'transport-agent',
      tools: {
        mode: 'client_only',
        client_manifest: {
          version: 1,
          tools: [{
            name: 'cua_driver__get_open_windows',
            mcp_server_id: 'cua-driver',
            schema: { type: 'object', properties: {} },
          }],
        },
      },
    });
    await transport.sendQuery({
      text: 'u got the mcp',
      conversation_ref: 'conv-agent-context',
      agent_definition: {
        id: 'agent-default',
        tools: {
          mode: 'default_plus_client',
          enabled_remote_tools: [],
          disabled_tools: [],
          disabled_capabilities: [],
        },
        agents_md: [{
          id: 'repo',
          type: 'agents_md',
          priority: 40,
          content: 'Follow repo rules.',
        }],
        runtime: {
          workspace_path: '/tmp/project',
        },
        metadata: {
          client_capability_revision: expect.stringMatching(/^cap_/),
          client_capability: expect.objectContaining({
            tool_count: 1,
            prompt_layer_count: 1,
            skill_count: 1,
            plugin_count: 1,
          }),
        },
      },
    });

    const query = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(query).toMatchObject({
      type: 'query',
      payload: {
        agent_definition: {
          id: 'agent-default',
          tools: {
            mode: 'default_plus_client',
            client_manifest: {
              version: 1,
              tools: [
                expect.objectContaining({
                  name: 'cua_driver__get_open_windows',
                  mcp_server_id: 'cua-driver',
                }),
              ],
            },
          },
          runtime: {
            workspace_path: '/tmp/project',
          },
          agents_md: [
            expect.objectContaining({ id: 'repo' }),
          ],
        },
      },
    });
  });

  test('SDK backend transport only lets a non-empty query client manifest replace SDK tools', async () => {
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createAgentRuntimeTransport(session, 'conv-agent-context', {
      id: 'transport-agent',
      tools: {
        mode: 'client_only',
        client_manifest: {
          version: 1,
          tools: [{
            name: 'cua_driver__get_open_windows',
            mcp_server_id: 'cua-driver',
            schema: { type: 'object', properties: {} },
          }],
        },
      },
    });

    await transport.sendQuery({
      text: 'empty manifest should not erase sdk tools',
      conversation_ref: 'conv-agent-context',
      agent_definition: {
        tools: {
          mode: 'default_plus_client',
          client_manifest: {
            version: 1,
            tools: [],
          },
        },
      },
    });

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      payload: {
        agent_definition: {
          tools: {
            client_manifest: {
              tools: [
                expect.objectContaining({
                  name: 'cua_driver__get_open_windows',
                }),
              ],
            },
          },
        },
      },
    });

    FakeWebSocket.instances[0].clearSent();

    await transport.sendQuery({
      text: 'empty manifest with tool policy should erase sdk tools',
      conversation_ref: 'conv-agent-context',
      agent_definition: {
        tools: {
          mode: 'explicit',
          available_tools: [],
          disabled_tools: ['cua_driver__get_open_windows'],
          client_manifest: {
            version: 1,
            tools: [],
          },
        },
      },
    });

    const disabledToolsQuery = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(disabledToolsQuery.payload.agent_definition.tools.client_manifest.tools).toEqual([]);
    expect(disabledToolsQuery.payload.agent_definition.tools.disabled_tools).toEqual([
      'cua_driver__get_open_windows',
    ]);

    FakeWebSocket.instances[0].clearSent();

    await transport.sendQuery({
      text: 'non-empty manifest replaces sdk tools',
      conversation_ref: 'conv-agent-context',
      agent_definition: {
        tools: {
          mode: 'default_plus_client',
          client_manifest: {
            version: 1,
            tools: [{
              name: 'query_supplied_tool',
              schema: { type: 'object', properties: {} },
            }],
          },
        },
      },
    });

    const replacementQuery = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(replacementQuery.payload.agent_definition.tools.client_manifest.tools).toEqual([
      expect.objectContaining({
        name: 'query_supplied_tool',
      }),
    ]);
  });

  test('SDK backend transport exposes typed compaction and wakeword messages', async () => {
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
      operatingSystem: 'macOS',
      agentDefinition: { id: 'transport-agent' },
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    const transport = createAgentRuntimeTransport(session, 'conv-commands');
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
    const session = createAgentSession({
      backendUrl: 'https://backend.example.test',
      WebSocketImpl: FakeWebSocket as any,
      userId: 'transport-user',
    });

    const openPromise = session.waitForOpen();
    FakeWebSocket.instances[0].emit('open', {});
    await openPromise;
    FakeWebSocket.instances[0].clearSent();

    await session.query({
      text: 'hello backend payload',
      conversationRef: 'conv-query',
      backendPayload: {
        repo_instruction_messages: [{ role: 'system', content: 'Use repo rules.' }],
        agent_definition: { id: 'agent-from-backend-payload' },
        renderer_only: true,
      },
    });
    await session.stopQuery({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      renderer_only: true,
    } as any);
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
        output: 'done',
        capture_meta: { capture_engine: 'partial' },
      },
    });

    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({
      type: 'query',
      payload: {
        text: 'hello backend payload',
        conversation_ref: 'conv-query',
        repo_instruction_messages: [{ role: 'system', content: 'Use repo rules.' }],
        agent_definition: { id: 'agent-from-backend-payload' },
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0]).payload).not.toHaveProperty('renderer_only');
    expect(JSON.parse(FakeWebSocket.instances[0].sent[1])).toMatchObject({
      type: 'stop-query',
      payload: {
        conversation_ref: 'conv-1',
        turn_ref: 'turn-1',
      },
    });
    await expect(session.stopQuery({
      conversation_ref: 'legacy-conv',
      turn_ref: 'legacy-turn',
    } as any)).rejects.toThrow(
      'AgentSession.stopQuery accepts conversationRef and turnRef; snake_case stop fields are not supported.',
    );
    expect(JSON.parse(FakeWebSocket.instances[0].sent[2])).toMatchObject({
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
    expect(JSON.parse(FakeWebSocket.instances[0].sent[3])).toMatchObject({
      type: 'rehydrate-conversation',
      payload: {
        conversation_ref: 'conv-1',
        messages: [],
        rehydrate_mode: 'replace',
      },
    });
    expect(JSON.parse(FakeWebSocket.instances[0].sent[4])).toMatchObject({
      type: 'tool-result',
      payload: {
        request_id: 'req-1',
        success: true,
        data: {
          output: 'done',
        },
      },
    });
  });

  test('agent.stop rejects removed snake_case option aliases', async () => {
    const stopQuery = jest.fn(async () => 'stop-message-id');
    const agent = new Agent(
      'stop-agent',
      {
        on: jest.fn(() => () => undefined),
        stopQuery,
        close: jest.fn(),
      } as any,
      {},
      {} as any,
      { listAgents: jest.fn(() => []) },
    );

    await expect(agent.stop({
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
    })).resolves.toBe('stop-message-id');

    expect(stopQuery).toHaveBeenCalledWith({
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
    });

    await expect(agent.stop({
      conversation_ref: 'legacy-conv',
      turn_ref: 'legacy-turn',
    } as any)).rejects.toThrow(
      'agent.stop accepts conversationRef and turnRef; snake_case stop fields are not supported.',
    );
    expect(stopQuery).toHaveBeenCalledTimes(1);
  });

  test('managed SDK agent sessions own reconnect fallback and command sends', async () => {
    const onFallback = jest.fn();
    const client = new AgentClient({
      backendSession: 'managed',
      backendUrl: 'https://primary.example.test',
      fetchImpl: mockFetch,
      backendEndpoints: [
        { backendUrl: 'https://primary.example.test' },
        { backendUrl: 'https://fallback.example.test' },
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
    expect(FakeWebSocket.instances[0].url).toBe('wss://primary.example.test/ws');

    FakeWebSocket.instances[0].emit('error', new Error('primary unavailable'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(FakeWebSocket.instances[1].url).toBe('wss://fallback.example.test/ws');
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      backendUrl: 'https://fallback.example.test',
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

  test('SDK backend event guard includes schema-backed control websocket events', async () => {
    const { isBackendEvent } = await import('../../packages/windie-sdk-js/src/events/backendEvents');
    const {
      isBackendEvent: isPackagedBackendEvent,
    } = require('../../packages/windie-sdk-js/cjs/events/backendEvents.js');

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
    expect(isBackendEvent({
      type: 'tool-bundle-output',
      payload: { bundle_id: 'bundle-1' },
    })).toBe(false);
    expect(isPackagedBackendEvent({
      type: 'tool-bundle-output',
      payload: { bundle_id: 'bundle-1' },
    })).toBe(false);
  });

  test('wakeUp applies an initial model selection after handshake', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
    })).rejects.toThrow('agent.setModel requires a non-empty modelId');
    expect(socket.sent).toHaveLength(0);
  });

  test('agent.ask applies per-call model selections before sending the query', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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

  test('agent.ask renders attachment bodies into SDK-prepared content', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
        content: expect.stringContaining('<attached_file_context>\nfile body\n</attached_file_context>'),
      },
    });
    expect(sent.payload.content).toContain('<user_query>\nSummarize this file.\n</user_query>');
    expect(sent.payload).not.toHaveProperty('query_context');
    expect(sent.payload).not.toHaveProperty('attachment_context');
    expect(sent.payload).not.toHaveProperty('attachment_filenames');
  });

  test('agent.chat sends the SDK agent definition with each backend query', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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

  test('wakeUp can attach to a configured local runtime daemon HTTP runtime', async () => {
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
              execution_target: 'local_runtime',
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntimeDaemon: {
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
    expect((statusCall?.[1]?.headers as Headers).get('x-agent-local-runtime-token')).toBe('daemon-token');
    expect(registerCall?.[1]?.method).toBe('POST');
    expect((registerCall?.[1]?.headers as Headers).get('x-agent-local-runtime-token')).toBe('daemon-token');
  });

  test('wakeUp can expose desktop builtin tools from the local runtime manifest', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          { name: 'read_file', schema: { type: 'object' } },
          { name: 'run_shell_command', schema: { type: 'object' } },
        ],
      })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'builtin-agent',
      ...agentBuiltins.desktop(),
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

  test('wakeUp can expose selected builtin groups from the local runtime manifest', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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

  test('wakeUp can expose computer builtin tools from the local runtime manifest', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerMcp: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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

  test('wakeUp registers MCPs before building the handshake client manifest', async () => {
    const mcpTool = {
      name: 'cua_driver__get_open_windows',
      description: 'List open windows.',
      execution_target: 'local_runtime',
      mcp_server_id: 'cua-driver',
      mcp_tool_name: 'get_open_windows',
      schema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    };
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerMcp: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({ version: 1, tools: [mcpTool] })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'mcp-manifest-agent',
      mcps: [{ id: 'cua-driver', command: 'cua-driver', args: ['mcp'] }],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    FakeWebSocket.instances[0].emit('open', {});
    const agent = await wakePromise;

    expect(localRuntime.registerMcp).toHaveBeenCalledWith({
      id: 'cua-driver',
      command: 'cua-driver',
      args: ['mcp'],
    });
    expect((localRuntime.registerMcp as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((localRuntime.listTools as jest.Mock).mock.invocationCallOrder[0]);
    const handshake = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(handshake.agent_definition).not.toHaveProperty('mcps');
    expect(handshake.agent_definition.tools.client_manifest.tools).toEqual([
      expect.objectContaining({
        name: 'cua_driver__get_open_windows',
        mcp_server_id: 'cua-driver',
        mcp_tool_name: 'get_open_windows',
      }),
    ]);
    expect(agent.agentDefinition.tools.client_manifest.tools).toEqual([
      expect.objectContaining({
        name: 'cua_driver__get_open_windows',
        mcp_server_id: 'cua-driver',
      }),
    ]);
  });

  test('agent.registerMcps updates the SDK manifest used by the next message', async () => {
    const mcpTool = {
      name: 'cua_driver__get_open_windows',
      description: 'List open windows.',
      execution_target: 'local_runtime',
      mcp_server_id: 'cua-driver',
      mcp_tool_name: 'get_open_windows',
      schema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    };
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerMcp: jest.fn(async () => ({ success: true, registered_tools: [mcpTool] })),
      listTools: jest.fn(async () => ({ version: 1, tools: [mcpTool] })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
      agentId: 'live-mcp-agent',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    socket.clearSent();

    const registration = await agent.registerMcps([
      { id: 'cua-driver', command: 'cua-driver', args: ['mcp'] },
    ], { replace: true });

    expect(localRuntime.registerMcp).toHaveBeenCalledWith({
      servers: [{
        id: 'cua-driver',
        command: 'cua-driver',
        args: ['mcp'],
      }],
      replace: true,
    });
    expect(registration.toolSchemas).toEqual([
      expect.objectContaining({
        name: 'cua_driver__get_open_windows',
        mcp_server_id: 'cua-driver',
      }),
    ]);
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'update-settings',
      payload: {
        agent_definition: {
          metadata: {
            client_capability_revision: expect.stringMatching(/^cap_/),
          },
        },
        tools: {
          mode: 'replace_client_manifest',
          client_manifest: {
            version: 1,
            tools: [expect.objectContaining({
              name: 'cua_driver__get_open_windows',
              mcp_server_id: 'cua-driver',
            })],
          },
        },
      },
    });
    expect(agent.agentDefinition.tools.client_manifest.tools).toEqual([
      expect.objectContaining({
        name: 'cua_driver__get_open_windows',
        mcp_server_id: 'cua-driver',
      }),
    ]);
    expect(agent.agentDefinition.metadata).toEqual(expect.objectContaining({
      client_capability_revision: expect.stringMatching(/^cap_/),
      client_capability: expect.objectContaining({
        tool_count: 1,
      }),
    }));

    await agent.ask('using the CUA Driver MCP, list the currently running apps', {
      conversationRef: 'conv-live-mcp',
    });
    const query = sentMessageOfType(socket, 'query');
    expect(query).toMatchObject({
      type: 'query',
      payload: {
        conversation_ref: 'conv-live-mcp',
        agent_definition: {
          metadata: {
            client_capability_revision: expect.stringMatching(/^cap_/),
          },
          tools: {
            client_manifest: {
              tools: [expect.objectContaining({
                name: 'cua_driver__get_open_windows',
                mcp_server_id: 'cua-driver',
              })],
            },
          },
        },
      },
    });
  });

  test('wakeUp ensures a local runtime when module tools need local runtime execution', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
      })),
      shutdown: jest.fn(async () => undefined),
    };
    const ensureLocalRuntime = jest.fn(async () => localRuntime);
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
    expect(localRuntime.shutdown).toHaveBeenCalledTimes(1);
  });

  test('agent.shutdown closes backend session and local runtime together', async () => {
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{ name: 'save_note', schema: { type: 'object', properties: {} } }],
      })),
      shutdown: jest.fn(async () => undefined),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
    });

    const wakePromise = client.wakeUp({
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

    await agent.shutdown();

    expect(FakeWebSocket.instances[0].closed).toBe(true);
    expect(localRuntime.shutdown).toHaveBeenCalledTimes(1);
  });

  test('wakeUp can explicitly reuse a discovered local runtime for local tools', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-daemon-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      autoLocalRuntime: {
        discoveryFile,
        reuseExisting: true,
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
    expect((registerCall?.[1]?.headers as Headers).get('x-agent-local-runtime-token')).toBe('auto-token');

    mockFetch.mockClear();
    const tools = await client.listTools();
    expect(tools?.tools?.[0]?.name).toBe('save_note');
    const listCall = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/tools'));
    expect(listCall?.[0]).toBe('http://127.0.0.1:43123/tools');
    expect((listCall?.[1]?.headers as Headers).get('x-agent-local-runtime-token')).toBe('auto-token');
  });

  test('createAgentLocalRuntimeProvider reuses discovery metadata directly', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43124',
        token: 'provider-token',
      }),
      'utf8',
    );
    mockFetch.mockResolvedValue(jsonResponse({ status: 'ok' }) as any);

    const provider = createAgentLocalRuntimeProvider({
      discoveryFile,
      fetchImpl: mockFetch,
      reuseExisting: true,
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
    expect(headers.get('x-agent-local-runtime-token')).toBe('provider-token');
  });

  test('createAgentLocalRuntimeProvider reports generic discovery timeout wording', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-timeout-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const launcherScript = path.join(tempDir, 'launcher.cjs');
    await fsPromises.writeFile(
      launcherScript,
      'setTimeout(() => {}, 30000);',
      'utf8',
    );

    const provider = createAgentLocalRuntimeProvider({
      command: process.execPath,
      args: [launcherScript],
      discoveryFile,
      fetchImpl: mockFetch,
      startTimeoutMs: 5,
      pollIntervalMs: 1,
    });

    await expect(provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    })).rejects.toThrow(`Timed out waiting for local runtime discovery at ${discoveryFile}`);
  });

  test('createAgentLocalRuntimeProvider requires host-supplied launch command or daemon script', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-no-launch-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const originalAgentDaemonScriptEnv = process.env.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT;
    const originalDaemonScriptEnv = process.env.WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT;
    delete process.env.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT;
    delete process.env.WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT;

    try {
      const provider = createAgentLocalRuntimeProvider({
        discoveryFile,
        fetchImpl: mockFetch,
        startTimeoutMs: 5,
        pollIntervalMs: 1,
      });

      await expect(provider({
        wakeUp: { tools: [] },
        needsLocalRuntime: true,
      })).rejects.toThrow(
        'Set autoLocalRuntime.command, autoLocalRuntime.daemonScript, or AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT',
      );
    } finally {
      if (typeof originalAgentDaemonScriptEnv === 'string') {
        process.env.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT = originalAgentDaemonScriptEnv;
      } else {
        delete process.env.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT;
      }
      if (typeof originalDaemonScriptEnv === 'string') {
        process.env.WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT = originalDaemonScriptEnv;
      } else {
        delete process.env.WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT;
      }
    }
  });

  test('createAgentLocalRuntimeProvider source keeps generic default discovery path', async () => {
    const runtimeSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/LocalRuntime.ts'),
      'utf8',
    );
    const runtimeCjsSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/cjs/runtime/LocalRuntime.js'),
      'utf8',
    );

    for (const source of [runtimeSource, runtimeCjsSource]) {
      expect(source).toContain("path.join(os.tmpdir(), 'desktop-runtime', 'local-runtime-daemon.json')");
      expect(source).not.toContain("path.join(os.tmpdir(), 'windieos', 'local-runtime-daemon.json')");
      expect(source).not.toContain('WINDIE_SIDECAR_DAEMON_DISCOVERY_FILE');
      expect(source).toContain('AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE');
      expect(source).not.toContain('WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE');
      expect(source).not.toContain('src/main/python/sidecar_daemon.py');
      expect(source).not.toContain('src/main/python/sidecar_daemon.py');
    }
    expect(runtimeSource).toContain('options.command');
    expect(runtimeSource).toContain('options.daemonScript');
    expect(runtimeCjsSource).toContain('options.command');
    expect(runtimeCjsSource).toContain('options.daemonScript');
    expect(runtimeSource).not.toContain('SidecarDaemonClientOptions');
    expect(runtimeSource).not.toContain('SidecarDaemonDiscovery');
    expect(runtimeSource).not.toContain('SidecarLaunchEnvironment');
    expect(runtimeSource).not.toContain('loadNodeSidecarModules');
    expect(runtimeSource).toContain('LocalRuntimeLaunchEnvironment');
    expect(runtimeSource).toContain('loadNodeLocalRuntimeModules');
    expect(runtimeCjsSource).not.toContain('loadNodeSidecarModules');
    expect(runtimeCjsSource).toContain('loadNodeLocalRuntimeModules');
    expect(runtimeSource).toContain('Node local runtime provider');
    expect(runtimeCjsSource).toContain('Node local runtime provider');
    expect(runtimeSource).not.toContain('Node sidecar runtime provider');
    expect(runtimeCjsSource).not.toContain('Node sidecar runtime provider');
  });

  test('SDK runtime env compatibility aliases live in the runtime env contract', async () => {
    const runtimeEnvSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/RuntimeEnv.ts'),
      'utf8',
    );
    const runtimeEnvCjsSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/cjs/runtime/RuntimeEnv.js'),
      'utf8',
    );
    const sdkSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/AgentClient.ts'),
      'utf8',
    );
    const localRuntimeSource = await fsPromises.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/LocalRuntime.ts'),
      'utf8',
    );

    for (const source of [runtimeEnvSource, runtimeEnvCjsSource]) {
      expect(source).toContain('AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS');
      expect(source).toContain("backendUrl: 'WINDIE_BACKEND_URL'");
      expect(source).toContain("installToken: 'WINDIE_API_KEY'");
      expect(source).toContain("localRuntimeDaemonScript: 'WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT'");
      expect(source).toContain("localRuntimePython: 'WINDIE_PYTHON'");
      expect(source).toContain("localRuntimeDaemonDiscoveryFile: 'WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE'");
      expect(source).toContain('AGENT_BACKEND_URL_ENV_KEYS');
      expect(source).toContain('WINDIE_BACKEND_URL');
      expect(source).toContain('AGENT_INSTALL_TOKEN_ENV_KEYS');
      expect(source).toContain('WINDIE_API_KEY');
      expect(source).toContain('AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS');
      expect(source).toContain('WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT');
      expect(source).toContain('AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS');
      expect(source).toContain('WINDIE_PYTHON');
      expect(source).toContain('AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS');
      expect(source).toContain('WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE');
    }

    expect(sdkSource).toContain('readGlobalRuntimeEnv(AGENT_BACKEND_URL_ENV_KEYS)');
    expect(sdkSource).toContain('readGlobalRuntimeEnv(AGENT_INSTALL_TOKEN_ENV_KEYS)');
    expect(sdkSource).not.toContain("'WINDIE_BACKEND_URL'");
    expect(sdkSource).not.toContain("'WINDIE_API_KEY'");
    expect(localRuntimeSource).toContain('readRuntimeEnv(processEnv, AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS)');
    expect(localRuntimeSource).not.toContain('processEnv.WINDIE_PYTHON');
    expect(localRuntimeSource).not.toContain('processEnv.WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE');
  });

  test('createAgentLocalRuntimeProvider rejects camelCase discovery metadata', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-discovery-alias-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const launcherScript = path.join(tempDir, 'launcher.cjs');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43133',
        baseUrl: 'http://127.0.0.1:43133',
        token: 'alias-token',
      }),
      'utf8',
    );
    await fsPromises.writeFile(
      launcherScript,
      [
        "const fs = require('node:fs');",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43134', token: 'fresh-token' }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43133/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43134/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43134/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      command: process.execPath,
      args: [launcherScript],
      discoveryFile,
      fetchImpl: mockFetch,
      pollIntervalMs: 1,
      reuseExisting: true,
      startTimeoutMs: 2000,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(mockFetch.mock.calls.some(([url]) => String(url) === 'http://127.0.0.1:43133/status')).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43134/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('createAgentLocalRuntimeProvider ignores non-loopback discovery metadata', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-loopback-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const launcherScript = path.join(tempDir, 'launcher.cjs');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'https://example.com',
        token: 'external-token',
      }),
      'utf8',
    );
    await fsPromises.writeFile(
      launcherScript,
      [
        "const fs = require('node:fs');",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43132', token: 'fresh-token' }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43132/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43132/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      command: process.execPath,
      args: [launcherScript],
      discoveryFile,
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(mockFetch.mock.calls.some(([url]) => String(url).startsWith('https://example.com'))).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43132/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('createAgentLocalRuntimeProvider restarts a discovered daemon by default', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-restart-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const daemonScript = path.join(tempDir, 'local_runtime_daemon.py');
    const launcherScript = path.join(tempDir, 'python-in-env');
    await fsPromises.writeFile(daemonScript, 'print("daemon")\n', 'utf8');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43124',
        token: 'old-token',
      }),
      'utf8',
    );
    await fsPromises.writeFile(
      launcherScript,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43125', token: 'fresh-token' }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    let oldStatusCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43124/status') {
        oldStatusCalls += 1;
        return oldStatusCalls === 1
          ? jsonResponse({ status: 'ok' }) as any
          : jsonResponse({ error: 'stopped' }, { status: 503, statusText: 'Service Unavailable' }) as any;
      }
      if (url === 'http://127.0.0.1:43124/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      if (url === 'http://127.0.0.1:43125/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43125/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      discoveryFile,
      daemonScript,
      pythonCommand: process.execPath,
      pythonArgs: [launcherScript],
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43124/shutdown',
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43125/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('createAgentLocalRuntimeProvider starts a desktop command with explicit env, cwd, and launch context', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-command-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const launcherScript = path.join(tempDir, 'launcher.cjs');
    const markerFile = path.join(tempDir, 'marker.json');
    await fsPromises.writeFile(
      launcherScript,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43129', token: process.env.AGENT_TEST_TOKEN, launch: { AGENT_TEST_MODE: process.env.AGENT_TEST_MODE } }));",
        "fs.writeFileSync(path.join(process.cwd(), 'marker.json'), JSON.stringify({ argv: process.argv.slice(2), env: process.env.AGENT_TEST_MODE }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43129/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43129/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      command: process.execPath,
      args: [launcherScript, '--desktop-launch'],
      cwd: tempDir,
      discoveryFile,
      env: {
        AGENT_TEST_MODE: 'desktop',
        AGENT_TEST_TOKEN: 'desktop-token',
      },
      envMode: 'replace',
      launchContext: {
        AGENT_TEST_MODE: 'desktop',
      },
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    const marker = JSON.parse(await fsPromises.readFile(markerFile, 'utf8'));
    expect(marker).toEqual({
      argv: ['--desktop-launch', '--discovery-file', discoveryFile],
      env: 'desktop',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43129/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('createAgentLocalRuntimeProvider replaces stale launch-context discovery before reuse', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-stale-launch-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const launcherScript = path.join(tempDir, 'launcher.cjs');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43130',
        token: 'old-token',
        launch: { AGENT_TEST_MODE: 'old' },
      }),
      'utf8',
    );
    await fsPromises.writeFile(
      launcherScript,
      [
        "const fs = require('node:fs');",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43131', token: 'fresh-token', launch: { AGENT_TEST_MODE: process.env.AGENT_TEST_MODE } }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );

    let oldStatusCalls = 0;
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43130/status') {
        oldStatusCalls += 1;
        return oldStatusCalls === 1
          ? jsonResponse({ status: 'ok' }) as any
          : jsonResponse({ error: 'stopped' }, { status: 503, statusText: 'Service Unavailable' }) as any;
      }
      if (url === 'http://127.0.0.1:43130/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      if (url === 'http://127.0.0.1:43131/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43131/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      command: process.execPath,
      args: [launcherScript],
      discoveryFile,
      env: { AGENT_TEST_MODE: 'new' },
      envMode: 'replace',
      launchContext: { AGENT_TEST_MODE: 'new' },
      reuseExisting: true,
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43130/shutdown',
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43131/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    await runtime?.shutdown?.();
  });

  test('createAgentLocalRuntimeProvider accepts discovery launch context supersets', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-provider-launch-superset-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    await fsPromises.writeFile(
      discoveryFile,
      JSON.stringify({
        base_url: 'http://127.0.0.1:43132',
        token: 'runtime-token',
        launch: {
          AGENT_BACKEND_HTTP_URL: 'https://api.example',
          AGENT_TEST_MODE: 'desktop',
        },
      }),
      'utf8',
    );
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:43132/status') {
        return jsonResponse({ status: 'ok' }) as any;
      }
      if (url === 'http://127.0.0.1:43132/shutdown') {
        return jsonResponse({ success: true }) as any;
      }
      return jsonResponse({ ok: true }) as any;
    });

    const provider = createAgentLocalRuntimeProvider({
      discoveryFile,
      launchContext: { AGENT_TEST_MODE: 'desktop' },
      reuseExisting: true,
      pollIntervalMs: 1,
      startTimeoutMs: 2000,
      fetchImpl: mockFetch,
    });
    const runtime = await provider({
      wakeUp: { tools: [] },
      needsLocalRuntime: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43132/status',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      'http://127.0.0.1:43132/shutdown',
      expect.any(Object),
    );
    await runtime?.shutdown?.();
  });

  test('AgentLocalRuntimeHttpClient subscribes to local runtime events', async () => {
    const events: unknown[] = [];
    const client = new AgentLocalRuntimeHttpClient({
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

  test('AgentLocalRuntimeHttpClient forwards tool execution trace context', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { output: 'done' },
    }));
    const client = new AgentLocalRuntimeHttpClient({
      baseUrl: 'http://127.0.0.1:43126',
      token: 'context-token',
      fetchImpl: mockFetch as any,
    });

    await expect(client.executeTool({
      toolName: 'cua_driver__get_window_state',
      args: { pid: 123, window_id: 456 },
      requestId: 'req-1',
      toolCallId: 'call-1',
      correlationId: 'corr-1',
      bundleId: 'bundle-1',
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
    })).resolves.toEqual({
      success: true,
      data: { output: 'done' },
    });

    const [, request] = mockFetch.mock.calls[0];
    expect(mockFetch.mock.calls[0][0]).toBe('http://127.0.0.1:43126/execute-tool');
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      tool_name: 'cua_driver__get_window_state',
      args: { pid: 123, window_id: 456 },
      request_id: 'req-1',
      bundle_id: 'bundle-1',
      tool_call_id: 'call-1',
      correlation_id: 'corr-1',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
    });
  });

  test('AgentLocalRuntimeHttpClient unwraps json-rpc rpc results', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      jsonrpc: '2.0',
      id: 'rpc-1',
      result: {
        success: true,
        data: {
          memories: {
            episodic: ['remembered'],
            semantic: [],
          },
        },
      },
    }) as any);
    const client = new AgentLocalRuntimeHttpClient({
      baseUrl: 'http://127.0.0.1:43127',
      token: 'rpc-token',
      fetchImpl: mockFetch as any,
    });

    await expect(client.rpc({
      id: 'rpc-1',
      method: 'search_memory_by_embedding',
      params: { user_id: 'peter' },
    })).resolves.toEqual({
      success: true,
      data: {
        memories: {
          episodic: ['remembered'],
          semantic: [],
        },
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43127/rpc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'rpc-1',
          method: 'search_memory_by_embedding',
          params: { user_id: 'peter' },
        }),
      }),
    );
  });

  test('AgentLocalRuntimeHttpClient throws json-rpc rpc errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      jsonrpc: '2.0',
      id: 'rpc-err',
      error: {
        code: -32000,
        message: 'local runtime failed',
      },
    }) as any);
    const client = new AgentLocalRuntimeHttpClient({
      baseUrl: 'http://127.0.0.1:43128',
      token: 'rpc-token',
      fetchImpl: mockFetch as any,
    });

    await expect(client.rpc({
      id: 'rpc-err',
      method: 'search_memory_by_embedding',
    })).rejects.toThrow('local runtime failed');
  });

  test('LocalRuntimeConversationStore routes conversation commands through local runtime rpc', async () => {
    const rpc = jest.fn(async ({ method, params }) => {
      if (method === 'conversation.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-local-runtime',
                revision_id: 'rev-1',
                title: 'Local runtime',
                last_message: 'hello',
                last_timestamp: '2026-05-22T00:00:00.000Z',
                entry_count: 1,
              },
            ],
          },
        };
      }
      if (method === 'conversation.load_events') {
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
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await expect(store.listMetadata()).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-local-runtime',
        title: 'Local runtime',
      }),
    ]);
    await expect(store.loadForDisplay('conv-local-runtime')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({ text: 'hello' }),
      ],
    });
    await store.deleteConversation('conv-local-runtime');
    await store.clearConversations();

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.delete',
    }));
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'clear_chat_history',
      params: {
        user_id: 'user-1',
        record_kind: 'chat_event',
      },
    }));
  });

  test('Agent exposes SDK-owned clear memory and conversation commands', async () => {
    const localRuntimeRpc = jest.fn(async ({ method }) => {
      if (method === 'list_episodic_memories') {
        return {
          success: true,
          data: {
            memories: [{ id: 'ep-1', content: 'User: hi\nAssistant: hello' }],
            count: 1,
          },
        };
      }
      if (method === 'delete_episodic_memory') {
        return {
          success: true,
          data: {
            deleted: true,
            memory_id: 'ep-1',
          },
        };
      }
      if (method === 'clear_local_memory') {
        return {
          success: true,
          data: {
            episodic_deleted_count: 2,
            semantic_deleted_count: 3,
          },
        };
      }
      return {};
    });
    const store = new InMemoryConversationStore();
    const session = {
      on: jest.fn(() => () => undefined),
    };
    const owner = {
      listAgents: jest.fn(() => []),
    };
    const sdkClient = {
      embeddings: {
        create: jest.fn(),
      },
    };
    const agent = new Agent(
      'agent-public-commands',
      session as any,
      {},
      sdkClient as any,
      owner,
      { rpc: localRuntimeRpc } as any,
      'user-1',
      store,
    );

    await store.appendEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-clear',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: { text: 'hello' },
    }));

    await expect(agent.listMemories({ type: 'episodic' })).resolves.toEqual({
      memories: [{ id: 'ep-1', content: 'User: hi\nAssistant: hello' }],
      count: 1,
    });
    await expect(agent.deleteMemory({ type: 'episodic', memoryId: 'ep-1' })).resolves.toEqual({
      deleted: true,
      memory_id: 'ep-1',
    });
    await expect(agent.clearMemories()).resolves.toEqual({
      episodic_deleted_count: 2,
      semantic_deleted_count: 3,
    });
    expect(localRuntimeRpc).toHaveBeenCalledWith({
      method: 'list_episodic_memories',
      params: {
        user_id: 'user-1',
        limit: undefined,
      },
    });
    expect(localRuntimeRpc).toHaveBeenCalledWith({
      method: 'delete_episodic_memory',
      params: {
        user_id: 'user-1',
        memory_id: 'ep-1',
      },
    });
    expect(localRuntimeRpc).toHaveBeenCalledWith({
      method: 'clear_local_memory',
      params: { user_id: 'user-1' },
    });

    await expect(agent.listConversations()).resolves.toHaveLength(1);
    await agent.clearConversations();
    await expect(agent.listConversations()).resolves.toEqual([]);
  });

  test('LocalRuntimeConversationStore persists and loads model-history checkpoints', async () => {
    const rpc = jest.fn(async ({ method, params }) => {
      if (method === 'conversation.model_history.replace') {
        return {
          success: true,
          data: {
            checkpoint_id: params.checkpoint_id,
            revision_id: params.revision_id,
            row_count: params.rows.length,
          },
        };
      }
      if (method === 'conversation.model_history.load') {
        return {
          success: true,
          data: {
            checkpoint_id: 'mh-1',
            revision_id: params.revision_id,
            created_at: '2026-06-22T12:00:00.000Z',
            rows: [
              {
                id: 'row-tool',
                conversation_id: params.conversation_id,
                revision_id: params.revision_id,
                role: 'tool',
                message_type: 'tool_output',
                content: 'bounded output',
                tool_call_id: 'call-1',
                tool_calls: [{ id: 'call-1' }],
                tool_name: 'read_file',
                image_refs: ['artifact-1'],
                compaction_facts: { bounded: true },
                source_display_row_ids: ['display-tool'],
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await store.replaceModelHistory({
      checkpointId: 'mh-1',
      conversationRef: 'conv-model-history',
      revisionId: 'rev-1',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'row-tool',
          conversationRef: 'conv-model-history',
          revisionId: 'rev-1',
          role: 'tool',
          messageType: 'tool_output',
          content: 'bounded output',
          toolCallId: 'call-1',
          toolCalls: [{ id: 'call-1' }],
          toolName: 'read_file',
          imageRefs: ['artifact-1'],
          compactionFacts: { bounded: true },
          sourceDisplayRowIds: ['display-tool'],
        },
      ],
    });

    await expect(store.loadModelHistory({
      conversationRef: 'conv-model-history',
      revisionId: 'rev-1',
    })).resolves.toEqual({
      checkpointId: 'mh-1',
      conversationRef: 'conv-model-history',
      revisionId: 'rev-1',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'row-tool',
          conversationRef: 'conv-model-history',
          revisionId: 'rev-1',
          role: 'tool',
          messageType: 'tool_output',
          content: 'bounded output',
          toolCallId: 'call-1',
          toolCalls: [{ id: 'call-1' }],
          toolName: 'read_file',
          imageRefs: ['artifact-1'],
          compactionFacts: { bounded: true },
          sourceDisplayRowIds: ['display-tool'],
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.model_history.replace',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-model-history',
        revision_id: 'rev-1',
        checkpoint_id: 'mh-1',
        rows: [
          expect.objectContaining({
            row_id: 'row-tool',
            message_type: 'tool_output',
            tool_call_id: 'call-1',
          }),
        ],
      }),
    }));
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.model_history.load',
      params: {
        user_id: 'user-1',
        conversation_id: 'conv-model-history',
        revision_id: 'rev-1',
      },
    }));
  });

  test('LocalRuntimeConversationStore persists and loads display timeline checkpoints', async () => {
    const rpc = jest.fn(async ({ method, params }) => {
      if (method === 'conversation.display.replace') {
        return {
          success: true,
          data: {
            revision_id: params.revision_id,
            row_count: params.rows.length,
          },
        };
      }
      if (method === 'conversation.display.load') {
        return {
          success: true,
          data: {
            revision_id: params.revision_id,
            created_at: '2026-06-22T12:00:00.000Z',
            reason: 'user_edit',
            base_revision_id: 'rev-base',
            rows: [
              {
                id: 'display-user',
                conversation_id: params.conversation_id,
                revision_id: params.revision_id,
                index: 0,
                role: 'user',
                type: 'user_message',
                content: 'edited hello',
                metadata: { revisionId: params.revision_id },
              },
            ],
          },
        };
      }
      if (method === 'conversation.revisions.list') {
        return {
          success: true,
          data: {
            revisions: [
              {
                conversation_id: params.conversation_id,
                revision_id: 'rev-display',
                parent_revision_id: 'rev-base',
                operation: 'edit',
                display_timeline_id: 'rev-display',
                updated_at: '2026-06-22T12:00:00.000Z',
                active: true,
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await store.replaceDisplayTimeline?.({
      conversationRef: 'conv-display',
      revisionId: 'rev-display',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: 'user_edit',
      baseRevisionId: 'rev-base',
      rows: [
        {
          id: 'display-user',
          conversationRef: 'conv-display',
          revisionId: 'rev-display',
          turnRef: null,
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'edited hello',
          metadata: { revisionId: 'rev-display' },
        },
      ],
    });

    await expect(store.loadDisplayTimeline?.({
      conversationRef: 'conv-display',
      revisionId: 'rev-display',
    })).resolves.toEqual({
      conversationRef: 'conv-display',
      revisionId: 'rev-display',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: 'user_edit',
      baseRevisionId: 'rev-base',
      rows: [
        {
          id: 'display-user',
          conversationRef: 'conv-display',
          revisionId: 'rev-display',
          turnRef: null,
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'edited hello',
          metadata: { revisionId: 'rev-display' },
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.display.replace',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-display',
        revision_id: 'rev-display',
        reason: 'user_edit',
        base_revision_id: 'rev-base',
        rows: [
          expect.objectContaining({
            row_id: 'display-user',
            row_type: 'user_message',
          }),
        ],
      }),
    }));
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.display.load',
      params: {
        user_id: 'user-1',
        conversation_id: 'conv-display',
        revision_id: 'rev-display',
      },
    }));

    await expect(store.listRevisions?.({
      conversationRef: 'conv-display',
      limit: 25,
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-display',
        revisionId: 'rev-display',
        parentRevisionId: 'rev-base',
        operation: 'edit',
        displayTimelineId: 'rev-display',
        active: true,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'conversation.revisions.list',
      params: {
        user_id: 'user-1',
        conversation_id: 'conv-display',
        limit: 25,
        record_kind: 'chat_event',
      },
    }));
  });

  test('Agent exposes model-history loading and revision checkout primitives', async () => {
    const store = new InMemoryConversationStore();
    await store.replaceDisplayTimeline?.({
      conversationRef: 'conv-checkout',
      revisionId: 'rev-parent',
      createdAt: '2026-06-22T11:00:00.000Z',
      reason: 'send',
      baseRevisionId: null,
      rows: [
        {
          id: 'row-parent-user',
          conversationRef: 'conv-checkout',
          revisionId: 'rev-parent',
          turnRef: 'turn-parent',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'original question',
          metadata: { revisionId: 'rev-parent' },
        },
      ],
    });
    await store.replaceDisplayTimeline?.({
      conversationRef: 'conv-checkout',
      revisionId: 'rev-child',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: 'user_edit',
      baseRevisionId: 'rev-parent',
      rows: [
        {
          id: 'row-child-user',
          conversationRef: 'conv-checkout',
          revisionId: 'rev-child',
          turnRef: 'turn-child',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'edited question',
          metadata: { revisionId: 'rev-child' },
        },
      ],
    });
    await store.replaceModelHistory?.({
      checkpointId: 'mh-child',
      conversationRef: 'conv-checkout',
      revisionId: 'rev-child',
      createdAt: '2026-06-22T12:01:00.000Z',
      rows: [
        {
          id: 'mh-child-user',
          conversationRef: 'conv-checkout',
          revisionId: 'rev-child',
          role: 'user',
          messageType: 'user_query',
          content: 'edited question',
          sourceDisplayRowIds: ['row-child-user'],
        },
      ],
    });
    const agent = new Agent(
      'revision-agent',
      { on: jest.fn(() => () => undefined), close: jest.fn() } as any,
      {},
      {} as any,
      { listAgents: jest.fn(() => []) },
      undefined,
      'user-1',
      store,
    );

    await expect(agent.loadModelHistory({
      conversationRef: 'conv-checkout',
      revisionId: 'rev-child',
    })).resolves.toMatchObject({
      checkpointId: 'mh-child',
      revisionId: 'rev-child',
      rows: [
        expect.objectContaining({
          id: 'mh-child-user',
          content: 'edited question',
          sourceDisplayRowIds: ['row-child-user'],
        }),
      ],
    });

    await expect(agent.checkoutRevision({
      conversationRef: 'conv-checkout',
      revisionId: 'rev-child',
    })).resolves.toMatchObject({
      displayTimeline: {
        revisionId: 'rev-child',
        rows: [
          expect.objectContaining({
            id: 'row-child-user',
            content: 'edited question',
          }),
        ],
      },
      modelHistoryCheckpoint: {
        checkpointId: 'mh-child',
        revisionId: 'rev-child',
      },
      view: {
        conversationRef: 'conv-checkout',
        revisionId: 'rev-child',
        displayRows: [
          expect.objectContaining({
            id: 'row-child-user',
            content: 'edited question',
          }),
        ],
      },
    });

    await expect(agent.listConversationRevisions({
      conversationRef: 'conv-checkout',
    })).resolves.toEqual([
      expect.objectContaining({
        revisionId: 'rev-child',
        active: true,
      }),
      expect.objectContaining({
        revisionId: 'rev-parent',
        active: false,
      }),
    ]);

    const traceEvents = await store.loadEvents('conv-checkout');
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'trace_event',
        revisionId: 'rev-child',
        payload: expect.objectContaining({
          path: 'conversation.revision',
          stage: 'checkout',
          status: 'succeeded',
        }),
      }),
    ]));
  });

  test('LocalRuntimeConversationStore merges host write params before local runtime rpc', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: {} }));
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
      eventWriteParams: ({ event, defaultParams }) => ({
        ...defaultParams,
        workspace_path: '/work/project-alpha',
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
      method: 'conversation.append_event',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-host-write',
        event_type: 'tool_output',
        content: 'tool output',
        role: 'tool',
        record_kind: 'chat_event',
        workspace_path: '/work/project-alpha',
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

  test('createAgentLocalRuntimeProvider can start the daemon through a launcher prefix', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-sdk-launcher-'));
    const discoveryFile = path.join(tempDir, 'local-runtime-daemon.json');
    const daemonScript = path.join(tempDir, 'local_runtime_daemon.py');
    const launcherScript = path.join(tempDir, 'python-in-env');
    await fsPromises.writeFile(daemonScript, 'print("daemon")\n', 'utf8');
    await fsPromises.writeFile(
      launcherScript,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "if (process.argv[2] !== 'local-runtime' || process.argv[3] !== 'python') process.exit(2);",
        "const discoveryIndex = process.argv.indexOf('--discovery-file');",
        'if (discoveryIndex < 0) process.exit(3);',
        "fs.writeFileSync(process.argv[discoveryIndex + 1], JSON.stringify({ base_url: 'http://127.0.0.1:43125', token: 'launcher-token' }));",
        'setTimeout(() => {}, 30000);',
      ].join('\n'),
      'utf8',
    );
    mockFetch.mockResolvedValue(jsonResponse({ status: 'ok' }) as any);
    const provider = createAgentLocalRuntimeProvider({
      discoveryFile,
      daemonScript,
      pythonCommand: process.execPath,
      pythonArgs: [launcherScript, 'local-runtime', 'python'],
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
    const localRuntime: AgentLocalRuntimeClient = {
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
            execution_target: 'local_runtime',
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
        id: expect.stringMatching(/^agent-/),
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
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          {
            name: 'save_note',
            execution_target: 'local_runtime',
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
        data: { output: 'saved:hello' },
      })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
    expect(sentMessageOfType(socket, 'query')).toMatchObject({
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
    const lifecycleCalls: string[] = [];
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      registerModuleTool: jest.fn(async () => ({ success: true })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [
          {
            name: 'save_note',
            execution_target: 'local_runtime',
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
        data: { output: 'saved:hello' },
      })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
      localToolLifecycle: {
        beforeExecute: jest.fn(async (call) => {
          lifecycleCalls.push(`before:${call.toolName}`);
          return () => {
            lifecycleCalls.push(`release:${call.toolName}`);
          };
        }),
      },
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

    const streamAgentDefinition = {
      id: 'stream-query-agent',
      tools: {
        mode: 'explicit',
        disabled_tools: ['mouse_control'],
        client_manifest: { version: 1, tools: [] },
      },
    };
    const iterator = agent.stream('save this note', {
      conversationRef: 'conv-stream',
      backendPayload: {
        repo_instruction_messages: [{ role: 'system', content: 'Use stream repo rules.' }],
        agent_definition: { id: 'stale-backend-payload-agent' },
      },
      agentDefinition: streamAgentDefinition,
    });
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
        type: 'user_message',
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
    await waitForExpect(() => {
      expect(sentMessageOfType(socket, 'query')).toMatchObject({
        type: 'query',
        payload: {
          text: 'save this note',
          conversation_ref: 'conv-stream',
          repo_instruction_messages: [{ role: 'system', content: 'Use stream repo rules.' }],
          agent_definition: streamAgentDefinition,
        },
      });
    });

    socket.emit('message', {
      data: JSON.stringify({
        event_id: 'thought-stream-1',
        sequence: 1,
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
        event_id: 'stream-response-1',
        sequence: 2,
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
        event_id: 'tool-call-stream-1',
        sequence: 3,
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
    await waitForExpect(() => {
      expect(sentMessageOfType(socket, 'tool-result')).toMatchObject({
        type: 'tool-result',
        payload: {
          request_id: 'req-stream-save',
          success: true,
          data: { output: 'saved:hello' },
        },
      });
    });
    expect(lifecycleCalls).toEqual([
      'before:save_note',
      'release:save_note',
    ]);
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
        event_id: 'complete-stream-1',
        sequence: 4,
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
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
      executeTool: jest.fn(async (call) => ({
        success: true,
        data: { output: `${call.toolName}:${String(call.args.path ?? '')}` },
      })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
      value: { type: 'user_message' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'thinking' },
    });

    socket.emit('message', {
      data: JSON.stringify({
        event_id: 'tool-bundle-stream-1',
        sequence: 1,
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
    await waitForExpect(() => {
      expect(sentMessageOfType(socket, 'tool-bundle-result')).toMatchObject({
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
        event_id: 'complete-bundle-stream-1',
        sequence: 2,
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
    const screenImagePayload = 'a'.repeat(600);
    const nestedImagePayload = 'b'.repeat(650);
    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({ version: 1, tools: [] })),
      executeTool: jest.fn(async () => ({
        success: true,
        data: {
          output: 'captured',
          screen_image: screenImagePayload,
          screen_image_content_type: 'image/jpeg',
          nested: {
            image_base64: nestedImagePayload,
            content_type: 'image/png',
          },
        },
      })),
    };
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      localRuntime,
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
      value: { type: 'user_message' },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'state', state: 'thinking' },
    });

    socket.emit('message', {
      data: JSON.stringify({
        event_id: 'tool-call-attachments-1',
        sequence: 1,
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

    await waitForExpect(() => {
      expect(sentMessageOfType(socket, 'tool-result')).toMatchObject({
        type: 'tool-result',
        payload: {
          request_id: 'req-capture',
          success: true,
          data: {
            output: 'captured',
            screen_image: screenImagePayload,
            screen_image_content_type: 'image/jpeg',
            nested: {
              image_base64: nestedImagePayload,
              content_type: 'image/png',
            },
          },
        },
      });
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
              screen_image_content_type: 'image/jpeg',
              nested: {
                content_type: 'image/png',
              },
            },
            attachments: [
              {
                kind: 'image',
                fieldPath: 'screen_image',
                key: 'screen_image',
                contentType: 'image/jpeg',
                value: screenImagePayload,
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
        event_id: 'complete-attachments-1',
        sequence: 2,
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
        type: 'user_message',
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
        event_id: 'stream-error-1',
        sequence: 1,
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
        event_id: 'backend-chunk-1',
        sequence: 1,
        id: 'backend-chunk-1',
        type: 'streaming-response',
        conversation_ref: 'conv-runtime-public',
        turn_ref: 'turn-runtime-public',
        payload: { text: 'partial' },
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    await conversation.rehydrate();

    expect(sentMessageOfType(socket, 'query')).toMatchObject({
      id: 'turn-runtime-public',
      type: 'query',
      payload: {
        text: 'hello runtime',
        conversation_ref: 'conv-runtime-public',
      },
    });
    expect(sentMessageOfType(socket, 'rehydrate-conversation')).toBeUndefined();
    const loadedConversation = await conversation.load();
    expect(loadedConversation).toMatchObject({
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
    const originalUserMessageId = loadedConversation.display.messages.find(message => message.sender === 'user')?.id;
    expect(originalUserMessageId).toEqual(expect.any(String));
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
    socket.clearSent();
    await expect(conversation.editAndResend({
      messageId: originalUserMessageId as string,
      text: 'edited runtime',
      payload: {
        screenshot_ref: 'artifact-edit',
      },
    })).resolves.toEqual(expect.objectContaining({
      turnRef: expect.any(String),
    }));
    expect(sentMessageOfType(socket, 'query')).toMatchObject({
      type: 'query',
      payload: {
        text: 'edited runtime',
        conversation_ref: 'conv-runtime-public',
        screenshot_ref: 'artifact-edit',
      },
    });
    const editedTimeline = await conversation.loadDisplayTimeline();
    await expect(conversation.checkoutRevision({
      revisionId: editedTimeline.revisionId,
    })).resolves.toEqual(expect.objectContaining({
      displayTimeline: expect.objectContaining({
        revisionId: editedTimeline.revisionId,
      }),
    }));
    const forkResult = await conversation.fork({
      sourceRevisionId: editedTimeline.revisionId,
      cutAfterRowId: editedTimeline.rows[0]?.id as string,
    });
    expect(forkResult).toEqual(expect.objectContaining({
      sourceConversationRef: 'conv-runtime-public',
    }));
    expect(forkResult.conversationRef).toMatch(/^conv_/);
    await agent.deleteConversation('conv-runtime-public');
    await agent.deleteConversation(forkResult.conversationRef);
    await expect(agent.listConversations()).resolves.toEqual([]);
  });

  test('agent.conversation persists memory trace events from the SDK enrichment path', async () => {
    const store = new InMemoryConversationStore();
    const localRuntimeRpc = jest.fn(async ({ method }) => {
      if (method === 'search_memory_by_embedding') {
        return {
          success: true,
          data: {
            memories: {
              episodic: ['previous event'],
              semantic: [],
            },
            trace: {
              runtime: 'local-runtime',
              method: 'search_memory_by_embedding',
              episodicResultCount: 1,
              semanticResultCount: 0,
              durationMs: 5,
            },
          },
        };
      }
      return { success: true, data: {} };
    });
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => ({
          embedding: [0.1, 0.2, 0.3],
          embedding_space_version: 'embed-v1',
        })),
      },
    };
    const session = {
      waitForOpen: jest.fn(async () => undefined),
      query: jest.fn(async () => 'turn-agent-trace'),
      on: jest.fn(() => () => undefined),
      close: jest.fn(),
    };
    const agent = new Agent(
      'agent-trace',
      session as any,
      {},
      sdkClient as any,
      { listAgents: jest.fn(() => []) },
      { rpc: localRuntimeRpc } as any,
      'user-1',
      store,
    );

    const conversation = agent.conversation({ conversationRef: 'conv-agent-trace' });
    await conversation.send({ text: 'remember this', turnRef: 'turn-agent-trace' });

    const events = await store.loadEvents('conv-agent-trace');
    const traceEvents = events.filter(event => event.type === 'trace_event');
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        turnRef: 'turn-agent-trace',
        payload: expect.objectContaining({
          path: 'memory.retrieval',
          status: 'started',
        }),
      }),
      expect.objectContaining({
        turnRef: 'turn-agent-trace',
        payload: expect.objectContaining({
          path: 'memory.local_runtime_search',
          status: 'succeeded',
          data: expect.objectContaining({
            method: 'search_memory_by_embedding',
            episodicResultCount: 1,
          }),
        }),
      }),
      expect.objectContaining({
        turnRef: 'turn-agent-trace',
        payload: expect.objectContaining({
          path: 'memory.retrieval',
          status: 'succeeded',
        }),
      }),
    ]));
    expect(localRuntimeRpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'search_memory_by_embedding',
      params: expect.objectContaining({
        trace_context: expect.objectContaining({
          traceId: expect.stringMatching(/^trace_/),
          conversationRef: 'conv-agent-trace',
          turnRef: 'turn-agent-trace',
        }),
      }),
    }));
  });

  test('agent.chat exposes a UI-facing session facade', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
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
        type: 'user_message',
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
        event_id: 'chat-complete-1',
        sequence: 1,
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

  test('agent.chat defaults to the agent conversation ref', async () => {
    const client = new AgentClient({
      backendUrl: 'https://backend.example.test',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const wakePromise = client.wakeUp({
      agentId: 'default-chat-agent',
      systemPrompt: 'Use default chat sessions.',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    const agent = await wakePromise;
    const chat = agent.chat();

    expect(chat.conversationRef).toBe('conv-default-chat-agent');

    const iterator = chat.stream('hello default chat');
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'state',
        state: 'sending',
        conversationRef: 'conv-default-chat-agent',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'user_message',
        conversationRef: 'conv-default-chat-agent',
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'state',
        state: 'thinking',
        conversationRef: 'conv-default-chat-agent',
      },
    });
    await waitForExpect(() => {
      expect(sentMessageOfType(socket, 'query')).toMatchObject({
        type: 'query',
        payload: {
          text: 'hello default chat',
          conversation_ref: 'conv-default-chat-agent',
        },
      });
    });

    socket.emit('message', {
      data: JSON.stringify({
        event_id: 'default-chat-complete-1',
        sequence: 1,
        type: 'streaming-complete',
        conversation_ref: 'conv-default-chat-agent',
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
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});
