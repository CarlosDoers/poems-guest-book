---
name: planning
description: Crea planes de implementación detallados y granulares antes de tocar el código. Se usa cuando se tienen requisitos claros para una tarea de varios pasos, asegurando TDD y commits frecuentes.
---

# Planning Implementation

## Overview
Write comprehensive implementation plans assuming the engineer has zero context for our codebase. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, and how to test it.

**Announce at start:** "I'm using the planning skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Bite-Sized Task Granularity
Each step should be a single action (2-5 minutes):
1. Write the failing test.
2. Run it to make sure it fails.
3. Implement the minimal code to make the test pass.
4. Run the tests and make sure they pass.
5. Commit.

## Plan Document Header
Every plan **MUST** start with this header:

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure
```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ext`
- Modify: `exact/path/to/existing.ext:line-range`
- Test: `tests/exact/path/to/test.ext`

**Step 1: Write the failing test**
[Code snippet]

**Step 2: Run test to verify it fails**
Run: `[Command]`
Expected: FAIL

**Step 3: Write minimal implementation**
[Code snippet]

**Step 4: Run test to verify it passes**
Run: `[Command]`
Expected: PASS

**Step 5: Commit**
```bash
git add ...
git commit -m "feat: ..."
```
```

## Remember
- Exact file paths always.
- Complete code in plan (not just descriptions).
- Exact commands with expected output.
- DRY (Don't Repeat Yourself), YAGNI (You Ain't Gonna Need It), TDD (Test Driven Development).
- Frequent commits.

## Execution Handoff
After saving the plan, offer to begin implementation step by step or suggest a workflow for execution.
