# Sentinel Exam (PB.AI)

> **Secure assessments. Explainable integrity. Fair evaluation.**

### Team Collaboration Guidelines
1. Everyone shall make their own branches (`git checkout -b <branch-name>`).
2. No one will push to `main` without consultation and PR review.
3. Keep the code neat, readable, and typed.
4. Pull first and then push (`git pull origin <branch>` before pushing).

---

## 1. Project Overview & Milestone Scope

This repository contains the **Foundation Milestone** for Sentinel Exam. The objective is an installable, runnable, and verifiable desktop application and backend architecture that future proctoring and assessment features can build upon without structural refactoring.

### Included in this Foundation Milestone:
- **Electron Desktop Shell**: Chromium sandboxed process with context isolation, strict CSP, and window focus telemetry.
- **Renderer UI**: React 18 + TypeScript + Vite with an editorial, warm-neutral design system adhering to WCAG AA accessibility standards.
- **FastAPI Assessment Service**: Python backend with SQLAlchemy ORM, Pydantic validation, and SQLite storage.
- **Deterministic Seeding**: Idempotent database initialization and seeding of a 5-question technical assessment.
- **Zero Answer Leakage**: Database models preserve correct answer keys internally while public API schemas rigorously omit them.
- **Endpoints**: `GET /health` and `GET /api/exams`.
- **Automated Test Suite**: Unit, integration, idempotency, and recursive answer leakage tests.

---

## 2. Architecture & Monorepo Structure

```
vistarx/
├── apps/
│   └── desktop/                   # Electron + React + TypeScript Desktop Shell
│       ├── src/
│       │   ├── main/              # Electron Main Process (Lifecycle, Security, IPC)
│       │   │   ├── index.ts
│       │   │   └── security.ts
│       │   ├── preload/           # Sandboxed Preload Script (ContextBridge)
│       │   │   └── index.ts
│       │   └── renderer/          # Sandboxed React Application
│       │       ├── src/
│       │       │   ├── api/       # Typed HTTP API Client
│       │       │   ├── components/# Editorial UI Components
│       │       │   ├── styles/    # Design Tokens & Warm-Neutral CSS
│       │       │   ├── App.tsx
│       │       │   └── main.tsx
│       │       ├── index.html     # Restrictive CSP Configuration
│       │       └── vite.config.ts
│       ├── package.json
│       ├── tsconfig.json          # Renderer TS config
│       ├── tsconfig.main.json     # Electron Main TS config
│       └── tsconfig.preload.json  # Electron Preload TS config
├── services/
│   └── api/                       # FastAPI Assessment Backend
│       ├── app/
│       │   ├── config.py          # Deterministic DB path & service settings
│       │   ├── database.py        # SQLAlchemy engine & session dependency
│       │   ├── main.py            # FastAPI app & CORS configuration
│       │   ├── models.py          # ORM Models (Exams, Questions, Choices)
│       │   ├── schemas.py         # Public Pydantic response models
│       │   ├── seed.py            # Idempotent DB seeder
│       │   └── routes/
│       │       ├── health.py      # GET /health
│       │       └── exams.py       # GET /api/exams
│       ├── tests/                 # Backend automated test suite
│       │   ├── conftest.py
│       │   ├── test_health.py
│       │   ├── test_exams.py
│       │   ├── test_seeding.py
│       │   └── test_security.py   # Recursive answer leakage tests
│       ├── pyproject.toml
│       └── requirements.txt
├── docs/
│   ├── api-contract.md            # Detailed REST & WebSocket API specification
│   └── architecture.md            # System process boundaries & security model
├── .gitignore
├── .env.example
├── package.json                   # Root monorepo workspace scripts
└── README.md
```

---

## 3. Prerequisites

- **Node.js**: `v20.x` or higher (verified on `v24.14.1`)
- **npm**: `v10.x` or higher (verified on `v11.11.0`)
- **Python**: `3.11.x` or higher (verified on `3.11.9`)
- **Operating System**: Windows, macOS, or Linux

---

## 4. Setup & Running Instructions

### Step 1: Install Dependencies

From the project root:

```bash
# Install desktop client dependencies
npm install

# Install backend dependencies (if running in a clean environment)
pip install -r services/api/requirements.txt
```

### Step 2: Initialize & Seed Database

Seed the SQLite database with the demo examination (5 technical MCQs):

```bash
npm run backend:seed
```
*Direct Python alternative:*
```bash
python services/api/app/seed.py
```

### Step 3: Start the Backend Service

Start the FastAPI assessment server on `http://127.0.0.1:8000`:

```bash
npm run backend:run
```
*Direct Python alternative:*
```bash
python -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000 --reload
```

### Step 4: Build & Launch the Desktop Application

In a separate terminal:

```bash
# Build renderer, main, and preload bundles
npm run desktop:build

# Launch the desktop application
npx electron apps/desktop
```

*Development hot-reload mode:*
```bash
# Run Vite renderer dev server
npm run desktop:dev
```

---

