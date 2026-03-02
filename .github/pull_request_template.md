## Summary

- 

## Testing

- 

## Frontend Runtime Invariants (Required)

Reference: `docs/frontend/runtime/frontend_runtime_invariants_checklist.md`

Check every applicable item below.  
If this PR does not touch frontend runtime behavior, check only the `inv-na-no-frontend-runtime-change` item.

- [ ] `inv-read-doc` Reviewed the runtime invariants doc and updated it when contract changes were intentional.
- [ ] `inv-chat-loop-flow` Preserved deterministic loop flow (send -> typing, first token -> response overlay, tool output -> typing).
- [ ] `inv-loop-interactivity` Preserved main-process ownership for loop interactivity (`click-through` + `focusable=false` during active loop).
- [ ] `inv-linux-capture-hide` Preserved Linux capture hide/restore contract (hide before capture, restore after, no focus steal).
- [ ] `inv-win-mac-content-protection` Preserved Windows/macOS capture policy (no collapse path; rely on content protection).
- [ ] `inv-no-focus-restore` Did not reintroduce renderer tab/window refocus recovery hacks.
- [ ] `inv-tests-updated` Added/updated relevant frontend regression tests for changed runtime paths.
- [ ] `inv-na-no-frontend-runtime-change` N/A: this PR does not change frontend runtime behavior.
