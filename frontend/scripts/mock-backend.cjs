#!/usr/bin/env node
/**
 * Runs the mock backend workflow for the developer CLI and automation tooling.
 */

const http = require('http');
const path = require('path');
const wsModule = require(path.resolve(__dirname, '../node_modules/ws'));

const WebSocketServer = wsModule.WebSocketServer || wsModule.Server;

function send(ws, type, payload = {}, envelope = {}) {
  ws.send(JSON.stringify({ ...envelope, type, payload }));
}

function createMockBackendServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'agent-sdk-mock-backend' }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let handshake = null;
    let pendingToolCall = null;
    let pendingRoutingEnvelope = {};
    let backendSequence = 0;
    const sendBackendEvent = (type, payload = {}, envelope = {}) => {
      backendSequence += 1;
      send(ws, type, payload, {
        ...envelope,
        event_id: `mock-backend-event-${backendSequence}`,
        sequence: backendSequence,
      });
    };

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (_error) {
        send(ws, 'error', { error: 'invalid JSON' });
        return;
      }

      if (!handshake) {
        if (message?.type !== 'handshake') {
          send(ws, 'error', { error: 'first message must be handshake' });
          ws.close();
          return;
        }
        handshake = message;
        const manifestTools = Array.isArray(
          message.agent_definition?.tools?.client_manifest?.tools,
        )
          ? message.agent_definition.tools.client_manifest.tools
          : [];
        send(ws, 'client-tool-manifest', {
          accepted: manifestTools,
          rejected: [],
        });
        send(ws, 'remote-tool-catalog', {
          remote_tools: [{
            name: 'web_search',
            description: 'Mock hosted web search tool.',
            enabled: true,
            available: true,
            reason_unavailable: null,
          }],
        });
        return;
      }

      if (message.type === 'query') {
        const queryPayload = message.payload && typeof message.payload === 'object'
          ? message.payload
          : {};
        const routingEnvelope = {
          conversation_ref: queryPayload.conversation_ref || message.conversation_ref,
          turn_ref: queryPayload.turn_ref || message.turn_ref,
        };
        const promptLayers = Array.isArray(message.client_prompt_layers)
          ? message.client_prompt_layers
          : [];
        const handshakeTools = Array.isArray(
          handshake.agent_definition?.tools?.client_manifest?.tools,
        )
          ? handshake.agent_definition.tools.client_manifest.tools
          : [];
        const toolSchemas = Array.isArray(handshakeTools)
          ? handshakeTools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.model_schema || { type: 'object' },
          }))
          : [];
        sendBackendEvent('system-prompt', {
          content: 'Mock Agent SDK system prompt.',
          tool_schemas: null,
          client_prompt_layers: promptLayers,
        }, routingEnvelope);
        sendBackendEvent('tool-schemas', { tool_schemas: toolSchemas }, routingEnvelope);
        sendBackendEvent('streaming-response', {
          chunk: 'Mock response from Agent SDK backend. ',
          text: 'Mock response from Agent SDK backend. ',
        }, routingEnvelope);

        const firstTool = handshakeTools[0];
        if (firstTool) {
          pendingToolCall = firstTool.name;
          pendingRoutingEnvelope = routingEnvelope;
          sendBackendEvent('tool-call', {
            tool_name: firstTool.name,
            parameters: {},
            request_id: 'mock-tool-call-1',
          }, routingEnvelope);
          return;
        }

        sendBackendEvent('streaming-complete', {
          content: 'Mock response from Agent SDK backend.',
          final_response: 'Mock response from Agent SDK backend.',
        }, routingEnvelope);
        return;
      }

      if (message.type === 'tool-result' || message.type === 'tool-bundle-result') {
        sendBackendEvent('tool-output', {
          tool_name: pendingToolCall || 'mock_tool',
          success: true,
          output: 'mock tool result accepted',
          metadata: { source: 'mock-backend' },
        }, pendingRoutingEnvelope);
        pendingToolCall = null;
        sendBackendEvent('streaming-complete', {
          content: 'Mock response from Agent SDK backend.',
          final_response: 'Mock response from Agent SDK backend.',
        }, pendingRoutingEnvelope);
        pendingRoutingEnvelope = {};
      }
    });
  });

  return { server, wss };
}

if (require.main === module) {
  const port = Number.parseInt(process.env.WINDIE_MOCK_BACKEND_PORT || '8765', 10);
  const { server } = createMockBackendServer();
  server.listen(port, () => {
    console.log(`Agent SDK mock backend listening on ws://127.0.0.1:${port}/ws`);
  });
}

module.exports = {
  createMockBackendServer,
};
