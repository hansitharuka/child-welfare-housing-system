# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

Phases 1 (foundation), 2 (sign-in and permissions), 3 (admin: accounts and lists), 4 (cases), 5 (check and release), 6 (installments, progress and closing) and 7 (dashboard, exports and notifications) of `docs/PLAN.md` are built. You get:

- a Sinhala Next.js shell for the three roles, and PostgreSQL with the place and stage lists
- sign-in with lockout and forced password change, a permission layer, an append-only audit log and security headers
- the admin's users and lists screens
- case entry with drafts, documents, the duplicate-NIC warning and case numbers
- the DS home, and Head Office's case list and case entry for any DS
- Head Office's check and release screen: verify, send back or reject, then record the Rs. 2,000,000 release, which makes the four installments
- notifications for the DS (a bell) and waiting counts in the Head Office menu; Head Office's corrections to verified cases and releases
- the four installments paid in order by the DS, building stages with photos, completion, stopping and reopening, and each case's history, on two-column case pages as in the prototype
- the DS home's money panel and its full to-do panel
- Head Office's dashboard, the Excel exports of the case lists, and a load-test data script
- tests and CI

Phase 7 was built one task at a time: 7.1 (the load-test data script), 7.2 (the Head Office dashboard), 7.3 (the Excel export of the case lists), 7.4 (an export in the old sheet's layout, since removed) and 7.5 (the notifications beside the dashboard).

Phase 8 (the sheet import) is being built one task at a time, on the branch `phase-8-import`. Tasks 8.1 (the made-up sample sheet), 8.2 (the import script) and 8.3 (the import report) are done.

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
| Change the database schema | edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` and `npx prisma generate` (Prisma 7's `migrate dev` no longer regenerates the client). When `migrate dev` stops to ask about a change (for example a new unique column), write the SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<change>/migration.sql` and apply it with `npx prisma migrate deploy` |
| Put the sample accounts back to their start state | `npx tsx prisma/seed-users.ts --reset` (the end-to-end tests do this themselves) |
| Add 5,000 made-up cases for load tests, or remove them | `npm run db:seed-load` (`-- --count 500`, `-- --seed 7`), `npm run db:seed-load -- --remove`. Remove them before running the end-to-end tests |
| Make the made-up sample sheet for the import | `npm run sheet:sample` writes `data/sample-sheet.xlsx`, which git ignores (`-- --out <file.xlsx>`, `-- --seed 7`) |
| Import a sheet | `npm run sheet:import -- <file.xlsx>`; `-- <file.xlsx> --dry-run` checks it and writes nothing to the database. Either way it writes a report next to the sheet (`-- --report <file.csv>` puts it elsewhere). Try it with the sample sheet; the real sheet is imported on the production server only (Phase 9) |

## Things to know when coding

- **Next.js 16 differs from older versions.** Read the matching guide in `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`). For example, middleware is now `proxy.ts`.
- **Prisma 7.** The client is generated into `src/generated/prisma/`. That folder is not committed and is regenerated on `npm install`. Import from `@/generated/prisma/client`. The client needs the `PrismaPg` adapter (see `src/server/db.ts`). Settings and the seed command live in `prisma.config.ts`.
- **The seed only adds missing rows** (`prisma/seed-data.ts`), so running it again never undoes an admin's change.
- **Never run `prisma migrate reset`.** It wipes a database, and Prisma blocks it when an AI agent runs it. The database tests make a new schema in the test database for each run and drop only that schema (`tests/db/global-setup.ts`).
- **Screen text lives only in `messages/si.json`.** Message keys are typed (`src/types/next-intl.d.ts`), and `npm run check:strings` fails on text written in components.
- **The Sinhala font is committed** in `src/app/fonts/`, copied from `@fontsource-variable/noto-sans-sinhala`. Nothing loads from Google at runtime.
- **The `overrides` in `package.json`** force patched `deepmerge-ts` and `mysql2` inside the Prisma CLI, and `uuid` inside ExcelJS. Remove them once Prisma and ExcelJS ship fixed versions.
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
  - `ds0102` (Maharagama; has a temporary password)
  - `ds0199` (Kesbewa; kept for the lockout test)
  - `ho0001` and `ad0001`

  The password is `Sample-Pass-2026`, and the temporary one is `Temp-Pass-2026` (`prisma/seed-users.ts`).
