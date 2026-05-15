# Repo Agent Extension Example

This is the canonical runnable Windie extension example. It includes one local
Python sidecar tool, one skill, and one SDK script that wakes an agent with this
extension.

Run it from the repo root:

```bash
node examples/repo-agent-extension/run.mjs
```

The script starts a mock backend, starts the real Windie sidecar daemon through
`scripts/python-in-env`, builds the local TypeScript SDK package if needed,
registers this extension through the SDK, streams one agent request, calls
`read_repo_snapshot`, prints the final response, and shuts everything down.

Files:

- `extension.json`: extension manifest.
- `tools/read_repo_snapshot.schema.json`: model-facing tool schema.
- `python/read_repo_snapshot.py`: local sidecar tool implementation.
- `skills/agent/SKILL.md`: reusable agent guidance.
- `run.mjs`: SDK script and self-contained mock backend.
