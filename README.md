# Diviyata Sawiyak (දිවියට සවියක්)

A web system for the Ministry of Women and Child Affairs, Sri Lanka, to run the Diviyata Sawiyak housing programme. It tracks each beneficiary from the Divisional Secretariat's first entry through the Head Office check, the Rs. 2,000,000 release, the four installments and the building stages.

The screens are in Sinhala and designed for office PCs.

## Documents

- [PRD](docs/PRD.md): what we are building and why
- [SPEC](docs/SPEC.md): what exactly the system must do
- [PLAN](docs/PLAN.md): the build phases, one at a time

## Running it locally

You need Node.js 22 and Docker Desktop.

```bash
cp .env.example .env
npm install
npm run db:up
npx prisma migrate dev
npm run db:seed
npm run dev
```

Then open http://localhost:3000. `CLAUDE.md` lists every command, including the tests.

## Data protection

This system holds personal data about children and vulnerable families. Real data never goes into this repository, its tests or its fixtures. Use made-up people only.