## 5. Verification & Test Commands

### Run Backend Automated Tests
Runs pytest covering health checks, exam schemas, idempotent seeding, and recursive answer leakage inspection:

```bash
npm run backend:test
```
*Direct command:*
```bash
python -m pytest services/api/tests -v
```

### Run TypeScript & Production Build Checks
```bash
# Strict TypeScript check across renderer, main, and preload
npm run desktop:check

# Production build test
npm run desktop:build
```

---

## 6. API Endpoint Examples

### 1. Health Status (`GET /health`)
```bash
curl -s http://127.0.0.1:8000/health
```
```json
{
  "status": "ok",
  "service": "sentinel-exam-api",
  "version": "0.1.0",
  "database": "connected"
}
```

### 2. Available Exams (`GET /api/exams`)
```bash
curl -s http://127.0.0.1:8000/api/exams
```
```json
[
  {
    "id": "e0000000-0000-4000-8000-000000000001",
    "title": "Systems Engineering & Secure Computing Assessment",
    "description": "Foundational evaluation of desktop process isolation, network security boundaries, and defensive software architecture.",
    "duration_minutes": 30,
    "total_questions": 5,
    "questions": [
      {
        "id": "q0000000-0000-4000-8000-000000000001",
        "question_number": 1,
        "text": "In an Electron desktop application architecture, which configuration is mandatory to guarantee that Node.js runtime APIs are completely isolated from the web renderer?",
        "choices": [
          {
            "id": "c0000000-0000-4000-8000-000000000001",
            "choice_letter": "A",
            "text": "Set contextIsolation: true and nodeIntegration: false in WebPreferences"
          },
          {
            "id": "c0000000-0000-4000-8000-000000000002",
            "choice_letter": "B",
            "text": "Disable webSecurity and enable allowRunningInsecureContent"
          },
          {
            "id": "c0000000-0000-4000-8000-000000000003",
            "choice_letter": "C",
            "text": "Enable the remote module and execute scripts in a Web Worker"
          },
          {
            "id": "c0000000-0000-4000-8000-000000000004",
            "choice_letter": "D",
            "text": "Set sandbox: false and configure nodeIntegrationInSubFrames: true"
          }
        ]
      }
    ]
  }
]
```

---

## 7. Security Decisions

1. **Process Isolation**: The Electron main process explicitly enforces `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The renderer operates in a standard Chromium sandbox with zero access to Node.js built-ins or the host filesystem.
2. **Minimal Typed IPC Bridge**: The preload script exposes only `window.sentinelBridge`, restricting renderer communication to platform metadata and focus telemetry. No arbitrary IPC send or invoke capabilities are exposed.
3. **Restrictive Content Security Policy**: Embedded in both HTTP response headers and `index.html`, prohibiting inline `eval()`, object plugins, and remote untrusted script origins.
4. **Navigation Locks**: `will-navigate` blocks navigation away from the local application origin, and `setWindowOpenHandler` denies all unauthorized popup window requests.
5. **Private Answer Keys**: Correct choice IDs reside exclusively in the SQLite database (`Question.correct_choice_id`) and are strictly excluded from public Pydantic schemas. Verified by automated tests that recursively scan responses.

---

## 8. Implemented vs. Planned Features

| Feature | Foundation Milestone | Planned Future Milestones |
|---|---|---|
| **Desktop Shell** | Implemented (Electron + React 18 + Vite) | Assessment fullscreen lock mode |
| **Process Security** | Implemented (`contextIsolation`, `sandbox`, CSP) | OS-level application restriction |
| **Backend REST API** | Implemented (`/health`, `/api/exams`) | Sessions, submissions, and admin routes |
| **Database & Seeding**| Implemented (SQLite, deterministic 5 MCQs) | Dynamic exam authoring & migrations |
| **Answer Security** | Implemented (Private DB keys, zero leak) | Cryptographic submission receipts |
| **Window Telemetry** | Implemented (Focus/blur native events) | Telemetry ingestion endpoint (`/events`) |
| **Camera Proctoring**| Architectural hooks prepared | OpenCV/MediaPipe face presence detector |
| **Examiner Dashboard**| Documented in API contract | Real-time review timeline & WebSocket |

---

## 9. Troubleshooting

- **Database not found**: The database path is resolved relative to the service directory (`services/api/sentinel_exam.db`). If testing in custom paths, set the `SENTINEL_DB_PATH` environment variable.
- **Port 8000 in use**: Start uvicorn on another port with `--port 8001` and update `VITE_API_URL=http://127.0.0.1:8001` in your environment or launch flags.
- **Electron window blank**: Ensure `npm run desktop:build` was executed prior to running `npx electron apps/desktop`.

---

## 10. Known Limitations

- **Computer Vision Proctoring**: Facial tracking and multi-face signals are planned for future milestones and are intentionally not mocked with fake data in this foundation release.
- **Assessment Submission**: In accordance with the foundation milestone specifications, answer submission and session lifecycle endpoints are documented in `docs/api-contract.md` but not active.
