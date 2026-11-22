// import React, { useState, useRef, useEffect } from 'react';
// import api from '../services/api';

// const SUGGESTIONS = [
//   'Why am I feeling low lately?',
//   'How has my sleep been affecting me?',
//   'What patterns have you noticed in my behavior?',
//   'What should I focus on this week?',
//   'How is my anxiety trending?',
// ];

// export default function Twin() {
//   const [messages, setMessages] = useState([
//     {
//       role: 'assistant',
//       content: "Hey. I'm Twin — I've been tracking your behavioral patterns and I'm here to help you understand yourself better.\n\nAsk me anything about your mood, sleep, productivity, or how you've been doing overall."
//     }
//   ]);
//   const [input,   setInput]   = useState('');
//   const [loading, setLoading] = useState(false);
//   const bottomRef = useRef(null);

//   useEffect(() => {
//     bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages]);

//   async function send(text) {
//     const msg = text || input.trim();
//     if (!msg || loading) return;
//     setInput('');

//     setMessages(m => [...m, { role: 'user', content: msg }]);
//     setLoading(true);

//     try {
//       const { data } = await api.post('/chat', { message: msg });
//       setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
//     } catch (err) {
//       setMessages(m => [...m, {
//         role: 'assistant',
//         content: 'Something went wrong — please try again.'
//       }]);
//     } finally {
//       setLoading(false);
//     }
//   }

//   async function clearHistory() {
//     await api.delete('/chat/history');
//     setMessages([{
//       role: 'assistant',
//       content: "Conversation cleared. What's on your mind?"
//     }]);
//   }

//   return (
//     <div>
//       <div className="flex-between" style={{ marginBottom: 20 }}>
//         <div className="page-header" style={{ marginBottom: 0 }}>
//           <h1>Twin</h1>
//           <p>Your behavioral AI — powered by your personal data</p>
//         </div>
//         <button className="btn btn-secondary btn-sm" onClick={clearHistory}>Clear chat</button>
//       </div>

//       {/* Suggestion chips */}
//       {messages.length === 1 && (
//         <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
//           {SUGGESTIONS.map((s, i) => (
//             <button
//               key={i}
//               className="btn btn-secondary btn-sm"
//               style={{ fontSize: 12 }}
//               onClick={() => send(s)}
//             >{s}</button>
//           ))}
//         </div>
//       )}

//       {/* Chat */}
//       <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
//         <div className="chat-messages">
//           {messages.map((m, i) => (
//             <div key={i} className={`msg msg-${m.role}`}>
//               {m.content.split('\n').map((line, j) => (
//                 <span key={j}>{line}{j < m.content.split('\n').length - 1 && <br />}</span>
//               ))}
//             </div>
//           ))}
//           {loading && (
//             <div className="msg msg-typing">
//               <span className="typing-dot" />
//               <span className="typing-dot" />
//               <span className="typing-dot" />
//             </div>
//           )}
//           <div ref={bottomRef} />
//         </div>

//         <div className="chat-input-row">
//           <input
//             value={input}
//             onChange={e => setInput(e.target.value)}
//             onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
//             placeholder="Ask Twin anything about your patterns, mood, productivity..."
//             disabled={loading}
//           />
//           <button
//             className="btn btn-primary"
//             onClick={() => send()}
//             disabled={loading || !input.trim()}
//           >Send</button>
//         </div>
//       </div>
//     </div>
//   );
// }




import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';

const SUGGESTIONS = [
  'Why am I feeling low lately?',
  'How has my sleep been affecting me?',
  'What patterns have you noticed in my behavior?',
  'What should I focus on this week?',
  'How is my anxiety trending?',
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hey. I'm Twin — I've been tracking your behavioral patterns and I'm here to help you understand yourself better.\n\nAsk me anything about your mood, sleep, productivity, or how you've been doing overall."
};

export default function Twin() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);

  // Load persisted conversation history on mount, so switching pages
  // and coming back doesn't lose the conversation.
  useEffect(() => {
    api.get('/chat/history').then(({ data }) => {
      if (data.messages?.length > 0) {
        setMessages([
          WELCOME_MESSAGE,
          ...data.messages.map(m => ({ role: m.role, content: m.content }))
        ]);
      }
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    setMessages(m => [...m, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const { data } = await api.post('/chat', { message: msg });
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: 'Something went wrong — please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    await api.delete('/chat/history');
    setMessages([WELCOME_MESSAGE]);
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Twin</h1>
          <p>Your behavioral AI — powered by your personal data</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearHistory}>Clear chat</button>
      </div>

      {historyLoaded && messages.length === 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => send(s)}
            >{s}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
        <div className="chat-messages">
          {!historyLoaded && (
            <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Loading conversation...
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.content.split('\n').map((line, j) => (
                <span key={j}>{line}{j < m.content.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          ))}
          {loading && (
            <div className="msg msg-typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-row">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask Twin anything about your patterns, mood, productivity..."
            disabled={loading}
          />
          <button
            className="btn btn-primary"
            onClick={() => send()}
            disabled={loading || !input.trim()}
          >Send</button>
        </div>
      </div>
    </div>
  );
}
