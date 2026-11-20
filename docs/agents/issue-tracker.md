# Issue tracker: Kiro specs (local markdown)

Specs and tickets for this repo live as markdown files in `.kiro/specs/`, so one trail serves both these skills and Kiro's spec-driven workflow.

## Conventions

- One feature per directory: `.kiro/specs/<feature-slug>/`
- The spec is split into Kiro's files:
  - `requirements.md`: problem, user stories and acceptance criteria (the "what")
  - `design.md`: the design and its decisions (the "how")
- `tasks.md` is the ticket index: one checklist line per ticket, in blocking order, linking to its file. Tick a line (`- [x]`) when the ticket's `Status:` becomes `done`.
- Implementation tickets are one file each at `.kiro/specs/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Each ticket has a `Status:` line near the top (`open`, `claimed`, `done`, or a triage role from `triage-labels.md`) and a `Blocked by: NN, NN` line when it depends on other tickets
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create the file under `.kiro/specs/<feature-slug>/` (creating the directory if needed). A spec becomes `requirements.md` + `design.md`; tickets become `issues/NN-<slug>.md` plus a line in `tasks.md`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the ticket number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.kiro/specs/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.kiro/specs/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.kiro/specs/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
