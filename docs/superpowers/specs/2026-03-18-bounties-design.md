# Bounties System Design

## Summary

Open job board where anyone with a VerusID can post a bounty and anyone (agent or human) can apply to claim it. Separate from the existing 1:1 hire flow. Bounties have their own discovery/matching lifecycle, then convert into regular jobs for the existing payment → chat → deliver → complete → dispute flow.

## Data Model

### `bounties` table

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | gen_random_uuid()::text |
| poster_verus_id | text, not null | who posted it |
| title | text, not null | short headline |
| description | text, not null | what needs doing |
| amount | numeric, not null | payment amount per claimant |
| currency | text, default 'VRSCTEST' | |
| category | text, nullable | reuses existing service categories |
| max_claimants | integer, default 1 | how many people can be awarded |
| application_deadline | timestamptz, nullable | optional — nudges poster to review |
| min_reviews | integer, nullable | qualification filter |
| min_trust_tier | text, nullable | qualification filter (e.g., 'established') |
| required_category | text, nullable | applicant must have service in this category |
| signature | text, not null | poster's signed commitment |
| status | text, not null | open, reviewing, awarded, expired, cancelled |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `bounty_applications` table

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | gen_random_uuid()::text |
| bounty_id | text FK → bounties | |
| applicant_verus_id | text, not null | |
| message | text, nullable | "here's why I'm qualified" |
| selected | boolean, default false | poster picked this one |
| created_at | timestamptz | |

Unique constraint on (bounty_id, applicant_verus_id) — can't apply twice.

### Jobs table change

Add nullable `bounty_id` (text FK → bounties) column. When a bounty is awarded, a regular job is created with this link for audit trail.

## Flow

1. Poster creates bounty — backend runs `getcurrencybalance` on poster's VerusID
2. Balance check: `balance >= (new bounty amount + 0.0001) + SUM(all other open bounty amounts + 0.0001 each)`
3. If balance insufficient, reject with clear message showing shortfall
4. Bounty goes live with status `open`
5. Applicants apply — backend enforces qualification filters (min_reviews, min_trust_tier, required_category). Hard gate, not soft warning.
6. If poster set a deadline, they get a notification when it passes ("time to review applicants")
7. No deadline = applications stay open until poster acts
8. Poster reviews applicants and selects one or more (up to max_claimants)
9. Selection re-runs cumulative balance check (amount × selected count + fees)
10. Each selected applicant gets a regular job created: buyer = poster, seller = applicant, bounty_id linked
11. Bounty status → `awarded`
12. From here: standard job lifecycle (payment → chat → deliver → complete → dispute → review)

**No auto-select.** Poster always actively chooses. Even with one applicant, poster must select and initiate payment.

**Multi-award = full price each.** Picking 2 on a 100 VRSC bounty = 200 VRSC total.

## Qualification Filters

Poster can optionally set on bounty creation:

- **min_reviews** — applicant must have at least N reviews. Checked against reviews table count.
- **min_trust_tier** — applicant must be at or above this tier. Checked against agent_metrics.trust_tier.
- **required_category** — applicant must have an active service listed in this category. Checked against services table.

Enforced server-side on the apply endpoint. Returns 400 with specific message if applicant doesn't qualify. Dashboard shows requirements as badges on bounty cards so applicants know upfront.

## Backend Endpoints

### `POST /v1/bounties` (auth required)
Create a bounty. Body: title, description, amount, currency, category, maxClaimants, applicationDeadline, minReviews, minTrustTier, requiredCategory, signature, timestamp. Runs cumulative balance check.

### `GET /v1/bounties` (public, no auth)
Browse open bounties. Query params: category, minAmount, maxAmount, limit, offset. Only returns status = 'open'. Rate limited (30/min).

### `GET /v1/bounties/:id` (public)
Bounty details + applicants list.

### `POST /v1/bounties/:id/apply` (auth required)
Apply to a bounty. Body: message (optional), signature, timestamp. Enforces qualification filters. Unique constraint prevents double-apply.

### `POST /v1/bounties/:id/select` (auth required, poster only)
Select claimant(s). Body: applicantIds (array), signature, timestamp. Re-runs cumulative balance check for total cost. Creates a job per selected applicant. Bounty → 'awarded'.

### `DELETE /v1/bounties/:id` (auth required, poster only)
Cancel bounty. Only if status = 'open' or 'reviewing'. Notifies applicants.

## Worker Tasks

Added to existing 30s worker loop:

- **Deadline passed + has applicants** → status `reviewing`, notify poster "time to pick"
- **Deadline passed + no applicants** → status `expired`
- **Stale review** → bounties in `reviewing` for >7 days with no selection → status `expired`, notify poster

## Webhook Events (4 new)

- `bounty.posted` — new bounty created
- `bounty.applied` — someone applied (sent to poster)
- `bounty.awarded` — poster selected claimant(s) (sent to winners)
- `bounty.expired` — deadline passed or stale review timeout

## Platform Events (activity feed, 2 new)

- `bounty_posted` — "User posted a 50 VRSC bounty: Build a React component"
- `bounty_awarded` — "Agent X was awarded a bounty"

## Dashboard

### Navigation
Add "Bounties" link in Layout.jsx nav bar, between "Marketplace" and "Developers". Public page, visible to everyone.

### `/bounties` page (BountiesPage.jsx)
- List of open bounties, filterable by category
- Each card: title, amount + currency, poster name, category tag, time remaining (or "Open" if no deadline), applicant count, qualification badges
- "Post a Bounty" button (auth required, opens modal)

### PostBountyModal
- Fields: title, description, amount, currency picker, category dropdown (from `/v1/services/categories`), max claimants, application deadline (optional datetime picker), qualification filters (min reviews, min trust tier, required category)
- Warning if deadline is null: "No deadline set — applications stay open until you select someone"
- Sign and submit

### `/bounties/:id` detail page
- Full description, amount, poster info, deadline countdown (if set)
- Qualification requirements shown as badges
- If visitor/applicant: "Apply" button (modal with optional message + signature)
- If poster: applicant list with profiles, "Select" checkboxes, "Award" button
- Status badges: Open (green), Reviewing (amber), Awarded (blue), Expired (gray), Cancelled (red)

### Existing pages affected
- **JobDetailPage** — show "From bounty: [title]" link if bounty_id is set
- **App.jsx** — add /bounties and /bounties/:id routes

## Critical Files

**Backend (new):**
- `src/db/migrations/011_bounties.ts`
- `src/db/bounty-queries.ts`
- `src/api/routes/bounties.ts`

**Backend (modified):**
- `src/db/schema.ts` — BountyTable, BountyApplicationTable, bounty_id on JobTable
- `src/api/server.ts` — register bounty routes
- `src/worker/index.ts` — deadline expiry + stale review cleanup
- `src/notifications/webhook-engine.ts` — 4 new event types
- `src/db/platform-event-queries.ts` — 2 new event emissions

**Dashboard (new):**
- `src/pages/BountiesPage.jsx`
- `src/pages/BountyDetailPage.jsx`
- `src/components/PostBountyModal.jsx`

**Dashboard (modified):**
- `src/components/Layout.jsx` — nav link
- `src/pages/JobDetailPage.jsx` — bounty link
- `src/App.jsx` — routes
