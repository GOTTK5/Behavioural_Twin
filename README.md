# Twin — Personal Behavioral AI

> "The memory system is the brain. The LLM is the interpreter."

Twin is a web app where you log your day — mood, journal, sleep, steps, exercise, screen time, tasks and a weekly anxiety check (GAD-7). It turns those logs into daily and weekly summaries, finds patterns in **your own** data (for example *"less sleep goes with lower mood"*), flags difficult stretches such as low-mood streaks or possible burnout, and lets you chat with **Twin**, an AI that answers using your real history.

---

## How it works

```
You log your day (Daily Log page)
        │
        ▼
MongoDB — raw entries ──► Daily summary (rebuilt instantly on every change)
                                │
                                ▼
          Weekly analysis (automatically after each Sunday, per user timezone)
            ├── Weekly summary + week-over-week changes
            ├── Correlation engine (Pearson, rolling 28 days) → Behavioral patterns
            ├── Episode detector (consecutive-day streaks)   → Episodes
            └── Semantic memory (Gemini embeddings stored in MongoDB)
                                │
                                ▼
          Context engine: last 7 days + patterns + episodes + memories relevant to the question
                                │
                                ▼
          Google Gemini (free tier) ──► Twin chat
```

| Concept | What it means |
|---|---|
| **Daily summary** | One record per day with all metrics and *signals* (`low_mood`, `low_sleep`, `high_screen_time`, …). |
| **Pattern** | A correlation between two metrics over the last 28 days (needs ≥ 7 days with both values, \|r\| ≥ 0.4). |
| **Episode** | A run of consecutive days with the same warning signal — e.g. 4+ days of low mood, 3+ nights under 5h sleep. |
| **Memory** | Weekly summaries, patterns and episodes, embedded so Twin can find the ones relevant to your question. |

Everything is stored in **MongoDB only** — no separate vector database to host.

---

## Quick start (local)

**Requirements:** Node.js 18+, MongoDB (local install or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster), and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
# 1. Install
npm run install:all

# 2. Configure
cp backend/.env.example backend/.env
#    then edit backend/.env: MONGO_URI, JWT_SECRET, GEMINI_API_KEY

# 3. (optional) Demo data: 35 days for test@twin.ai / password123
npm run seed

# 4. Run — two terminals
npm run dev:backend     # http://localhost:5000
npm run dev:frontend    # http://localhost:3000
```

On Windows you can double-click `start-twin.bat` instead of step 4 (it also starts `mongod`).

Run the tests with `npm test`.

---

## Deploy

The backend serves the built React app, so Twin deploys as **one web service + one MongoDB database**.

### Render (free)
1. Create a free MongoDB Atlas cluster and copy its connection string. In Atlas → Network Access, allow `0.0.0.0/0` (or Render's IPs).
2. On [Render](https://render.com): **New → Blueprint**, pick this repo (it reads `render.yaml`).
3. Set `MONGO_URI` and `GEMINI_API_KEY` in the service's environment. `JWT_SECRET` is generated for you.
4. Open the URL Render gives you and create an account.

> Render's free tier sleeps after ~15 minutes without traffic. The weekly analysis catches up automatically the next time the server wakes up, and you can always run it from **Profile → Run weekly analysis now**.

### Docker (any host)
```bash
docker build -t twin .
docker run -p 5000:5000 --env-file backend/.env -e NODE_ENV=production twin
```

### Environment variables
See [`backend/.env.example`](backend/.env.example). Required: `MONGO_URI`, `JWT_SECRET` (32+ characters in production). Strongly recommended: `GEMINI_API_KEY` (without it, chat and semantic memory are off; logging and dashboards still work).

---

## Google Fit (optional)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Fitness API**.
2. Create OAuth credentials (Web application) with the redirect URI `https://<your-backend>/api/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `BACKEND_URL` (or `GOOGLE_REDIRECT_URI`).
4. In the app: **Profile → Connect Google Fit**.

Steps and sleep sync every night. Values you enter by hand are never overwritten. **Note:** Google is winding down the Fitness REST API — check its current status before relying on it.

---

## API

All endpoints except register/login need `Authorization: Bearer <token>`. Dates are `YYYY-MM-DD` in the user's timezone and default to today.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | Create account / sign in |
| GET · PUT | `/api/auth/me` · `/api/auth/profile` | Current user / update profile & timezone |
| GET | `/api/auth/export` | Download all your data (JSON) |
| DELETE | `/api/auth/account` | Delete account and all data (body: `password`) |
| GET | `/api/ingest/day?date=` | Everything logged for one day |
| POST | `/api/ingest/mood` · `journal` · `task` · `health` · `psych-test` | Log entries |
| PATCH · DELETE | `/api/ingest/task/:id/toggle` · `/api/ingest/task/:id` | Tick / remove a task |
| GET | `/api/dashboard/overview?days=30` · `today` · `weekly` | Dashboard data |
| POST | `/api/dashboard/trigger-batch` | Run the weekly analysis now |
| GET · PATCH | `/api/insights/patterns` · `episodes` · `weekly-history` · `episodes/:id/resolve` | Insights |
| GET · POST · DELETE | `/api/chat/history` · `/api/chat` · `/api/chat/history` | Twin chat |
| GET · POST | `/api/google/status` · `auth-url` · `sync` · `disconnect` | Google Fit |
| GET | `/api/health` | Health check (used by hosts) |

---

## Project layout

```
backend/
  index.js                     entry point (config check, DB, cron, server)
  src/app.js                   Express app, security middleware, error handler, serves frontend build
  src/config/                  env validation, MongoDB connection
  src/routes/                  auth, ingest, dashboard, insights, chat, google
  src/modules/processing/      dailySummary, weeklySummary, correlation, episodeDetector, weeklyBatch
  src/modules/conversation/    contextEngine (RAG), llmCall (Twin persona)
  src/modules/ai/gemini.js     Gemini chat + embeddings
  src/modules/memory/          vector store on MongoDB
  src/jobs/scheduler.js        hourly job: nightly finalize + weekly analysis per user timezone
  scripts/                     seed.js, runBatch.js
  test/                        unit tests (node --test)
frontend/                      React app (Dashboard, Daily Log, Twin, Insights, Profile)
```

---

## Privacy & safety

- This app stores sensitive mental-health data. Use HTTPS in production, keep `JWT_SECRET` secret, and restrict database access.
- Users can download or permanently delete all their data from the Profile page.
- Chat text and summaries are sent to Google's Gemini API. **On the free tier Google may use this data to improve its products** — tell your users, or use a paid tier for real deployments.
- Twin is not a therapist. The chat and the GAD-7 result point users to professional help (India: Tele-MANAS 14416) when answers suggest serious distress.

---

## Roadmap

- **Next:** password reset by email, reminders to log, PDF weekly reports, journal sentiment analysis.
- **Later:** behavioral predictions, mobile app (Health Connect / HealthKit instead of Google Fit), richer personalization.
