# Local Tool Extension Example

This is the smallest runnable Windie SDK example for a local module tool. It
does not use a plugin package; the SDK registers a Python `module:function`
entrypoint with the sidecar daemon and routes the backend tool call through it.

Run it from the repo root:

```bash
node examples/local-tool-extension/run.mjs
```

The script starts a mock backend, starts the real Windie sidecar daemon through
`scripts/python-in-env`, builds the local TypeScript SDK package if needed,
registers `save_local_note` with `moduleTool(...)`, streams one agent request,
executes the local Python tool, sends the tool result back to the backend, and
prints the final response.

Files:

- `python/save_note.py`: local module tool implementation.
- `run.mjs`: SDK script and self-contained mock backend.
