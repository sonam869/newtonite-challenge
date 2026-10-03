import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { requireAuth, requireAdmin } from '../lib/auth';

const router = Router();

// GET /users/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.global_role, u.created_at,
      COALESCE(json_agg(json_build_object(
        'teamId', tm.team_id,
        'teamName', t.name,
        'role', tm.role
      )) FILTER (WHERE tm.team_id IS NOT NULL), '[]') as teams
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN teams t ON t.id = tm.team_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [req.user!.userId]
  );
  const user = result.rows[0];
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ data: { id: user.id, name: user.name, email: user.email, globalRole: user.global_role, teams: user.teams } });
});

// GET /users — admin only
router.get('/', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT id, name, email, global_role, created_at FROM users ORDER BY name`
  );
  res.json({ data: result.rows.map(u => ({ id: u.id, name: u.name, email: u.email, globalRole: u.global_role, createdAt: u.created_at })) });
});

// GET /users/search?q= — for assignee search
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const result = await pool.query(
    `SELECT id, name, email FROM users WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 20`,
    [`%${q}%`]
  );
  res.json({ data: result.rows });
});

// PATCH /users/:id/role — admin only
const RoleSchema = z.object({ globalRole: z.enum(['admin', 'user']) });
router.patch('/:id/role', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = RoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid role' }); return; }
  await pool.query(`UPDATE users SET global_role = $1 WHERE id = $2`, [parsed.data.globalRole, req.params.id]);
  res.json({ data: { success: true } });
});

export default router;
