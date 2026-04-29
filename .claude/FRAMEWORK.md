# Claude Agent Framework — StorePulse

## Purpose

This file is loaded at the start of every Claude session to provide continuity.
Claude should read `CLAUDE.md` (root) for the full developer guide.
This file covers AI-specific session structure and agent behavior.

---

## Session Startup Checklist

Before doing any work, verify:
1. Read `CLAUDE.md` — critical architecture context
2. Check `docs/KNOWN_ISSUES.md` — don't re-implement around a known workaround
3. Check `docs/ROADMAP.md` — understand where the feature fits
4. Check `git log --oneline -10` — understand recent changes
5. Verify file exists before editing (never assume from memory)

---

## Agent Behavior Rules

### Code Changes
- **Prefer Edit over Write** for existing files — always read first
- **Prefer small focused commits** — one concern per commit
- **Always check TypeScript** after editing `.tsx`/`.ts` files: `npx tsc --noEmit`
- **Never skip** `Cache-Control` headers on new API routes
- **Never** add `select('*')` in API routes — always specify columns

### When Adding New Categories
The exact checklist is in `CLAUDE.md` under "How to Add a New Store Category".
All 5 steps are required — skipping any breaks the pipeline.

### When Asked to "Prioritize Singapore"
- Check all `useState` defaults: should be `'singapore'` not `'taipei'`
- Check all hardcoded copy for Taiwan/Taipei references
- Check `intro.tsx`, `request.tsx`, and page titles

### Python Scripts
- Target Python 3.9 — no `X | Y` type union syntax
- Always test with `--dry-run` before writing to DB
- Use `.venv` at project root: `source .venv/bin/activate`

### Database
- Never run DROP or DELETE without explicit user instruction
- After bulk inserts: remind user to refresh materialized views
- Use `ON CONFLICT (google_place_id) DO NOTHING` or `DO UPDATE` for upserts

---

## Memory Summary

Key facts that survive between sessions:

| Fact | Value |
|---|---|
| Primary city | Singapore |
| Active stores in DB | ~5K (check pitch-stats for current count) |
| Categories | 14 |
| Districts | 31 (12 Taipei + 19 Singapore) |
| DB dedup key | `google_place_id` |
| Admin email env var | `NEXT_PUBLIC_ADMIN_EMAIL` |
| Supabase anon key var | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| Python version | 3.9 (in .venv) |
| Map default city | Singapore |
| Pitch ask | SGD 400K pre-seed |

---

## Pitfalls Log

See `.claude/pitfalls/` for detailed incident write-ups.

| ID | Pitfall | Quick fix |
|---|---|---|
| P001 | `dict | None` crashes Python 3.9 | Use bare `= None` default |
| P002 | Env var not accessible client-side | Add `NEXT_PUBLIC_` prefix |
| P003 | Mapbox layer op before style load | Wrap in `styleLoaded` promise |
| P004 | Old variable name in JSX after rename | Full-text search before committing |
| P005 | Port 3000 occupied | Dev server falls back to 3001 silently |

---

## Commit Message Convention

```
feat: short description of what was added
fix: short description of what was fixed
docs: documentation changes
refactor: code restructure with no behavior change
chore: dependency, config, tooling changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
