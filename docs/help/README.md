---
summary: "Help hub for WindieOS troubleshooting, diagnostics, logs, permissions, providers, tools, and packaged app issues."
read_when:
  - When debugging a user-visible WindieOS failure.
  - When adding troubleshooting docs for a recurring issue.
title: "Help Hub"
---

# Help Hub

Start here for user-visible failures. If the issue is implementation-specific, follow the linked deep docs after identifying the failing runtime.

## Help Pages

- [Diagnostics](diagnostics.md)
- [Troubleshooting](troubleshooting.md)

## First Questions

1. Is the failure in the hosted backend, Electron main, renderer, preload, or sidecar?
2. Is the app running from source or packaged?
3. Did the backend websocket connect and complete settings sync?
4. Did the sidecar local backend start and answer JSON-RPC?
5. Is the missing capability hidden by provider health, permissions, or config?

## Related Docs

- [Getting Started Troubleshooting](../getting-started/troubleshooting.md)
- [Configuration](../operations/configuration.md)
- [Security](../operations/security.md)
- [Platforms Hub](../platforms/README.md)
