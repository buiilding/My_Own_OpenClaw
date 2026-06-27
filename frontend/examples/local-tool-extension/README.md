# Local Tool Extension Example

This is the smallest runnable Agent SDK example for a local module tool. It
does not use a plugin package; the SDK registers a Python `module:function`
entrypoint with the local-runtime daemon and routes the backend tool call
through it.

Run it from the repo root:

```bash
node examples/local-tool-extension/run.mjs
```

The script starts a mock backend, builds the local TypeScript SDK package from
`packages/windie-sdk-js`, and lets `AgentClient` own local-runtime daemon discovery
and startup through `autoLocalRuntime`. It registers `save_local_note` with
`moduleTool(...)`, streams one agent request, executes the local Python tool,
sends the tool result back to the backend, and prints the final response. It then calls
`agent.stop(...)` to show that local tool examples can use the same SDK runtime
controls as CLI and custom UI hosts.

Install example dependencies through the SDK package itself:

```bash
cd packages/windie-sdk-js
npm install
```

Files:

- `python/save_note.py`: local module tool implementation.
- `run.mjs`: SDK script and self-contained mock backend.
