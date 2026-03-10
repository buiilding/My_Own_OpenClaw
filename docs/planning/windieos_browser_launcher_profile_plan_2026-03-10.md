---
summary: "Implementation plan for a user-visible Windie browser launcher that reuses WindieOS's dedicated persistent Chrome profile while differentiating it from the user's normal browser."
read_when:
  - When designing or implementing a user-facing Windie browser launcher/shortcut.
  - When deciding how WindieOS should expose its dedicated persistent browser profile to end users.
  - When evaluating profile-branding vs bundled-Chromium tradeoffs for browser identity.
title: "WindieOS Browser Launcher + Profile Branding Plan (2026-03-10)"
---

# WindieOS Browser Launcher + Profile Branding Plan (2026-03-10)

## Scope

This note captures the recommended plan for making WindieOS's dedicated browser session feel user-visible and intentionally separate from the user's normal browser without immediately shipping a fully bundled custom Chromium app.

Primary product direction:
- keep the existing WindieOS-owned persistent browser profile
- add a user-facing launcher/shortcut with WindieOS branding
- optionally seed profile metadata later so the in-browser profile is easier to recognize

## Current Runtime Facts

- WindieOS already launches Chrome/Chromium against a dedicated persistent profile directory instead of the user's default profile:
  - Windows: `%LOCALAPPDATA%/WindieOS/BrowserProfile`
  - macOS: `~/Library/Application Support/WindieOS/BrowserProfile`
  - Linux: `~/.config/windieos/browser-profile`
- The current CDP launch path uses:
  - `--user-data-dir=<windie profile dir>`
  - `--profile-directory=Default`
- The browser tool connect path already assumes this dedicated Windie browser instance and reuses it when available.
- WindieOS already ships icon assets suitable for a launcher/shortcut:
  - `frontend/src/main/assets/icons/windieos.ico`
  - `frontend/src/main/assets/icons/windieos.icns`
  - `frontend/src/main/assets/icons/linux/*`

## Product Decision

Recommended near-term solution:
1. Expose a user-visible "Windie Browser" launcher that opens Chrome with the WindieOS profile path.
2. Allow WindieOS to create an OS shortcut/launcher for that target with WindieOS branding.
3. Keep agent automation and manual user browsing on the same dedicated profile so sign-in state persists across both flows.

Why this is the right first step:
- low implementation risk relative to shipping a fully custom browser runtime
- preserves the dedicated persistent session model already present in the codebase
- gives users a recognizable entrypoint for "the browser Windie uses"
- avoids mixing Windie session state into the user's normal browser profile

## Important Limitation

A custom shortcut changes the launcher entry and icon. It does not fully change Chrome's process identity everywhere.

Implications:
- Windows and Linux can present a clearly separate desktop/start-menu launcher with Windie branding.
- macOS can present a wrapper/launcher, but the running app still largely looks like Chrome in Dock/menu-bar contexts.
- If WindieOS eventually needs a truly separate browser identity at runtime, bundled Chromium is the correct path.

## Proposed UX

User-facing surfaces:
- `Open Windie Browser`
- `Create Windie Browser Shortcut`
- `Reset Windie Browser Session`

Behavior:
- first launch opens a dedicated Windie browser window using the existing persistent profile
- user signs in once with normal credentials
- later Windie automation reuses that same session state
- reset clears only the Windie-owned browser profile, not the user's personal Chrome data

## Implementation Plan

### Phase 1: Shared Launcher Runtime

Add a small main-process/runtime module responsible for:
- resolving the canonical Windie browser profile directory using the same policy as the sidecar launcher
- resolving a Chrome/Chromium executable path
- building canonical launch arguments for the Windie browser profile
- opening the Windie browser in the foreground on demand

Contract:
- one source of truth for Windie browser args
- same profile path for manual launch and automation connect flows
- no use of the user's default browser profile

### Phase 2: Electron Main + IPC Surface

Add main-process commands for:
- `openWindieBrowser`
- `createWindieBrowserShortcut`
- `resetWindieBrowserProfile`

Renderer/UI candidates:
- onboarding
- settings
- browser permissions/runtime section

Requirement:
- all user-visible browser-launch actions should call the same canonical launcher runtime rather than duplicating OS command strings across modules

### Phase 3: OS-Specific Shortcut Creation

### Windows

Preferred path:
- create a `.lnk` shortcut
- target: detected Chrome executable
- args: WindieOS `--user-data-dir` + `--profile-directory=Default`
- icon: `windieos.ico`
- name: `Windie Browser`

Expected result:
- distinct desktop/start-menu entry
- clear user mental model: "this is the browser Windie uses"

### Linux

Preferred path:
- create a `.desktop` file
- `Exec=` points to Chrome/Chromium plus Windie profile args
- `Icon=` points to WindieOS launcher icon
- visible as a normal application launcher entry

### macOS

Fallback path:
- create a wrapper launcher or app alias that opens Chrome with the Windie profile args

Constraint:
- this improves launch discoverability, but not full runtime identity

Decision:
- support macOS launcher creation only if the UX is clean enough; otherwise expose `Open Windie Browser` without promising full separate-app branding on macOS

### Phase 4: Optional Profile Metadata Seeding

Optional enhancement after launcher support:
- seed the dedicated profile with a recognizable Windie profile name/avatar on first-run only

Possible approach:
- patch Chrome profile metadata files (`Local State`, profile `Preferences`) before first launch of an empty Windie profile

Caution:
- these files are Chrome-owned internals
- this is less stable than shortcut branding
- do not make this a prerequisite for the main launcher feature

### Phase 5: Reset + Recovery Controls

Add explicit controls for:
- opening the Windie browser
- recreating the shortcut if deleted
- clearing the Windie browser profile
- surfacing actionable errors when Chrome is missing or shortcut creation fails

Reset must only affect the Windie-owned profile directory.

## Test Plan

Add focused tests for:
- canonical profile-dir resolution stays aligned with current sidecar launcher logic
- launcher arg builder always includes the dedicated `--user-data-dir` and `--profile-directory`
- IPC handlers route to the launcher runtime correctly
- Windows/Linux shortcut generation emits expected target, args, and icon metadata
- reset path never targets the user's default browser profile

For macOS:
- if wrapper generation is implemented, test only deterministic path/command generation; avoid brittle OS-integration tests

## Documentation Follow-Up

Update stable docs when this ships:
- browser runtime/packaging docs
- onboarding or permission docs if the launcher is exposed there
- user-facing setup docs explaining that Windie Browser is a separate persistent profile, not a separate Chrome install

## Risks

- Chrome executable discovery may differ from the executable the user expects to open manually.
- Running Windie automation against a profile already open in another incompatible mode can create lock/contention issues if launch semantics drift.
- macOS may not meet user expectations for "separate browser icon" without moving to bundled Chromium.
- Profile metadata patching can break if Chrome changes internal preference keys.

## Recommendation Summary

Ship this in two layers:
1. dedicated profile plus branded launcher/shortcut
2. optional profile name/avatar seeding later

Defer bundled Chromium until WindieOS explicitly needs true runtime-level browser identity instead of a differentiated launcher entry.
