---
summary: "Plan for a first-run WindieOS onboarding path that routes developers toward self-hosted backend setup and routes everyday users away from API-key and backend-hosting complexity."
read_when:
  - Designing first-run onboarding, install flows, backend endpoint selection, or developer setup UX.
  - Changing hosted-vs-local backend routing, API-key collection, self-hosted backend scripts, or progress reporting during setup.
  - Planning product messaging around hosted backend cost, user-provided provider keys, or local backend privacy.
title: "Self-Hosted Backend Onboarding Plan"
---

# Self-Hosted Backend Onboarding Plan

## Objective

WindieOS should not assume Peter can indefinitely host the backend and provide free model tokens for every public user. The public onboarding path should make the cost and trust boundary explicit:

- developers are encouraged to self-host their own backend
- provider API keys stay user-owned
- users who do not want to expose API keys to WindieOS infrastructure can run everything through their own local backend
- users who only want the app experience should get a simpler path that avoids developer setup language

This is a planned product flow. Current desktop builds default to the hosted backend unless explicit backend endpoint environment overrides are set.

## Audience Split

First-run onboarding should ask:

> Are you using Windie as a developer or as an everyday user?

Use these labels:

- `Developer`
- `Everyday user`

Avoid `non-technical` in product copy. It can sound dismissive and does not describe the user's goal. `Everyday user` frames the choice around desired setup complexity, not ability.

## Developer Path

The developer path should route to a dedicated backend setup pipeline page with two choices.

## Option 1: Manual Self-Host

For developers who do not want to share API keys with a hosted WindieOS backend:

- link to the backend repo and self-hosting docs
- show the required runtime versions and environment variables
- explain that the local desktop app must point to their backend endpoint
- provide copyable commands, but do not run them automatically
- include a backend health-check step before switching the frontend endpoint

This path should be explicit that the user owns:

- clone location
- Python environment
- API keys
- backend process lifetime
- backend URL configured in the desktop app

## Option 2: Auto-Install Local Backend

For developers who want the app to prepare the local backend automatically:

1. show an install-size estimate before doing anything
2. ask for an install location
3. clone the backend repo
4. create the Python environment
5. install dependencies
6. collect required provider API keys
7. write keys to a local backend environment file or keychain-backed local secret store
8. launch the backend locally
9. run a health check
10. switch the frontend from hosted backend to local backend

The install page should separate estimates:

- repository checkout size
- Python environment and dependency size
- optional model/cache size if enabled
- final disk estimate after setup

The first implementation can show a conservative estimated range, then replace it with measured sizes as the installer downloads and creates files.

## API-Key Page Copy

The API-key page must be direct and trust-preserving. It should explain:

- these keys are used to run your local backend
- the keys are not needed so WindieOS can take them
- keys should stay on this machine unless the user intentionally chooses a remote backend
- the app should show where keys are stored and how to delete or rotate them

Suggested copy:

> These keys let your local Windie backend call the model providers you choose. They are stored for your local backend setup and are not sent to WindieOS as a hosted service credential. You can edit or remove them later.

If a future hosted path accepts user-provided keys, it must use separate copy and separate storage rules. Do not blur local backend keys with hosted-service credentials.

## Frontend Endpoint Redirect

After the local backend is healthy, the running frontend needs a first-class endpoint switch instead of relying on process restart or hidden environment variables.

Required behavior:

- detect local backend health at `http://127.0.0.1:<port>`
- switch backend HTTP and websocket targets to the local endpoint
- reconnect the SDK websocket runtime
- update renderer endpoint state used for artifact uploads, transcription, and status UI
- persist the selected backend mode as `hosted` or `local`
- offer a visible control to switch back to hosted/default behavior

The endpoint switch must respect the current runtime boundary:

- Electron main owns backend endpoint resolution and websocket ownership
- renderer can request a backend mode change through IPC
- sidecar receives backend HTTP URL through explicit environment/config propagation
- backend code is not imported by frontend or sidecar for this decision

## Progress UI Requirements

The auto-install path needs real progress reporting, not a spinner.

Each setup stage should have:

- stage name
- current action
- percentage within the stage
- overall percentage
- bytes downloaded or disk used where available
- command/process log disclosure for developers
- failure state with retry and clean-up guidance

Suggested stages:

| Stage | Weight |
| --- | ---: |
| Preflight checks | 5% |
| Repository clone | 15% |
| Python environment creation | 20% |
| Dependency install | 25% |
| API-key setup | 10% |
| Backend launch | 10% |
| Health check | 10% |
| Frontend endpoint switch | 5% |

Percentages should be deterministic enough for trust. Do not fake smooth progress after a subprocess stalls; show the current command and elapsed time.

## Security and Privacy Requirements

- Never log raw API keys.
- Never include API keys in progress text, telemetry, crash reports, or support bundles.
- Store local keys in an OS credential store when possible.
- If an env file is used, set restrictive permissions and show the path to the user.
- Make local-vs-hosted backend mode visible in settings and connection status.
- Warn before sending provider keys to any remote backend.
- Health checks must not include provider secrets.

## Implementation Surface

Likely code areas:

- first-run renderer onboarding flow
- Electron main backend endpoint resolver and reconnect orchestration
- local backend installer/launcher service
- sidecar backend URL propagation
- provider credential collection and storage
- backend health-check route/docs
- settings UI for backend mode and credential management

Likely docs to promote or update when implemented:

- install docs
- operations deployment docs
- frontend main backend endpoint docs
- security credential docs
- provider credential docs
- getting-started docs

## Open Questions

- Should auto-install clone the full monorepo or a backend-only distribution package?
- What is the acceptable initial disk estimate on macOS, Windows, and Linux?
- Should the local backend be managed as a child process, login item/service, or explicit user-started process?
- Should provider keys be stored only in OS keychain, or is a local `.env` fallback acceptable?
- How should upgrades work when the local backend repo has user changes?
- Should everyday users be offered hosted mode only, or a simplified local-backend setup with fewer developer details?

## Validation Plan

Before shipping:

- unit-test endpoint candidate switching and persistence
- integration-test SDK websocket reconnect from hosted to local
- test sidecar receives the new backend HTTP URL after switch
- test installer failure and retry states
- test API-key redaction in logs
- run a clean-machine setup simulation on macOS, Windows, and Linux
- document manual recovery when clone, dependency install, backend launch, or health check fails
