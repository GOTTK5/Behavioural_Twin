import React, { useState, useEffect, useCallback } from 'react';
import api, { errorMessage } from '../services/api';

const GAD7_QUESTIONS = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen'
];
const SCALE_LABELS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

const HEALTH_FIELDS = [
  { key: 'sleepHours',      label: '😴 Sleep (hours)',       step: '0.5', max: 24,     placeholder: '7.5', float: true },
  { key: 'steps',           label: '👟 Steps',               step: '1',   max: 200000, placeholder: '8000' },
  { key: 'exerciseMinutes', label: '🏃 Exercise (minutes)',  step: '1',   max: 1440,   placeholder: '30' },
  { key: 'screenTimeHours', label: '📱 Screen time (hours)', step: '0.5', max: 24,     placeholder: '3', float: true }
];
const EMPTY_HEALTH = { sleepHours: '', steps: '', exerciseMinutes: '', screenTimeHours: '' };

export default function DailyLog() {
  const [today,     setToday]     = useState(null);
  const [date,      setDate]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [mood,      setMood]      = useState({ score: null, text: '' });
  const [journal,   setJournal]   = useState('');
  const [health,    setHealth]    = useState(EMPTY_HEALTH);
  const [savedHealth, setSavedHealth] = useState(EMPTY_HEALTH);
  const [healthSource, setHealthSource] = useState({});
  const [tasks,     setTasks]     = useState([]);
  const [newTask,   setNewTask]   = useState('');
  const [gad7,      setGad7]      = useState(Array(7).fill(null));
  const [showGad7,  setShowGad7]  = useState(false);
  const [psychDue,  setPsychDue]  = useState(false);
  const [supportMsg, setSupportMsg] = useState(false);
  const [saving,    setSaving]    = useState({});
  const [saved,     setSaved]     = useState({});
  const [errors,    setErrors]    = useState({});

  const load = useCallback(async (forDate) => {
    setLoading(true);
    try {
      const { data } = await api.get('/ingest/day', { params: forDate ? { date: forDate } : {} });
      setToday(data.today);
      setDate(data.date);
      setMood({ score: data.mood?.score ?? null, text: data.mood?.text || '' });
      setJournal(data.journal?.text || '');
      const h = {};
      for (const f of HEALTH_FIELDS) h[f.key] = data.health?.[f.key] ?? '';
      setHealth(h);
      setSavedHealth(h);
      setHealthSource(data.health?.source || {});
      setTasks(data.tasks || []);
      setPsychDue(data.psychTestDue);
      setErrors({});
    } catch (err) {
      setErrors({ page: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(key) {
    setSaved(s => ({ ...s, [key]: true }));
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000);
  }

  async function run(key, fn) {
    setSaving(s => ({ ...s, [key]: true }));
    setErrors(e => ({ ...e, [key]: null }));
    try {
      await fn();
      flash(key);
    } catch (err) {
      setErrors(e => ({ ...e, [key]: errorMessage(err) }));
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  }

  const saveMood = () => mood.score && run('mood', () => api.post('/ingest/mood', { date, score: mood.score, text: mood.text }));

  const saveJournal = () => journal.trim() && run('journal', () => api.post('/ingest/journal', { date, text: journal }));

  // Send only changed fields so Google Fit values aren't marked manual.
  const healthChanges = {};
  for (const f of HEALTH_FIELDS) {
    if (String(health[f.key]) !== String(savedHealth[f.key])) {
      const raw = health[f.key];
      healthChanges[f.key] = raw === '' ? null : (f.float ? parseFloat(raw) : parseInt(raw, 10));
    }
  }
  const healthDirty = Object.keys(healthChanges).length > 0;

  const saveHealth = () => run('health', async () => {
    const { data } = await api.post('/ingest/health', { date, ...healthChanges });
    setSavedHealth(health);
    setHealthSource(data.log?.source || {});
  });

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    try {
      const { data } = await api.post('/ingest/task', { date, title });
      setTasks(t => [...t, data.task]);
      setNewTask('');
      setErrors(e => ({ ...e, tasks: null }));
    } catch (err) {
      setErrors(e => ({ ...e, tasks: errorMessage(err) }));
    }
  }

  async function toggleTask(id) {
    try {
      const { data } = await api.patch(`/ingest/task/${id}/toggle`);
      setTasks(ts => ts.map(t => t._id === id ? data.task : t));
    } catch (err) {
      setErrors(e => ({ ...e, tasks: errorMessage(err) }));
    }
  }

  async function deleteTask(id) {
    try {
      await api.delete(`/ingest/task/${id}`);
      setTasks(ts => ts.filter(t => t._id !== id));
    } catch (err) {
      setErrors(e => ({ ...e, tasks: errorMessage(err) }));
    }
  }

  const submitGad7 = () => run('gad7', async () => {
    const { data } = await api.post('/ingest/psych-test', { date, answers: gad7 });
    setPsychDue(false);
    setShowGad7(false);
    setSupportMsg(Boolean(data.supportSuggested));
  });

  if (loading && !date) return <div className="loading">Loading your day...</div>;
  if (errors.page) return <div className="card"><div className="error-text">{errors.page}</div></div>;

  const doneCount = tasks.filter(t => t.done).length;
  const completion = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0;
  const isToday = date === today;

  return (
    <div>
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Daily Log</h1>
          <p>{isToday ? `Today, ${date}` : date} — log your day</p>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input type="date" value={date || ''} max={today || undefined} onChange={e => e.target.value && load(e.target.value)} />
        </div>
      </div>

      {supportMsg && (
        <div className="notice notice-danger section">
          Your answers suggest you're going through a lot right now. You don't have to handle it alone — consider talking to someone you trust
          or a professional. In India you can call Tele-MANAS at <b>14416</b> (free, 24/7). If you are in danger, call your local emergency number.
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div className="card">
            <div className="card-title">😊 Mood</div>
            <div className="mood-scale">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} className={`mood-btn ${mood.score === n ? 'selected' : ''}`} onClick={() => setMood(m => ({ ...m, score: n }))}>{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', margin: '6px 0 12px' }}>
              1 = terrible &nbsp;·&nbsp; 5 = neutral &nbsp;·&nbsp; 9 = great
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea value={mood.text} maxLength={1000} onChange={e => setMood(m => ({ ...m, text: e.target.value }))} placeholder="How are you feeling? (optional)" style={{ minHeight: 60 }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveMood} disabled={!mood.score || saving.mood}>
              {saved.mood ? '✓ Saved' : saving.mood ? 'Saving...' : 'Save mood'}
            </button>
            {errors.mood && <div className="error-text">{errors.mood}</div>}
          </div>

          <div className="card">
            <div className="card-title">📝 Journal</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea value={journal} maxLength={20000} onChange={e => setJournal(e.target.value)}
                placeholder="Write freely — what happened, how you felt, what you're thinking..." style={{ minHeight: 120 }} />
            </div>
            <div className="flex-between">
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{journal.split(/\s+/).filter(Boolean).length} words</span>
              <button className="btn btn-primary btn-sm" onClick={saveJournal} disabled={!journal.trim() || saving.journal}>
                {saved.journal ? '✓ Saved' : saving.journal ? 'Saving...' : 'Save journal'}
              </button>
            </div>
            {errors.journal && <div className="error-text">{errors.journal}</div>}
          </div>

          {psychDue && (
            <div className="card" style={{ borderColor: 'var(--warning)' }}>
              <div className="card-title" style={{ color: 'var(--warning)' }}>⚠️ Weekly anxiety check (GAD-7)</div>
              {!showGad7 ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                    Takes 2 minutes. Over the last 2 weeks, how often have you been bothered by the following?
                  </p>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowGad7(true)}>Take test</button>
                </div>
              ) : (
                <div>
                  {GAD7_QUESTIONS.map((q, i) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>{i + 1}. {q}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[0, 1, 2, 3].map(score => (
                          <button
                            key={score}
                            onClick={() => setGad7(a => { const n = [...a]; n[i] = score; return n; })}
                            className="btn btn-sm"
                            style={{
                              background: gad7[i] === score ? 'var(--accent)' : 'var(--bg3)',
                              color: gad7[i] === score ? '#fff' : 'var(--text2)',
                              border: '1px solid var(--border)',
                              fontSize: 11
                            }}
                          >{score} — {SCALE_LABELS[score]}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-primary btn-sm" onClick={submitGad7} disabled={saving.gad7 || gad7.includes(null)}>
                    {saving.gad7 ? 'Saving...' : 'Submit test'}
                  </button>
                  {errors.gad7 && <div className="error-text">{errors.gad7}</div>}
                </div>
              )}
            </div>
          )}
          {saved.gad7 && <div className="success-text">✓ Anxiety check saved</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div className="card">
            <div className="card-title">📊 Health & activity</div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              {HEALTH_FIELDS.map(f => (
                <div className="form-group" key={f.key}>
                  <label>
                    {f.label}
                    {healthSource[f.key === 'sleepHours' ? 'sleep' : f.key] === 'google_fit' && <span style={{ color: 'var(--accent2)' }}> · Google Fit</span>}
                  </label>
                  <input type="number" step={f.step} min="0" max={f.max} value={health[f.key]} placeholder={f.placeholder}
                    onChange={e => setHealth(h => ({ ...h, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveHealth} disabled={saving.health || !healthDirty}>
              {saved.health ? '✓ Saved' : saving.health ? 'Saving...' : 'Save health data'}
            </button>
            {errors.health && <div className="error-text">{errors.health}</div>}
          </div>

          <div className="card">
            <div className="card-title flex-between">
              <span>✅ Tasks</span>
              {tasks.length > 0 && (
                <span style={{ fontSize: 13, color: completion === 100 ? 'var(--success)' : 'var(--text2)' }}>
                  {doneCount}/{tasks.length} done ({completion}%)
                </span>
              )}
            </div>

            {tasks.length > 0 && (
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 14 }}>
                <div style={{ width: `${completion}%`, height: '100%', background: 'var(--success)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}

            {tasks.map(task => (
              <div key={task._id} className="task-item">
                <button className={`task-check ${task.done ? 'done' : ''}`} onClick={() => toggleTask(task._id)} aria-label="Toggle task">
                  {task.done ? '✓' : ''}
                </button>
                <span className={`task-text ${task.done ? 'done' : ''}`}>{task.title}</span>
                <button onClick={() => deleteTask(task._id)} aria-label="Delete task"
                  style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input value={newTask} maxLength={300} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Add a task..." style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={addTask} disabled={!newTask.trim()}>Add</button>
            </div>
            {errors.tasks && <div className="error-text">{errors.tasks}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
