# Twin — Personal Behavioral AI System

> "The memory system is the brain. The LLM is the interpreter."

A web-based behavioral AI that tracks your mood, sleep, tasks, exercise, screen time, and psychology — discovers patterns, detects significant life episodes, and lets you talk to your own behavioral data through an AI chat interface called Twin.

---

## Architecture

```
Daily Inputs (8 sources)
        ↓
MongoDB (raw storage)
        ↓
Daily Summary (auto at 11:55 PM)
        ↓
Weekly Batch (every Sunday)
  ├── Pearson correlation engine → Behavioral Knowledge Table
  ├── Episode detector (rule-based)
  └── ChromaDB embeddings (weekly summaries + patterns + episodes)
        ↓
Behavioral Context Engine (RAG)
        ↓
Claude API (LLM call)
        ↓
Twin Chat
```

---

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- ChromaDB running locally
- Anthropic API key
- (Optional) Google Cloud project for Google Fit OAuth

---

## Setup

### 1. Start ChromaDB locally

```bash
pip install chromadb
chroma run --host localhost --port 8000
```

### 2. Backend setup

```bash
cd behavioral-twin/backend
npm install
cp .env.example .env
# Fill in your .env values (MONGO_URI, ANTHROPIC_API_KEY, JWT_SECRET)
```

### 3. Frontend setup

```bash
cd behavioral-twin/frontend
npm install
```

---

## Running the project

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
# Runs on http://localhost:3000
```

---

## Seed synthetic data (for testing)

```bash
cd backend
npm run seed
```

This creates a test user with 30 days of realistic synthetic data, runs the weekly batch job, and builds the behavioral knowledge table.

**Test credentials:**
- Email: `test@twin.ai`
- Password: `password123`

---

## Google Fit setup (optional — for auto sleep/steps sync)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Fitness API**
3. OAuth 2.0 credentials → Web application
4. Redirect URI: `http://localhost:5000/api/auth/google/callback`
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to `.env`
6. In the app: Profile → Connect Google Fit

---

## API endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with name, email, password, age, weight |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Get current user |
| PUT  | `/api/auth/profile` | Update profile |

### Ingest (all require Bearer token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest/mood` | Log mood score (1-9) + text |
| POST | `/api/ingest/journal` | Log journal entry |
| POST | `/api/ingest/task` | Add a task |
| PATCH | `/api/ingest/task/:id/toggle` | Toggle task done/undone |
| POST | `/api/ingest/health` | Log sleep, steps, exercise, screen time |
| GET  | `/api/ingest/psych-test/questions` | Get GAD-7 questions |
| POST | `/api/ingest/psych-test` | Submit weekly GAD-7 test |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message to Twin (RAG + LLM) |
| DELETE | `/api/chat/history` | Clear conversation history |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/overview` | All trend data for charts |
| GET | `/api/dashboard/today` | Today's log completion status |
| GET | `/api/dashboard/weekly` | Last 12 weekly summaries |
| POST | `/api/dashboard/trigger-batch` | Manually run weekly batch job |

### Insights
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/insights/patterns` | All behavioral knowledge patterns |
| GET | `/api/insights/episodes` | All detected episodes |
| PATCH | `/api/insights/episodes/:id/resolve` | Mark episode resolved |
| GET | `/api/insights/weekly-history` | Weekly summaries list |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | 7 trend charts, patterns, episodes |
| Daily Log | `/log` | Mood, journal, tasks, health, GAD-7 |
| Twin | `/twin` | AI chat powered by behavioral context |
| Insights | `/insights` | Patterns, episodes, weekly history |
| Profile | `/profile` | User settings, Google Fit, developer tools |

---

## V1 → V2 → V3 roadmap

**V1 (current):** Manual inputs, weekly batch, RAG chat, dashboard

**V2:** Auto Google Fit sync (already scaffolded), notification system, PDF weekly reports, richer correlation analysis

**V3:** Multi-agent reasoning, behavioral prediction, mobile app, advanced personalization

---

## Key files to understand

```
backend/src/modules/processing/correlation.js    ← Pearson correlation engine
backend/src/modules/processing/episodeDetector.js ← Rule-based episode detection
backend/src/modules/processing/weeklySummary.js   ← Weekly batch + ChromaDB embedding
backend/src/modules/conversation/contextEngine.js ← RAG retrieval + context building
backend/src/modules/conversation/llmCall.js        ← Claude API call with Twin persona
backend/src/jobs/scheduler.js                      ← Cron jobs (daily + weekly)
```
