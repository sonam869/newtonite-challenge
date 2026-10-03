import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { requireAuth, requireAdmin } from '../lib/auth';

const router = Router();

// GET /teams
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  const result = await pool.query(`SELECT id, name, created_at FROM teams ORDER BY name`);
  res.json({ data: result.rows.map(t => ({ id: t.id, name: t.name, createdAt: t.created_at })) });
});

// POST /teams — admin only
const CreateTeamSchema = z.object({ name: z.string().min(1).max(100) });
router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateTeamSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const result = await pool.query(
    `INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at`,
    [parsed.data.name]
  );
  res.status(201).json({ data: result.rows[0] });
});

// GET /teams/:id/members
router.get('/:id/members', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, tm.role
     FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 ORDER BY u.name`,
    [req.params.id]
  );
  res.json({ data: result.rows });
});

// POST /teams/:id/members — team lead or admin
const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['lead', 'member', 'viewer']),
});
router.post('/:id/members', requireAuth, async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const userId = req.user!.userId;

  // Must be admin or lead of this team
  const isAdmin = req.user!.globalRole === 'admin';
  if (!isAdmin) {
    const membership = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId]
    );
    if (!membership.rows[0] || membership.rows[0].role !== 'lead') {
      res.status(403).json({ error: 'Only team leads or admins can add members' });
      return;
    }
  }

  const parsed = AddMemberSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  await pool.query(
    `INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role`,
    [parsed.data.userId, teamId, parsed.data.role]
  );
  res.status(201).json({ data: { success: true } });
});

// DELETE /teams/:id/members/:userId — team lead or admin
router.delete('/:id/members/:userId', requireAuth, async (req: Request, res: Response) => {
  const { id: teamId, userId: targetUserId } = req.params;
  const requesterId = req.user!.userId;
  const isAdmin = req.user!.globalRole === 'admin';

  if (!isAdmin) {
    const membership = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, requesterId]
    );
    if (!membership.rows[0] || membership.rows[0].role !== 'lead') {
      res.status(403).json({ error: 'Only team leads or admins can remove members' });
      return;
    }
  }

  await pool.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, targetUserId]);
  res.json({ data: { success: true } });
});

export default router;
