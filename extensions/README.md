# Extensions

This directory is reserved for reusable Windie Agent extensions.

Create a starter extension with:

```bash
scripts/create-windie-extension repo-agent --name "Repo Agent" --tool inspect_repo
```

Use this shape:

```text
extensions/
  my-extension/
    extension.json
    tools/
    python/
    ui/
    docs/
```

See [Extension Convention](../docs/development/extensions.md) for the current
contract. Ordinary sidecar extension tools declare their model-facing JSON
Schema as `schema` and their Python executable as an `entrypoint` in
`extension.json`.
