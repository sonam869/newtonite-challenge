# Newtonite — Setup & Running Instructions

This guide provides clear, step-by-step instructions for installing, configuring, running, and verifying the **Newtonite Operations Under Pressure** application on any local machine.

---

## ⚡ Quick Summary (Run in 2 Minutes)

You can run the full-stack system **with or without Docker**:
- **Option A (Zero-Docker / Embedded Mode — Recommended)**: Uses embedded WebAssembly PostgreSQL (`PGlite`) with persistent disk storage. No local PostgreSQL or Docker installation is needed.
- **Option B (Docker Mode)**: Uses standard PostgreSQL 16 and Redis 7 containers via Docker Compose.

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v18.x` or higher (verified on Node 20 / 22)
  ```bash
  node -v
  ```
- **pnpm**: `v9.x` or `v12.x`
  ```bash
  # If you do not have pnpm installed:
  npm install -g pnpm
  ```
- *(Optional for Option B)* **Docker & Docker Compose**

---

## 🚀 Option A: Zero-Docker Setup (Instant Local Mode)

This mode runs the entire stack locally with embedded database persistence.

### Step 1: Install Dependencies
From the project root:
```bash
pnpm install
```

### Step 2: Initialize Database Schema (Migrations)
Create all relational tables, foreign keys, and indexes:
```bash
pnpm --filter api db:migrate
```
*Output: `📦 Running with embedded PostgreSQL (PGlite) ... ✅ Database migration complete`*

### Step 3: Seed Sample Accounts & Work Items
Populate the initial teams, role memberships, and operational items:
```bash
pnpm --filter api db:seed
```
*Output: `✅ Seed complete`*

### Step 4: Start Development Servers
Start both the Next.js frontend and Express API server concurrently:
```bash
pnpm dev
```

### Step 5: Open in Your Browser
- **Frontend Web Application**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)

---

## 🐳 Option B: Docker Compose Setup

If you prefer to run PostgreSQL and Redis inside Docker containers:

### Step 1: Start Postgres & Redis Containers
```bash
docker compose up -d
```
Verify the containers are healthy:
```bash
docker compose ps
```

### Step 2: Switch Database Mode in `.env`
In `apps/api/.env`, ensure:
```env
DB_MODE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=newtonite
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Step 3: Run Migrations & Seeds
```bash
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

### Step 4: Start Development Servers
```bash
pnpm dev
```

---

## 🔑 Seeded Demo User Accounts

Use any of the following accounts to sign in at [http://localhost:3000/login](http://localhost:3000/login):

| Role / Responsibility | Email Address | Password | Permissions & Notes |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@newtonite.com` | `admin123` | Global admin; can create teams, manage members across all teams, close any ticket |
| **Engineering Lead** | `alice@newtonite.com` | `user123` | Team Lead of Engineering; can add/remove members, manage tickets, close tickets |
| **Engineering Member** | `bob@newtonite.com` | `user123` | Team Member of Engineering; can claim and work on tickets, leave comments |
| **Operations Lead** | `carol@newtonite.com` | `user123` | Team Lead of Operations; manage operations items |
| **Operations Member** | `david@newtonite.com` | `user123` | Team Member of Operations |

---

## 🧪 Automated Testing & Verification

### 1. Run Unit & Critical Behaviour Tests (Jest)
Tests the core state machine, concurrency conflict detection, idempotency caching, and authorization matrix:
```bash
pnpm test
```
*Expected Result: `Test Suites: 1 passed, 1 total; Tests: 13 passed, 13 total`*

### 2. Run Comprehensive End-to-End System Test
Executes an automated 10-step validation across the live servers (Web pages, JWT login, team hierarchy, idempotent POST, atomic claim race, workflow transitions, OCC conflict, comments, and audit trail):
```bash
pnpm --filter api exec tsx ../../scripts/e2e-test.ts
```
*Expected Result: `🎉 ALL END-TO-END TEST SUITES PASSED PERFECTLY!`*

### 3. Verify Production Monorepo Build
Ensures all TypeScript contracts compile with zero errors across the entire workspace:
```bash
pnpm build
```

---

## 🖥️ Interactive Reviewer Walkthrough (What to Test in UI)

### 1. Unassigned Triage & Atomic Claiming
1. Sign in as `alice@newtonite.com` (password `user123`).
2. On the **Operations Dashboard** (`http://localhost:3000/dashboard`), notice the **Unassigned Triage Queue**.
3. Click **⚡ Claim** on an unassigned item. The ticket is immediately claimed and assigned to Alice.

### 2. Multi-Tab Real-Time WebSocket Synchronization
1. Open **two browser tabs** side-by-side at `http://localhost:3000/work-items`.
2. In **Tab 1**, click **+ Create Work Item**, fill in a title and team, and click **Create Item**.
3. In **Tab 2**, notice the table **instantly updates in real-time** via Socket.io without refreshing the page.

### 3. Optimistic Concurrency Control (OCC) Conflict
1. In **Tab 1**, navigate to a work item detail page (e.g., `/work-items/<id>`).
2. In **Tab 2**, open the **exact same** work item detail page.
3. In **Tab 1**, change the Priority dropdown from `Medium` to `Critical`.
4. In **Tab 2**, attempt to click a workflow status transition (e.g. `→ in progress`).
5. **Result**: The server rejects the stale version update with `409 Conflict`. The UI displays an amber banner:  
   `⚠️ Optimistic Concurrency Conflict: Another user has modified this work item simultaneously.`  
   Click **↻ Reload Latest Version** to fetch the latest state.

### 4. Workflow State Machine Restrictions
1. Open any `open` work item.
2. Note that the workflow action buttons only display legal transitions (`→ in progress` or `→ closed`).
3. You cannot illegally jump directly to `resolved` without first entering `in_progress`.

### 5. Immutable Audit Trail
1. Scroll down on any work item detail page to the **Immutable Audit Trail**.
2. Notice the chronological, append-only history recording every actor, action type (`created`, `assigned`, `status_changed`, `commented`), and timestamp.

---

## 🛠️ Troubleshooting

- **Port Conflict (`EADDRINUSE: 3000` or `4000`)**:  
  Ensure no previous background node instance is running on port 3000 or 4000.  
  On Windows PowerShell:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
  ```
- **Resetting the Embedded Database**:  
  If you want to completely wipe the local embedded database and re-seed from scratch:
  ```bash
  # Delete local PGlite data folder:
  Remove-Item -Path "apps/api/.data" -Recurse -Force -ErrorAction SilentlyContinue
  # Re-run migrations and seeds:
  pnpm --filter api db:migrate
  pnpm --filter api db:seed
  ```
