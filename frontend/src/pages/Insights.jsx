import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../services/api';

export default function Insights() {
  const [patterns,  setPatterns]  = useState([]);
  const [episodes,  setEpisodes]  = useState([]);
  const [weeks,     setWeeks]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('patterns');
  const [error,     setError]     = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [pRes, eRes, wRes] = await Promise.all([
        api.get('/insights/patterns'),
        api.get('/insights/episodes'),
        api.get('/insights/weekly-history')
      ]);
      setPatterns(pRes.data.patterns || []);
      setEpisodes(eRes.data.episodes || []);
      setWeeks(wRes.data.weeks || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resolveEpisode(id) {
    try {
      await api.patch(`/insights/episodes/${id}/resolve`);
      setEpisodes(eps => eps.map(e => e._id === id ? { ...e, resolved: true } : e));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <div className="loading">Loading insights...</div>;

  const activeEpisodes   = episodes.filter(e => !e.resolved);
  const resolvedEpisodes = episodes.filter(e => e.resolved);

  return (
    <div>
      <div className="page-header">
        <h1>Insights</h1>
        <p>Patterns Twin has discovered about your behavior</p>
      </div>

      {error && <div className="error-text section">{error}</div>}

      <div className="grid-4" style={{ marginBottom: 28 }}>
        <div className="stat-tile">
          <div className="stat-label">Patterns found</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{patterns.length}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Active episodes</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{activeEpisodes.length}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Weeks tracked</div>
          <div className="stat-value" style={{ color: 'var(--accent2)' }}>{weeks.length}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">High confidence</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {patterns.filter(p => p.confidence === 'high' && !(p.lastSeen && Date.now() - new Date(p.lastSeen) > 35 * 86400000)).length}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'patterns', label: `Patterns (${patterns.length})` },
          { key: 'episodes', label: `Episodes (${activeEpisodes.length} active)` },
          { key: 'weeks',    label: `Weekly history (${weeks.length})` }
        ].map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'patterns' && (
        <div>
          {patterns.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No patterns yet</div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                Keep logging daily — patterns appear after about 2 weeks of data (at least 7 days with both values logged).
              </div>
            </div>
          )}
          {patterns.map((p, i) => {
            const faded = p.lastSeen && Date.now() - new Date(p.lastSeen) > 35 * 86400000;
            return (
            <div key={i} className="pattern-card" style={{ marginBottom: 12, opacity: faded ? 0.55 : 1 }}>
              <div className="flex-between">
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {p.pattern}
                  {faded && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · not seen in the last 5 weeks</span>}
                </div>
                <span className={`confidence-badge confidence-${p.confidence}`}>{p.confidence}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
                <span>📅 {p.observedWeeks} weeks observed</span>
                <span>📊 r = {p.correlation?.toFixed(2)}</span>
                <span>🔗 {p.sourceA} ↔ {p.sourceB}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)' }}>
                First seen: {p.firstSeen ? new Date(p.firstSeen).toLocaleDateString() : '—'} &nbsp;·&nbsp;
                Last updated: {p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : '—'}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {tab === 'episodes' && (
        <div>
          {episodes.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No significant episodes detected</div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>Twin watches for burnout, low mood streaks, sleep deprivation, and more.</div>
            </div>
          )}

          {activeEpisodes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-title">Active episodes</div>
              {activeEpisodes.map(ep => (
                <div key={ep._id} className="episode-card" style={{ marginBottom: 12 }}>
                  <div className="flex-between">
                    <div style={{ fontWeight: 600 }}>{ep.label}</div>
                    <button className="btn btn-sm btn-secondary" onClick={() => resolveEpisode(ep._id)}>
                      Mark resolved
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <span>📅 {ep.startDate} → {ep.endDate || 'ongoing'}</span>
                    <span style={{ color: ep.severity === 'severe' ? 'var(--danger)' : ep.severity === 'moderate' ? 'var(--warning)' : 'var(--text2)' }}>
                      ⚠️ {ep.severity}
                    </span>
                  </div>
                  {ep.triggers?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {ep.triggers.map(t => <span key={t} className={`tag tag-low`}>{t.replace(/_/g, ' ')}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {resolvedEpisodes.length > 0 && (
            <div>
              <div className="section-title" style={{ color: 'var(--text2)' }}>Resolved</div>
              {resolvedEpisodes.map(ep => (
                <div key={ep._id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg3)', marginBottom: 8, opacity: 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500 }}>{ep.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{ep.startDate} → {ep.endDate}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'weeks' && (
        <div>
          {weeks.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>No weekly summaries yet — the first one is created early Monday, after your first full week.</div>
            </div>
          )}
          {weeks.map((w, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <div className="flex-between" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>{w.weekYear}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{w.startDate} → {w.endDate}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>{w.summary}</div>
              {w.averages && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                  {w.averages.mood        != null && <span>😊 Mood: <b>{w.averages.mood?.toFixed(1)}/9</b></span>}
                  {w.averages.sleepHours  != null && <span>😴 Sleep: <b>{w.averages.sleepHours?.toFixed(1)}h</b></span>}
                  {w.averages.steps       != null && <span>👟 Steps: <b>{Math.round(w.averages.steps)}</b></span>}
                  {w.averages.taskCompletionRate != null && <span>✅ Tasks: <b>{(w.averages.taskCompletionRate * 100).toFixed(0)}%</b></span>}
                  {w.averages.anxietyScore != null && <span>😰 Anxiety: <b>{w.averages.anxietyScore?.toFixed(1)}/21</b></span>}
                </div>
              )}
              {w.dominantSignals?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {w.dominantSignals.map(s => (
                    <span key={s} className={`tag ${s.includes('low') ? 'tag-low' : s.includes('high') && !s.includes('screen') ? 'tag-high' : 'tag-warn'}`}>
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
              {w.changes && Object.keys(w.changes).some(k => w.changes[k] != null) && (
                <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                  {Object.entries(w.changes).map(([k, v]) => v != null && (
                    <span key={k} style={{ color: v > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {k}: {v > 0 ? '+' : ''}{v}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
