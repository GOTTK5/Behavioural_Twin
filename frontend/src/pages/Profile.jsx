import React, { useState, useEffect } from 'react';
import api, { errorMessage, setToken } from '../services/api';

const TIMEZONES = (() => {
  try { return Intl.supportedValuesOf('timeZone'); } catch {
    return ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];
  }
})();

export default function Profile({ onLogout }) {
  const [user,     setUser]     = useState(null);
  const [form,     setForm]     = useState({ name: '', age: '', weight: '', gender: 'prefer_not_to_say', timezone: 'Asia/Kolkata' });
  const [google,   setGoogle]   = useState({ connected: false, available: false });
  const [status,   setStatus]   = useState({});   // { key: { ok, text } }
  const [busy,     setBusy]     = useState({});
  const [deletePw, setDeletePw] = useState('');
  const [pw,       setPw]       = useState({ current: '', next: '', confirm: '' });

  const show = (key, ok, text) => setStatus(s => ({ ...s, [key]: { ok, text } }));

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      setUser(data.user);
      setForm({
        name:     data.user.name     || '',
        age:      data.user.age      ?? '',
        weight:   data.user.weight   ?? '',
        gender:   data.user.gender   || 'prefer_not_to_say',
        timezone: data.user.timezone || 'Asia/Kolkata'
      });
    }).catch(err => show('page', false, errorMessage(err)));

    api.get('/google/status').then(({ data }) => setGoogle(data)).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (result === 'connected') {
      setGoogle(g => ({ ...g, connected: true }));
      show('google', true, 'Google Fit connected');
    } else if (result === 'error') {
      show('google', false, 'Could not connect Google Fit — please try again.');
    }
    if (result) window.history.replaceState({}, '', '/profile');
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function act(key, fn) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await fn();
    } catch (err) {
      show(key, false, errorMessage(err));
      if (err.response?.data?.needsReconnect) setGoogle(g => ({ ...g, connected: false }));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }

  const saveProfile = () => act('profile', async () => {
    const { data } = await api.put('/auth/profile', {
      name:     form.name,
      age:      form.age === '' ? null : parseInt(form.age, 10),
      weight:   form.weight === '' ? null : parseFloat(form.weight),
      gender:   form.gender,
      timezone: form.timezone
    });
    setUser(data.user);
    show('profile', true, '✓ Saved');
  });

  const changePassword = () => act('password', async () => {
    if (pw.next.length < 8) return show('password', false, 'New password must be at least 8 characters');
    if (pw.next !== pw.confirm) return show('password', false, 'The two new passwords do not match');
    const { data } = await api.put('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
    setToken(data.token); // keep this device signed in
    setPw({ current: '', next: '', confirm: '' });
    show('password', true, `✓ ${data.message}`);
  });

  const connectGoogle = () => act('google', async () => {
    const { data } = await api.get('/google/auth-url');
    window.location.href = data.url;
  });

  const syncGoogleToday = () => act('google', async () => {
    const { data } = await api.post('/google/sync', {});
    const { sleepHours, steps } = data.synced;
    show('google', true, `Synced — sleep: ${sleepHours ?? 'no data'}${sleepHours != null ? 'h' : ''}, steps: ${steps ?? 'no data'}`);
  });

  const disconnectGoogle = () => act('google', async () => {
    await api.post('/google/disconnect');
    setGoogle(g => ({ ...g, connected: false }));
    show('google', true, 'Disconnected');
  });

  const runBatch = () => act('batch', async () => {
    const { data } = await api.post('/dashboard/trigger-batch');
    show('batch', true, data.hadData
      ? `✓ Processed ${data.weekYear}: ${data.patterns} pattern(s), ${data.episodes} episode(s)`
      : `No data logged in ${data.weekYear} (${data.startDate} → ${data.endDate}) yet`);
  });

  const exportData = () => act('export', async () => {
    const { data } = await api.get('/auth/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'twin-data-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const deleteAccount = () => act('delete', async () => {
    if (!window.confirm('This permanently deletes your account and ALL your data. This cannot be undone. Continue?')) return;
    await api.delete('/auth/account', { data: { password: deletePw } });
    onLogout();
  });

  if (status.page) return <div className="card"><div className="error-text">{status.page.text}</div></div>;
  if (!user) return <div className="loading">Loading profile...</div>;

  const Status = ({ k }) => status[k] ? <div className={status[k].ok ? 'success-text' : 'error-text'}>{status[k].text}</div> : null;

  return (
    <div>
      <div className="page-header">
        <h1>Profile</h1>
        <p>Your account and Twin settings</p>
      </div>

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Personal info</div>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={set('name')} placeholder="Your name" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Age</label>
              <input type="number" min="1" max="120" value={form.age} onChange={set('age')} placeholder="21" />
            </div>
            <div className="form-group">
              <label>Weight (kg)</label>
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
          <div className="form-group">
            <label>Timezone (decides when your "day" starts)</label>
            <select value={form.timezone} onChange={set('timezone')}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={busy.profile}>
            {busy.profile ? 'Saving...' : 'Save profile'}
          </button>
          <Status k="profile" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {google.available && (
            <div className="card">
              <div className="card-title">Google Fit — auto sync</div>
              <div className="muted" style={{ marginBottom: 16 }}>
                Syncs sleep and steps every night. Values you type in by hand are never overwritten.
              </div>
              {google.connected ? (
                <div>
                  <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 12 }}>✓ Connected</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={syncGoogleToday} disabled={busy.google}>Sync today now</button>
                    <button className="btn btn-secondary btn-sm" onClick={disconnectGoogle} disabled={busy.google}>Disconnect</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={connectGoogle} disabled={busy.google}>Connect Google Fit</button>
              )}
              <Status k="google" />
            </div>
          )}

          <div className="card">
            <div className="card-title">Account</div>
            <div className="muted" style={{ marginBottom: 4 }}>Email</div>
            <div style={{ fontWeight: 500, marginBottom: 16 }}>{user.email}</div>
            <div className="muted" style={{ marginBottom: 4 }}>Member since</div>
            <div style={{ fontWeight: 500, marginBottom: 20 }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={exportData} disabled={busy.export}>
                {busy.export ? 'Preparing...' : 'Download my data'}
              </button>
              <button className="btn btn-secondary" onClick={onLogout}>Sign out</button>
            </div>
            <Status k="export" />
          </div>

          <div className="card">
            <div className="card-title">Change password</div>
            <div className="form-group">
              <label>Current password</label>
              <input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label>New password</label>
                <input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Confirm new</label>
                <input type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={changePassword} disabled={busy.password || !pw.current || !pw.next}>
              {busy.password ? 'Saving...' : 'Change password'}
            </button>
            <Status k="password" />
          </div>

          <div className="card">
            <div className="card-title">Rebuild insights</div>
            <div className="muted" style={{ marginBottom: 12 }}>
              Patterns and weekly summaries update automatically every Monday. Run it now to refresh them immediately.
            </div>
            <button className="btn btn-secondary btn-sm" onClick={runBatch} disabled={busy.batch}>
              {busy.batch ? 'Running...' : 'Run weekly analysis now'}
            </button>
            <Status k="batch" />
          </div>

          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <div className="card-title" style={{ color: 'var(--danger)' }}>Delete account</div>
            <div className="muted" style={{ marginBottom: 12 }}>Permanently deletes your account and every entry, summary and chat message.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)} placeholder="Confirm with your password" style={{ flex: 1, minWidth: 180 }} />
              <button className="btn btn-danger" onClick={deleteAccount} disabled={!deletePw || busy.delete}>Delete</button>
            </div>
            <Status k="delete" />
          </div>
        </div>
      </div>
    </div>
  );
}
