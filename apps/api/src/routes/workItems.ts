import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { requireAuth } from '../lib/auth';
import { checkIdempotency, storeIdempotency } from '../lib/idempotency';
import { enqueueNotification } from '../lib/queue';
import { VALID_TRANSITIONS as SHARED_TRANSITIONS, WorkItemStatus } from '@newtonite/shared';

const VALID_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = SHARED_TRANSITIONS || {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'pending_approval', 'resolved', 'closed'],
  pending_approval: ['in_progress', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

const router = Router();

// Helper to get user's team memberships
async function getUserTeams(userId: string): Promise<{ teamId: string; role: string }[]> {
  const result = await pool.query(
    `SELECT team_id, role FROM team_members WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map(r => ({ teamId: r.team_id, role: r.role }));
}

// Helper: can user modify a work item?
async function canModify(userId: string, globalRole: string, teamId: string): Promise<boolean> {
  if (globalRole === 'admin') return true;
  const result = await pool.query(
    `SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2`,
    [userId, teamId]
  );
  const membership = result.rows[0];
  return membership && (membership.role === 'lead' || membership.role === 'member');
}

// Helper: record an audit event + broadcast via socket
async function recordEvent(
  client: any,
  workItemId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const result = await client.query(
    `INSERT INTO events (work_item_id, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [workItemId, actorId, eventType, JSON.stringify(payload)]
  );
  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /work-items
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const {
    status, priority, type, teamId, assignedTo, search,
    page = '1', pageSize = '20', sort = 'created_at', order = 'desc',
  } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (status) { conditions.push(`wi.status = $${i++}`); params.push(status); }
  if (priority) { conditions.push(`wi.priority = $${i++}`); params.push(priority); }
  if (type) { conditions.push(`wi.type = $${i++}`); params.push(type); }
  if (teamId) { conditions.push(`wi.team_id = $${i++}`); params.push(teamId); }
  if (assignedTo === 'me') { conditions.push(`wi.assigned_to = $${i++}`); params.push(req.user!.userId); }
  else if (assignedTo) { conditions.push(`wi.assigned_to = $${i++}`); params.push(assignedTo); }
  if (search) {
    conditions.push(`(wi.title ILIKE $${i} OR wi.description ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSorts: Record<string, string> = {
    created_at: 'wi.created_at',
    updated_at: 'wi.updated_at',
    priority: `CASE wi.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
  };
  const sortCol = allowedSorts[sort] || 'wi.created_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, parseInt(page));
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize)));
  const offset = (pageNum - 1) * pageSizeNum;

  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority, wi.type,
              wi.version, wi.created_at, wi.updated_at,
              wi.team_id, t.name as team_name,
              wi.created_by, cb.name as created_by_name,
              wi.assigned_to, ab.name as assigned_to_name
       FROM work_items wi
       JOIN teams t ON t.id = wi.team_id
       JOIN users cb ON cb.id = wi.created_by
       LEFT JOIN users ab ON ab.id = wi.assigned_to
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSizeNum, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM work_items wi ${where}`, params),
  ]);

  res.json({
    data: dataResult.rows.map(mapWorkItem),
    total: parseInt(countResult.rows[0].count),
    page: pageNum,
    pageSize: pageSizeNum,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /work-items
// ─────────────────────────────────────────────────────────────────────────────
const CreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().default(''),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  type: z.enum(['incident', 'task', 'compliance', 'approval', 'investigation']).default('task'),
  teamId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  // Idempotency check
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }
  }

  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { title, description, priority, type, teamId, assignedToId } = parsed.data;
  const userId = req.user!.userId;

  // Must be member or lead of the team (or admin)
  if (!(await canModify(userId, req.user!.globalRole, teamId))) {
    res.status(403).json({ error: 'You must be a member or lead of the team to create items' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemResult = await client.query(
      `INSERT INTO work_items (title, description, priority, type, created_by, assigned_to, team_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, description, status, priority, type, version, created_at, updated_at,
                 created_by, assigned_to, team_id`,
      [title, description, priority, type, userId, assignedToId || null, teamId]
    );
    const item = itemResult.rows[0];

    await recordEvent(client, item.id, userId, 'created', { title, priority, type });

    await client.query('COMMIT');

    // Fetch full item with joins
    const fullItem = await getWorkItemById(item.id);
    const responseBody = { data: fullItem };

    if (idempotencyKey) {
      await storeIdempotency(idempotencyKey, { status: 201, body: responseBody });
    }

    // Async: notify
    await enqueueNotification({
      type: 'work_item_created',
      workItemId: item.id,
      workItemTitle: title,
      actorName: req.user!.email,
      payload: { teamId },
    });

    // Broadcast via socket (attached to req.app)
    const io = req.app.get('io');
    if (io) io.emit('work_item:created', fullItem);

    res.status(201).json(responseBody);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /work-items/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const item = await getWorkItemById(req.params.id);
  if (!item) { res.status(404).json({ error: 'Work item not found' }); return; }
  res.json({ data: item });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /work-items/:id — optimistic locking via version
// ─────────────────────────────────────────────────────────────────────────────
const UpdateSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    status: z.enum(['open', 'in_progress', 'pending_approval', 'resolved', 'closed']).optional(),
    assignedToId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((data) => data.version !== undefined || data.expectedVersion !== undefined, {
    message: 'version or expectedVersion is required for optimistic concurrency control',
  });

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) { res.status(cached.status).json(cached.body); return; }
  }

  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const version = (parsed.data.version ?? parsed.data.expectedVersion)!;
  const { version: _v, expectedVersion: _ev, ...updates } = parsed.data;
  const userId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row for update
    const currentResult = await client.query(
      `SELECT * FROM work_items WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Work item not found' });
      return;
    }

    // Authorization
    if (!(await canModify(userId, req.user!.globalRole, current.team_id))) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'You do not have permission to modify this item' });
      return;
    }

    // ── CRITICAL BEHAVIOUR 1: Optimistic concurrency check ──
    if (current.version !== version) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: 'Conflict: item was modified by someone else',
        code: 'VERSION_CONFLICT',
        currentVersion: current.version,
      });
      return;
    }

    // ── CRITICAL BEHAVIOUR 2: Workflow state machine ──
    if (updates.status && updates.status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status as WorkItemStatus];
      if (!allowed.includes(updates.status as WorkItemStatus)) {
        await client.query('ROLLBACK');
        res.status(422).json({
          error: `Invalid transition: ${current.status} → ${updates.status}`,
          code: 'INVALID_TRANSITION',
          allowedTransitions: allowed,
        });
        return;
      }
    }

    // Build SET clause dynamically
    const setClauses: string[] = ['version = version + 1', 'updated_at = NOW()'];
    const setParams: unknown[] = [];
    let pi = 1;

    if (updates.title !== undefined) { setClauses.push(`title = $${pi++}`); setParams.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push(`description = $${pi++}`); setParams.push(updates.description); }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${pi++}`); setParams.push(updates.priority); }
    if (updates.status !== undefined) { setClauses.push(`status = $${pi++}`); setParams.push(updates.status); }
    if ('assignedToId' in updates) { setClauses.push(`assigned_to = $${pi++}`); setParams.push(updates.assignedToId ?? null); }
    if (updates.teamId !== undefined) { setClauses.push(`team_id = $${pi++}`); setParams.push(updates.teamId); }

    setParams.push(req.params.id);
    const updatedResult = await client.query(
      `UPDATE work_items SET ${setClauses.join(', ')} WHERE id = $${pi} RETURNING *`,
      setParams
    );
    const updated = updatedResult.rows[0];

    // Record events for meaningful changes
    if (updates.status && updates.status !== current.status) {
      await recordEvent(client, updated.id, userId, 'status_changed', {
        from: current.status, to: updates.status,
      });
    }
    if (updates.priority && updates.priority !== current.priority) {
      await recordEvent(client, updated.id, userId, 'priority_changed', {
        from: current.priority, to: updates.priority,
      });
    }
    if ('assignedToId' in updates && updates.assignedToId !== current.assigned_to) {
      await recordEvent(client, updated.id, userId, updates.assignedToId ? 'assigned' : 'unassigned', {
        from: current.assigned_to, to: updates.assignedToId,
      });
    }
    if (updates.title && updates.title !== current.title) {
      await recordEvent(client, updated.id, userId, 'title_changed', {
        from: current.title, to: updates.title,
      });
    }

    await client.query('COMMIT');

    const fullItem = await getWorkItemById(updated.id);
    const responseBody = { data: fullItem };

    if (idempotencyKey) {
      await storeIdempotency(idempotencyKey, { status: 200, body: responseBody });
    }

    // Notify if assigned
    if ('assignedToId' in updates && updates.assignedToId && updates.assignedToId !== current.assigned_to) {
      const recipient = await pool.query(`SELECT email FROM users WHERE id = $1`, [updates.assignedToId]);
      if (recipient.rows[0]) {
        await enqueueNotification({
          type: 'work_item_assigned',
          workItemId: updated.id,
          workItemTitle: updated.title,
          actorName: req.user!.email,
          recipientEmail: recipient.rows[0].email,
          payload: {},
        });
      }
    }

    // Notify if status changed
    if (updates.status && updates.status !== current.status) {
      await enqueueNotification({
        type: 'work_item_status_changed',
        workItemId: updated.id,
        workItemTitle: updated.title,
        actorName: req.user!.email,
        payload: { from: current.status, to: updates.status },
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('work_item:updated', fullItem);

    res.json(responseBody);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /work-items/:id/claim — CRITICAL BEHAVIOUR 3: Atomic claim
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/claim', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) { res.status(cached.status).json(cached.body); return; }
  }

  // Atomic: only succeeds if currently unassigned
  const result = await pool.query(
    `UPDATE work_items
     SET assigned_to = $1, version = version + 1, updated_at = NOW()
     WHERE id = $2 AND assigned_to IS NULL
     RETURNING *`,
    [userId, req.params.id]
  );

  if (result.rowCount === 0) {
    // Either not found, or already claimed by someone else
    const check = await pool.query(`SELECT assigned_to FROM work_items WHERE id = $1`, [req.params.id]);
    if (!check.rows[0]) {
      res.status(404).json({ error: 'Work item not found' });
      return;
    }
    res.status(409).json({
      error: 'Item already claimed by another user',
      code: 'ALREADY_CLAIMED',
    });
    return;
  }

  const claimed = result.rows[0];
  await pool.query(
    `INSERT INTO events (work_item_id, actor_id, event_type, payload) VALUES ($1, $2, 'assigned', $3)`,
    [claimed.id, userId, JSON.stringify({ from: null, to: userId, via: 'claim' })]
  );

  const fullItem = await getWorkItemById(claimed.id);
  const responseBody = { data: fullItem };

  if (idempotencyKey) await storeIdempotency(idempotencyKey, { status: 200, body: responseBody });

  const io = req.app.get('io');
  if (io) io.emit('work_item:updated', fullItem);

  res.json(responseBody);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /work-items/:id/events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/events', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT e.id, e.work_item_id, e.event_type, e.payload, e.created_at,
            e.actor_id, u.name as actor_name
     FROM events e JOIN users u ON u.id = e.actor_id
     WHERE e.work_item_id = $1
     ORDER BY e.created_at ASC`,
    [req.params.id]
  );
  res.json({
    data: result.rows.map(e => ({
      id: e.id,
      workItemId: e.work_item_id,
      actorId: e.actor_id,
      actorName: e.actor_name,
      eventType: e.event_type,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /work-items/:id/comments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/comments', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT c.id, c.body, c.created_at, c.work_item_id,
            c.author_id, u.name as author_name
     FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.work_item_id = $1 ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  res.json({
    data: result.rows.map(c => ({
      id: c.id,
      workItemId: c.work_item_id,
      authorId: c.author_id,
      authorName: c.author_name,
      body: c.body,
      createdAt: c.created_at,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /work-items/:id/comments
// ─────────────────────────────────────────────────────────────────────────────
const CommentSchema = z.object({ body: z.string().min(1).max(5000) });

router.post('/:id/comments', requireAuth, async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) { res.status(cached.status).json(cached.body); return; }
  }

  const parsed = CommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const workItem = await pool.query(`SELECT id, team_id, title, assigned_to FROM work_items WHERE id = $1`, [req.params.id]);
  if (!workItem.rows[0]) { res.status(404).json({ error: 'Work item not found' }); return; }

  const userId = req.user!.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const commentResult = await client.query(
      `INSERT INTO comments (work_item_id, author_id, body) VALUES ($1, $2, $3)
       RETURNING id, work_item_id, author_id, body, created_at`,
      [req.params.id, userId, parsed.data.body]
    );
    const comment = commentResult.rows[0];
    await recordEvent(client, req.params.id, userId, 'commented', { commentId: comment.id });
    await client.query('COMMIT');

    const authorResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const response = {
      data: {
        id: comment.id,
        workItemId: comment.work_item_id,
        authorId: comment.author_id,
        authorName: authorResult.rows[0]?.name,
        body: comment.body,
        createdAt: comment.created_at,
      },
    };

    if (idempotencyKey) await storeIdempotency(idempotencyKey, { status: 201, body: response });

    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('comment:added', response.data);

    res.status(201).json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getWorkItemById(id: string) {
  const result = await pool.query(
    `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority, wi.type,
            wi.version, wi.created_at, wi.updated_at,
            wi.team_id, t.name as team_name,
            wi.created_by, cb.name as created_by_name,
            wi.assigned_to, ab.name as assigned_to_name
     FROM work_items wi
     JOIN teams t ON t.id = wi.team_id
     JOIN users cb ON cb.id = wi.created_by
     LEFT JOIN users ab ON ab.id = wi.assigned_to
     WHERE wi.id = $1`,
    [id]
  );
  return result.rows[0] ? mapWorkItem(result.rows[0]) : null;
}

function mapWorkItem(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    type: row.type,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teamId: row.team_id,
    teamName: row.team_name,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    assignedToId: row.assigned_to,
    assignedToName: row.assigned_to_name,
  };
}

export default router;
