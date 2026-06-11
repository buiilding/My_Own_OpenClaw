# Compaction-Safe Plan Execution

Moderate and major implementation changes must be resilient to context-window
compaction. Treat the active `docs/plans/` plan and its matching report as the
durable source of truth for the task, not the conversational history.

- The required loop is: recover state from the plan/report, inspect the current
  codebase against the plan's target architecture, design and implement the next
  coherent slice, run focused validation for that slice, perform a fresh
  design-inspection pass, and repeat until inspection finds no remaining
  in-scope work.
- Before editing code, create a dated, scope-named plan file under
  `docs/plans/`. The plan is a pre-flight execution contract. It must restate
  the user intent, describe the architectural change conceptually, name
  out-of-scope work, provide an ordered workflow, checklist, success criteria,
  validation commands, assumptions, and the reread anchors needed after context
  compaction.
- After writing the plan, proceed with implementation when the user has asked
  for the planned work to be completed or the active goal explicitly says to
  continue. Do not pause solely for a separate approval message. In the plan,
  explain the proposed change in architectural, conceptual bullet points: what
  source of truth changes, which runtime boundaries move, what old path is
  deleted or preserved, and what behavior must not regress.
- If the user changes direction, update the plan file first, then continue from
  the updated plan unless the user explicitly asks to pause for review.
- The plan should not be only a fixed list of edits. For architecture cleanup,
  it must define an inspection workflow: read the relevant code, identify code
  that violates the target architecture, change it, reread the affected paths,
  and repeat until inspection finds no remaining violations or unclassified
  paths in scope.
- When a resumed turn contains a compacted summary or otherwise indicates lost
  history, do not jump directly to validation, commit, or handoff. Read the
  approved plan and matching report, use the report's latest checklist,
  findings, decisions, validation log, blockers, and commits to reconstruct the
  active task, then inspect the live code before choosing the next slice.
- While executing an active plan, create or update a matching report file
  under `docs/plans/`. Keep the report current as a realtime ledger. It must
  link the plan, track checklist and success-criteria status, document every
  commit created for the plan, record validation commands and results, and note
  decisions, tradeoffs, blockers, deviations from the approved plan, inspection
  passes, findings, changes made, newly satisfied criteria, and remaining
  findings.
- Do not end the turn just because one planned edit is complete. At the end of
  each coherent implementation slice, perform a fresh design-inspection pass:
  reread the affected code paths, search adjacent in-scope surfaces, and
  classify each finding as fixed, intentionally out of scope, or still requiring
  work. If any in-scope finding remains, design the next slice and continue.
- Treat validation as supporting evidence, not the final inspection. Grep
  inventories, tests, typechecks, builds, docs listing, and `git diff --check` can
  support the report, but they do not prove the target architecture is complete
  unless the live code has also been inspected and the remaining paths have been
  classified.
- End the implementation turn only when a fresh inspection finds no remaining
  in-scope changes to make, all success criteria are satisfied, validation has
  been recorded, and the report says the plan is complete. If that cannot be
  achieved, mark the plan/report blocked with the exact blocker and the evidence
  proving that further progress needs user input or an external change.
