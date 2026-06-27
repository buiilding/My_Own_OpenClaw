---
summary: "Help hub for WindieOS troubleshooting, diagnostics, triage routes, doctor-style checks, evidence packets, logs, permissions, providers, tools, and packaged app issues."
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
- [Triage Routes](triage_routes.md)
- [Doctor Checklist](doctor_checklist.md)
- [Evidence Packet](evidence_packet.md)
- [FAQ](faq.md)

## First Questions

1. Is the failure in the hosted backend, Electron main, renderer, preload, or local runtime?
2. Is the app running from source or packaged?
3. Did the backend websocket connect and complete settings sync?
4. Did the local runtime start the local-runtime Python daemon and answer JSON-RPC?
5. Is the missing capability hidden by provider health, permissions, or config?

## Related Docs

- [Getting Started Troubleshooting](../getting-started/troubleshooting.md)
- [Debug Hub](../debug/README.md)
- Configuration (private backend docs)
- Security (private backend docs)
- [Platforms Hub](../platforms/README.md)
