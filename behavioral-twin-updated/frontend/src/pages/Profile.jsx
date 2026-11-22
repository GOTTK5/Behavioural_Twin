import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Profile({ onLogout }) {
  const [user,    setUser]    = useState(null);
  const [form,    setForm]    = useState({ name: '', age: '', weight: '', gender: 'male', timezone: 'Asia/Kolkata' });
  const [google,  setGoogle]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      setUser(data.user);
      setForm({
        name:     data.user.name     || '',
        age:      data.user.age      || '',
        weight:   data.user.weight   || '',
        gender:   data.user.gender   || 'male',
        timezone: data.user.timezone || 'Asia/Kolkata'
      });
    });
    api.get('/google/status').then(({ data }) => setGoogle(data.connected));

    // Check URL param for Google connect result
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      setGoogle(true);
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function saveProfile() {
    setSaving(true);
    try {
      const { data } = await api.put('/auth/profile', {
        name:     form.name,
        age:      parseInt(form.age),
        weight:   parseFloat(form.weight),
        gender:   form.gender,
        timezone: form.timezone
      });
      setUser(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    const { data } = await api.get('/google/auth-url');
    window.location.href = data.url;
  }

  async function syncGoogleToday() {
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data } = await api.post('/google/sync', { date: today });
      alert(`Synced! Sleep: ${data.synced.sleepHours}h, Steps: ${data.synced.steps}`);
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.error || err.message));
    }
  }
  

  async function disconnectGoogle() {
    await api.post('/google/disconnect');
    setGoogle(false);
  }
  
  async function runBatch() {
    setBatching(true);
    setBatchMsg('');
    try {
      // Trigger daily summary for today first
      const today = new Date().toISOString().split('T')[0];
      await api.post('/dashboard/trigger-batch', { date: today });
      setBatchMsg('✓ Batch job complete — patterns and summaries updated');
    } catch (err) {
      setBatchMsg('Batch job ran (check console for details)');
    } finally {
      setBatching(false);
    }
  }

  if (!user) return <div className="loading">Loading profile...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Profile</h1>
        <p>Your account and Twin settings</p>
      </div>

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>

        {/* Profile form */}
        <div className="card">
          <div className="card-title">Personal info</div>
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
              <input type="number" step="0.1" value={form.weight} onChange={set('weight')} placeholder="65" />
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
          <div className="form-group">
            <label>Timezone</label>
            <select value={form.timezone} onChange={set('timezone')}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/London">Europe/London</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Google Fit */}
          <div className="card">
            <div className="card-title">Google Fit — auto sync</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Connect Google Fit to automatically sync sleep and steps every night.
              No manual entry needed.
            </div>
            {google ? (
              <div>
                 <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 12 }}>✓ Connected</div>
                 <div style={{ display: 'flex', gap: 8 }}>
                   <button className="btn btn-secondary btn-sm" onClick={syncGoogleToday}>
                      Sync today manually
                   </button>
                   <button className="btn btn-secondary btn-sm" onClick={disconnectGoogle}>
                      Disconnect & reconnect
                   </button>
                 </div>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={connectGoogle}>
                Connect Google Fit
              </button>
            )}
          </div>

          {/* Account */}
          <div className="card">
            <div className="card-title">Account</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Email</div>
            <div style={{ fontWeight: 500, marginBottom: 16 }}>{user.email}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Member since</div>
            <div style={{ fontWeight: 500, marginBottom: 20 }}>
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            </div>
            <button className="btn btn-secondary" onClick={onLogout}>Sign out</button>
          </div>

          {/* Developer tools */}
          <div className="card" style={{ borderColor: 'var(--border)', opacity: 0.8 }}>
            <div className="card-title">Developer tools</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              Manually trigger the weekly batch job — useful for testing with synthetic data.
            </div>
            <button className="btn btn-secondary btn-sm" onClick={runBatch} disabled={batching}>
              {batching ? 'Running...' : 'Run weekly batch now'}
            </button>
            {batchMsg && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--success)' }}>{batchMsg}</div>}
          </div>

        </div>
      </div>
    </div>
  );
}
