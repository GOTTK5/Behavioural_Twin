import React, { useState } from 'react';
import api, { errorMessage } from '../services/api';

export default function ResetPassword({ onLogin }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const goToLogin = () => window.location.replace('/');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords do not match');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password });
      window.history.replaceState({}, '', '/dashboard');
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
        <div style={{ color: 'var(--text2)', marginBottom: 28, fontSize: 13 }}>Choose a new password</div>

        {!token ? (
          <div className="error-text" style={{ marginBottom: 16 }}>This reset link is incomplete. Please request a new one.</div>
        ) : (
          <>
            <div className="form-group">
              <label>New password</label>
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required autoFocus />
            </div>
            <div className="form-group">
              <label>Confirm new password</label>
              <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type it again" required />
            </div>
            {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Saving...' : 'Set new password'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <button type="button" className="link-btn" onClick={goToLogin}>Back to sign in</button>
        </div>
      </form>
    </div>
  );
}