- **Raw SQL doesn't get the `?schema=` from the URL.** Name the schema in the query, or rely on the default `public`.

### Admin screens (Phase 3)

- **The pattern for a feature:**
  - The Zod schema goes in `src/lib/validation/`. Its error messages are message keys, not text.
  - Queries and commands go in `src/server/<area>/`. They take `db` as their first argument, so the database tests can pass a test client.
  - Commands return `{ ok: true, … }` or `{ ok: false, error: "<message key>" }` and write the audit record in the same transaction.
  - Server Actions (`actions.ts` beside the page) call `requireRole`, parse the form, call the command and `revalidatePath`.
- **Forms keep what was typed.** React 19 resets uncontrolled fields after an action, so forms that can be refused use controlled fields (`account-form.tsx`, `list-forms.tsx`).
- **A temporary password is shown once.** It comes back in the action's state and is never stored in plain text or put in a URL. Remounting the component (`key`) clears it.
- **Usernames are generated** as `ds`/`ho`/`ad` plus four digits (`src/server/users/usernames.ts`), and accounts have a placeholder email. Accounts, offices and stages are never deleted, only disabled or deactivated (ADM-7, LST-3).
- **One active DS officer per DS office (ADM-3).** Each DS has one Child Rights Promotion Officer (ළමා හිමිකම් ප්‍රවර්ධන නිලධාරී), the name the screens give the `DS_OFFICER` role.
  - The account commands refuse a second one with `officeTaken`.
  - A partial unique index (`app_user_one_active_ds_officer_per_office`, a hand-written migration) enforces it in the database too. Prisma ignores that index, so `migrate dev` won't drop it.
  - `banned` is never null, so "active" is simply `banned: false`.
- **Database test files share one schema per run** and run one after another. A test must not assume it sees only its own rows, and must put back anything shared that it changes. A test that adds a DS officer takes a free office from `freeOfficeId()` (`tests/db/client.ts`).
- **End-to-end tests add data.** `tests/e2e/cleanup.ts` runs before each run:
  - It removes the offices and stages the tests added, which carry `TEST_MARKER`.
  - It disables the officer accounts they created, named "ඊ. පරීක්ෂණ", which frees their Gampaha offices. The accounts stay, because the audit log refers to them.
  - A sample-account reset disables any other active officer at a sample office.

### Cases (Phase 4)

