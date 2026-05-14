# Extensions

This directory is reserved for reusable Windie Agent extensions.

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
contract. Ordinary sidecar extension tools declare their Python executable as an
`entrypoint` in `extension.json`; they do not require edits to the built-in
sidecar registry.
