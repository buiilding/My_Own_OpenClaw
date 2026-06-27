# windie-sdk

Python SDK boundary for waking agents from external clients.

The package installs as `windie-sdk` and imports as `windie`.

```python
from windie import AgentSdkClient

client = AgentSdkClient(
    backend_url="https://backend.example.com",
    default_user_id="dev-user",
)

agent = await client.wake_up(
    workspace_path="/Users/me/project",
    plugins=[{"path": "./plugins/repo-agent"}],
)

final_response = await agent.run("Inspect the repo and summarize what changed.")

async for event in agent.stream("Run the checks and report progress."):
    if event["type"] == "text":
        print(event["text"], end="")
    elif event["type"] == "tool_call":
        print(f"using {event['tool_name']}")
    elif event["type"] == "complete":
        print(event["final_response"])
```
