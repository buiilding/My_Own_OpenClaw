# Simple Chat CLI

Interactive Node CLI that connects to the remote WindieOS backend through the
local TypeScript SDK build and renders normalized `chat.stream(...)` events.

Run from the repo root:

```bash
node examples/simple-chat-cli/run.mjs
```

The script builds `packages/windie-sdk-js`, wakes an agent with the browser
builtin, creates `agent.chat()`, and renders state changes,
reasoning deltas, assistant deltas, tool-call payloads, tool-output payloads,
and errors from the SDK stream. Final assistant message events are received as
the canonical completed message, but the example does not print them when
assistant deltas have already streamed.

The SDK defaults to `WINDIE_BACKEND_URL` or `https://api.windieos.com` and reads
`WINDIE_API_KEY` as the install token when it is set. For the hosted backend,
the SDK registers a temporary install identity through `/api/install/register`
when `WINDIE_API_KEY` is not set. To reuse an existing hosted identity, pass:

```bash
WINDIE_API_KEY=<install-token> node examples/simple-chat-cli/run.mjs
```
