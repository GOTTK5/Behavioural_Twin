import React, { useState } from 'react';
import api, { errorMessage } from '../services/api';

const browserTimezone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch { return 'Asia/Kolkata'; }
})();

export default function Login({ onLogin }) {
  const [mode, setMode]       = useState('login'); // 'login' | 'register' | 'forgot'
  const [info, setInfo]       = useState('');
  const [form, setForm]       = useState({ name: '', email: '', password: '', age: '', weight: '', gender: 'prefer_not_to_say' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'forgot') {
      setLoading(true);
      try {
        const { data } = await api.post('/auth/forgot-password', { email: form.email });
        setInfo(data.message);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }
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
        <div style={{ color: 'var(--text2)', marginBottom: 28, fontSize: 13 }}>
          {mode === 'forgot' ? "Enter your account email and we'll send you a link to set a new password." : 'Your personal behavioral AI'}
        </div>

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
        {mode !== 'forgot' && (
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
          {mode === 'login' && (
            <button type="button" className="link-btn" style={{ marginTop: 6, fontSize: 12 }} onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}
        </div>
        )}

        {info && <div className="success-text" style={{ marginBottom: 12 }}>{info}</div>}
        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
          {mode === 'login' ? "Don't have an account? " : mode === 'register' ? 'Already have an account? ' : 'Remembered it? '}
          <button type="button" className="link-btn" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