- **Every change to a case goes through `saveCase`** (`src/server/cases/commands.ts`). One transaction saves the fields, attaches new uploads and writes the audit record. On submit, the same transaction takes the case number and records the `SUBMIT` decision.
- **Who may change what** is in `src/server/cases/rules.ts`: the office while `DRAFT` or `RETURNED`, Head Office also while `VERIFIED` or `IN_PROGRESS` (CASE-9), and only Head Office moves a draft to another office. Status changes are in `transitions.ts` (Phase 5).
- **A new case's id is made when its form page renders**, so a form sent twice finds the saved case and changes nothing (ERR-8). Every later save sends the `version` it opened with; a stale one is refused with `conflict` (CASE-10, ERR-3).
- **Case numbers come from `case_number_counter`.** The row for an office and year stays locked until the submit commits, so parallel submits take turns. Two first submits of a year can still meet on its insert; `saveCase` tries again.
- **Uploads are one Server Action request per file**, sent as soon as it is chosen (at most 10 MB). The file row's `case_id` stays empty until the case form is saved, which attaches only the actor's own unattached uploads. An upload never saved with a case is removed after a day.
- **Body limits are 16 MB** (`serverActions.bodySizeLimit` and `proxyClientMaxBodySize` in `next.config.ts`), for photos of up to 15 MB (Phase 6). Above its limit the proxy silently cuts a request body short. Nginx will need `client_max_body_size` of at least 16 MB (Phase 9).
- **Files live under `FILES_DIR`** (default `data/files`, which git ignores), named by a random UUID in two-character sub-folders. `/files/[id]` applies the case's office rules. The proxy leaves its CSP off `/files/` responses, because the page policy (`object-src 'none'`) could stop the browser's PDF viewer.
- **One case form for both roles.** `src/components/forms/case-form.tsx` builds its own `FormData` instead of using `<form action>`, so typed values and chosen files survive a refused save. Each role's `actions.ts` checks its own role, then calls `src/server/cases/form-actions.ts`.
- **Client components may import types from `src/server/`**, never values.
- **Test data:** database tests point `FILES_DIR` at a temporary folder. End-to-end test cases have names starting with `TEST_CASE_NAME` ("ස්වයං පරීක්ෂණ"), and `tests/e2e/cleanup.ts` deletes them with their decisions and files before each run.

### Check and release (Phase 5)

- **Every status change goes through `applyMove`** (`src/server/cases/transitions.ts`). Its `MOVES` table is SPEC section 6, row by row: who may make each move, from and to which statuses, whether it needs a reason, its Decision type, its audit action and its notice.
  - It updates the case only while it still has the status the caller read (and the version, with `checkVersion`), so two people deciding at once can't both succeed.
  - It writes the Decision, the audit record and the notifications in the caller's transaction. It throws a `Refusal` (`refusal.ts`) that rolls everything back.
  - Commands call `moveRefusal` first to answer early with `roleNotAllowed` or `notAllowedNow`. `saveCase`'s submit uses `applyMove` too.
- **Head Office's check and release screen** is one screen with two tabs, `/ho/check` and `/ho/release` (`src/app/ho/check/review-screen.tsx`). The chosen case is `?case=<id>`.
  - After an action the page goes back to the queue with `?notice=<key>&done=<id>`, or, from the case page (`from=case`), to `/ho/cases/<id>?notice=<key>`. URLs carry ids, never names (SEC-8).
  - The decision and release forms (`src/components/review/`) are on both the queue screen and the case page, keyed by the case's version, so they reset after a change.
- **The release** (`src/server/releases/commands.ts`) moves the case to `IN_PROGRESS`, saves the release and makes the four installments in one transaction.
  - The command checks the form itself, because the date rules need the case's verification date.
  - Database checks (hand-written in the `release` migration) hold the amounts at 2,000,000 and 500,000 and installment numbers at 1 to 4.
- **Date-only columns** (`@db.Date`): store a day with `dayToDate`, read it with `dateToDay`, and compare days as `"YYYY-MM-DD"` strings. Today is `colomboDay(new Date())`.
- **Notifications** are made by `notifyOffice` inside the move's transaction, for the office's active officers only. Lists and the bell show only cases the officer may still see (PRM-3).
  - Head Office's menu counts come from `src/app/ho/layout.tsx`, and the bell's from `src/app/ds/layout.tsx`. A layout doesn't render again on client-side moves, so actions that change a queue call `revalidatePath("/ho", "layout")`, and the actions on notifications `revalidatePath("/ds", "layout")`.
  - Someone else's change doesn't refresh the layout, so the menu's badge and the bell read their count again after every move (`useLiveCount`, `src/components/shell/live-count.ts`, Phase 7) from `/ho/waiting` or `/ds/notifications/unread`. Each reading carries the server time it was read (`waitingNow`, `unreadNow`), and the newer one is shown. A refreshed layout's 0 then wins over an earlier read's 1 after "mark all read".
