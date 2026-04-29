# P002 — NEXT_PUBLIC_ Prefix Missing on Client-Side Env Vars

**Date:** 2026-04  
**File affected:** `.env.local`, `components/Navbar.tsx`  
**Severity:** Silent runtime failure

## What Happened

`ADMIN_EMAIL` was defined in `.env.local` without the `NEXT_PUBLIC_` prefix.
Client-side code checking `process.env.ADMIN_EMAIL` received `undefined`, making admin detection always fail.

## Fix

Renamed in `.env.local`:
```
NEXT_PUBLIC_ADMIN_EMAIL=you@example.com
```

Updated all references to use `process.env.NEXT_PUBLIC_ADMIN_EMAIL`.

## Rule

Any environment variable accessed in browser code (pages, components) **must** have the `NEXT_PUBLIC_` prefix. Server-only variables (API routes, scripts) do not need this prefix.

| Where accessed | Prefix required |
|---|---|
| `pages/*.tsx` (render) | ✅ `NEXT_PUBLIC_` |
| `components/*.tsx` | ✅ `NEXT_PUBLIC_` |
| `pages/api/*.ts` | ❌ No prefix needed |
| Python scripts | ❌ No prefix needed |
