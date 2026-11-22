import React, { useState } from 'react';
import api, { errorMessage } from '../services/api';

const browserTimezone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch { return 'Asia/Kolkata'; }
})();

export default function Login({ onLogin }) {
  const [mode, setMode]       = useState('login'); // 'login' | 'register'
  const [form, setForm]       = useState({ name: '', email: '', password: '', age: '', weight: '', gender: 'prefer_not_to_say' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : {
            name: form.name, email: form.email, password: form.password, gender: form.gender, timezone: browserTimezone,
            ...(form.age    && { age: parseInt(form.age, 10) }),
            ...(form.weight && { weight: parseFloat(form.weight) })
          };
      const { data } = await api.post(endpoint, payload);
      onLogin(data.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <form className="card" style={{ width: '100%', maxWidth: 400, padding: 36 }} onSubmit={submit}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Twin</div>
        <div style={{ color: 'var(--text2)', marginBottom: 28, fontSize: 13 }}>Your personal behavioral AI</div>

        {mode === 'register' && (
          <>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={set('name')} placeholder="Your name" required />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>Age (optional)</label>
                <input type="number" min="1" max="120" value={form.age} onChange={set('age')} placeholder="21" />
              </div>
              <div className="form-group">
                <label>Weight kg (optional)</label>
                <input type="number" min="1" max="500" step="0.1" value={form.weight} onChange={set('weight')} placeholder="65" />
              </div>
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Email</label>
          <input type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={set('password')}
            placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
            required
          />
        </div>

        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit' }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
