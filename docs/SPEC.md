# Diviyata Sawiyak — Software Specification

2026-09-28, updated 2026-10-02 · Janindu Pramod

> **Status:** draft. This SPEC turns the [PRD](PRD.md) into requirements precise enough to build and test against. The [clickable prototype](https://claude.ai/artifact/DQarnsyMfCao1y6SmpMDbT) shows the screens. The PRD's open questions are deferred: [section 13](#13-deferred-questions-and-the-defaults-used) gives the default this SPEC uses for each until the Ministry answers.

"Shall" means the requirement must be met. Each requirement has an ID (for example `CASE-5`) that the PLAN, the tests and the acceptance criteria refer to.

## 1. Scope

This SPEC covers version 1 as the PRD defines it:

- three roles, and cases for new houses and renovations
- the Head Office check and the Rs. 2,000,000 release
- the four installments and the building stages
- dashboards and Excel exports
- accounts and lists
- a one-time import of the sheet

It does not cover anything under "Later" or "Out of scope" in the PRD.

## 2. Technology stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) with TypeScript in strict mode, React Server Components and Server Actions, on the current Node.js LTS |
| Database | PostgreSQL, accessed through Prisma; schema changes through Prisma Migrate |
| Sign-in and sessions | Better Auth: username and password, sessions stored in the database, admin plugin |
| Forms and validation | React Hook Form in the browser; the same Zod schemas checked again in every Server Action |
| Screens | Tailwind CSS and shadcn/ui components; Noto Sans Sinhala served from our own server through `next/font/local` |
| Language | next-intl; one locale, `si`, in version 1; every string in `messages/si.json` |
| Excel | ExcelJS |
| Images | sharp |
| Tests | Vitest for unit and database tests, Playwright for end-to-end tests |
| Runtime | Docker Compose on a Linux server in Sri Lanka: `app` (Next.js standalone build), `db` (PostgreSQL), `proxy` (Nginx with TLS) |

Rules for the stack:

- **STK-1** Every dependency shall be pinned to an exact version, and the lockfile committed. Upgrades are made on purpose, one at a time, never automatically.
- **STK-2** The system shall not use any third-party hosted service that receives or stores its data: no Vercel, Supabase, Firebase, Clerk, hosted analytics or runtime Google Fonts.

## 3. Architecture

```
 Browser (office PC)
      │ HTTPS
      ▼
 Nginx (TLS) ──► Next.js app
                   ├─ pages (Server Components) ──┐
                   ├─ Server Actions ─────────────┼─► data-access layer (role + office checks) ─► Prisma ─► PostgreSQL
                   └─ /files/[id] route ──────────┘                                            └─► /data/files (private)
```

- **ARC-1** One Next.js application shall serve every screen and action. Version 1 has no public API.
- **ARC-2** Every read and write shall go through a server-side data-access layer (`src/server/`). That layer receives the signed-in user and applies the role and office rules in section 4. Pages and Server Actions shall never call Prisma directly.
- **ARC-3** Middleware may redirect signed-out users to the sign-in page, but it shall never be the only permission check.
- **ARC-4** Every change of state shall write its audit record (HIS-1) in the same database transaction as the change.
- **ARC-5** Uploaded files shall be stored under a private directory (`/data/files`, set by `FILES_DIR`) outside the web root, and served only through the `/files/[id]` route (SEC-7). In development the folder is `data/files` in the project, which git ignores.
- **ARC-6** All dates and times shall use the Asia/Colombo time zone.

## 4. Roles and permissions

Every account has exactly one role. A DS officer is the DS's Child Rights Promotion Officer (ළමා හිමිකම් ප්‍රවර්ධන නිලධාරී, the name the screens use). Each DS has one, and they run the system for their DS. A DS officer belongs to exactly one DS office, and a DS office has at most one active DS officer (ADM-3). Head Office officers and admins belong to none.

| Action | DS officer | Head Office officer | Admin |
| --- | --- | --- | --- |
| See cases | Own DS only | All | None |
| Create a case, save a draft, submit | Own DS | Any DS | — |
| Edit a draft or a returned case | Own DS | Any | — |
| Edit a case after it is verified | — | Yes, and every change is logged | — |
| Verify, send back or reject | — | Yes | — |
| Record the Rs. 2,000,000 release | — | Yes | — |
| Change an installment | Own DS | Undo a release only (INS-6) | — |
| Record a stage update, photos and documents | Own DS | — | — |
| Stop or reopen a case | — | Yes | — |
| Dashboard | Own DS | National | — |
| Export to Excel | Own DS lists | Any list, and the sheet layout | — |
| Manage accounts and lists | — | — | Yes |

- **PRM-1** When a DS officer asks for a case, file or history belonging to another DS, the system shall answer "not found" (HTTP 404). It shall not answer "forbidden", so nobody can learn which case numbers exist.
- **PRM-2** An admin shall not be able to open any page, list, file or export that shows beneficiary details.
- **PRM-3** Office scope shall be read from the account on every request. When the admin moves an officer to another DS (ADM-4), the change applies to the officer's next request.

## 5. Data model

Amounts are whole rupees stored as integers. Nothing listed here is ever deleted, except drafts (CASE-8).

| Entity | Main fields | Rules |
| --- | --- | --- |
| Province | name (Sinhala) | 9 rows, seeded |
| District | name, province | 25 rows, seeded |
| DsOffice | name, code, district, active | `code` is 3 capital letters, unique nationally, and used in case numbers. Name is unique within its district |
| User | full name, designation, mobile, email, username, role, DS office, active, must change password, last sign-in, failed sign-ins, locked until | DS office is required for DS officers only, and an office has at most one active DS officer (ADM-3). Username is generated (ADM-2) and unique |
| Case | case number, DS office, category, kind, status, name, child's name, NIC, NIC key, address, mobile 1, mobile 2, remark, sheet reference, created by, submitted at, verified at, completed at, closed at, close reason, version | See CASE-2 for field rules. `version` goes up by one on every save (CASE-10). `submitted at` is the latest submit |
| CaseNumberCounter | DS office, year, last number | One row per office and year. Taking the next number locks the row, so two submits at once never share a number (CASE-5) |
| Decision | case, type, reason, by, at | Types: submit, verify, send back, reject, stop, reopen, confirm import |
| Release | case (one per case), released on, amount, reference number, note, by, at | Amount is always 2,000,000 (a database check) |
| Installment | case, number 1–4, amount, status, purpose, expected on, released on, note | Amount is always 500,000 and the number 1 to 4 (database checks). Case plus number is unique. All four are created when the release is recorded |
| StageDefinition | kind, order, name, active | New-house stages are seeded (LST-4) |
| StageUpdate | case, stage (empty means a note-only visit), on, note, by | A case's current stage is the highest stage it has reached |
| File | case, stored name, original name, type, size, SHA-256, uploaded by, removed at | Linked to a case as a document, or to a stage update as a photo. Until the case form is saved with it, only the person who uploaded it can open it, and an upload never saved with a case is removed after a day. A document taken off a case is kept but no longer shown |
| AuditLog | at, actor, action, entity, entity id, case, before, after | Can only be added to, never changed (HIS-3) |
| Notification | user, case, type, created at, read at | See NTF-1 |

Values used across the system:

- **Category:** `CARE_LEAVER` (නිවාසගත) or `CHILD_AT_RISK` (අවදානම් දරුවන්).
- **Kind:** `NEW_HOUSE` (නව නිවසක් ඉදිකිරීම) or `RENOVATION` (නිවස අලුත්වැඩියා කිරීම).
- **Installment status:** `NOT_STARTED` (තවම ආරම්භ කර නැත), `PROCESSING` (ගෙවීමට කටයුතු කරමින්) or `RELEASED` (ගෙවා ඇත).

## 6. Case statuses and transitions

| Status | Screen label | Meaning |
| --- | --- | --- |
| `DRAFT` | තවම යවා නැත | Saved by the DS, not sent |
| `SUBMITTED` | පරීක්ෂාවට යවා ඇත | Waiting for the Head Office check |
| `RETURNED` | ආපසු එවා ඇත | Sent back to the DS for correction |
| `VERIFIED` | අනුමතයි | Approved, waiting for the Rs. 2,000,000 release |
| `IN_PROGRESS` | වැඩ සිදුවෙමින් | Release recorded; installments and stages running |
| `COMPLETED` | නිමයි | Finished (CLS-1) |
| `REJECTED` | ප්‍රතික්ෂේප කළා | Refused by Head Office, with a reason |
| `STOPPED` | නවතා ඇත | Cannot go ahead, with a reason |
| `IMPORTED` | පැරණි පත්‍රිකාවෙන් | Brought in from the sheet, waiting for Head Office to confirm it (IMP-5) |

| From | To | Who | Needs | Then |
| --- | --- | --- | --- | --- |
| (new) | `DRAFT` | DS officer, HO officer | Nothing | — |
| `DRAFT`, `RETURNED` | `SUBMITTED` | DS officer, HO officer | Every rule in CASE-2 passes | A case number is given on the first submit (CASE-5) |
| `SUBMITTED` | `VERIFIED` | HO officer | — | DS notified |
| `SUBMITTED` | `RETURNED` | HO officer | Reason | DS notified |
| `SUBMITTED` | `REJECTED` | HO officer | Reason | DS notified |
| `VERIFIED` | `IN_PROGRESS` | HO officer | Release details (REL-2) | Four installments created; DS notified |
| `IN_PROGRESS` | `COMPLETED` | The system | CLS-1 is met | DS notified |
| `VERIFIED`, `IN_PROGRESS` | `STOPPED` | HO officer | Reason | DS notified |
| `STOPPED` | The status it had before | HO officer | Reason | DS notified |
| `IMPORTED` | `VERIFIED`, `IN_PROGRESS`, `REJECTED`, `STOPPED` | HO officer | IMP-5 | — |

- **STS-1** Any change not listed in this table shall be refused on the server with a message explaining why, even when the screen hides the button.
- **STS-2** `COMPLETED` and `REJECTED` are final.
- **STS-3** Nobody can edit a case's details while it is `SUBMITTED`. The DS waits for the Head Office decision.

## 7. Functional requirements

### 7.1 Sign-in (AUTH)

- **AUTH-1** Users shall sign in with their username and password.
- **AUTH-2** After 5 wrong passwords in a row, the account shall be locked for 15 minutes. The message shall be the same whether or not the username exists.
- **AUTH-3** An account with a temporary password shall go straight to a "set a new password" page and reach no other page until it is done. The new password shall have at least 8 characters and differ from the temporary one.
- **AUTH-4** A session shall end after 30 minutes without activity, and always after 12 hours. Signing out shall end it at once.
- **AUTH-5** A disabled account shall not be able to sign in. Its open sessions shall stop working on their next request.
- **AUTH-6** Passwords shall be stored only as slow hashes, using Better Auth's default. A temporary password shall be shown once and never stored in plain text or written to any log.

### 7.2 Admin: accounts (ADM)

- **ADM-1** The users screen shall list every account with its name, username, role, DS office, district, last sign-in and status. It shall be searchable by name, office or username, and filterable by role.
- **ADM-2** Creating an account shall take:
  - **Inputs:** full name (required, 2–100 characters), designation (optional, up to 100), mobile (required, `^0\d{9}$` once spaces are removed), email (optional, a valid address) and role (required). A DS officer also needs a district and a DS office, chosen in that order from the lists.
  - **Output:** a generated username (the role prefix `ds`, `ho` or `ad` plus 4 digits, unique) and a 12-character temporary password, shown once.
- **ADM-3** Each DS has one Child Rights Promotion Officer, so a DS office shall have at most one active DS officer account. The database shall enforce this as well as the server.
  - The form shall show each office's current officer by name, and shall not offer an office that already has one.
  - Creating, transferring or re-enabling an account into an office that has an active DS officer shall be refused, with a message to disable that account first.
  - When the officer changes, the admin disables the old account and creates one for the new officer. The old account and its history stay (ADM-7).
- **ADM-4** The admin shall be able to change any account detail. Changing a DS officer's office is how a transfer is recorded, and the history keeps both offices.
- **ADM-5** Resetting a password shall show a new temporary password once, require a change at the next sign-in, and end the account's open sessions.
- **ADM-6** The admin shall be able to disable and re-enable accounts. An admin cannot disable their own account, and at least one active admin must always remain.
- **ADM-7** Accounts shall never be deleted.

### 7.3 Admin: lists (LST)

- **LST-1** The system shall be seeded with the 9 provinces, the 25 districts and every DS office, with Sinhala names and codes.
- **LST-2** The admin shall be able to add a DS office to a district. The name must be unique within the district, and the code unique nationally.
- **LST-3** The admin shall be able to rename a DS office or make it inactive. An inactive office gets no new accounts or cases but keeps its existing ones.
- **LST-4** For each kind of help, the admin shall be able to add, rename, reorder and deactivate stages:
  - New-house stages are seeded as අත්තිවාරම් මට්ටම, බිත්ති මට්ටම, වහල මට්ටම, නිමයි.
  - Renovation stages start empty.
  - A stage that has been used can be deactivated but not removed.

### 7.4 DS home: my beneficiaries (HOME)

- **HOME-1** The home page shall show only the officer's own DS cases. Each row shows:
  - name, plus the child's name for children at risk
  - case number, category, kind and status
  - installments released (for example `2 / 4`)
  - current stage or next step
  - days since the last update, when that is more than 30
- **HOME-2** Tabs shall filter the list to all cases, cases in progress or completed cases. Search shall match name, child's name, case number or NIC.
- **HOME-3** A "to do" panel shall list:
  - returned cases, with the Head Office reason
  - drafts
  - installments in `PROCESSING` whose expected date has passed or is within 7 days
  - cases in progress with no update in 30 days
- **HOME-4** A money panel shall show the office's total received (releases), paid out (released installments) and balance.

### 7.5 Adding and editing a case (CASE)

- **CASE-1** A case shall be entered on one page with four numbered parts: category, kind of help, the beneficiary's details and other documents.
- **CASE-2** Fields and rules:

  | Field | Required | Rule |
  | --- | --- | --- |
  | Category | Yes | `CARE_LEAVER` or `CHILD_AT_RISK` |
  | Kind of help | Yes | `NEW_HOUSE` or `RENOVATION` |
  | Child's name | For children at risk | 2–100 characters |
  | Name (care leaver or guardian) | Yes | 2–100 characters |
  | NIC | Yes | 9 digits and V or X (old), or 12 digits (new). Stored in capitals without spaces |
  | Address | Yes | Up to 300 characters |
  | Mobile 1 | Yes | `^0\d{9}$` once spaces are removed |
  | Mobile 2 | No | Same rule as mobile 1 |
  | Remark | No | Up to 1,000 characters |
  | Other documents | No | PDF, JPEG or PNG; up to 10 MB each; up to 10 files |

  Each document is uploaded as soon as it is chosen and joins the case when the form is saved. While a case can be edited, a document can be taken off it; the file itself is kept.

- **CASE-3** For a DS officer, the district and DS office shall come from the account and cannot be changed. A Head Office officer chooses the district, then the DS office.
- **CASE-4** Saving a draft shall skip the required-field checks. Format rules still apply to fields that are filled in.
- **CASE-5** Submitting shall:
  1. Check every rule. If any fail, save nothing and show the errors (ERR-1).
  2. Show a summary to confirm.
  3. On confirmation, set the status to `SUBMITTED` and, on the first submit only, give a case number `{DS code}-{year}-{NNN}` (for example `HMG-2026-011`). `NNN` counts up per DS per year, uses at least 3 digits, and cannot be changed.
- **CASE-6** Duplicate NIC check:
  - For matching, an old NIC is turned into its 12-digit form: `19` + its first 5 digits + `0` + its next 4 digits. So `880001234V` becomes `198800001234`.
  - When the NIC is entered, and again at submit, it shall be compared with every other case.
  - A match in the same DS shows the case number and name. A match in another DS shows only the case number and DS office. Head Office sees all three.
  - Drafts count only in the case's own DS, where a draft shows its name without a number.
  - The warning shall never block saving or submitting.
- **CASE-7** A returned case shall show the Head Office reason at the top of the form. The DS corrects it and submits it again.
- **CASE-8** The owning DS, or Head Office (which may also start drafts), may delete a draft with its documents. The deletion is logged without personal details.
- **CASE-9** After a case is verified, only a Head Office officer can change its details, and every changed field is logged with its old and new value. This is possible while the case is `VERIFIED` or `IN_PROGRESS`; a completed, rejected or stopped case can't be changed. Every required field must stay filled in, and the form has one save button and no submit.
- **CASE-10** Saving a case that someone else changed after it was opened shall fail with ERR-3. It shall never overwrite their change silently.

### 7.6 Finding cases (FND)

- **FND-1** Head Office shall have a case list filterable by name, NIC, case number, district, DS, status, category and kind, sorted by last update. A DS officer has the same list, limited to their own DS.

### 7.7 Head Office check (CHK)

- **CHK-1** The "පරීක්ෂා කිරීමට" (to check) queue shall list `SUBMITTED` cases, oldest submission first. Each row shows the name, case number, DS, days waiting and any duplicate-NIC flag. As in the prototype, the queue and the release queue (REL-1) are two tabs of one screen: the list is on the left and the chosen case on the right.
- **CHK-2** A case's check view shall show every field, its documents (opening in a new tab) and every duplicate-NIC match in full: case number, name, DS and status, each linked to its case. The Head Office case page of a `SUBMITTED` case shows the same matches and decisions.
- **CHK-3** Head Office shall have three actions:
  - **Verify:** no input needed.
  - **Send back:** a reason is required (5–1,000 characters).
  - **Reject:** a reason is required (5–1,000 characters).

  Verifying asks once to confirm. Each writes a Decision and notifies every active officer of the case's DS. A decision is refused if the case changed after the check view showed it (CASE-10), for example when it was sent back and submitted again in the meantime.

### 7.8 The Rs. 2,000,000 release (REL)

- **REL-1** The "මුදල් නිදහස් කිරීමට" (to release) queue shall list `VERIFIED` cases, oldest verification first.
- **REL-2** Recording a release shall take:
  - released on: required; not in the future and not before the verification date
  - reference number: required, 1–50 characters
  - note: optional, up to 500 characters

  The amount is fixed at Rs. 2,000,000 and cannot be edited.
- **REL-3** Saving the release shall set the case to `IN_PROGRESS`, create four `NOT_STARTED` installments and notify the DS.
- **REL-4** Head Office shall be able to correct a release's date, reference number and note. Every correction is logged with the old and new values. The REL-2 date rules apply, and the date can't move past an installment date already recorded (INS-3, INS-4).

### 7.9 Installments (INS)

- **INS-1** Every case in progress has four installments of Rs. 500,000, numbered 1 to 4.
- **INS-2** Only the lowest-numbered installment that is not yet `RELEASED` can change.
- **INS-3** Moving `NOT_STARTED` to `PROCESSING` shall need an expected date, on or after the release date. A purpose (up to 200 characters) and a note are optional.
- **INS-4** Moving `PROCESSING` to `RELEASED` shall need the date paid. It must be no later than today, on or after the Rs. 2,000,000 release date, and on or after the previous installment's paid date.
- **INS-5** Installments can change only while the case is `IN_PROGRESS`. A stage never blocks an installment.
- **INS-6** To correct a mistake, a Head Office officer may move the most recently released installment back to `PROCESSING`, with a reason.

### 7.10 Building progress (STG)

- **STG-1** A stage update shall need a stage later than the current one, or "no change, note only". It also needs a date, no later than today and on or after the release date. A note (up to 1,000 characters) and 0–10 photos are optional. Photos may be JPEG, PNG or WebP, up to 15 MB each.
- **STG-2** Choosing a stage further ahead shall also mark the skipped stages as reached on the same date.
- **STG-3** On upload, each photo shall be resized to at most 1,600 px on its long edge and saved as a JPEG at quality 80. All metadata, including GPS location, shall be removed.
- **STG-4** Renovation cases use the renovation stage list. While that list is empty, only note-only updates are possible.
- **STG-5** Stage updates are allowed only while the case is `IN_PROGRESS`.
- **STG-6** The Head Office case page shall show every stage reached, with its date and photo thumbnails. A thumbnail opens the full image.

### 7.11 Completing, stopping and reopening (CLS)

- **CLS-1** The system shall set a case to `COMPLETED` when installment 4 is `RELEASED` and the case has reached the last active stage of its kind. A kind with no active stages needs only installment 4.
- **CLS-2** Stopping a case shall need a reason. The confirmation and the case page shall show the balance left with the DS (2,000,000 minus the amount paid out).
- **CLS-3** Reopening a stopped case shall need a reason. It returns the case to the status it had before it was stopped.

### 7.12 Dashboards and exports (DSH, EXP)

- **DSH-1** The Head Office dashboard shall offer filters for district, category and kind. It shall show:
  - totals: all cases except drafts, cases in progress, completed cases, amount released and amount paid out
  - a table by district, where choosing a district shows its DS offices
  - the number of cases waiting for a check and waiting for release, linked to those queues
  - cases in progress with no update for 30 days or more, the longest first

  An "update" is any installment change, stage update or case edit.
- **DSH-2** Dashboard figures shall come from the database when the page loads, and never be more than 1 minute old.
- **EXP-1** Any list shall be exportable to `.xlsx` with Sinhala headers, limited to what the user may see.
- **EXP-2** Head Office shall be able to export in the sheet's layout:
  - Two sheets, නිවාසගත and අවදානම් දරුවන්, with the original columns: serial number, names, NIC, address, phone, district, DS, four installment columns, four progress columns and remark.
  - Each installment cell shows its status and date. Each progress cell shows the date the stage was reached.
- **EXP-3** Every export shall be logged with who made it, which filters were used and how many rows it held.

### 7.13 History and notifications (HIS, NTF)

- **HIS-1** Every create, edit and status change shall write an audit record: who did it, when, the action, and the old and new values of each changed field.
- **HIS-2** The case page shall show the case history, newest first, as plain Sinhala sentences, as in the prototype.
- **HIS-3** Audit records cannot be edited or deleted. The database shall refuse any update, delete or truncation of the audit table, whichever database account asks.
- **NTF-1** Notifications appear inside the system:
  - A DS's officers get one when a case is sent back, verified, rejected, released, completed, stopped or reopened.
  - Head Office officers see live counts of cases waiting for a check and waiting for release in the menu.
  - A bell shows unread notifications, and opening one marks it read. The bell leads to a list of the officer's notifications, newest first (`/ds/notifications`).
  - An officer moved to another DS (ADM-4) no longer sees notifications about the old DS's cases (PRM-3).

### 7.14 Importing the sheet (IMP)

- **IMP-1** A command-line script (not a screen) shall import the `.xlsx` file from a path given when it runs. The file shall never be stored in the repository.
- **IMP-2** Rows from the නිවාසගත tab become `CARE_LEAVER` cases, and rows from අවදානම් දරුවන් become `CHILD_AT_RISK` cases. Headers are matched after removing zero-width joiners (U+200D) and spaces, using both header rows.
- **IMP-3** District names shall be mapped to the 25 official names, with English and Sinhala spellings both accepted. DS offices are matched by name within the district. Anything that doesn't match goes in the report.
- **IMP-4** A missing NIC or phone number is allowed on imported cases. They appear under a "details missing" filter, so offices can fill them in.
- **IMP-5** Imported cases start as `IMPORTED`:
  - The sheet's installment, stage and remark notes are kept as read-only text.
  - The owning DS may fill in the NIC, phone numbers and kind of help.
  - A Head Office officer confirms each case as verified, in progress (entering the release and installment statuses), rejected or stopped.
  - Imported cases are left out of the money totals until confirmed.
- **IMP-6** The script shall write a report of rows skipped or needing attention: tab, row number and reason, with no other personal details. The report is saved outside the repository.
- **IMP-7** Running the import again shall not create duplicates. The key is the tab plus the sheet serial number.

### 7.15 Screens and language (UI)

- **UI-1** Every label, message, status and date shall be in Sinhala, taken from `messages/si.json`. No screen text is hard-coded.
- **UI-2** Screens shall be designed for desktop widths of 1,280–1,920 px and stay usable at 1,024 px.
- **UI-3** Dates shall be shown as `YYYY.MM.DD`, and money as `රු. 2,000,000` (Western digits, comma separators).
- **UI-4** Text shall use Noto Sans Sinhala at a 16 px base size and a line height of at least 1.5.
- **UI-5** Screens shall use the sheet's own terms, such as නිවාසගත, අවදානම් දරුවන් and පළමු වාරිකය. Each screen does one main task.
- **UI-6** Every form control shall have a visible label, every screen shall work with the keyboard, and text contrast shall meet WCAG 2.1 AA.
- **UI-7** Screens shall follow the prototype:

  | Role | Screen | Route | Prototype screen |
  | --- | --- | --- | --- |
  | All | Sign in, set a new password | `/login`, `/change-password` | — |
  | DS officer | My beneficiaries | `/ds` | මගේ ප්‍රතිලාභීන් |
  | DS officer | New case / edit | `/ds/cases/new`, `/ds/cases/[id]/edit` | නව ප්‍රතිලාභියෙකු |
  | DS officer | Case page | `/ds/cases/[id]` | ප්‍රතිලාභියාගේ පිටුව |
  | HO officer | Dashboard | `/ho` | සාරාංශය |
  | DS officer | Notifications | `/ds/notifications` | — |
  | HO officer | Check and release | `/ho/check`, `/ho/release` | පරීක්ෂාව සහ මුදල් නිදහස් කිරීම |
  | HO officer | Case list, case page, new case | `/ho/cases`, `/ho/cases/[id]`, `/ho/cases/new` | ප්‍රතිලාභියාගේ පිටුව |
  | HO officer | Imported cases | `/ho/imported` | — |
  | Admin | Users, lists | `/admin/users`, `/admin/lists` | පරිශීලකයින්, ලැයිස්තු |

## 8. Error handling

- **ERR-1** A form with invalid input shall save nothing and keep what was typed. Each error appears in Sinhala next to its field, and all errors are listed above the save button.
- **ERR-2** A page or record the user may not see shall show a "not found" page (මෙම පිටුව සොයාගත නොහැක), the same as a record that doesn't exist.
- **ERR-3** If someone else saved the record first (CASE-10), the system shall show "මෙම විස්තර වෙනත් අයෙකු මේ අතර වෙනස් කර ඇත. නැවත පූරණය කරන්න." and keep the user's input on screen so it can be entered again.
- **ERR-4** When a session has expired, the user goes to the sign-in page and comes back to the same page afterwards.
- **ERR-5** An upload of the wrong type or size shall be refused with a message for that file. The other files still upload.
- **ERR-6** Any other server error shall show a general Sinhala message with a reference code. The details are logged on the server without personal data.
- **ERR-7** A request that breaks a rule shall be refused on the server with a message naming the rule, even if the screen would not have allowed it. Examples: an installment out of order, or a stage update on a stopped case.
- **ERR-8** Sending the same form twice, for example after a network drop, shall not create a second record.

## 9. Security and privacy

- **SEC-1** The system shall be reachable only over HTTPS (TLS 1.2 or later) with HSTS. Plain HTTP redirects to HTTPS.
- **SEC-2** Every Server Action and route handler shall check the role and office in the data-access layer. Tests shall call each one with each role.
- **SEC-3** The database shall accept connections only from the app container. The app's database account shall not be able to change the schema.
- **SEC-4** Sign-in shall allow at most 10 attempts per minute from one IP address. An unused temporary password expires after 7 days.
- **SEC-5** Responses shall carry these security headers:
  - a Content Security Policy that allows only this site, with no third-party scripts or fonts
  - `frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: same-origin`
- **SEC-6** The Server Actions origin check shall stay on, allowing only the production domain.
- **SEC-7** Files:
  - Files are stored under random names.
  - A file's type is checked from its contents, not its name.
  - `/files/[id]` applies the same permission check as the case the file belongs to.
- **SEC-8** Names, NICs, addresses and phone numbers shall never appear in application logs, error messages or URLs. Logs use IDs only.
- **SEC-9** Secrets such as the database password and the auth secret shall live in environment variables on the server, never in the repository.
- **SEC-10** Backups:
  - The database and files are backed up every day, encrypted, to a second location in Sri Lanka.
  - Backups are kept for 30 days.
  - A restore is tested every month.
- **SEC-11** Real sheet data shall never go into the repository, tests or fixtures. Tests use made-up cases.
- **SEC-12** CI shall run `npm audit`. Security fixes are applied within 14 days, or within 3 days for critical ones.

## 10. Performance and capacity

- **PRF-1** The system shall be sized for 400 accounts, 50 people signed in at once, 5,000 cases and 50,000 photos (about 20 GB).
- **PRF-2** 95% of pages shall be answered by the server within 1 second, and a page shall be usable within 3 seconds on a 4 Mbps office connection.
- **PRF-3** The Head Office dashboard shall load within 2 seconds with 5,000 cases.
- **PRF-4** Exporting every case to Excel shall take under 60 seconds.
- **PRF-5** The starting server shall have 2 vCPU, 4 GB RAM and a 100 GB disk.
- **PRF-6** The system shall be available 99% of office hours (08:30–16:30, Monday to Friday) each month. Planned maintenance happens outside those hours.

## 11. Hosting and operations

- **OPS-1** There shall be three environments: local development, staging (made-up data only) and production.
- **OPS-2** Production runs with Docker Compose. Database data and files are kept on named volumes on the server.
- **OPS-3** A release is a tagged image built in CI. Database migrations run as part of the deploy. If a deploy fails, the previous image is restored, and the database too if a migration had run.
- **OPS-4** An uptime check shall run every 5 minutes. An alert fires when the disk is 80% full or the nightly backup fails.

## 12. Acceptance criteria

Version 1 is accepted when every check below passes on staging with made-up data.

| ID | Check | Covers |
| --- | --- | --- |
| AC-1 | A Homagama DS officer sees only Homagama cases. Opening a Kaduwela case's link shows "not found". | PRM-1, HOME-1 |
| AC-2 | An admin can open the users and lists screens. Any case link, case list, file or export shows "not found". | PRM-2 |
| AC-3 | The admin creates a DS officer, and a username and temporary password are shown once. At first sign-in the officer must set a new password before seeing anything else. | ADM-2, AUTH-3 |
| AC-4 | After 5 wrong passwords, the account is locked for 15 minutes, with the same message as for an unknown username. | AUTH-2 |
| AC-5 | Submitting with required fields empty saves nothing. Each error shows in Sinhala next to its field and in the list above the button. | CASE-2, ERR-1 |
| AC-6 | NIC `12345` is refused. `198800012345` and `880001234V` are accepted, and `880001234V` matches a case holding `198800001234`. | CASE-2, CASE-6 |
| AC-7 | A duplicate NIC in the same DS shows the case number and name. One in another DS shows only the case number and DS. Submitting is still possible. | CASE-6 |
| AC-8 | Submitting gives a number like `HMG-2026-001`, and the case appears in the check queue, oldest first. | CASE-5, CHK-1 |
| AC-9 | "Send back" without a reason is refused. With a reason, the DS sees the case and the reason in its to-do panel. Submitting again returns it to the queue. | CHK-3, CASE-7, HOME-3 |
| AC-10 | After verifying, the case is in the release queue. A release without a reference number is refused. After a valid release, the case has four `NOT_STARTED` installments and the DS is notified. | REL-1–3 |
| AC-11 | Installment 3 cannot change while installment 2 is not `RELEASED`, including through a direct request to the server. | INS-2, ERR-7 |
| AC-12 | A stage update that skips ahead marks the skipped stages with the same date. An installment can be released at any stage. | STG-2, INS-5 |
| AC-13 | Releasing installment 4 after the last stage is reached sets the case to `COMPLETED`. | CLS-1 |
| AC-14 | Stopping needs a reason. A stopped case allows no installment or stage change and shows its balance. Reopening restores its earlier status. | CLS-2, CLS-3, STS-1 |
| AC-15 | Every change appears in the case history with who made it and when. The app's database account cannot update or delete audit rows. | HIS-1–3 |
| AC-16 | A photo uploaded with GPS data is stored without it. Its file link works only for permitted users. | STG-3, SEC-7 |
| AC-17 | Dashboard totals equal the sums in the database for each filter, tested with seeded data. | DSH-1 |
| AC-18 | The sheet-layout export opens in Excel with Sinhala headers and one row per case. | EXP-2 |
| AC-19 | Importing a made-up sample sheet creates `IMPORTED` cases and maps English district spellings. It reports unknown DS offices, and a second run creates no duplicates. | IMP-1–7 |
| AC-20 | No screen shows English interface text. A check in CI finds no hard-coded strings in components. | UI-1 |
| AC-21 | With 5,000 seeded cases, the dashboard loads in under 2 seconds. | PRF-3 |
| AC-22 | Restoring last night's backup on staging brings back the cases and their files. | SEC-10 |
| AC-23 | The admin can't give a DS office a second active DS officer. Once the old account is disabled, an account for the new officer can be created. | ADM-3 |

## 13. Deferred questions and the defaults used

On 28 Sep the open questions were set aside for later. Until the Ministry answers, the system uses the defaults below. Each one is kept in the places listed, so changing it later is a small, contained change.

| PRD question | Default in version 1 | Where it lives |
| --- | --- | --- |
| 1. Siblings | Each child is a separate case. A shared NIC only raises a warning. | CASE-6 |
| 3. Renovation stages | The admin defines the list. Until then, renovation cases take note-only updates. | LST-4, STG-4 |
| 4. Hosting | Any Linux server in Sri Lanka that runs Docker. | Section 11 |
| 5. How long records are kept | Everything is kept; nothing is deleted automatically. | Section 5 |
| 6. Money on a stopped case | The balance left with the DS is shown. The system has no refund process. | CLS-2 |
| 7. Replacing a beneficiary | The new person is a new case. The old case is rejected or stopped with a reason that names the new case number. | CHK-3, CLS-2 |
| 8. Tamil | Not in version 1. Every string is in a message file, so `ta` can be added later. | UI-1 |
| 9. How the Rs. 2M is released | Case by case. | REL-2 |
| 12. First password | The admin sees it once and passes it on in person or by phone. | ADM-2 |

The six rules marked Proposed in the PRD are built as written there: send back (CHK-3), Head Office-only edits after verification (CASE-9), nothing deleted (ADM-7, LST-3), the completion rule (CLS-1), one account per person (ADM-2), and the duplicate NIC in another DS (CASE-6).
