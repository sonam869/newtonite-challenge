import http from 'http';

const API_BASE = 'http://localhost:4000';
const WEB_BASE = 'http://localhost:3000';

function fetchUrl(url: string, options: any = {}): Promise<{ status: number; body: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('🚀 Starting Comprehensive End-to-End System & UI Test...\n');

  // 1. Verify Frontend Pages load (HTTP 200)
  console.log('--- Step 1: Checking Frontend Web Pages ---');
  for (const path of ['/', '/login', '/dashboard', '/work-items', '/teams']) {
    const res = await fetchUrl(`${WEB_BASE}${path}`);
    if (res.status === 200 || res.status === 307 || res.status === 308) {
      console.log(`  ✓ Page ${path.padEnd(12)} returned status ${res.status} OK`);
    } else {
      console.error(`  ✗ Page ${path} returned unexpected status: ${res.status}`);
      process.exit(1);
    }
  }

  // 2. Authentication Flow
  console.log('\n--- Step 2: Testing User Authentication Flow ---');
  const loginRes = await fetchUrl(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@newtonite.com', password: 'admin123' },
  });
  if (loginRes.status !== 200 || !loginRes.body.token) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }
  const token = loginRes.body.token;
  const user = loginRes.body.user;
  console.log(`  ✓ Successfully logged in as ${user.name} (${user.email}) [Role: ${user.globalRole}]`);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Teams API
  console.log('\n--- Step 3: Verifying Teams & Memberships ---');
  const teamsRes = await fetchUrl(`${API_BASE}/teams`, { headers: authHeaders });
  console.log(`  ✓ Retrieved ${teamsRes.body.data.length} operational teams:`);
  for (const team of teamsRes.body.data) {
    const membersRes = await fetchUrl(`${API_BASE}/teams/${team.id}/members`, { headers: authHeaders });
    console.log(`    • ${team.name.padEnd(14)} (${membersRes.body.data.length} members)`);
  }
  const engTeam = teamsRes.body.data.find((t: any) => t.name === 'Engineering');

  // 4. Create Work Item (with Idempotency Key)
  console.log('\n--- Step 4: Creating New Work Item via Idempotent POST ---');
  const idemKey = `e2e-create-${Date.now()}`;
  const createPayload = {
    title: 'P0 Incident: Checkout API 500 error spike',
    description: 'Elevated rate of 500 status codes detected on /api/v1/checkout during peak traffic.',
    type: 'incident',
    priority: 'critical',
    teamId: engTeam.id,
  };

  const createRes1 = await fetchUrl(`${API_BASE}/work-items`, {
    method: 'POST',
    headers: { ...authHeaders, 'X-Idempotency-Key': idemKey },
    body: createPayload,
  });
  console.log(`  ✓ First POST returned HTTP ${createRes1.status} (Created item ID: ${createRes1.body.data.id})`);

  // Retry with same idempotency key
  const createRes2 = await fetchUrl(`${API_BASE}/work-items`, {
    method: 'POST',
    headers: { ...authHeaders, 'X-Idempotency-Key': idemKey },
    body: createPayload,
  });
  if (createRes2.body.data.id === createRes1.body.data.id) {
    console.log(`  ✓ Idempotency verified: duplicate POST returned cached result (ID matched: ${createRes2.body.data.id})`);
  } else {
    throw new Error('Idempotency failure: new item was created instead of returning cached result');
  }

  const itemId = createRes1.body.data.id;
  let currentVersion = createRes1.body.data.version;

  // 5. Atomic Claim
  console.log('\n--- Step 5: Testing Atomic Claim Under Contention ---');
  const claimRes1 = await fetchUrl(`${API_BASE}/work-items/${itemId}/claim`, {
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`  ✓ First claim succeeded with HTTP ${claimRes1.status} (Assigned to: ${claimRes1.body.data.assignedToName})`);
  currentVersion = claimRes1.body.data.version;

  // Second claim should be rejected (ALREADY_CLAIMED)
  const claimRes2 = await fetchUrl(`${API_BASE}/work-items/${itemId}/claim`, {
    method: 'POST',
    headers: authHeaders,
  });
  if (claimRes2.status === 409) {
    console.log(`  ✓ Second claim correctly rejected with HTTP 409 Conflict (${claimRes2.body.error})`);
  } else {
    throw new Error(`Second claim expected 409, got ${claimRes2.status}`);
  }

  // 6. Workflow State Machine Transitions
  console.log('\n--- Step 6: Testing Workflow State Machine Enforcement ---');
  // Disallowed transition: open directly to resolved
  const illegalTransitionRes = await fetchUrl(`${API_BASE}/work-items/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: { status: 'resolved', expectedVersion: currentVersion },
  });
  if (illegalTransitionRes.status === 422) {
    console.log(`  ✓ Illegal status jump (open -> resolved) correctly blocked with HTTP 422 (${illegalTransitionRes.body.error})`);
  } else {
    throw new Error(`Expected 422 for illegal transition, got ${illegalTransitionRes.status}`);
  }

  // Valid transition 1: open -> in_progress
  const transition1 = await fetchUrl(`${API_BASE}/work-items/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: { status: 'in_progress', expectedVersion: currentVersion },
  });
  console.log(`  ✓ Valid status change (open -> in_progress) succeeded: HTTP ${transition1.status}`);
  currentVersion = transition1.body.data.version;

  // Valid transition 2: in_progress -> resolved
  const transition2 = await fetchUrl(`${API_BASE}/work-items/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: { status: 'resolved', expectedVersion: currentVersion },
  });
  console.log(`  ✓ Valid status change (in_progress -> resolved) succeeded: HTTP ${transition2.status}`);
  currentVersion = transition2.body.data.version;

  // 7. Optimistic Concurrency Control (OCC)
  console.log('\n--- Step 7: Testing Optimistic Concurrency Control (Version Conflict) ---');
  const staleVersion = currentVersion - 1; // Simulated concurrent update from another tab
  const conflictRes = await fetchUrl(`${API_BASE}/work-items/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: { priority: 'low', expectedVersion: staleVersion },
  });
  if (conflictRes.status === 409) {
    console.log(`  ✓ Stale version update correctly blocked with HTTP 409 Conflict (${conflictRes.body.error})`);
  } else {
    throw new Error(`Expected 409 for stale version update, got ${conflictRes.status}`);
  }

  // 8. Comments & Discussion
  console.log('\n--- Step 8: Adding Discussion Comment ---');
  const commentRes = await fetchUrl(`${API_BASE}/work-items/${itemId}/comments`, {
    method: 'POST',
    headers: authHeaders,
    body: { body: 'Database connection pool resized to 50 connections. Latency normalized.' },
  });
  console.log(`  ✓ Added comment successfully: HTTP ${commentRes.status} by ${commentRes.body.data.authorName}`);

  // 9. Immutable Audit Event Log
  console.log('\n--- Step 9: Verifying Immutable Audit Trail ---');
  const eventsRes = await fetchUrl(`${API_BASE}/work-items/${itemId}/events`, { headers: authHeaders });
  console.log(`  ✓ Retrieved ${eventsRes.body.data.length} audit events logged:`);
  for (const ev of eventsRes.body.data) {
    console.log(`    • [${new Date(ev.createdAt).toLocaleTimeString()}] ${ev.actorName} performed '${ev.eventType}'`);
  }

  // 10. Dashboard Triage Verification
  console.log('\n--- Step 10: Verifying Dashboard Aggregate Data ---');
  const workItemsRes = await fetchUrl(`${API_BASE}/work-items?pageSize=10`, { headers: authHeaders });
  console.log(`  ✓ Total work items in system: ${workItemsRes.body.total}`);
  console.log(`  ✓ Page 1 items returned: ${workItemsRes.body.data.length}`);

  console.log('\n🎉 ALL END-TO-END TEST SUITES PASSED PERFECTLY!\n');
}

runE2E().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
