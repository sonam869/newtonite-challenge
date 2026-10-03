import pool from './pool';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  try {
    // Create admin user
    const adminHash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (id, name, email, password_hash, global_role) VALUES
       ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@newtonite.com', $1, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [adminHash]
    );

    // Create regular users
    const userHash = await bcrypt.hash('user123', 10);
    await client.query(
      `INSERT INTO users (id, name, email, password_hash) VALUES
       ('00000000-0000-0000-0000-000000000002', 'Alice Johnson', 'alice@newtonite.com', $1),
       ('00000000-0000-0000-0000-000000000003', 'Bob Smith', 'bob@newtonite.com', $1),
       ('00000000-0000-0000-0000-000000000004', 'Carol Davis', 'carol@newtonite.com', $1),
       ('00000000-0000-0000-0000-000000000005', 'David Lee', 'david@newtonite.com', $1)
       ON CONFLICT (email) DO NOTHING`,
      [userHash]
    );

    // Create teams
    await client.query(
      `INSERT INTO teams (id, name) VALUES
       ('00000000-0000-0000-0001-000000000001', 'Engineering'),
       ('00000000-0000-0000-0001-000000000002', 'Operations'),
       ('00000000-0000-0000-0001-000000000003', 'Compliance')
       ON CONFLICT (name) DO NOTHING`
    );

    // Add team members
    await client.query(
      `INSERT INTO team_members (user_id, team_id, role) VALUES
       ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001', 'lead'),
       ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000001', 'member'),
       ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000002', 'lead'),
       ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000002', 'member'),
       ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000003', 'viewer')
       ON CONFLICT DO NOTHING`
    );

    // Create sample work items
    await client.query(
      `INSERT INTO work_items (title, description, status, priority, type, created_by, team_id) VALUES
       ('Production database slow queries', 'P95 query time has spiked to 3s. Needs investigation.', 'in_progress', 'critical', 'incident', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001'),
       ('Q4 compliance audit preparation', 'Annual compliance review due end of month.', 'open', 'high', 'compliance', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000003'),
       ('Payment gateway timeout investigation', 'Intermittent 504 errors on payment endpoint.', 'open', 'high', 'investigation', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000001'),
       ('Onboard new enterprise client', 'Configure SSO and provision access for Acme Corp.', 'pending_approval', 'medium', 'task', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000002'),
       ('Update data retention policy', 'Legal requires update to 7-year retention for financial records.', 'open', 'medium', 'compliance', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000003')
       ON CONFLICT DO NOTHING`
    );

    console.log('✅ Seed complete');
    console.log('');
    console.log('Accounts:');
    console.log('  admin@newtonite.com / admin123  (Admin)');
    console.log('  alice@newtonite.com / user123   (Engineering Lead)');
    console.log('  bob@newtonite.com   / user123   (Engineering Member)');
    console.log('  carol@newtonite.com / user123   (Operations Lead)');
    console.log('  david@newtonite.com / user123   (Operations Member)');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
