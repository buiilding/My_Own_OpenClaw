# Custom UI Example

Minimal browser UI built directly on the Windie SDK runtime. It is not an
Electron renderer and does not use desktop transcript hooks.

Run from the repo root:

```bash
node examples/custom-ui/run.mjs
```

Open the printed local URL, type a message, and watch the response stream
through `agent.conversation(...).stream(...)`. The model selector loads the
mock backend-owned model catalog and calls `conversation.setModel(...)`, while
each turn also passes the selected model through the SDK per-turn option.

Smoke check without opening a browser:

```bash
node examples/custom-ui/run.mjs --smoke
```

This example proves the intended public shape:

- wake a `WindieClient`
- open a conversation runtime
- change models through the SDK runtime
- render SDK display projections
- stream turns through normalized runtime events
- keep UI state outside the desktop app
