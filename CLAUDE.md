# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository has no application code yet, so there are no build, lint or test commands. Once code lands, add those commands here, including how to run a single test.

The stack is set in `docs/SPEC.md` (draft, 28 Sep): Next.js (App Router, TypeScript), PostgreSQL + Prisma, Better Auth, next-intl (Sinhala), Zod, Tailwind + shadcn/ui, ExcelJS and sharp. It runs self-hosted with Docker Compose on a server in Sri Lanka. Every permission check lives in the server-side data-access layer, never in middleware alone.

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
