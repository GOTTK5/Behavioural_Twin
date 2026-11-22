import React, { useState } from 'react';
import api from '../services/api';

export default function Login({ onLogin }) {
  const [mode, setMode]   = useState('login'); // 'login' | 'register'
  const [form, setForm]   = useState({ name: '', email: '', password: '', age: '', weight: '', gender: 'male' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError(''); setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload  = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, age: parseInt(form.age), weight: parseFloat(form.weight), gender: form.gender };
      const { data } = await api.post(endpoint, payload);
      onLogin(data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 400, padding: 36 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Twin</div>
        <div style={{ color: 'var(--text2)', marginBottom: 28, fontSize: 13 }}>Your personal behavioral AI</div>

        {mode === 'register' && (
          <>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={set('name')} placeholder="Your name" />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>Age</label>
                <input type="number" value={form.age} onChange={set('age')} placeholder="21" />
              </div>
              <div className="form-group">
                <label>Weight (kg)</label>
                <input type="number" value={form.weight} onChange={set('weight')} placeholder="65" />
              </div>
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </div>
      </div>
    </div>
  );
}
