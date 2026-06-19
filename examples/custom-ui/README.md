# Custom UI Example

Minimal browser UI built directly on the Agent SDK runtime. It is not an
Electron renderer and does not use desktop transcript hooks.

Run from the repo root:

```bash
node examples/custom-ui/run.mjs
```

Open the printed local URL, type a message, and watch the response stream
through `agent.conversation(...).stream(...)`. The model selector loads the
mock backend-owned model catalog and calls `conversation.setModel(...)`, while
each turn also passes the selected model through the SDK per-turn option.
The Retry and Stop buttons call `conversation.retryTurn(...)` and
`conversation.stop(...)` directly so custom UIs can own their shell while the
SDK owns the agent-loop contract.

Smoke check without opening a browser:

```bash
node examples/custom-ui/run.mjs --smoke
```

Install example dependencies through the SDK package itself:

```bash
cd packages/windie-sdk-js
npm install
```

This example proves the intended public shape:

- wake an `AgentClient`
- open a conversation runtime
- change models through the SDK runtime
- render SDK display projections
- stream turns through normalized runtime events
- retry and stop through SDK conversation commands
- keep UI state outside the desktop app