- **Edits after verification (CASE-9)** reuse `saveCase` and the case form in `mode="change"`: one save button, every required field checked (`mustStayComplete`), no submit. The changed fields are logged as `case_updated` with old and new values.
- **Test helpers:** e2e case entry is in `tests/e2e/case-helpers.ts` (`openAs` keeps a second person's window open). `cleanup.ts` also deletes test cases' notifications, installments and releases. The database tests' config skips `.next/`, where a standalone build copies the test files.

### Installments, progress and closing (Phase 6)

- **Every installment or stage change claims the case first** with `claimCase` (`src/server/cases/claim.ts`): the version goes up only while it is still the one the page showed and the case is `IN_PROGRESS`, inside the change's transaction. That gives CASE-10 and ERR-8 for free, and moves `case.updatedAt`, which is what "no update for 30 days" reads (`STALE_DAYS` in `src/server/cases/queries.ts`).
- **The installment order is pure code** in `src/server/installments/rules.ts` (`nextInstallment`, `stepRefusal`, `lastPaid`). The commands (`src/server/installments/commands.ts`) and the DS case page both use it. Only the DS office starts and pays; Head Office only undoes the last payment (INS-6).
- **Stage updates are one row per stage reached** (`stage_update`, unique per case and stage). Choosing a stage further ahead also writes a row for each stage it skips, on the same day; a note-only visit has no stage. The chosen row holds the note and photos. The progress view (`stageProgress` in `src/server/stages/queries.ts`) is pure: the current stage is the highest one reached, and the choices are the active stages after it. A used stage can't be deleted (a restricting foreign key), only deactivated.
- **Completion runs inside the change's transaction** (`completeIfDone` in `src/server/cases/complete.ts`) after a payment or a stage reached. The system makes the move, so its audit record has no actor and the history says "the system".
- **Stopping stores `status_before_stop`** on the case; reopening goes back to it (`src/server/cases/stop.ts`). A database check allows it only on a stopped case.
- **Files have a kind**, `DOCUMENT` or `PHOTO`. Every document query (the case's list, the 10-document limit, removing one) filters on `DOCUMENT`, and a photo also carries its `stage_update_id`.
  - `uploadPhoto` (`src/server/files/uploads.ts`) runs `processPhoto` (`src/server/files/images.ts`, sharp) before anything is stored: upright, at most 1,600 px, JPEG 80, no metadata, plus a 320 px thumbnail kept under `thumb_name` and served by `/files/[id]/thumb`.
  - Thumbnails are plain `<img>` tags, because the files are protected and can't go through Next's image optimizer.
- **The history** (`caseHistory` in `src/server/history/queries.ts`) reads the audit log; `src/components/progress/case-history.tsx` turns each action into a Sinhala sentence. A new audit action needs a sentence there and under `history.actions` in `messages/si.json`, or it shows as "a change was made".
- **Case pages** use `CaseColumns` (`src/components/cases/case-view.tsx`): money, decisions and history on the left; stages and details on the right; one column below 1,280 px. The pop-ups for installments, stages, stopping, reopening and undoing are in `src/components/progress/`; `ReasonAction` is the shared "give a reason" pop-up. `Modal` takes a `size` and sets `text-left`, because some pop-ups live in right-aligned table cells.
- **Test helpers:** `releasedCase` (`tests/e2e/case-helpers.ts`) gives a case released today. E2E tests read the stage names from the form, because the admin may rename or reorder stages. The development database's new-house stages have been reordered by hand. `cleanup.ts` also deletes test cases' stage updates and photo thumbnails.

### Dashboard and exports (Phase 7)

- **Load-test data** (`scripts/seed-load.ts`, PRF-1) makes made-up cases at every status in every active DS office: drafts, queues, cases being built (a quarter with no update for 30 days or more), completed, rejected and stopped. It runs on development, CI, test and staging databases, never in production. The same `--seed` gives the same cases.
  - The cases' ids start with `load-`, which is how `--remove` finds them. They belong to the disabled account `load-test-account`, which has no username, so it can't sign in and isn't on the admin's users screen.
  - It writes no audit records, because those can never be removed (HIS-3), and no notifications, files or photos. A load-test case's history is empty.
  - Case numbers are taken in one block per office and year from `case_number_counter`. `--remove` puts each counter back where it stood before, unless a later case holds a higher number.
  - `addLoadData(db, { count, seed, now })` and `removeLoadData(db)` are exported for the database tests.
  - `addLoadData` ends with a plain `ANALYZE`. Until autoanalyze notices 5,000 new cases, the planner may still think the tables are as small as before, which made the dashboard's reads about 20 times slower and the database tests time out now and then.
  - **Remove it before the end-to-end tests.** The check queue lists 50 per page, oldest first (CHK-1), and the release test expects its new case on the first page. While load-test cases use a test office or stage that an end-to-end run left behind, `cleanup.ts` leaves that office or stage in place. It is removed on the first run after the load-test cases are gone.
- **The dashboard** (`/ho`, DSH-1) is built from `dashboard()` in `src/server/dashboard/queries.ts`: the totals, each DS office's figures and the stale cases.
  - `tableRows()` is pure. It groups the office figures by district, or lists a chosen district's offices.
  - The figures are read on every load (DSH-2); the page renders per request anyway.
  - The filters (`districtId`, `category`, `kind`) are in the address. They narrow every figure except the waiting counts, which come from `queueCounts`, as in the menu.
  - Prisma can't sum a related table by office, and raw SQL would miss the schema the tests and CI's end-to-end run use. So the money figures come from one row per case with a release. With 5,000 cases the reads take about 65 ms, and the page about 0.3 s.
  - "No update for 30 days" is `staleBefore(now)` in `src/server/cases/queries.ts`, shared with the DS to-do panel.
  - Its database test (AC-17, AC-21) adds 5,000 load-test cases and removes them again, which takes about 20 seconds.
- **A filter form on a page whose links change only its address needs a `key` made from the filter values.** Otherwise the uncontrolled fields keep their old choices after a client-side move, such as "clear filters". The dashboard and the Head Office case list both do this.
- **The Excel exports** (EXP-1, EXP-3) are route handlers that answer with a file: `/ho/cases/export` and `/ds/export`. Each list links to its own with `ExportLink` (`src/components/cases/export-link.tsx`), a plain `<a download>`, not `<Link>`.
  - Each route reads the address with its list page's own reader, `readFilters` (`src/app/ho/cases/filters.ts`) or `readHomeList` (`src/app/ds/list.ts`), and the query uses `caseWhere` from `src/server/cases/queries.ts`. So the file holds exactly the screen's cases, every page of them.
  - `exportCaseList` (`src/server/exports/case-list.ts`) builds the file and writes a `cases_exported` audit record (entity `case_list`, id `ho_cases` or `ds_cases`) with the filters used and the number of rows. It answers null for an admin.
  - ExcelJS is a `serverExternalPackages` entry in `next.config.ts`: Node loads it from `node_modules`. Compiling it in the dev server held up the other pages, and the end-to-end tests timed out.
  - `src/server/exports/workbook.ts` holds the shared parts: `addSheet` (a bold header row that stays in view, filter buttons, days as real dates shown `yyyy.mm.dd`, amounts as `#,##0`, text kept as text) and `xlsxResponse`.
  - Server code gets its labels from `getTranslations("cases")`. Tests make the same translator with `createTranslator({ locale: "si", messages, namespace: "cases" })`.
  - **File names avoid zero-width joiners.** Chrome saves one in a download's name as `_` (ප්‍ර becomes ප්_ර), so the file is "දිවියට සවියක් ලැයිස්තුව <date>.xlsx". A unit test checks it.
  - The button says එක්සෙල්, not "Excel", because the smoke test allows no Latin letters on `/ds` and `/ho` (AC-20).
  - With 5,000 cases the whole export takes about 3 seconds (PRF-4 allows 60). Its database test adds 5,000 load-test cases too.
- **There is no export in the old sheet's layout.** Task 7.4 built one (EXP-2), and it was removed on 2026-10-04 because the Ministry no longer needs it. Don't add it back unless asked.

### Sheet import (Phase 8)

- **The sample sheet** (`scripts/make-sample-sheet.ts`, task 8.1) is a made-up copy of the real sheet for building and testing the import (SEC-11). Its two header rows, merges and header text, zero-width joiners included, are the same as the real file's. Its rows copy the real sheet's oddities (see "Source data" below). The same `--seed` gives the same sheet.
  - `makeSampleSheet(seed)` returns the workbook and an answer key, one `SampleRow` per sheet row: the district and DS office (by code) the row belongs to, its NIC and phone numbers as they should be stored, and its `quirks`. `QUIRKS` lists every oddity with a short description; the unit test checks each one appears at least once.
  - An office is in the key when its name matches the list once spaces, capitals and zero-width characters are ignored. Rows the import can't place (no district, an unknown district, no office, an unknown office, or another district's office) have `officeCode: null`.
  - The special rows name DS offices from `data/places.json` by district and English name. When task 9.7 replaces that list, keep those offices or change the special rows; the script stops and names any office it can't find.
- **Made-up people** (names, NICs, phone numbers and the seeded random number generator) are in `scripts/made-up.ts`, shared by the sample sheet and the load-test data.
- **The import** (`scripts/import-sheet.ts`, task 8.2) calls `importSheet(db, workbook, { dryRun })` in `src/server/import/commands.ts`. It returns what it made and two lists for the report: rows `skipped` and imported rows needing `attention`, each with its tab, row and reason only (IMP-6).
  - `sheet.ts` finds the tabs and columns. A column's header is its row 2 text, or its row 1 text when row 2 is empty (a merged cell reads its master's text). Headers and place names compare after `squash()`: no spaces, capitals or zero-width characters. Each tab's one column with no header is the care leavers' phone numbers or the children's serial numbers. A missing tab or column throws `SheetLayoutError`, and nothing is written.
  - `values.ts` tidies NICs and phone numbers. A bad one isn't stored; its cell as written goes into the case's `sheet_notes` with the installment, level and remark notes (`SheetNotes`). A missing NIC or phone number isn't reported (IMP-4).
  - `places.ts` maps districts (English, Sinhala and the sheet's own spellings in `DISTRICT_SPELLINGS`) and then the DS office within that district, from the database's lists. Rows it can't place, or with no name, are skipped.
  - **The key (IMP-7)** is `sheet_key`, unique: `CARE_LEAVER:serial:45`, or `CHILD_AT_RISK:row:380` for a row with no serial number or one used above it in its tab (decided with the user on 5 Oct). Rows already imported are passed over, so a later run adds only rows that couldn't come in before.
  - Imported cases have no case number and no kind. They're created by the disabled account `sheet-import` ("පැරණි පත්‍රිකාව", no username, so it can't sign in). One transaction writes them, a `case_imported` audit record each (no actor, so the history says "the system"), and one `sheet_imported` record for the run.
  - The development database's DS offices differ from `data/places.json` (the user renamed some by hand), so a dry run there skips more rows than the sample's answer key expects. The tests use the seeded list.
