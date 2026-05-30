# Simple Chat CLI

Interactive Node CLI that connects to the remote WindieOS backend through the
local TypeScript SDK build and renders normalized `chat.stream(...)` events.

Run from the repo root:

```bash
WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs
```

The script builds `packages/windie-sdk-js`, wakes an agent with filesystem and
shell built-ins, creates `agent.chat(...)`, and renders state changes,
reasoning deltas, assistant deltas, tool-call payloads, tool-output payloads,
and errors from the SDK stream. Final assistant message events are received as
the canonical completed message, but the example does not print them when
assistant deltas have already streamed.

For hosted backends, the SDK registers a temporary install identity through
`/api/install/register` unless `WINDIE_API_KEY` or `WINDIE_INSTALL_TOKEN` is
set. To reuse an existing hosted identity, pass:

```bash
WINDIE_API_KEY=<install-token> WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs
```
