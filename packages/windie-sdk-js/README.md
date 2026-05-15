# @windie/sdk

TypeScript SDK boundary for waking Windie agents from external clients.

The implementation currently shares the same runtime source used by the
Electron app. The public package surface is `WindieClient`, `WindieAgent`,
`moduleTool`, sidecar daemon helpers, and hosted SDK route clients.

```ts
import { WindieClient } from '@windie/sdk';

const windie = new WindieClient({ backendUrl: 'https://api.windieos.com' });
const agent = await windie.wakeUp({
  workspacePath: '/Users/me/project',
  plugins: [{ path: './extensions/repo-agent' }],
});

await agent.run('Inspect the repo and summarize what changed.');

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