- **The report (IMP-6, task 8.3)** is a CSV file that `runImport` (`scripts/import-sheet.ts`) writes on every run, dry or not, next to the sheet: `<sheet>-import-report-<YYYY-MM-DD-HHmmss in Colombo>[-dry-run].csv`. Git ignores that name anywhere, so the sample sheet's reports in `data/` stay out too.
  - One line per row and reason: tab, row, imported (no or yes), reason, and for a row that couldn't be placed, the district and DS office as written. Nothing else about the person. The rows not imported come first, then the imported rows to check, each in the sheet's order.
  - It starts with a byte-order mark and uses CRLF, so Excel shows the Sinhala. A cell starting with `=`, `+`, `-` or `@` gets a `'` first, so a place name can't become a formula.
  - The file is opened (`wx`) before the import, so a folder that doesn't exist or an earlier report of the same name stops the run before anything is imported (`ReportError`). Otherwise the imported rows to check would be lost: a later run passes over them. A failed import removes the empty file.
  - The reasons are in English, like the script's other output.

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
  - AG (Divisional Secretariat) officer: sees their own office only. This is the DS's Child Rights Promotion Officer (ළමා හිමිකම් ප්‍රවර්ධන නිලධාරී). Each DS has one, and they run the system for their DS (29 Sep), so a DS has one active officer account.
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

