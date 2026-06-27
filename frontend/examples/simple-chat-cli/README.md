# Simple Chat CLI

Interactive Node CLI that connects to a hosted backend through the
local TypeScript SDK build and renders normalized `chat.stream(...)` events.

Run from the repo root:

```bash
AGENT_BACKEND_URL=https://backend.example.com \
AGENT_INSTALL_TOKEN=<install-token> \
node examples/simple-chat-cli/run.mjs
```

The script builds `packages/windie-sdk-js`, wakes an agent with the browser
builtin, creates `agent.chat()`, and renders state changes,
reasoning deltas, assistant deltas, tool-call payloads, tool-output payloads,
and errors from the SDK stream. Final assistant message events are received as
the canonical completed message, but the example does not print them when
assistant deltas have already streamed.

The SDK requires an explicit backend endpoint through `AGENT_BACKEND_URL` or
`new AgentClient({ backendUrl })`. This example also requires
`AGENT_INSTALL_TOKEN` and does not register a temporary install identity.
To reuse an existing hosted identity, pass:

```bash
AGENT_BACKEND_URL=https://backend.example.com \
AGENT_INSTALL_TOKEN=<install-token> \
node examples/simple-chat-cli/run.mjs
```
