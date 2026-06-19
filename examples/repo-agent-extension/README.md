# Repo Agent Extension Example

This is the canonical runnable local-runtime plugin example. It includes one
local Python plugin tool and one SDK script that wakes an agent with this plugin.

Run it from the repo root:

```bash
node examples/repo-agent-extension/run.mjs
```

The script starts a mock backend, builds the local TypeScript SDK package from
`packages/windie-sdk-js`, and lets `AgentClient` own local-runtime daemon discovery
and startup through `autoLocalRuntime`. It registers this plugin through the SDK,
streams one agent request, calls `read_repo_snapshot`, prints the final
response, calls `agent.stop(...)`, and shuts everything down.

Install example dependencies through the SDK package itself:

```bash
cd packages/windie-sdk-js
npm install
```

Files:

- `plugin.json`: local-runtime plugin manifest.
- `schemas/read_repo_snapshot.schema.json`: model-facing tool schema.
- `python/read_repo_snapshot.py`: local-runtime tool implementation.
- `run.mjs`: SDK script and self-contained mock backend.