- `නිවාසගත` (housed beneficiaries, 240 rows and one empty row). Columns A to P: serial no, name, NIC, address, phone, district, divisional secretariat (`ප්‍රා.ලේ. කොට්ඨාසය`).
- `අවදානම් දරුවන්` (children at risk, 504 rows). Columns A to Q: serial no, child's name, guardian's name, guardian's NIC, address, phone, district, divisional secretariat (`ප්‍රා.ලේ. කාර්යාලය`, worded differently from the other tab).

Both sheets end with the same columns:

- Financial progress (Rs): 1st to 4th installment.
- Physical progress: Foundation Level, Wall Level, Roof Level, Completed.
- Remark.

Things to know when parsing:

- **Two-row header.** Row 1 holds the group headers and the ungrouped columns, which are merged over both rows. Row 2 holds the sub-columns under "financial progress" and "physical progress".
- **Missing headers.** The care leavers' phone column has no header, and their district's header is on row 2 only. The children's serial number column has no header.
- **Serial numbers.** On the care leavers' tab one serial number is used twice. On the children's tab a block of 38 rows, all from one DS office, has no serial number, and the numbers go on after it.
- **NICs and phone numbers.** Most rows have no NIC (2 of 240 care leavers, 37 of 504 children) and most children have no phone number. Excel holds some as numbers: 12-digit NICs, and phone numbers without their first 0. Old NICs come with a small `v`, sometimes after a space, and a few have the wrong number of digits. Phone numbers are written `07X-XXXXXXX`, sometimes two or three in one cell split by spaces.
- **Districts** are in Sinhala, or in English in the north (Jaffna, Mannar, Kilinochchi, Vavuniya), and some are spelled unlike the list: අනුරාධපුර (the list has අනුරාධපුරය), ත්‍රීකුණාමලය (ත්‍රිකුණාමලය), රත්නපුර (රත්නපුරය), මොනරාගල (මොණරාගල) and Mullative (Mullaitivu).
- **DS offices** are in Sinhala or English, with other spellings: extra or missing spaces, a zero-width non-joiner (U+200C), capitals, typing slips, words in another order, and now and then an office of another district.
- **Progress columns hold notes, not amounts:** ඔව්, නැත, No, or a sentence about when an installment is expected. The children's tab has notes only in the first installment column. Remarks are rare, and one is a number.
- **Zero-width joiners.** The Sinhala headers contain U+200D (ZWJ), for example `ප්‍රා.ලේ.` Match headers after normalising, not on the raw strings.
- **Cell colours.** Some cells are colour-coded in the sheet, but the colours are deliberately ignored on import.
- **Windows console.** Printing Sinhala text from Python on Windows needs `sys.stdout.reconfigure(encoding='utf-8')`.
- **Real personal data.** The workbook holds names, NICs, phone numbers and addresses of real beneficiaries and children. Never commit it or copy real rows into this repo. Use synthetic data for fixtures and seeds.
