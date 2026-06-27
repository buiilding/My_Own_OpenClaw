---
summary: "HTTP and websocket surface map for WindieOS hosted backend routes, SDK routes, artifacts, memory, transcription, runs, and install auth."
read_when:
  - When integrating with WindieOS backend APIs.
  - When adding or changing HTTP routes, websocket routes, SDK endpoints, or hosted auth.
title: "HTTP and WebSocket API Surface"
---

# HTTP and WebSocket API Surface

This page is the route-level map. Use [API Reference](api_reference.md) for payload examples and longer protocol notes.

For gateway-level route assembly, auth, health checks, and hosted troubleshooting, start with Gateway Hub (private backend docs).

## Public/Hosted Surfaces

| Surface | Routes | Code owner |
| --- | --- | --- |
| Main agent websocket | `GET /ws` | private backend implementation |
| Transcription websocket | `GET /ws/transcription` | private backend implementation |
| Install registration | `POST /api/install/register` | backend install-auth routes/services |
| Artifacts | `/api/artifacts/*` | private backend implementation |
| Memory embeddings | `/api/embeddings/*` | private backend implementation |
| Semantic summarize/title | `/api/semantic/*` | private backend implementation |
| SDK OCR/vision/debug | `/api/sdk/*` | private backend implementation |

## SDK Route Families

private backend implementation exposes developer-facing routes for:

- OCR run, inspect, text search, candidate ranking, and candidate resolution
- OCR/vision overlays
- vision locate, locate-all, and describe
- prompt preview and query plan generation
- debug model list, tool schemas, tool capabilities, config snapshot, and system prompt access

These routes should expose backend-owned perception and introspection without
requiring SDK consumers to start the desktop app or local-runtime process.

## Runs API


- create run
- get run
- list/ingest run events
- control run
- stop all runs in a workspace
- worker polling, dispatch acknowledgment, and heartbeat

Runs routes require the runs API key dependency. Do not route normal desktop app query traffic through the runs API.

Detailed run orchestration docs:

- Automation Hub (private backend docs)
- Runs API Runbook (private backend docs)

## Auth Rules

- Hosted `/api/*` requests require install-token authorization except install registration.
- Main websocket hosted sessions require `Authorization: Bearer <install_token>`.
- Runs API routes use their own API key dependency.

## Change Path

1. Update route models and router code.
2. Update API reference payload examples.
3. Update backend route/schema tests.
4. Update SDK clients if the route is public to TypeScript or Python consumers.
5. Update frontend/main bridge docs only if the desktop app consumes the route through Electron IPC.
