# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

Phases 1 (foundation) and 2 (sign-in and permissions) of `docs/PLAN.md` are built. You get a Sinhala Next.js shell for the three roles, PostgreSQL with the place and stage lists, sign-in with lockout and forced password change, a permission layer, an append-only audit log, security headers, tests and CI. The screens behind sign-in are still placeholders (Phase 3 onwards).

The stack is set in `docs/SPEC.md`: Next.js 16 (App Router, TypeScript), PostgreSQL + Prisma 7, Better Auth, next-intl (Sinhala), Zod, Tailwind 4 + shadcn/ui (Radix), ExcelJS and sharp. It runs self-hosted with Docker Compose on a server in Sri Lanka. Every permission check lives in the server-side data-access layer (`src/server/`), never in middleware or the UI alone.

## Commands

First run: `cp .env.example .env`, `npm install`, `npm run db:up` (needs Docker Desktop running), `npx prisma migrate dev`, `npm run db:seed`.

| Task | Command |
| --- | --- |
| Dev server (http://localhost:3000) | `npm run dev` |
| Lint, formatting, types | `npm run lint`, `npm run format:check`, `npm run typecheck` |
| No hard-coded screen text (UI-1) | `npm run check:strings` |
| Unit tests | `npm test`; one file: `npx vitest run src/lib/dates.test.ts`; one test: add `-t "<name>"` |
| Database tests (database must be up) | `npm run test:db`; one file: `npx vitest run --config vitest.db.config.mts prisma/seed.db.test.ts` |
| End-to-end tests | `npm run test:e2e`; one test: `npx playwright test tests/e2e/smoke.spec.ts -g "/ds"` |
| Production build and server | `npm run build`, then `npm run start:standalone` |
| Change the database schema | edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` |
| Put the sample accounts back to their start state | `npx tsx prisma/seed-users.ts --reset` (the end-to-end tests do this themselves) |

## Things to know when coding

- **Next.js 16 differs from older versions.** Read the matching guide in `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`). For example, middleware is now `proxy.ts`.
- **Prisma 7.** The client is generated into `src/generated/prisma/`. That folder is not committed and is regenerated on `npm install`. Import from `@/generated/prisma/client`. The client needs the `PrismaPg` adapter (see `src/server/db.ts`). Settings and the seed command live in `prisma.config.ts`.
- **The seed only adds missing rows** (`prisma/seed-data.ts`), so running it again never undoes an admin's change.
- **Never run `prisma migrate reset`.** It wipes a database, and Prisma blocks it when an AI agent runs it. The database tests make a new schema in the test database for each run and drop only that schema (`tests/db/global-setup.ts`).
- **Screen text lives only in `messages/si.json`.** Message keys are typed (`src/types/next-intl.d.ts`), and `npm run check:strings` fails on text written in components.
- **The Sinhala font is committed** in `src/app/fonts/`, copied from `@fontsource-variable/noto-sans-sinhala`. Nothing loads from Google at runtime.
- **The `overrides` in `package.json`** force patched `deepmerge-ts` and `mysql2` inside the Prisma CLI. Remove them once Prisma ships fixed versions.
- **Pinned versions.** `.npmrc` saves exact versions. Upgrade one dependency at a time, on purpose.

### Sign-in and permissions (Phase 2)

- **Every page and Server Action starts with `requireRole(...)`** or `requireSignedIn()` from `src/server/context.ts`. Put the check in each page as well as its layout, because layouts don't re-run on client-side navigation. Anything out of scope answers `notFound()`, never "forbidden" (PRM-1, ERR-2).
- **Limit case queries with `officeFilter(viewer)`** from `src/server/permissions.ts`. A DS officer sees only their own office, Head Office sees every office, and an admin sees none.
- **Every change calls `writeAudit(tx, …)`** (`src/server/audit.ts`) in the same `db.$transaction` as the change. A database trigger refuses any update or delete of `audit_log`.
- **Better Auth's HTTP endpoints are deliberately not mounted.** Sign-in, sign-out and password changes are Server Actions in `src/app/(auth)/actions.ts`. They pass through our lockout (`src/server/auth/lockout.ts`) and the per-IP rate limit.
- **The rate limit trusts `X-Forwarded-For`.** In production, Nginx must overwrite that header with the real client address (Phase 9). The end-to-end tests give each page its own address.
- **The session ends after 30 minutes idle or 12 hours in total.** The idle time is our `session.last_active_at`, checked in `getContext()`.
- **`src/proxy.ts` has only two jobs:** a quick redirect of signed-out visitors, and a fresh CSP nonce on every page. Because of the nonce, the root layout makes every page render per request.
- **Sample accounts** exist in development and tests only, never in staging or production:
  - `ds0101` (Homagama) and `ds0103` (Kaduwela)
  - `ds0102` (has a temporary password)
  - `ds0199` (kept for the lockout test)
  - `ho0001` and `ad0001`

  The password is `Sample-Pass-2026`, and the temporary one is `Temp-Pass-2026` (`prisma/seed-users.ts`).
- **Raw SQL doesn't get the `?schema=` from the URL.** Name the schema in the query, or rely on the default `public`.

The system is for the Ministry of Women and Child Affairs (Sri Lanka) and tracks the **Diviyata Saviyak (දිවියට සවියක්)** housing programme. For each case it records the financial progress (four installment releases) and the physical construction progress.

## Workflow: PRD → SPEC → PLAN before code

This project follows a documentation-first workflow (source: `../Documents/Project Documentation Workflow.pdf`):

- `docs/PRD.md` answers what we are building and why: the problem, users, goals, scope and what is out of scope.
- `docs/SPEC.md` answers what exactly the system must do: functional requirements, inputs and outputs, error handling, security, performance and acceptance criteria.
- `docs/PLAN.md` answers how we will build it and in what order: phases, tasks, dependencies, the files each task touches, tests and completion criteria.

The order is: a clickable prototype is reviewed with the Ministry to settle the PRD's open questions, the user approves the PRD, then the SPEC is written, then the PLAN, then implementation one phase at a time. The prototype ([Design canvas](https://claude.ai/artifact/DQarnsyMfCao1y6SmpMDbT)) is throwaway: sample data only, no backend, and never the start of the app's code. Test each phase before starting the next. When approved requirements change, update all three documents so they stay in sync. Don't start application code until the relevant document exists and the user has approved it. If a question is already answered in the PRD, don't ask the user again.

## Decisions made so far

These may not be in `docs/PRD.md` yet. Once the PRD is approved, it overrides this list.

- **Platform:** a web app used on office PCs and on phones. Since 28 Sep, screens are designed for desktop first, for DS officers as well as Head Office.
- **Language and ease of use (28 Sep):** the screens are in Sinhala, because officers are non-technical and all their other systems are in Sinhala. Keep screens simple: one main task per screen, plain words, and the sheet's own terms (for example නිවාසගත, අවදානම් දරුවන්, පළමු වාරිකය).
- **Roles (v1 only):**
  - AG (Divisional Secretariat) officer: sees their own office only.
  - Head Office officer: sees everything and can add and edit beneficiaries.
  - Head Office admin: manages accounts and master lists.
- **Money:** Rs. 2,000,000 per case, paid as 4 fixed installments of Rs. 500,000. This includes land-only cases.
- **Releases:**
  - The AG office checks each case on site and ticks off each installment. Head Office does not approve releases.
  - Installments must be ticked in order.
  - Photos are optional and never block a release.
  - Construction stages never block installments.
- **Installment status:** Not started → Processing (with an expected date) → Released (with the actual date).
- **Documents (28 Sep):** a new case has one optional upload, "වෙනත් ලේඛන" (other documents). No document is required, so the field research report and GN certificate are not separate uploads.
- **Kinds of help (28 Sep):** only a new house or the renovation of an existing house. Land cases have not started, so leave them out of the system for now. Don't design for them.
- **Still open with the Ministry:**
  - siblings (one case per family or one per child)
  - renovation stages
  - hosting
  - data retention

## Source data (for import)

The live spreadsheet is `../Documents/ප්_රගතිය - දිවියට සවියක්.xlsx`. It sits outside this repo and is not under version control. It has two sheets:

- `නිවාසගත` (housed beneficiaries, about 240 rows). Columns: serial no, name, NIC, address, phone, district, divisional secretariat.
- `අවදානම් දරුවන්` (children at risk, about 500 rows). Columns: child's name, guardian's name, guardian's NIC, address, phone, district, divisional secretariat.

Both sheets end with the same columns:

- Financial progress (Rs): 1st to 4th installment.
- Physical progress: Foundation Level, Wall Level, Roof Level, Completed.
- Remark.

Things to know when parsing:

- **Two-row header.** Row 1 holds the group headers and the ungrouped columns. Row 2 holds the sub-columns under "financial progress" and "physical progress".
- **Zero-width joiners.** The Sinhala headers contain U+200D (ZWJ), for example `ප්‍රා.ලේ.` Match headers after normalising, not on the raw strings.
- **Cell colours.** Some cells are colour-coded in the sheet, but the colours are deliberately ignored on import.
- **Windows console.** Printing Sinhala text from Python on Windows needs `sys.stdout.reconfigure(encoding='utf-8')`.
- **Real personal data.** The workbook holds names, NICs, phone numbers and addresses of real beneficiaries and children. Never commit it or copy real rows into this repo. Use synthetic data for fixtures and seeds.
