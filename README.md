# Voyagent Frontend

Independent **Vite + React + TypeScript** SPA for the Voyagent travel planning backend. This directory is its **own Git repository** (not tracked by the parent `voyagent-backend` repo).

## Prerequisites

- Node.js 20+ (or current LTS)
- Backend running: `uvicorn api.main:app` (see parent repo `docs/API.md`)

## Setup

```bash
cd voyagent-frontend
cp .env.example .env.local
# edit VITE_API_BASE_URL if your API is not on http://127.0.0.1:8000
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

**CORS:** ensure the backend sets `CORS_ORIGINS` to include your dev origin, e.g. `http://localhost:5173`.

## MVP behaviour

- Loads `GET /api/v1/health`, `GET /api/v1/version`, `GET /api/v1/agents`, `GET /api/v1/workflow/steps`
- Submits natural language to `POST /api/v1/plan` and displays errors, warnings, and JSON sections for each pipeline output

## Production build

```bash
npm run build
npm run preview
```

`VITE_API_BASE_URL` must be set for `npm run build` (see `src/lib/api.ts`).

## Detach from parent folder (optional)

This repo can live anywhere. To move it next to the backend:

```bash
# from parent of voyagent-backend
mv voyagent-backend/voyagent-frontend ./voyagent-frontend
```

Then remove `voyagent-frontend/` from `voyagent-backend/.gitignore` only if you no longer nest it inside the backend tree.

## Initialise Git (first time in this folder)

```bash
cd voyagent-frontend
git init
git add .
git commit -m "chore: initial Voyagent frontend MVP"
```
