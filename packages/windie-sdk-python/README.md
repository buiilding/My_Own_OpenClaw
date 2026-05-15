# windie-sdk

Python SDK boundary for waking Windie agents from external clients.

The package installs as `windie-sdk` and imports as `windie`.

```python
from windie import WindieSdkClient

client = WindieSdkClient(
    backend_url="https://api.windieos.com",
    default_user_id="dev-user",
)

agent = await client.wake_up(
    workspace_path="/Users/me/project",
    plugins=[{"path": "./extensions/plugins/repo-agent"}],
)

await agent.query(text="Inspect the repo and summarize what changed.")
```
