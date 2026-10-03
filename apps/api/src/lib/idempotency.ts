import redis from './redis';
import pool from '../db/pool';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export interface IdempotencyResult {
  status: number;
  body: unknown;
}

export async function checkIdempotency(key: string): Promise<IdempotencyResult | null> {
  // 1. Try Redis if connected
  if (redis.status === 'ready') {
    try {
      const stored = await redis.get(`idempotency:${key}`);
      if (stored) return JSON.parse(stored);
    } catch (err) {
      console.warn('Redis idempotency read failed:', err);
    }
  }

  // 2. Fall back to PostgreSQL idempotency_keys table
  try {
    const res = await pool.query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE key = $1`,
      [key]
    );
    if (res.rows.length > 0) {
      return {
        status: res.rows[0].response_status,
        body: res.rows[0].response_body,
      };
    }
  } catch (err) {
    console.warn('DB idempotency check failed:', err);
  }

  return null;
}

export async function storeIdempotency(key: string, result: IdempotencyResult): Promise<void> {
  // 1. Try Redis if connected
  if (redis.status === 'ready') {
    try {
      await redis.setex(
        `idempotency:${key}`,
        IDEMPOTENCY_TTL_SECONDS,
        JSON.stringify(result)
      );
    } catch (err) {
      console.warn('Redis idempotency store failed:', err);
    }
  }

  // 2. Persist to PostgreSQL idempotency_keys table
  try {
    await pool.query(
      `INSERT INTO idempotency_keys (key, response_status, response_body)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [key, result.status, JSON.stringify(result.body)]
    );
  } catch (err) {
    console.warn('DB idempotency store failed:', err);
  }
}
