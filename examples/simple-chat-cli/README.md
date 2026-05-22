# Simple Chat CLI

Interactive Node CLI that connects to the remote WindieOS backend through the
local TypeScript SDK build.

Run from the repo root:

```bash
WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs
```

Run a single test message:

```bash
WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs --once="Say hello in one sentence."
```

The script builds `packages/windie-sdk-js`, wakes an agent, creates
`agent.chat(...)`, streams assistant text to stdout, and supports `/exit` and
`/stop` in interactive mode.

For hosted backends, the SDK registers a temporary install identity through
`/api/install/register` unless `WINDIE_INSTALL_TOKEN` is set. To reuse an
existing hosted identity, pass:

```bash
WINDIE_INSTALL_TOKEN=<install-token> WINDIE_BACKEND_URL=https://api.windieos.com node examples/simple-chat-cli/run.mjs
```
