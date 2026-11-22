import React, { useState, useRef, useEffect } from 'react';
import api, { errorMessage } from '../services/api';

const SUGGESTIONS = [
  'Why am I feeling low lately?',
  'How has my sleep been affecting me?',
  'What patterns have you noticed in my behavior?',
  'What should I focus on this week?',
  'How is my anxiety trending?',
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hey. I'm Twin — I learn from what you log and help you understand your own patterns.\n\nAsk me anything about your mood, sleep, productivity, or how you've been doing overall."
};

function MessageText({ text }) {
  const lines = text.split('\n');
  return lines.map((line, j) => (
    <span key={j}>{line}{j < lines.length - 1 && <br />}</span>
  ));
}

export default function Twin() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/chat/history').then(({ data }) => {
      if (data.messages?.length > 0) {
        setMessages([WELCOME_MESSAGE, ...data.messages.map(m => ({ role: m.role, content: m.content }))]);
      }
    }).catch(() => {}).finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const { data } = await api.post('/chat', { message: msg });
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${errorMessage(err)}`, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm('Clear the whole conversation?')) return;
    try {
      await api.delete('/chat/history');
      setMessages([WELCOME_MESSAGE]);
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20, gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Twin</h1>
          <p>Your behavioral AI — powered by your personal data</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearHistory}>Clear chat</button>
      </div>

      {historyLoaded && messages.length === 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="btn btn-secondary btn-sm" style={{ fontSize: 12 }} onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 360 }}>
        <div className="chat-messages">
          {!historyLoaded && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Loading conversation...</div>}
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`} style={m.error ? { color: 'var(--danger)' } : undefined}>
              <MessageText text={m.content} />
            </div>
          ))}
          {loading && (
            <div className="msg msg-typing">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input-row" onSubmit={e => { e.preventDefault(); send(); }}>
          <input
            value={input}
            maxLength={2000}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Twin anything about your patterns, mood, productivity..."
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>Send</button>
        </form>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Twin is an AI, not a therapist or doctor. If you are in crisis, contact a local helpline (India: Tele-MANAS 14416).
      </div>
    </div>
  );
}
