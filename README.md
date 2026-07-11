# Loan EMI Tracker

A small loan-management app: log in, add members, create loans at a fixed
8% p.a. reducing-balance rate, auto-generate the EMI schedule, and see a
member-wise outstanding report with CSV export.

## How to run it locally

Requires **Node.js 18+** (uses the built-in `node --test` runner and no
native/database dependencies, so there's nothing else to install on your
machine).

```bash
# 1. Install dependencies
npm install

# 2. Run the unit tests for the EMI math (optional but recommended)
npm test

# 3. Start the server
npm start
```

Then open **http://localhost:3000** in your browser.

**Login:** `admin` / `admin123` (pre-filled on the login screen — this is
mock/hardcoded auth, see "Tech choices" below).

The app seeds itself with 3 demo members and 2 demo loans on every server
start, so there's something to look at immediately. Data lives in memory
only and resets when the server restarts (see assumptions below).

## Tech choices and why

- **Backend:** Node.js + Express. Minimal, unopinionated, easy to read line
  by line, no build step.
- **Frontend:** Plain HTML/CSS/JS, no framework, no bundler. For an app
  this size, a build pipeline (Vite/webpack/React) adds setup risk and
  moving parts without adding real value — and it means `npm install &&
  npm start` is the entire setup, with no second terminal or CORS
  configuration needed since the frontend is served by the same Express
  app that serves the API.
- **Data:** In-memory JavaScript arrays (`src/store.js`) instead of
  SQLite/Postgres. The assignment explicitly allows this
  ("in-memory seed data — your call"). All data access goes through a
  small set of functions in `store.js`, so swapping in a real database
  later would mean rewriting that one file, not touching the routes or UI.
- **Auth:** Hardcoded single user (`admin` / `admin123`), mock bearer
  token generated on login and checked by a small Express middleware.
  Explicitly not production-grade — no password hashing, no session
  expiry — the assignment says mock auth is fine.

## The EMI math (`src/emi.js`)

This is the part of the assignment that matters most, so it's isolated in
its own module with no dependencies on Express or the data store, and it's
unit tested (`test/emi.test.js`, 10 tests, run with `npm test`).

- Monthly rate `r = annualRate / 100 / 12`.
- `EMI = P × r × (1+r)^n / ((1+r)^n − 1)`, rounded once to the nearest rupee.
- Every month, interest = `round(currentOutstandingBalance × r)` — charged
  on what's *actually still owed*, not the original principal. This is why
  interest is highest in month 1 and falls every month after.
- **Rounding fix for the last instalment:** instead of reusing the fixed
  EMI amount for the final row, the last row's principal component is set
  to "whatever balance is left," and its EMI amount is recomputed as
  `principal + interest` for that row only. This guarantees the schedule
  always closes to exactly ₹0 with no leftover paise, however the rounding
  fell on earlier months.

## Assumptions made (per "if ambiguous, write it down")

1. **No payment tracking / no "mark EMI as paid" flow.** The core
   requirements don't ask for actually recording payments over time, only
   for generating the schedule and showing outstanding balance. "Current
   outstanding" is computed as the schedule balance as of the most recent
   due date that has already passed relative to today's date — i.e., the
   app assumes instalments are paid on schedule. A real product would need
   an explicit payment-recording step; that's the single biggest thing
   I'd add with more time (see below).
2. **Foreclosure needs to know how many EMIs were "actually paid."**
   Since there's no payment tracking (see above), foreclosing a loan asks
   for the number of completed instalments as an input, rather than
   inferring it from a payment ledger that doesn't exist yet.
3. **Loan disbursement date = the day the loan is created** (not a
   separately chosen date), with EMI due dates at +1, +2, ... +n months
   from there.
4. **Member IDs are unique** — adding a duplicate `memberId` is rejected
   with a clear validation error.
5. Currency is rounded to whole rupees everywhere per the spec (no paise),
   using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR',
   maximumFractionDigits: 0 })`, which produces the Indian digit grouping
   (`₹1,23,456`) natively.

## What used AI assistance vs. what I wrote/reviewed myself

Be honest and specific here about your own process before you submit —
for example:

- *AI-assisted:* initial project scaffolding (file layout, Express
  boilerplate, CSS), the EMI formula's standard derivation.
- *Written/reviewed by me:* the rounding strategy for the final
  instalment (the "close out whatever balance remains" approach), the
  validation rules, the foreclosure settlement formula, and I re-derived
  and hand-checked the EMI numbers in `test/emi.test.js` against the
  formula myself.

(Replace the above with what's actually true for your process — this is
the one section reviewers said they weigh heavily, and they explicitly
say they'd rather see honest AI use than a claim of having typed every
character unaided.)

## What I'd improve with more time

- **Payment tracking:** an explicit "mark this EMI as paid" action per
  instalment, rather than inferring "paid" from due dates having passed.
  This would make foreclosure figure out `completedEmis` automatically
  instead of asking for it.
- **Persistence:** swap `src/store.js`'s in-memory arrays for SQLite so
  data survives a server restart — the module boundary is already there
  to make this a contained change.
- **Top-up loan gating** (bonus): block a new top-up loan until ≥33% of
  the current loan's principal is repaid. Not implemented — flagging
  honestly rather than faking it.
- **Search/filter** on the members and loans tables.
- Real password hashing + session expiry if this ever left "assignment"
  status.

## Project structure

```
loan-emi-tracker/
├── server.js           Express app: routes + serves the frontend
├── src/
│   ├── emi.js           EMI schedule + foreclosure math (pure, unit-tested)
│   └── store.js         In-memory data store, seed data, validation
├── test/
│   └── emi.test.js      10 unit tests for the EMI math
├── public/
│   ├── index.html        All screens (login, members, loans, loan detail, report)
│   ├── styles.css
│   └── app.js             Frontend logic: auth, rendering, API calls
├── package.json
└── README.md
```

## Quick manual test script

If you want to sanity-check the whole flow by hand in ~2 minutes:

1. Log in with `admin` / `admin123`.
2. Go to **Members**, add one (e.g. name `Priya Sharma`, ID `EMP-010`,
   salary `40000`).
3. Go to **Loans**, create a loan for Priya: principal `100000`, tenure
   `12`.
4. Click **View schedule** — check month 1's interest (₹667) is higher
   than month 12's (₹58), and the last row's balance is ₹0.
5. Click **Foreclose loan**, enter `3` completed instalments, confirm —
   status flips to Closed and shows the settlement amount.
6. Go to **Report** — check Priya's other, non-foreclosed loan (if any)
   shows correct outstanding, then click **Export to CSV** and confirm the
   file downloads.
