# @windie/sdk

TypeScript SDK boundary for waking Windie agents from external clients.

This package is intentionally standalone: install and build it from this
directory without relying on the Electron app's `frontend/node_modules`.

```bash
cd packages/windie-sdk-js
npm install
npm run build
```

The public package surface is `WindieClient`, `WindieAgent`, `moduleTool`,
sidecar daemon helpers, hosted SDK route clients, and the SDK conversation
runtime primitives used by desktop, CLI, and custom UI adapters.

```ts
import { WindieClient } from '@windie/sdk';

const windie = new WindieClient({ backendUrl: 'https://api.windieos.com' });
const catalog = await windie.listModels();
const agent = await windie.wakeUp({
  workspacePath: '/Users/me/project',
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
  if (event.type === 'text') {
    process.stdout.write(event.text);
  }
  if (event.type === 'tool_call') {
    console.log(`\nusing ${event.toolName}`);
  }
  if (event.type === 'complete') {
    console.log(`\n${event.finalResponse ?? ''}`);
  }
}
```

For custom clients that need durable local state, use the conversation runtime
pieces exported from this package:

- normalized conversation events
- `InMemoryConversationStore`
- projection builders for display, rehydrate, tool trace, and compaction state
- `SdkConversationRuntime`
- `ToolExecutionCoordinator`

Runnable repo examples:

- `examples/cli-agent`: minimal Node conversation runtime.
- `examples/custom-ui`: browser UI projection demo.
- `examples/local-tool-extension`: sidecar module-tool registration with
  `moduleTool(...)`.
- `examples/repo-agent-extension`: sidecar plugin package registration.
