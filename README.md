# Newtonite — Operations Under Pressure

An operational request coordination system engineered for high-pressure teams. Built to transition fast-growing organizations away from chaotic chat messages, spreadsheets, and emails toward a deterministic, audit-trailed workflow system.

> 📖 **Quick Links**:
> - [Setup & Running Instructions (Zero-Docker & Docker Modes)](RUNNING_INSTRUCTIONS.md)
> - [Engineering Decisions & Architecture Deep-Dive](ENGINEERING_DECISIONS.md)
> - [High-Level Design (HLD) Diagram (SVG)](docs/hld-diagram.svg)
> - [Component Architecture Diagram (SVG)](docs/architecture-diagram.svg)

---

## 🏛️ High-Level System Design (HLD)

<p align="center">
  <img src="docs/hld-diagram.svg" alt="Newtonite Operations High-Level Design (HLD)" width="100%" />
</p>

The High-Level Design (HLD) organizes the platform into 4 cohesive tiers:
1. **Actors & Ingress**: Ops specialists, team leads, Next.js 14 web application, and external incident webhooks.
2. **Edge & Gateway**: TLS termination, JWT authentication guard, 24h `X-Idempotency-Key` deduplication, and WebSocket connection management.
3. **Core API Services**: Stateless Express cluster executing contention-resistant atomic claims (`WHERE assigned_to IS NULL`), Optimistic Concurrency Control (`version` checks returning `409 Conflict`), workflow finite state machines (`VALID_TRANSITIONS`), and immutable audit event logging.
4. **Data & Async Tier**: Dual-mode PostgreSQL (embedded WebAssembly PGlite for zero-Docker local execution or external PostgreSQL 16), Redis 7 broker, and BullMQ background notification workers with graceful offline fallbacks.

---

## 🏗️ Component Architecture & Technology Stack

<p align="center">
  <img src="docs/architecture-diagram.svg" alt="Newtonite Operations System Architecture" width="100%" />
</p>

This repository is structured as a **pnpm monorepo** with shared types and separation of concerns:

```
tumpa2/
├── packages/
│   └── shared/             # Shared TypeScript types, workflow contracts, & socket events
├── apps/
│   ├── api/                # Express, PostgreSQL, Redis, BullMQ, Socket.io
│   └── web/                # Next.js 14 App Router, SWR, Socket.io-client, CSS Tokens
├── docker-compose.yml       # Local infrastructure (PostgreSQL 16 & Redis 7)
└── package.json            # Root workspace scripts
```

- **Frontend**: Next.js 14 (App Router), React 18, SWR, Socket.io client, vanilla CSS design system.
- **Backend API**: Node.js, Express, TypeScript, Socket.io (WebSocket push), Zod schema validation.
- **Database**: PostgreSQL 16 (relational schema, foreign keys, transactions, indexes).
- **Background Queue**: Redis 7 + BullMQ worker for asynchronous notifications with retries and backoff.
- **Shared Package**: `@newtonite/shared` for strict contract and type alignment across stack.

---

## ⚡ Critical Behaviors & System Design

### 1. Optimistic Concurrency Control (OCC)
- **Problem**: When multiple operators view and edit the same ticket simultaneously, last-write-wins causes lost updates.
- **Solution**: Every `work_items` record includes an integer `version` field. Mutation queries perform:
  ```sql
  UPDATE work_items
  SET status = $1, version = version + 1, updated_at = NOW()
  WHERE id = $2 AND version = $3
  RETURNING *;
  ```
- If the row was modified concurrently, `0` rows match, and the API returns **`409 Conflict` (`CONCURRENT_UPDATE_CONFLICT`)**.
- The frontend detects the 409 response and presents an interactive conflict notification allowing the operator to reload the latest state before retrying.

### 2. Contention-Resistant Atomic Claim
- **Problem**: In an emergency incident, multiple responders may click "Claim" at the exact same millisecond.
- **Solution**: Atomic SQL conditional update:
  ```sql
  UPDATE work_items
  SET assigned_to = $1, status = 'in_progress', updated_at = NOW()
  WHERE id = $2 AND assigned_to IS NULL
  RETURNING *;
  ```
- Exactly one transaction succeeds; subsequent claims receive **`409 Conflict` (`ALREADY_CLAIMED`)**.

### 3. Workflow State Machine Enforcement
- Strict transitions defined in `@newtonite/shared`:
  - `open` ➔ `in_progress` | `closed`
  - `in_progress` ➔ `open` | `pending_approval` | `resolved` | `closed`
  - `pending_approval` ➔ `in_progress` | `resolved` | `closed`
  - `resolved` ➔ `open` | `closed`
  - `closed` ➔ `open` (reopen only)
- Disallowed jumps (e.g. `open` directly to `resolved`) are rejected with **`400 Bad Request`**.

### 4. Idempotency Key Deduplication
- Operations that mutate state accept an `X-Idempotency-Key` header.
- Cached responses are stored in the database (`idempotency_keys`).
- If an operator double-clicks or a network drop causes a retry, the backend returns the original cached response with identical payload, preventing duplicate items, comments, or status jumps.

### 5. Immutable Audit Trail
- Every modification (status change, priority adjustment, assignment, claim, comment) writes an event to the append-only `events` table inside the same DB transaction.
- The UI renders the full chronological timeline showing who changed what, previous and new values, and precise timestamps.

### 6. Real-Time Push & Asynchronous Notifications
- **WebSockets**: Socket.io server broadcasts `work_item:created`, `work_item:updated`, and `comment:added` to connected clients so operators see updates in real time without refreshing.
- **BullMQ Notification Worker**: Operational notifications are queued in Redis and processed asynchronously with retry backoff, keeping API endpoints fast and resilient.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose

### 1. Start Infrastructure
Start PostgreSQL and Redis:
```bash
docker compose up -d
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Run Database Migrations & Seeds
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

### 4. Start Development Servers
```bash
pnpm dev
```
- Web Application: **http://localhost:3000**
- API Server: **http://localhost:4000**

---

## 👥 Seed Demo Accounts

| Role | Email | Password | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@newtonite.com` | `admin123` | System admin, create teams, full permissions |
| **Engineering Lead** | `alice@newtonite.com` | `user123` | Lead of Engineering, manage team members |
| **Engineering Member**| `bob@newtonite.com` | `user123` | Engineering contributor, triage & claim items |
| **Operations Lead** | `carol@newtonite.com` | `user123` | Lead of Operations |
| **Operations Member**| `david@newtonite.com` | `user123` | Operations contributor |

---

## 🧪 Testing & Verification

Run the test suite covering all critical behaviors:
```bash
pnpm test
```

Build all packages across the monorepo:
```bash
pnpm build
```

---

## ⚖️ Trade-offs & Production Considerations

| Area | Challenge Decision | Production Recommendation |
| :--- | :--- | :--- |
| **Push Delivery** | Socket.io with in-memory / local rooms | Socket.io Redis Streams adapter across scaled API instances |
| **Notifications** | BullMQ queue with simulated email output | SendGrid / AWS SES with delivery status webhook ingestion |
| **Idempotency** | PostgreSQL table with 24h retention | Redis TTL keys with automatic expiration for microsecond latency |
| **Search** | Case-insensitive SQL `ILIKE` | PostgreSQL full-text search with `tsvector` or Elasticsearch |
| **Rate Limiting** | Disabled for evaluation convenience | Redis sliding window rate limiter per user/IP |
