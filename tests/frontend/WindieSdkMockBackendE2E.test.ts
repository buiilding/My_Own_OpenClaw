import {
  moduleTool,
  WindieClient,
  type WindieLocalRuntimeClient,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

const WebSocket = require('../../frontend/node_modules/ws');
const { createMockBackendServer } = require('../../scripts/mock-backend.cjs');

describe('Windie SDK mock backend end to end', () => {
  let server: any;
  let wss: any;
  let activeAgent: { sleep?: () => void } | null = null;

  afterEach(async () => {
    activeAgent?.sleep?.();
    activeAgent = null;
    if (wss?.clients) {
      for (const client of wss.clients) {
        client.terminate?.();
      }
    }
    await new Promise<void>((resolve) => {
      if (!wss || !server) {
        resolve();
        return;
      }
      wss.close(() => {
        server.close(() => resolve());
      });
    });
    server = null;
    wss = null;
  });

  test('streams through mock backend, local runtime tool execution, and tool-result continuation', async () => {
    ({ server, wss } = createMockBackendServer());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const localRuntime: WindieLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{
          name: 'save_note',
          description: 'Save a note.',
          execution_target: 'sidecar',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        }],
      })),
      registerModuleTool: jest.fn(async () => ({ ok: true })),
      executeTool: jest.fn(async () => ({
        success: true,
        data: { llm_content: 'saved by fake daemon' },
      })),
    };

    const client = new WindieClient({
      backendUrl: `http://127.0.0.1:${port}`,
      fetchImpl: jest.fn() as unknown as typeof fetch,
      WebSocketImpl: WebSocket,
      defaultUserId: 'mock-user',
      sidecar: localRuntime,
    });
    const agent = await client.wakeUp({
      agentId: 'mock-e2e-agent',
      systemPrompt: 'Use the fake daemon.',
      tools: [
        moduleTool({
          name: 'save_note',
          module: 'fake.tools:save_note',
          description: 'Save a note.',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        }),
      ],
    });
    activeAgent = agent;

    const events: string[] = [];
    for await (const event of agent.stream('save this note', { conversationRef: 'conv-mock-e2e' })) {
      events.push(event.type);
    }

    expect(events).toEqual(expect.arrayContaining([
      'start',
      'text',
      'tool_call',
      'tool_output',
      'complete',
    ]));
    expect((localRuntime.registerModuleTool as jest.Mock).mock.calls[0][0]).toMatchObject({
      name: 'save_note',
      module: 'fake.tools:save_note',
    });
    expect((localRuntime.executeTool as jest.Mock).mock.calls[0][0]).toMatchObject({
      toolName: 'save_note',
      args: {},
      requestId: 'mock-tool-call-1',
      conversationRef: 'conv-mock-e2e',
    });
    await expect(agent.loadConversation('conv-mock-e2e')).resolves.toMatchObject({
      state: { phase: 'completed' },
      display: {
        messages: expect.arrayContaining([
          expect.objectContaining({ messageType: 'user_message', text: 'save this note' }),
          expect.objectContaining({ messageType: 'tool_call', toolName: 'save_note' }),
          expect.objectContaining({ messageType: 'tool_output' }),
        ]),
      },
    });
  });
});
