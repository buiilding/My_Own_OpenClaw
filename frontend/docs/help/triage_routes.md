---
summary: "User-visible failure triage routes for WindieOS, mapping symptoms to runtime owners, first checks, and deeper docs."
read_when:
  - When a report describes a visible symptom and the owning runtime is not clear.
  - When deciding whether to inspect backend, Electron main, renderer, preload,
    local runtime, platform, provider, packaging, or operations code first.
title: "Triage Routes"
---

# Triage Routes

Use this page before editing code when a bug report starts with a visible symptom. The goal is to find the first broken producer, not the first consumer that looks wrong.

## Fast Symptom Routes

| Symptom | Likely owner | First check | Deep docs |
| --- | --- | --- | --- |
| app opens but messages do not send | SDK runtime adapter, Electron query preparation, or backend websocket | connection logs and settings ACK | Endpoint and Network Debugging (private backend docs) |
| backend responds but model output never appears | backend event stream or renderer event consumer | stream trace and stale-turn filters | [Runtime Traces](../debug/runtime_traces.md), [Streaming and Events](../concepts/streaming_and_events.md) |
| model list is empty or wrong | backend provider/model catalog or renderer settings ACK | provider factory, catalog, credentials | [Models and LLM Providers](../providers/models.md) |
| tool call appears but no local action happens | SDK runtime tool router, Electron bridge, or local-runtime registry | backend tool event, SDK router handoff, and local-runtime request | [Tool Troubleshooting](../tools/tool_troubleshooting.md) |
| screenshot includes desktop overlay UI | platform overlay capture policy | Linux hide/restore vs macOS/Windows content protection | [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md) |
| permission is stuck | Electron permission service or stored permission state | platform probe and onboarding visibility | [Platform Permission Matrix](../platforms/permission_matrix.md) |
| browser action fails | local-runtime browser adapter/runtime | browser session state and local-runtime browser logs | [Browser Troubleshooting](../browser/browser_troubleshooting.md) |
| packaged app works differently than source | bundled runtime, endpoint env, installed app state, or package dependency | installed app logs and `resources/python-runtime` | [Install Troubleshooting](../install/install_troubleshooting.md) |
| voice or wakeword does not trigger | renderer audio, Electron wakeword bridge, local-runtime wakeword helper, or transcription route | mic permission, bridge logs, transcription websocket | [Voice and Wakeword](../desktop/voice_and_wakeword.md) |
| transcript, replay, or memory is stale | renderer transcript queue, local-runtime memory store, backend history, or semantic routes | identify visible transcript vs backend history vs semantic memory | [Memory Troubleshooting](../memory/memory_troubleshooting.md) |

## Runtime Owner Questions

Ask these in order:

1. Is the source app or packaged app being used?
2. Did the backend endpoint resolve to the intended host?
3. Did the websocket connect and complete handshake/settings sync?
4. Did the backend emit the expected event?
5. Did Electron main relay it?
6. Did the renderer consume it for the current turn/session?
7. Did the local runtime receive a request when a local tool was expected?
8. Is the failure OS-specific?
9. Is a provider, permission, or capability gate hiding the behavior by design?

## Do Not Start By

- editing renderer UI text because the UI is where the symptom is visible
- importing backend code into client/local-runtime Python code for parity
- adding platform branches in React components
- changing provider/model catalogs before checking credentials and model listing responses
- changing packaged runtime paths before proving source mode and packaged mode differ

## Related Docs

- [Diagnostics](diagnostics.md)
- Doctor Checklist (private backend docs)
- [Evidence Packet](evidence_packet.md)
- [Symptom Playbooks](../debug/symptom_playbooks.md)
