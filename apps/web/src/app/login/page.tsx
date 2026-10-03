'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Newton<span style={{ color: 'var(--accent)' }}>ite</span>
          </div>
          <h1 className="auth-title">
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </h1>
          <p className="auth-subtitle">
            {mode === 'login' ? 'Manage your operational work.' : 'Join your team on Newtonite.'}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name</label>
              <input id="name" className="form-input" type="text" value={name}
                onChange={e => setName(e.target.value)} required placeholder="Alice Johnson" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input id="email" className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="alice@newtonite.com" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input id="password" className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <button id="submit-btn" className="btn btn-primary" type="submit" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', marginTop: 4 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="btn-ghost" style={{ padding: 0, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>

        <div style={{ marginTop: 20, padding: '12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Demo accounts:</strong><br />
          admin@newtonite.com / admin123<br />
          alice@newtonite.com / user123
        </div>
      </div>
    </div>
  );
}
