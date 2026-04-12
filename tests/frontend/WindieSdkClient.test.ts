import {
  WindieSdkClient,
  type SdkPromptPreviewRequest,
  type SdkQueryPlanRequest,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly sent: string[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
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
      WebSocketImpl: FakeWebSocket as any,
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
      WebSocketImpl: FakeWebSocket as any,
    });

    const response = await client.promptPreview(payload);

    expect(response.prompt_token_count).toBe(42);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.windieos.com/api/sdk/prompt-preview',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      messages: [],
    };

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
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
        headers: { 'Content-Type': 'application/json' },
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
      WebSocketImpl: FakeWebSocket as any,
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

  test('connects an agent session, sends handshake and emits backend events', async () => {
    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      defaultOperatingSystem: 'macOS',
    });

    const connectPromise = client.agent.connect();
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('wss://api.windieos.com/ws');

    socket.emit('open', {});

    const session = await connectPromise;
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'handshake',
      user_id: 'dev-user',
      operating_system: 'macOS',
    });

    const toolSchemasEvents: Array<{ type: string; payload?: unknown }> = [];
    session.on('tool-schemas', event => {
      toolSchemasEvents.push(event);
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
        },
      }),
    });

    expect(toolSchemasEvents).toHaveLength(1);
    expect(toolSchemasEvents[0].payload).toEqual({
      tool_schemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
    });

    socket.clearSent();
    const messageId = await session.query({
      text: 'Click the orange search button',
      conversationRef: 'conv-123',
      screenshotRef: 'artifact-123.png',
    });

    const queryEnvelope = JSON.parse(socket.sent[0]);
    expect(messageId).toBe(queryEnvelope.id);
    expect(queryEnvelope).toMatchObject({
      type: 'query',
      payload: {
        text: 'Click the orange search button',
        conversation_ref: 'conv-123',
        screenshot_ref: 'artifact-123.png',
      },
    });
  });

  test('collects a full agent trace until streaming-complete', async () => {
    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
      defaultOperatingSystem: 'macOS',
    });

    const tracePromise = client.agent.traceQuery(
      {},
      {
        text: 'Summarize this file',
        conversationRef: 'conv-trace',
      },
    );

    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'handshake',
      user_id: 'dev-user',
      operating_system: 'macOS',
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: 'query',
      payload: {
        text: 'Summarize this file',
        conversation_ref: 'conv-trace',
      },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-response',
        payload: { text: 'partial' },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'streaming-complete',
        payload: { final_response: 'done' },
      }),
    });

    const trace = await tracePromise;

    expect(trace.finalResponse).toBe('done');
    expect(trace.events.map(event => event.type)).toEqual([
      'tool-schemas',
      'streaming-response',
      'streaming-complete',
    ]);
    expect(trace.queryMessageId).toBe(JSON.parse(socket.sent[1]).id);
  });

  test('fails trace collection on timeout and closes the socket', async () => {
    jest.useFakeTimers();

    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
      defaultUserId: 'dev-user',
    });

    const tracePromise = client.agent.traceQuery(
      {},
      {
        text: 'Inspect repo state',
        conversationRef: 'conv-timeout',
      },
      { timeoutMs: 25 },
    );

    const socket = FakeWebSocket.instances[0];
    socket.emit('open', {});
    await Promise.resolve();
    await Promise.resolve();

    const rejection = expect(tracePromise).rejects.toThrow('Windie agent trace timed out after 25ms');
    await jest.advanceTimersByTimeAsync(25);
    await rejection;
    expect(socket.closed).toBe(true);

    jest.useRealTimers();
  });

  test('requires an explicit user id when no default is configured', async () => {
    const client = new WindieSdkClient({
      httpBaseUrl: 'https://api.windieos.com',
      fetchImpl: mockFetch,
      WebSocketImpl: FakeWebSocket as any,
    });

    await expect(client.connectAgent()).rejects.toThrow(
      'WindieSdkClient.connectAgent requires a userId or defaultUserId',
    );
  });
});
