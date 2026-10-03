import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

export interface DbResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface DbClient {
  query(text: string, params?: any[]): Promise<DbResult>;
  release(): void;
}

export interface IDbPool {
  query(text: string, params?: any[]): Promise<DbResult>;
  connect(): Promise<DbClient>;
  end(): Promise<void>;
  isEmbedded(): boolean;
}

const useEmbedded =
  process.env.DB_MODE === 'embedded' ||
  process.env.USE_EMBEDDED_DB === 'true' ||
  !process.env.DB_HOST;

class EmbeddedPool implements IDbPool {
  private pglite: PGlite | null = null;
  private dataDir: string;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), '.data', 'pglite');
  }

  private async getDb(): Promise<PGlite> {
    if (!this.pglite) {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.pglite = new PGlite(this.dataDir);
      console.log(`📦 Running with embedded PostgreSQL (PGlite) at: ${this.dataDir}`);
    }
    return this.pglite;
  }

  async query(text: string, params?: any[]): Promise<DbResult> {
    const db = await this.getDb();
    if (!params || params.length === 0) {
      // If it has multiple statements, use exec()
      if (text.includes(';') && text.trim().split(';').filter((s) => s.trim()).length > 1) {
        const results = await db.exec(text);
        const lastResult = results[results.length - 1];
        return {
          rows: (lastResult?.rows as any[]) || [],
          rowCount: lastResult?.affectedRows ?? 0,
        };
      }
    }
    const res = await db.query(text, params);
    return {
      rows: res.rows as any[],
      rowCount: res.affectedRows ?? res.rowCount ?? res.rows.length,
    };
  }

  async connect(): Promise<DbClient> {
    const db = await this.getDb();
    return {
      query: (text: string, params?: any[]) => this.query(text, params),
      release: () => {},
    };
  }

  async end(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
  }

  isEmbedded(): boolean {
    return true;
  }
}

class PostgresPool implements IDbPool {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'newtonite',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });
  }

  async query(text: string, params?: any[]): Promise<DbResult> {
    const res = await this.pool.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  }

  async connect(): Promise<DbClient> {
    const client = await this.pool.connect();
    return {
      query: async (text: string, params?: any[]) => {
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? 0 };
      },
      release: () => client.release(),
    };
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  isEmbedded(): boolean {
    return false;
  }
}

// Select pool implementation based on environment
const pool: IDbPool = useEmbedded ? new EmbeddedPool() : new PostgresPool();

export default pool;
