# Diviyata Sawiyak — Implementation Plan

2026-09-28 · Janindu Pramod

> **Status:** draft. This PLAN breaks the [SPEC](SPEC.md) into phases to build one at a time. Each task names the SPEC requirements it delivers (for example `CASE-5`) and each phase ends with the acceptance checks (`AC-n`) that must pass before the next phase starts.

## How we work

- **One phase at a time.** A phase is done only when its "Done when" checks pass. The next phase does not start before that.
- **One branch per phase** (`phase-1-foundation`, …), merged into `main` when the phase is done. Commit after each task.
- **Tests come with the code.** Every task that adds a rule adds its tests in the same commit. CI must be green before merging.
- **No real data in the repository.** Tests, seeds and demos use made-up people only. The real sheet is used once, on the production server, in Phase 8 (SEC-11).
- **Keep the documents in step.** When a requirement changes, update the PRD, SPEC and this PLAN together. After Phase 1, record the build, lint and test commands in `CLAUDE.md`.
- **Deferred questions** use the defaults in [SPEC section 13](SPEC.md#13-deferred-questions-and-the-defaults-used). When the Ministry answers one, change only the places listed there.

## Phases at a glance

| Phase | What it delivers | Depends on | Size |
| --- | --- | --- | --- |
| 1. Foundation | Project, database, Sinhala layout, CI | — | M |
| 2. Sign-in and permissions | Login, roles, data-access layer, audit log | 1 | M |
| 3. Admin | Accounts and lists screens | 2 | M |
| 4. Cases | New case, drafts, duplicate NIC, DS home | 3 | L |
| 5. Check and release | Head Office queues, decisions, Rs. 2M release | 4 | M |
| 6. Installments and progress | Installments, stages, photos, stop and reopen, history | 5 | L |
| 7. Dashboard and exports | Head Office dashboard, Excel exports, notifications | 6 | M |
| 8. Sheet import | Import script, imported-case review | 6 | M |
| 9. Go-live | Production server, backups, security and performance checks, training | 7, 8 | M |

Sizes are relative: S is a few days, M about one to two weeks, and L about two to three weeks of one developer's time.

## Target folder layout

```
src/
  app/
    (auth)/login, change-password
    ds/                 DS officer screens
    ho/                 Head Office screens
    admin/              admin screens
    files/[id]/route.ts protected file downloads
  components/           ui/ (shadcn), shell/ (header, menu), forms/
  server/               data-access layer: context, permissions, audit, one folder per area
  lib/                  nic.ts, phone.ts, dates.ts, money.ts, validation/ (Zod schemas)
  i18n/                 next-intl setup
messages/si.json        every screen string
prisma/                 schema.prisma, migrations/, seed.ts
data/                   seed lists (places and stages only, no personal data)
scripts/                import-sheet.ts, make-sample-sheet.ts, seed-load.ts, backup.sh
tests/e2e/              Playwright tests
docker/                 Dockerfile, nginx.conf
docker-compose.yml, docker-compose.dev.yml
```

## Phase 1 — Foundation

**Goal:** an empty Sinhala application that builds, tests and runs against PostgreSQL, with the prototype's layout.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 1.1 | Create the Next.js app: TypeScript strict, App Router, `src/`, ESLint and Prettier; pin exact versions | STK-1 | `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` |
| 1.2 | Add Tailwind and shadcn/ui; set the colours from the prototype (#0E5A4B and the neutrals) | UI-4 | `src/app/globals.css`, `src/components/ui/*` |
| 1.3 | Serve Noto Sans Sinhala from the app with `next/font/local`; 16 px base, line height 1.5 | UI-4, STK-2 | `src/app/fonts/*`, `src/app/layout.tsx` |
| 1.4 | Set up next-intl with the `si` locale and `messages/si.json`; date and money helpers (`YYYY.MM.DD`, `රු. 2,000,000`) | UI-1, UI-3 | `src/i18n/*`, `messages/si.json`, `src/lib/dates.ts`, `src/lib/money.ts` |
| 1.5 | PostgreSQL in `docker-compose.dev.yml`; Prisma with Province, District, DsOffice and AuditLog | Section 5 | `docker-compose.dev.yml`, `prisma/schema.prisma` |
| 1.6 | Seed the 9 provinces, 25 districts, the DS offices known so far, and the new-house stages | LST-1, LST-4 | `prisma/seed.ts`, `data/places.json`, `data/stages.json` |
| 1.7 | Page shells for the three roles: header, menu and "sample data" banner as in the prototype | UI-7 | `src/components/shell/*`, `src/app/{ds,ho,admin}/layout.tsx` |
| 1.8 | Vitest (with a test database) and Playwright; GitHub Actions running lint, type check, tests, build and `npm audit` | SEC-12 | `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` |
| 1.9 | A check that fails CI when a component contains hard-coded screen text | UI-1 | `eslint.config.mjs` (i18n rule) or `scripts/check-strings.ts` |

**Tests:** date and money formatting; the seed creates 9 provinces and 25 districts; a Playwright smoke test opens each shell and finds Sinhala text only.

**Done when:**
- `npm run dev` shows the Sinhala shell for each role.
- `npm test` and the Playwright smoke test pass, and CI is green on `main`.
- `CLAUDE.md` lists the commands to run the app, the tests and a single test.

## Phase 2 — Sign-in and permissions

**Goal:** people sign in with the right role, and every server call goes through one permission layer that also writes the audit log.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 2.1 | Better Auth with username and password, sessions in PostgreSQL, the admin plugin; User fields from section 5. Its HTTP endpoints are not mounted: sign-in, sign-out and password changes go through Server Actions (ARC-1) | AUTH-1, AUTH-6 | `src/lib/auth.ts`, `src/app/(auth)/actions.ts`, `prisma/schema.prisma` |
| 2.2 | Sign-in page in Sinhala; lock after 5 wrong passwords for 15 minutes; 10 attempts per minute per IP | AUTH-2, SEC-4 | `src/app/(auth)/login/*`, `src/server/auth/limits.ts` |
| 2.3 | Forced "set a new password" page for temporary passwords | AUTH-3 | `src/app/(auth)/change-password/*` |
| 2.4 | Session limits: 30 minutes idle, 12 hours maximum; disabled accounts stop working at once | AUTH-4, AUTH-5 | `src/lib/auth.ts` |
| 2.5 | Data-access layer: `getContext()` (user, role, office), `requireRole()`, office scoping, and "not found" for anything out of scope | ARC-2, PRM-1–3 | `src/server/context.ts`, `src/server/permissions.ts` |
| 2.6 | Audit writer used inside the same transaction as each change; a database trigger that refuses any change or removal of audit rows | ARC-4, HIS-1, HIS-3 | `src/server/audit.ts`, `prisma/migrations/*` |
| 2.7 | Proxy (Next.js 16's name for middleware) that only redirects signed-out users; role home pages; the "not found" page | ARC-3, ERR-2 | `src/proxy.ts`, `src/app/not-found.tsx` |
| 2.8 | Security headers, Server Actions origin check, error page with a reference code, logging without personal data | SEC-5, SEC-6, SEC-8, ERR-6 | `next.config.ts`, `src/app/error.tsx`, `src/server/log.ts` |

**Tests:** permission helpers for every role and office combination; an audit row is written with each change and rolled back with it; e2e for sign-in, lockout and the forced password change.

**Done when:**
- AC-4 passes.
- Each role lands on its own home page, and opening another role's page shows "not found".
- A test user created by the seed can sign in and must change their password.

## Phase 3 — Admin: accounts and lists

**Goal:** the admin can set up every office's officers and keep the lists, matching the prototype's admin screens.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 3.1 | Users list with search and role filter | ADM-1 | `src/app/admin/users/page.tsx`, `src/server/users/*` |
| 3.2 | Create account: form, district → DS choice, usernames, 12-character temporary password shown once, one active DS officer (the Child Rights Promotion Officer) per office, enforced by the database too | ADM-2, ADM-3 | `src/app/admin/users/*`, `src/lib/validation/user.ts`, `prisma/migrations/*` |
| 3.3 | Edit account and transfer to another office, with history | ADM-4, PRM-3 | `src/server/users/*` |
| 3.4 | Reset password, disable and enable, with the "last admin" and "not yourself" rules | ADM-5, ADM-6, ADM-7 | `src/server/users/*` |
| 3.5 | Lists: districts and DS offices (add, rename, deactivate) | LST-2, LST-3 | `src/app/admin/lists/*`, `src/server/lists/*` |
| 3.6 | Lists: stages per kind (add, rename, reorder, deactivate), on a second tab of the lists page (`/admin/lists?tab=stages`) | LST-4 | `src/app/admin/lists/*`, `src/server/lists/*` |

**Tests:** unit tests for username generation and the account rules; database tests for every account and list command and its audit record; e2e for creating a DS officer who then signs in (AC-3), transfer, reset and disable, adding an office and a stage, and a Head Office officer trying an admin page (not found).

**Done when:**
- AC-3 and AC-23 pass.
- An admin can create, reset, transfer and disable accounts, and every step shows in the audit log.

## Phase 4 — Cases: entry, drafts and the DS home

**Goal:** DS officers (and Head Office) can enter cases, save drafts and submit them, and DS officers see their own list.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 4.1 | Prisma: Case, Decision, File (which knows its case) and the case-number counter; statuses and categories as enums; `version` column | Section 5 | `prisma/schema.prisma` |
| 4.2 | NIC and phone rules, and the old-to-new NIC conversion | CASE-2, CASE-6 | `src/lib/nic.ts`, `src/lib/phone.ts` |
| 4.3 | Case form on one page with four parts, shared Zod schema, draft saving with partial checks | CASE-1–4 | `src/app/ds/cases/new/*`, `src/components/forms/case-form.tsx`, `src/lib/validation/case.ts` |
| 4.4 | Submit with confirmation, case numbers per DS per year (safe when two people submit at once) | CASE-5 | `src/server/cases/submit.ts` |
| 4.5 | Duplicate NIC warning that shows less for other offices | CASE-6 | `src/server/cases/duplicates.ts` |
| 4.6 | Document upload: one file per request as it is chosen, type checked from contents, random names, private folder, `/files/[id]` with the case's permission check | CASE-2, ARC-5, SEC-7, ERR-5 | `src/server/files/*`, `src/app/files/[id]/route.ts` |
| 4.7 | Returned-case editing with the Head Office reason at the top; draft deletion; save conflicts (`version`) | CASE-7, CASE-8, CASE-10, ERR-3, ERR-8 | `src/app/ds/cases/[id]/edit/*`, `src/server/cases/*` |
| 4.8 | DS home: list, tabs, search, and the to-do panel (returned cases and drafts for now) | HOME-1–3, FND-1 | `src/app/ds/page.tsx`, `src/server/cases/list.ts` |
| 4.9 | Head Office: new case (district → DS) and the case list with filters | CASE-3, FND-1 | `src/app/ho/cases/*` |

**Tests:** NIC and phone rules (AC-6); case-number generation under parallel submits; duplicate matching across offices (AC-7); e2e for office separation (AC-1), required-field errors (AC-5) and submitting (first half of AC-8).

**Done when:**
- AC-1, AC-5, AC-6 and AC-7 pass.
- A submitted case gets its number and appears as "පරීක්ෂාවට යවා ඇත" (sent for checking) on the DS home.

## Phase 5 — Head Office check and the release

**Goal:** a case can go from the DS to Head Office and back, and be verified and funded.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 5.1 | One status-change module that allows only the moves in SPEC section 6; the submit goes through it too | STS-1–3 | `src/server/cases/transitions.ts`, `src/server/cases/commands.ts` |
| 5.2 | Check queue, oldest first, with duplicate flags, as one screen with the release queue (two tabs) | CHK-1 | `src/app/ho/check/*`, `src/server/cases/queues.ts` |
| 5.3 | Case check view with documents and full duplicate details, in the queue screen and on the case page | CHK-2 | `src/app/ho/check/review-screen.tsx`, `src/app/ho/cases/[id]/*`, `src/components/review/*` |
| 5.4 | Verify, send back and reject, with reasons and Decisions | CHK-3 | `src/server/cases/decide.ts` |
| 5.5 | Release queue and the release form; four installments created on save; release corrections; the money section on both case pages | REL-1–4 | `src/app/ho/release/*`, `src/server/releases/*`, `src/components/cases/money-section.tsx` |
| 5.6 | Notifications table, the notices for every decision, the DS bell and its list, the waiting counts in the Head Office menu | NTF-1 | `src/server/notifications/*`, `src/app/ds/notifications/*`, `src/components/shell/*` |
| 5.7 | Edits after verification, Head Office only, logged field by field | CASE-9 | `src/server/cases/rules.ts`, `src/server/cases/commands.ts`, `src/components/forms/case-form.tsx` |

**Tests:** every allowed and refused status change; reasons required; release date rules; e2e for the full path DS → check → send back → resubmit → verify → release (AC-8, AC-9, AC-10), rejecting, and Head Office's corrections (CASE-9, REL-4).

**Done when:** AC-8, AC-9 and AC-10 pass.

## Phase 6 — Installments, building progress and closing

**Goal:** the DS records payments and progress, and a case can finish, stop or reopen, with its full history on the case page.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 6.1 | Installment actions: start (expected date) and mark paid (date), only the next one, date rules; Head Office undo with a reason. Every change claims the case at the version the page showed | INS-1–6 | `src/server/installments/*`, `src/server/cases/claim.ts`, `src/lib/validation/progress.ts`, `src/app/ds/cases/[id]/actions.ts`, `src/app/ho/cases/[id]/actions.ts` |
| 6.2 | Prisma: StageUpdate (one row per stage reached; skipped stages get their own rows) and photo links; stage update form with note-only option and skipped stages. Head Office can still change a running case's kind of help (CASE-9), so refuse that once a stage is recorded | STG-1, STG-2, STG-4, STG-5 | `prisma/schema.prisma`, `src/server/stages/*`, `src/components/progress/stage-update.tsx` |
| 6.3 | Photo pipeline with sharp: turn upright, resize to 1,600 px, JPEG 80, remove all metadata, store a 320 px thumbnail too | STG-3 | `src/server/files/images.ts`, `src/server/files/uploads.ts`, `src/app/files/[id]/thumb/route.ts` |
| 6.4 | Completion rule, run after every installment or stage change | CLS-1 | `src/server/cases/complete.ts` |
| 6.5 | Stop and reopen with reasons, balance shown, changes blocked while stopped. The moves are already in `transitions.ts`; the status before the stop is stored on the case for reopening | CLS-2, CLS-3 | `src/server/cases/stop.ts` |
| 6.6 | Case history in plain Sinhala sentences, from the audit log | HIS-2 | `src/server/history/*`, `src/components/progress/case-history.tsx`, `messages/si.json` |
| 6.7 | Full DS and Head Office case pages as in the prototype (two columns), photo thumbnails and viewer | STG-6, UI-7 | `src/app/ds/cases/[id]/*`, `src/app/ho/cases/[id]/*`, `src/components/progress/*`, `src/components/cases/case-view.tsx` |
| 6.8 | DS home: money panel, installments paid and stage reached in each row, and the rest of the to-do panel (due installments, 30 days without an update) | HOME-1, HOME-3, HOME-4 | `src/app/ds/page.tsx`, `src/server/cases/queries.ts` |

**Tests:** installment order through direct server calls (AC-11); skipped stages (AC-12); completion (AC-13); stop and reopen (AC-14); audit rows for every change and no updates allowed on them (AC-15); a photo with GPS data comes back without it (AC-16); e2e for a case from release to completion with a photo, and for undo, stop and reopen.

**Done when:** AC-11 to AC-16 pass.

## Phase 7 — Dashboard, exports and notifications

**Goal:** Head Office sees the national picture and everyone can take lists to Excel.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 7.1 | Load-test data: a script that creates 5,000 made-up cases across all districts | PRF-1 | `scripts/seed-load.ts` |
| 7.2 | Dashboard: filters, totals, district table with DS drill-down, waiting counts, stale cases | DSH-1, DSH-2 | `src/app/ho/page.tsx`, `src/server/dashboard/*` |
| 7.3 | Excel export of any list, limited to what the user may see, and logged | EXP-1, EXP-3 | `src/server/exports/*`, `src/app/ho/cases/export/route.ts`, `src/app/ds/export/route.ts` |
| 7.4 | Sheet-layout export (two tabs, original columns). Built, then removed on 2026-10-04: the Ministry no longer needs the old layout | EXP-2 | — |
| 7.5 | Notifications: the bell, the menu's queue counts and every notice, completed, stopped and reopened included, were built in Phases 5 and 6; check they stay right beside the dashboard. The menu's count and the bell are read again after every move, because a layout isn't rendered again on a client-side move | NTF-1 | `src/components/shell/*`, `src/app/ho/waiting/route.ts`, `src/app/ds/notifications/unread/route.ts` |

**Tests:** dashboard totals against direct database sums (AC-17); the exported list reopened with ExcelJS and checked (EXP-1); dashboard time with 5,000 cases (AC-21); full export under 60 seconds (PRF-4); the menu's count matching the dashboard, and the bell, after moves by the menu alone (NTF-1).

**Done when:** AC-17 and AC-21 pass.

## Phase 8 — Sheet import

**Goal:** the 729 cases can be brought in once, safely, and Head Office can confirm them.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 8.1 | A script that makes a made-up sample sheet with the real layout (two tabs, two-row headers, zero-width joiners, mixed district spellings) | SEC-11 | `scripts/make-sample-sheet.ts` |
| 8.2 | Import script: header matching, district and DS mapping, IMPORTED status, sheet notes kept read-only, no duplicates on re-run | IMP-1–3, IMP-5, IMP-7 | `scripts/import-sheet.ts`, `src/server/import/*` |
| 8.3 | Import report (tab, row, reason) written outside the repository | IMP-6 | `scripts/import-sheet.ts` |
| 8.4 | "Details missing" filter; DS can fill NIC, phones and kind of help on imported cases | IMP-4, IMP-5 | `src/server/cases/*`, `src/app/ds/page.tsx` |
| 8.5 | Head Office "imported cases" screen to confirm each case's real status, with release and installments | IMP-5 | `src/app/ho/imported/*` |

**Tests:** import of the sample sheet, including every mapping and report case, and a second run with no new rows (AC-19).

**Done when:** AC-19 passes on the sample sheet. The real sheet is not imported until Phase 9.

## Phase 9 — Go-live

**Goal:** the system runs on the server in Sri Lanka, is backed up, and the offices are ready to use it.

| # | Task | SPEC | Files |
| --- | --- | --- | --- |
| 9.1 | Production images and Compose: Next.js standalone, PostgreSQL, Nginx with TLS and HSTS; Nginx's `client_max_body_size` at least 16 MB for uploads (photos of up to 15 MB); `FILES_DIR` on a named volume | OPS-2, SEC-1 | `docker/Dockerfile`, `docker/nginx.conf`, `docker-compose.yml` |
| 9.2 | Staging server with made-up data; deploy from a tagged build with migrations; rollback steps | OPS-1, OPS-3 | `.github/workflows/deploy.yml`, `docs/RUNBOOK.md` |
| 9.3 | Nightly encrypted backup of the database and files to a second location in Sri Lanka; a restore test | SEC-10 | `scripts/backup.sh`, `docs/RUNBOOK.md` |
| 9.4 | Uptime, disk and backup alerts | OPS-4 | server configuration |
| 9.5 | Security pass: a test calling every action with every role, headers, CSP, `npm audit`, secrets only in the environment | SEC-2–9 | `tests/security/*` |
| 9.6 | Performance and accessibility pass on staging | PRF-2–4, UI-6 | — |
| 9.7 | Full list of DS offices with codes loaded; admin creates the first accounts | LST-1 | `data/places.json` |
| 9.8 | Short Sinhala guides for DS officers and Head Office, plus a user test with a few officers | — | `docs/guides/*` |
| 9.9 | Production launch; import the real sheet on the server, then delete the file from the server; Head Office starts confirming imported cases | IMP-1–7 | — |

**Done when:**
- AC-20 and AC-22 pass.
- Every other acceptance check passes again on staging.
- The real sheet is imported, the sheet is set to read-only, and DS offices have signed in.

## Waiting on others

These don't block Phases 1–8. Each one is needed by the phase shown.

| Item | Needed by | From |
| --- | --- | --- |
| Where the server runs (PRD question 4) | Phase 9 | Ministry / ICTA |
| The full list of DS offices with Sinhala names | Phase 9 (sample list until then) | Ministry |
| Renovation stages (PRD question 3) | Any time; the admin adds them | Ministry |
| Answers to the other deferred questions | When they arrive; SPEC section 13 lists what to change | Ministry |
