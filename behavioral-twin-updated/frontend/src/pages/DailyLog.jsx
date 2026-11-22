import React, { useState, useEffect } from 'react';
import api from '../services/api';

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

export default function DailyLog() {
  const today = new Date().toISOString().split('T')[0];

  const [mood,       setMood]       = useState({ score: null, text: '' });
  const [journal,    setJournal]    = useState('');
  const [health,     setHealth]     = useState({ sleepHours: '', steps: '', exerciseMinutes: '', screenTimeHours: '' });
  const [tasks,      setTasks]      = useState([]);
  const [newTask,    setNewTask]    = useState('');
  const [gad7,       setGad7]       = useState(Array(7).fill(null));
  const [showGad7,   setShowGad7]   = useState(false);
  const [psychDue,   setPsychDue]   = useState(false);
  const [saving,     setSaving]     = useState({});
  const [saved,      setSaved]      = useState({});

  useEffect(() => {
    loadTodayData();
  }, []);

  async function loadTodayData() {
    try {
      const [moodRes, journalRes, healthRes, tasksRes, todayRes] = await Promise.all([
        api.get(`/ingest/mood?days=1`),
        api.get(`/ingest/journal?days=1`),
        api.get(`/ingest/health?days=1`),
        api.get(`/ingest/tasks?date=${today}`),
        api.get('/dashboard/today')
      ]);

      const todayMood    = moodRes.data.moods?.find(m => m.date === today);
      const todayJournal = journalRes.data.journals?.find(j => j.date === today);
      const todayHealth  = healthRes.data.logs?.find(h => h.date === today);

      if (todayMood)    { setMood({ score: todayMood.score, text: todayMood.text || '' }); }
      if (todayJournal) { setJournal(todayJournal.text); }
      if (todayHealth)  {
        setHealth({
          sleepHours:      todayHealth.sleepHours ?? '',
          steps:           todayHealth.steps ?? '',
          exerciseMinutes: todayHealth.exerciseMinutes ?? '',
          screenTimeHours: todayHealth.screenTimeHours ?? ''
        });
      }
      setTasks(tasksRes.data.tasks || []);
      setPsychDue(todayRes.data.psychTestDue);
    } catch (err) {
      console.error(err);
    }
  }

  async function saveMood() {
    if (!mood.score) return;
    setSaving(s => ({ ...s, mood: true }));
    try {
      await api.post('/ingest/mood', { date: today, score: mood.score, text: mood.text });
      flash('mood');
    } finally { setSaving(s => ({ ...s, mood: false })); }
  }

  async function saveJournal() {
    if (!journal.trim()) return;
    setSaving(s => ({ ...s, journal: true }));
    try {
      await api.post('/ingest/journal', { date: today, text: journal });
      flash('journal');
    } finally { setSaving(s => ({ ...s, journal: false })); }
  }

  async function saveHealth() {
    setSaving(s => ({ ...s, health: true }));
    try {
      await api.post('/ingest/health', {
        date: today,
        sleepHours:      health.sleepHours      ? parseFloat(health.sleepHours)      : null,
        steps:           health.steps           ? parseInt(health.steps)             : null,
        exerciseMinutes: health.exerciseMinutes ? parseInt(health.exerciseMinutes)   : null,
        screenTimeHours: health.screenTimeHours ? parseFloat(health.screenTimeHours) : null
      });
      flash('health');
    } finally { setSaving(s => ({ ...s, health: false })); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    const { data } = await api.post('/ingest/task', { date: today, title: newTask.trim() });
    setTasks(t => [...t, data.task]);
    setNewTask('');
  }

  async function toggleTask(id) {
    const { data } = await api.patch(`/ingest/task/${id}/toggle`);
    setTasks(ts => ts.map(t => t._id === id ? data.task : t));
  }

  async function deleteTask(id) {
    await api.delete(`/ingest/task/${id}`);
    setTasks(ts => ts.filter(t => t._id !== id));
  }

  async function submitGad7() {
    if (gad7.includes(null)) return alert('Please answer all 7 questions');
    setSaving(s => ({ ...s, gad7: true }));
    try {
      await api.post('/ingest/psych-test', { date: today, answers: gad7 });
      setPsychDue(false);
      setShowGad7(false);
      flash('gad7');
    } finally { setSaving(s => ({ ...s, gad7: false })); }
  }

  function flash(key) {
    setSaved(s => ({ ...s, [key]: true }));
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000);
  }

  const doneCount = tasks.filter(t => t.done).length;
  const completion = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Daily Log</h1>
        <p>{today} — log your day</p>
      </div>

      <div className="grid-2" style={{ gap: 20 }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Mood */}
          <div className="card">
            <div className="card-title">😊 Mood</div>
            <div className="mood-scale">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button
                  key={n}
                  className={`mood-btn ${mood.score === n ? 'selected' : ''}`}
                  onClick={() => setMood(m => ({ ...m, score: n }))}
                >{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', margin: '6px 0 12px' }}>
              1 = terrible &nbsp;·&nbsp; 5 = neutral &nbsp;·&nbsp; 9 = great
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea
                value={mood.text}
                onChange={e => setMood(m => ({ ...m, text: e.target.value }))}
                placeholder="How are you feeling? (optional)"
                style={{ minHeight: 60 }}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveMood} disabled={!mood.score || saving.mood}>
              {saved.mood ? '✓ Saved' : saving.mood ? 'Saving...' : 'Save mood'}
            </button>
          </div>

          {/* Journal */}
          <div className="card">
            <div className="card-title">📝 Journal</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea
                value={journal}
                onChange={e => setJournal(e.target.value)}
                placeholder="Write freely — what happened today, how you felt, what you're thinking..."
                style={{ minHeight: 120 }}
              />
            </div>
            <div className="flex-between">
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{journal.split(' ').filter(Boolean).length} words</span>
              <button className="btn btn-primary btn-sm" onClick={saveJournal} disabled={!journal.trim() || saving.journal}>
                {saved.journal ? '✓ Saved' : saving.journal ? 'Saving...' : 'Save journal'}
              </button>
            </div>
          </div>

          {/* GAD-7 Psychology Test */}
          {psychDue && (
            <div className="card" style={{ borderColor: 'var(--warning)', borderWidth: 1 }}>
              <div className="card-title" style={{ color: 'var(--warning)' }}>⚠️ Weekly anxiety check (GAD-7)</div>
              {!showGad7 ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                    Takes 2 minutes. Helps Twin understand your anxiety patterns over time.
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
                    {saved.gad7 ? '✓ Submitted' : saving.gad7 ? 'Saving...' : 'Submit test'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Health */}
          <div className="card">
            <div className="card-title">📊 Health & activity</div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>😴 Sleep (hours)</label>
                <input type="number" step="0.5" min="0" max="24"
                  value={health.sleepHours}
                  onChange={e => setHealth(h => ({ ...h, sleepHours: e.target.value }))}
                  placeholder="7.5"
                />
              </div>
              <div className="form-group">
                <label>👟 Steps</label>
                <input type="number" min="0"
                  value={health.steps}
                  onChange={e => setHealth(h => ({ ...h, steps: e.target.value }))}
                  placeholder="8000"
                />
              </div>
              <div className="form-group">
                <label>🏃 Exercise (minutes)</label>
                <input type="number" min="0"
                  value={health.exerciseMinutes}
                  onChange={e => setHealth(h => ({ ...h, exerciseMinutes: e.target.value }))}
                  placeholder="30"
                />
              </div>
              <div className="form-group">
                <label>📱 Screen time (hours)</label>
                <input type="number" step="0.5" min="0"
                  value={health.screenTimeHours}
                  onChange={e => setHealth(h => ({ ...h, screenTimeHours: e.target.value }))}
                  placeholder="3"
                />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveHealth} disabled={saving.health}>
              {saved.health ? '✓ Saved' : saving.health ? 'Saving...' : 'Save health data'}
            </button>
          </div>

          {/* Tasks */}
          <div className="card">
            <div className="card-title flex-between">
              <span>✅ Tasks</span>
              {tasks.length > 0 && (
                <span style={{ fontSize: 13, color: completion === 100 ? 'var(--success)' : 'var(--text2)' }}>
                  {doneCount}/{tasks.length} done ({completion}%)
                </span>
              )}
            </div>

            {/* Progress bar */}
            {tasks.length > 0 && (
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 14 }}>
                <div style={{ width: `${completion}%`, height: '100%', background: 'var(--success)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}

            {tasks.map(task => (
              <div key={task._id} className="task-item">
                <button
                  className={`task-check ${task.done ? 'done' : ''}`}
                  onClick={() => toggleTask(task._id)}
                >{task.done ? '✓' : ''}</button>
                <span className={`task-text ${task.done ? 'done' : ''}`}>{task.title}</span>
                <button
                  onClick={() => deleteTask(task._id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16, padding: 4 }}
                >×</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Add a task..."
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary btn-sm" onClick={addTask} disabled={!newTask.trim()}>Add</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
