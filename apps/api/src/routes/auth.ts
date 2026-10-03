import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import pool from '../db/pool';
import { signToken } from '../lib/auth';

const router = Router();

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { name, email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     RETURNING id, name, email, global_role, created_at`,
    [name, email, hash]
  );
  const user = result.rows[0];
  const token = signToken({ userId: user.id, email: user.email, globalRole: user.global_role });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, globalRole: user.global_role } });
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const result = await pool.query(
    `SELECT id, name, email, password_hash, global_role FROM users WHERE email = $1`,
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const token = signToken({ userId: user.id, email: user.email, globalRole: user.global_role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, globalRole: user.global_role } });
});

export default router;
