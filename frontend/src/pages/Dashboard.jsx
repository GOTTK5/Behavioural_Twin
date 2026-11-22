import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api, { errorMessage } from '../services/api';

const METRICS = [
  { key: 'mood',         label: 'Mood',         color: '#6c63ff', unit: '/9',  icon: '😊' },
  { key: 'sleep',        label: 'Sleep',        color: '#4ecdc4', unit: 'h',   icon: '😴' },
  { key: 'steps',        label: 'Steps',        color: '#ffd93d', unit: '',    icon: '👟' },
  { key: 'exercise',     label: 'Exercise',     color: '#6bcb77', unit: 'min', icon: '🏃' },
  { key: 'screenTime',   label: 'Screen time',  color: '#ff6b6b', unit: 'h',   icon: '📱' },
  { key: 'productivity', label: 'Productivity', color: '#a8dadc', unit: '%',   icon: '✅' },
  { key: 'anxiety',      label: 'Anxiety',      color: '#ff9f43', unit: '/21', icon: '😰' },
];

function fmt(v, unit) {
  if (v == null) return '—';
  if (unit === '%') return `${(v * 100).toFixed(0)}%`;
  return `${typeof v === 'number' ? v.toFixed(1).replace(/\.0$/, '') : v}${unit}`;
}

function MiniChart({ data, color }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text2)', fontSize: 12 }}>No data</div>;
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BigChart({ data, color, label, unit }) {
  if (!data || data.length === 0) return null;
  const formatted = data.map(d => ({
    ...d,
    value: d.value != null ? (unit === '%' ? +(d.value * 100).toFixed(1) : d.value) : null,
    date:  d.date?.slice(5) // MM-DD
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fill: 'var(--text2)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}
          labelStyle={{ color: 'var(--text2)' }}
          itemStyle={{ color }}
          formatter={(v) => [`${v}${unit === '%' ? '%' : ''}`, label]}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [data, setData]         = useState(null);
  const [today, setToday]       = useState(null);
  const [active, setActive]     = useState('mood');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/overview?days=30'),
      api.get('/dashboard/today')
    ]).then(([ov, td]) => {
      setData(ov.data);
      setToday(td.data);
    }).catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="card"><div className="error-text">{error}</div></div>;

  const activeMetric = METRICS.find(m => m.key === active);
  const activeData   = data?.trends?.[active];
  const latestVal    = activeData?.filter(d => d.value != null).slice(-1)[0]?.value;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your behavioral overview — last 30 days</p>
      </div>

      {/* Today's completion bar */}
      {today && (
        <div className="card section today-bar">
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Today's log — {today.date}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
              {['mood','journal','health','tasks'].map(k => (
                <span key={k} style={{ color: today.logged[k] ? 'var(--success)' : 'var(--text2)' }}>
                  {today.logged[k] ? '✓' : '○'} {k.charAt(0).toUpperCase() + k.slice(1)}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{today.completionScore}/4</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>logged today</div>
          </div>
          {today.psychTestDue && (
            <div style={{ background: 'rgba(255,217,61,0.1)', border: '1px solid var(--warning)', padding: '8px 14px', borderRadius: 8, fontSize: 12, color: 'var(--warning)' }}>
              ⚠️ Weekly anxiety test due
            </div>
          )}
        </div>
      )}

      {/* 7 stat tiles — change = latest value vs. average of the 7 values before it */}
      <div className="stat-grid">
        {METRICS.map(m => {
          const vals   = data?.trends?.[m.key]?.filter(d => d.value != null) || [];
          const latest = vals.slice(-1)[0]?.value;
          const before = vals.slice(-8, -1).map(d => d.value);
          const prev   = before.length ? before.reduce((a, b) => a + b, 0) / before.length : null;
          const change = latest != null && prev ? ((latest - prev) / prev * 100).toFixed(0) : null;
          return (
            <div
              key={m.key}
              className="stat-tile"
              style={{ cursor: 'pointer', borderColor: active === m.key ? m.color : 'var(--border)', borderWidth: active === m.key ? 2 : 1 }}
              onClick={() => setActive(m.key)}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
              <div className="stat-label">{m.label}</div>
              <div className="stat-value" style={{ color: m.color, fontSize: 20 }}>{fmt(latest, m.unit)}</div>
              {change != null && +change !== 0 && <div className={`stat-change ${+change > 0 ? 'up' : 'down'}`}>{+change > 0 ? '↑' : '↓'}{Math.abs(change)}%</div>}
              <div style={{ marginTop: 8 }}>
                <MiniChart data={vals.slice(-14)} color={m.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Big expanded chart */}
      <div className="card section">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div className="section-title">{activeMetric.icon} {activeMetric.label} trend</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: activeMetric.color }}>{fmt(latestVal, activeMetric.unit)}</div>
        </div>
        {activeData?.some(d => d.value != null)
          ? <BigChart data={activeData} color={activeMetric.color} label={activeMetric.label} unit={activeMetric.unit} />
          : <div className="muted">No {activeMetric.label.toLowerCase()} data in the last 30 days — log it on the Daily Log page.</div>}
      </div>

      {/* Patterns + active episodes */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">Behavioral patterns</div>
          {data?.patterns?.length === 0 && <div className="muted">Keep logging — patterns appear after about 2 weeks of data</div>}
          {data?.patterns?.map((p, i) => (
            <div key={i} className="pattern-card">
              <div style={{ fontSize: 13 }}>{p.pattern}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <span className={`confidence-badge confidence-${p.confidence}`}>{p.confidence}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{p.weeks} weeks observed</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">Active episodes</div>
          {data?.activeEpisodes?.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 13 }}>No active episodes — looking good</div>}
          {data?.activeEpisodes?.map((ep, i) => (
            <div key={i} className="episode-card">
              <div style={{ fontWeight: 600, fontSize: 13 }}>{ep.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Since {ep.startDate} · {ep.severity}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
