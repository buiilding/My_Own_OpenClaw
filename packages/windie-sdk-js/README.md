# @windie/sdk

TypeScript SDK boundary for waking Windie agents from external clients.

This package is intentionally standalone: install and build it from this
directory without relying on the Electron app's `frontend/node_modules`.

```bash
cd packages/windie-sdk-js
npm install
npm run build
```

The public package surface for external app authors is `WindieClient`,
`WindieAgent`, `moduleTool`, hosted SDK route clients, local-runtime adapter
options, and conversation APIs. The built-in Electron desktop may use
lower-level SDK runtime modules behind first-party facades, but public examples
should model the high-level `WindieClient` path.

```ts
import { WindieClient } from '@windie/sdk';

const windie = new WindieClient({ backendUrl: 'https://api.windieos.com' });
const catalog = await windie.listModels();
const agent = await windie.wakeUp({
  plugins: [{ path: './plugins/repo-agent' }],
  model: {
    modelProvider: 'openai',
    modelId: 'gpt-5.4',
    modelMode: 'online',
    interactionMode: 'agent',
  },
});

await agent.setModel({
  modelProvider: 'mistral',
  modelId: 'mistral-large-latest',
});
await agent.run('Inspect the repo and summarize what changed.');

const conversation = agent.conversation({ conversationRef: 'repo-checks' });
for await (const event of conversation.stream({
  text: 'Run the tests and summarize failures.',
  model: {
    modelProvider: 'openai',
    modelId: catalog.config.selected_model_id,
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

Node examples that need local sidecar execution can let `WindieClient` own
daemon discovery and startup:

```ts
const windie = new WindieClient({
  backendUrl: 'https://api.windieos.com',
  autoSidecar: {
    pythonCommand: './scripts/python-in-env',
    pythonArgs: ['sidecar', 'python'],
  },
});
```

When `workspacePath` is omitted in a Node runtime, `WindieClient` uses
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
- `examples/local-tool-extension`: sidecar module-tool registration with
  `moduleTool(...)`.
- `examples/repo-agent-extension`: sidecar plugin package registration.
