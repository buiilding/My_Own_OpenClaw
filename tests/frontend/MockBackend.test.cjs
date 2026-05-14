const WebSocket = require('../../frontend/node_modules/ws');
const { createMockBackendServer } = require('../../scripts/mock-backend.cjs');

function waitForEvent(events, type) {
  return new Promise((resolve) => {
    const existing = events.find((event) => event.type === type);
    if (existing) {
      resolve(existing);
      return;
    }
    events.waiters.push({ type, resolve });
  });
}

describe('mock backend', () => {
  let server;
  let wss;

  afterEach((done) => {
    if (!server) {
      done();
      return;
    }
    wss.close(() => {
      server.close(done);
    });
  });

  test('accepts handshake, query prompt layers, tool result, and completes', async () => {
    ({ server, wss } = createMockBackendServer());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events = [];
    events.waiters = [];
    ws.on('message', (raw) => {
      const event = JSON.parse(raw.toString());
      events.push(event);
      for (const waiter of [...events.waiters]) {
        if (waiter.type === event.type) {
          events.waiters.splice(events.waiters.indexOf(waiter), 1);
          waiter.resolve(event);
        }
      }
    });
    await new Promise((resolve) => ws.once('open', resolve));

    ws.send(JSON.stringify({
      type: 'handshake',
      client_tool_manifest: {
        tools: [{
          name: 'read_file',
          description: 'Read a file.',
          model_schema: { type: 'object' },
          execution_schema: { type: 'object' },
          execution_target: 'sidecar',
          argument_resolution: 'passthrough',
        }],
      },
    }));
    await waitForEvent(events, 'client-tool-manifest');
    await waitForEvent(events, 'remote-tool-catalog');

    ws.send(JSON.stringify({
      type: 'query',
      client_prompt_layers: [{
        id: 'custom-instructions',
        type: 'custom_instructions',
        priority: 60,
        content: 'Be concise.',
      }],
    }));
    const systemPrompt = await waitForEvent(events, 'system-prompt');
    const toolCall = await waitForEvent(events, 'tool-call');
    expect(systemPrompt.payload.client_prompt_layers[0].content).toBe('Be concise.');
    expect(toolCall.payload.tool_name).toBe('read_file');

    ws.send(JSON.stringify({
      type: 'tool-result',
      tool_name: 'read_file',
      request_id: 'mock-tool-call-1',
      result: { success: true, output: 'done' },
    }));
    const toolOutput = await waitForEvent(events, 'tool-output');
    const complete = await waitForEvent(events, 'streaming-complete');
    expect(toolOutput.payload.output).toBe('mock tool result accepted');
    expect(complete.payload.content).toBe('Mock response from Windie-agent backend.');
    ws.close();
  });
});
