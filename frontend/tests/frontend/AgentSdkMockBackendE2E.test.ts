/**
 * Covers Agent SDK mock backend end-to-end behavior in the frontend test suite.
 */

import {
  moduleTool,
  AgentClient,
  type AgentLocalRuntimeClient,
} from '../../packages/windie-sdk-js/src';

const WebSocket = require('../../node_modules/ws');
const { createMockBackendServer } = require('../../scripts/mock-backend.cjs');

describe('Agent SDK mock backend end to end', () => {
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
    const storedEvents: Array<Record<string, unknown>> = [];

    const localRuntime: AgentLocalRuntimeClient = {
      status: jest.fn(async () => ({ status: 'ok' })),
      listTools: jest.fn(async () => ({
        version: 1,
        tools: [{
          name: 'save_note',
          description: 'Save a note.',
          execution_target: 'local_runtime',
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
        data: { output: 'saved by fake daemon' },
      })),
      rpc: jest.fn(async ({ method, params }) => {
        if (method === 'conversation.append_event') {
          const eventPayload = params?.event_payload ?? params?.eventPayload ?? null;
          storedEvents.push({
            message_index: storedEvents.length + 1,
            event_payload: eventPayload,
          });
          return { success: true, data: { message_index: storedEvents.length } };
        }
        if (method === 'conversation.load_events') {
          return { success: true, data: { events: storedEvents } };
        }
        if (method === 'conversation.get_revision') {
          const latestEvent = storedEvents[storedEvents.length - 1]?.event_payload as Record<string, unknown> | undefined;
          return {
            success: true,
            data: {
              revision_id: latestEvent?.revisionId ?? 'rev-mock-e2e',
              updated_at: latestEvent?.timestamp ?? new Date(0).toISOString(),
            },
          };
        }
        if (method === 'search_memory_by_embedding') {
          return { success: true, data: { memories: {} } };
        }
        if (method === 'store_memory_by_embedding') {
          return { success: true, data: { stored: true } };
        }
        return { success: true, data: {} };
      }),
    };

    const client = new AgentClient({
      backendUrl: `http://127.0.0.1:${port}`,
      fetchImpl: jest.fn() as unknown as typeof fetch,
      WebSocketImpl: WebSocket,
      defaultUserId: 'mock-user',
      localRuntime,
    });
    const agent = await client.wakeUp({
      agentId: 'mock-e2e-agent',
      systemPrompt: 'Use the fake daemon.',
      memory: false,
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
      if (event.type === 'error') {
        throw new Error(event.message);
      }
    }

    expect(events).toEqual(expect.arrayContaining([
      'state',
      'assistant_delta',
      'tool_calls',
      'tool_outputs',
      'assistant_message',
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
