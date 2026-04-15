---
summary: "Sidecar shell/process runtime reference: command execution modes, output token truncation policy, PTY handling, background session registry lifecycle, and process action semantics."
read_when:
  - When changing `run_shell_command`/`process` tool contracts, timeout behavior, or session I/O actions.
  - When debugging missing poll output, stuck background sessions, or registry cleanup/TTL behavior.
title: "Shell and Process Session Runtime Reference"
---

# Shell and Process Session Runtime Reference

## Canonical Modules

- `frontend/src/main/python/tools/system/shell_tool.py`
- `frontend/src/main/python/tools/system/shell_output_formatting.py`
- `frontend/src/main/python/tools/system/shell_response_payloads.py`
- `frontend/src/main/python/tools/system/process_tool.py`
- `frontend/src/main/python/tools/system/shell_process_registry.py`
- `frontend/src/main/python/tools/schemas.py` (`RunShellCommandArgs`, `ProcessShellCommandArgs`)
- `tests/sidecar/test_shell_output_formatting.py`
- `tests/sidecar/test_shell_process_tool.py`
- `tests/sidecar/test_shell_process_registry.py`

## Runtime Purpose

`run_shell_command` executes shell commands in foreground or background, while `process` manages background sessions (`list`, `poll`, `log`, `write`, `send-keys`, `submit`, `paste`, `kill`, `clear`, `remove`).

Detached GUI app launching is handled by `open_app` (outside shell session registry lifecycle).

Model-facing wording note:

- backend schema/description guidance for `run_shell_command`, `process`, and `open_app` now avoids naming other tools inside tool descriptions unless the relationship is intrinsic to the contract
- session follow-up behavior is described in terms of the returned `session_id`, not by telling the model to call a different tool by name
- visual verification wording now uses generic `screen image` / `capture` terminology in shared schema text where possible

The design separates:

- execution path + stream capture (`shell_tool.py`)
- output/token formatting + `llm_content`/`return_display` shaping (`shell_output_formatting.py`)
- foreground/background response envelope assembly (`shell_response_payloads.py`)
- session state store + retention policy (`shell_process_registry.py`)
- user-facing session operations (`process_tool.py`)

## `run_shell_command` Flow

Entry: `run_shell_command(args: dict)`.

Validation and defaults:

- `command` must be non-empty
- `directory` may be omitted, absolute, or relative; omitted and relative values resolve from the selected workspace folder from `filesystem_workspace_access` when available, then `Path.home()`
- `max_output_tokens` defaults to `10000`; must be positive int
- `terminate_after_seconds` defaults to `120.0`
- optional `pty=true` is best-effort (disabled on Windows or missing `pty` module)
- repository/log search guidance remains model-facing rather than executor-enforced: prefer `rg` and exclude generated directories such as `node_modules`, `frontend/release`, `frontend/python-runtime`, and `.git` unless the user explicitly needs them

Execution transport:

- Windows: `powershell.exe -NoProfile -NonInteractive -Command ...`
- non-Windows: `bash -c ...`
- Linux sudo path:
  - when `sudo_auth_mode=os_prompt` (default), leading `sudo ...` is rewritten to `pkexec bash -lc ...` so elevation uses the OS authentication dialog instead of sidecar terminal password prompts
  - when `sudo_auth_mode=native`, command stays `sudo ...` unchanged (used when agent passwordless sudo is enabled)
- optional PTY path uses `pty.openpty()` and a single read loop
- non-PTY path reads stdout/stderr concurrently via `_read_stream`

Sudo auth outcomes on Linux:

- if `pkexec` is unavailable, `run_shell_command` fails fast with an explicit error
- if user cancels/denies the OS auth prompt, tool output reports a normalized error:
  - `User canceled or denied the OS authentication prompt for this sudo command.`

Foreground vs background:

- `run_in_background=true`: marks session backgrounded and returns `session_id`
- `yield_after_seconds`: foreground call can return early as running background session
- foreground with timeout waits for exit; on timeout kills process and reports `timed_out=true`

Output shaping:

- LLM output uses approximate token budgeting (`4 chars ~= 1 token`)
- oversized output is head+tail truncated with marker `... tokens truncated ...`
- response includes:
  - `output_token_limit`
  - `original_output_tokens`
  - `output_truncated`
  - `llm_content`
  - human-readable `return_display`

## Session Registry Model

Core entities:

- `ProcessSession` for active jobs
- `FinishedSession` for completed background jobs

Key maps:

- `_running_sessions`
- `_finished_sessions`

Retention + limits:

- `WINDIE_SHELL_JOB_TTL_SECONDS` env controls finished-session TTL (clamped `60..10800`, default `1800`)
- aggregate output capped per session (`max_output_chars`, default `200000`)
- pending poll buffers capped separately (`pending_max_output_chars`, default `30000`)
- tails kept (`DEFAULT_TAIL_CHARS = 2000`)

Output bookkeeping:

- `append_output` updates aggregate and per-stream buffers
- truncation flag set when caps trim data
- `drain_pending` returns incremental stdout/stderr since last poll

Lifecycle:

- `mark_backgrounded` toggles session visibility for list/poll/log
- `mark_exited` moves background sessions to finished map with snapshot metadata
- sweeper task periodically prunes expired finished sessions

## `process` Tool Actions

`list`:

- returns running (backgrounded only) and finished session summaries

`poll`:

- backgrounded running session: drains pending stdout/stderr and reports status
- finished session: returns snapshot output without requiring running entry

`log`:

- line-sliced view over aggregated output using `offset` + `limit`

Interactive input actions (`write`, `send-keys`, `submit`, `paste`):

- require active backgrounded session
- write to PTY master for PTY sessions or process stdin otherwise
- `send-keys` supports symbolic keys, hex bytes, and literal payload
- `paste` optionally wraps payload in bracketed-paste escape sequences

Termination and cleanup:

- `kill` stops active process and finalizes status
- `clear` drops all finished sessions
- `remove` force-removes active or finished sessions (kills process if needed)

## Behavioral Guarantees (Tests)

`tests/sidecar/test_shell_process_tool.py` covers:

- background poll path and completion states
- timeout handling + timeout flag
- default cwd fallback to selected workspace folder, then user home
- environment override support
- PTY warning behavior when unavailable
- default/custom output token truncation
- session list/poll/log/write/send-keys/remove/clear paths

`tests/sidecar/test_shell_process_registry.py` covers:

- session id uniqueness
- output cap and truncation accounting
- finished-session movement on exit
- TTL pruning behavior
- sweeper cancellation/reset and registry shutdown cleanup

`tests/sidecar/test_shell_output_formatting.py` covers:

- `max_output_tokens` default/validation behavior
- truncation marker and token-count metadata in `llm_content`
- status-specific `return_display` formatting

## Drift Hotspots

1. Changing session id/output field names breaks renderer/main-process assumptions for poll/log tooling.
2. Tweaking output truncation logic can silently alter LLM context quality for long commands.
3. Inconsistent PTY fallback handling can cause platform-specific stdin/write failures.
4. Registry cap/TTL changes directly affect memory footprint and debugging retention windows.

## Related Pages

- [Shell Output Formatting and Response Payload Contract Reference](system/shell_output_formatting_and_response_payload_contract_reference.md)
