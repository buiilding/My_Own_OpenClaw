# @windie/sdk

TypeScript SDK boundary for waking agents from external clients.

This package is intentionally standalone: install and build it from this
directory without relying on the Electron app's `frontend/node_modules`.

```bash
cd packages/windie-sdk-js
npm install
npm run build
```

The public package surface for external app authors is `AgentClient`,
`Agent`, `moduleTool`, hosted SDK route clients, local-runtime adapter
options, and conversation APIs. The built-in Electron desktop may use
lower-level SDK runtime modules behind first-party facades, but public examples
should model the high-level `AgentClient` path.

```ts
import { AgentClient } from '@windie/sdk';

const client = new AgentClient({ backendUrl: 'https://backend.example.com' });
const catalog = await client.listModels();
const selectedModelId = catalog.config?.selected_model_id ?? 'hosted-model';
const agent = await client.wakeUp({
  plugins: [{ path: './plugins/repo-agent' }],
  model: {
    modelProvider: 'hosted-provider',
    modelId: selectedModelId,
    modelMode: 'online',
    interactionMode: 'agent',
  },
});

await agent.setModel({
  modelProvider: 'other-hosted-provider',
  modelId: 'other-hosted-model',
});
await agent.run('Inspect the repo and summarize what changed.');

const conversation = agent.conversation({ conversationRef: 'repo-checks' });
for await (const event of conversation.stream({
  text: 'Run the tests and summarize failures.',
  model: {
    modelProvider: 'hosted-provider',
    modelId: selectedModelId,
  },
})) {
  if (event.type === 'conversation_event' && event.event.type === 'assistant_delta') {
    process.stdout.write(String(event.event.payload.text ?? ''));
  }
}
await conversation.retryTurn();

for await (const event of agent.stream('Run the repo checks and report progress.')) {
  if (event.type === 'assistant_delta') {
    process.stdout.write(event.text);
  }
  if (event.type === 'tool_calls') {
    for (const call of event.calls) {
      console.log(`\nusing ${call.toolName}`);
    }
  }
  if (event.type === 'tool_outputs') {
    for (const output of event.outputs) {
      console.log(`\n${output.toolName}: ${JSON.stringify(output.result)}`);
    }
  }
}
```

Node examples that need local-runtime execution can let `AgentClient` own
daemon discovery and startup:

```ts
const client = new AgentClient({
  backendUrl: 'https://backend.example.com',
  autoLocalRuntime: {
    daemonScript: './agent-local-runtime-daemon.py',
    pythonCommand: 'python3',
  },
});
```

When `workspacePath` is omitted in a Node runtime, `AgentClient` uses
`process.cwd()` and falls back to the user home path exposed by the environment.

For custom clients that need durable local state, use the conversation runtime
pieces exported from this package:

- normalized conversation events
- `InMemoryConversationStore`
- `FileConversationStore` for Node CLI/custom UI hosts that want durable local
  JSON event logs without Electron
- projection builders for display, rehydrate, tool trace, and compaction state
- `SdkConversationRuntime`
- `ToolExecutionCoordinator`

Runnable repo examples:

- `examples/cli-agent`: minimal Node conversation runtime.
- `examples/simple-chat-cli`: interactive remote-backend CLI using
  `agent.chat(...)`.
- `examples/custom-ui`: browser UI projection demo.
- `examples/local-tool-extension`: local-runtime module-tool registration with
  `moduleTool(...)`.
- `examples/repo-agent-extension`: local-runtime plugin package registration.
