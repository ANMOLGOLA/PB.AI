# Sentinel Exam — Architecture Specification

## 1. Executive Overview

**Sentinel Exam** is an assessment application built for conducting examinations with transparent, explainable integrity monitoring.

The system is architected as an offline-first desktop browser shell paired with a local or networked FastAPI backend, prioritizing process separation, minimal privilege exposure, and verifiable answer security.

```
+-----------------------------------------------------------------------+
| Sentinel Exam Desktop (Electron Process Tree)                         |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | Electron Main Process (Node.js runtime)                         |  |
|  | - Window lifecycle & native window management                   |  |
|  | - Security enforcement (CSP, sandbox, navigation control)       |  |
|  | - Window focus/blur monitoring (integrity signal)               |  |
|  +-------------------------------+---------------------------------+  |
|                                  | IPC (Strictly Typed, Read-Only)    |
|  +-------------------------------v---------------------------------+  |
|  | Preload Script (Isolated Context)                               |  |
|  | - Context bridge (`window.sentinelBridge`)                      |  |
|  | - Zero Node.js or filesystem API leakage                        |  |
|  +-------------------------------+---------------------------------+  |
|                                  | DOM Boundary                       |
|  +-------------------------------v---------------------------------+  |
|  | Renderer Process (Chromium Sandbox, React + TypeScript + Vite)   |  |
|  | - Candidate & Status Interface (Editorial Design System)        |  |
|  | - Communicates strictly via HTTP to Backend API                 |  |
|  | - Zero direct SQLite or OS access                               |  |
|  +-------------------------------+---------------------------------+  |
+----------------------------------|------------------------------------+
                                   | HTTP / JSON (Port 8000)
                                   v
+-----------------------------------------------------------------------+
| Sentinel Exam Backend (FastAPI Service)                               |
|                                                                       |
|  - Request validation & serialization via Pydantic                    |
|  - Health checks & system status (`GET /health`)                      |
|  - Exam and question query service (`GET /api/exams`)                 |
|  - Private answer key isolation (correct choices never leave backend) |
|  - SQLAlchemy 2.0 ORM with SQLite database engine                     |
+----------------------------------+------------------------------------+
                                   | ACID Transactions
                                   v
+-----------------------------------------------------------------------+
| SQLite Database (`sentinel_exam.db`)                                  |
|                                                                       |
|  - Exams table                                                        |
|  - Questions table (with private `correct_choice_id`)                 |
|  - Choices table                                                      |
|  - Deterministic idempotent seed migrations                           |
+-----------------------------------------------------------------------+
```

---

## 2. Process Boundaries and Responsibilities

### 2.1 Electron Main Process
- **Runtime**: Node.js in the main Electron lifecycle.
- **Responsibilities**:
  - Creates the primary `BrowserWindow` with security flags permanently enabled (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
  - Implements navigation guards (`will-navigate` and `setWindowOpenHandler`) to prevent renderer redirection to external or untrusted URLs.
  - Monitors native window focus and blur events to detect window switching or multitasking during assessments.
  - Exposes only explicit, verified IPC channels for system metadata and window events.
  - Does NOT expose filesystem, shell execution, or database connectivity to the renderer.

### 2.2 Preload Boundary
- **Runtime**: Isolated context running between the Main process and Renderer.
- **Responsibilities**:
  - Uses `contextBridge.exposeInMainWorld('sentinelBridge', ...)` to provide a strongly typed API.
  - Only exposes:
    1. Read-only platform and application metadata (`platform`, `appVersion`).
    2. Backend connectivity configuration (`getBackendUrl()`).
    3. Read-only event listeners for window focus state changes (`onWindowBlur`, `onWindowFocus`).
  - Forbids raw `ipcRenderer.send` or `ipcRenderer.invoke` access to arbitrary channels.

### 2.3 Renderer Process
- **Runtime**: Chromium sandboxed browser environment with React 19, TypeScript, and Vite.
- **Responsibilities**:
  - Renders user interfaces adhering to the warm-neutral design directive.
  - Fetches assessment and health data via standard HTTP `fetch` to the FastAPI backend.
  - Handles network failures, loading indicators, and retry loops gracefully.
  - Contains zero secret keys, database credentials, or answers.

### 2.4 FastAPI Backend Service
- **Runtime**: Python 3.11+ running with Uvicorn.
- **Responsibilities**:
  - Serves REST endpoints with typed Pydantic models.
  - Sanitizes public responses to prevent answer key disclosure.
  - Manages SQLite database connection and idempotent migrations/seeding.
  - Designed to host future assessment sessions, telemetry ingestion, and integrity scoring.

### 2.5 SQLite Database Layer
- **Storage**: Single local database file (`sentinel_exam.db`).
- **Path Resolution**: Resolved relative to the service root independently of process execution directory.
- **Isolation**: Direct access is restricted to the FastAPI SQLAlchemy layer.

---

## 3. Security Model

| Security Vector | Mitigation Strategy |
|---|---|
| **Remote Code Execution (RCE)** | `nodeIntegration: false`, `contextIsolation: true`, sandboxing enabled in Electron. |
| **Cross-Site Scripting (XSS)** | Restrictive Content Security Policy (CSP): `default-src 'self'; connect-src 'self' http://127.0.0.1:8000; style-src 'self' 'unsafe-inline'; img-src 'self' data:`. |
| **Answer Key Leakage** | Database schema stores `correct_choice_id` on the `Question` model, but public Pydantic schemas (`PublicExamResponse`, `PublicQuestionResponse`) explicitly exclude answer fields. Tested recursively with automated unit tests. |
| **Arbitrary Navigation** | `webContents.setWindowOpenHandler` denies new windows; `will-navigate` blocks navigation to external origins. |
| **Data Integrity** | Database operations utilize ACID transactions. Seeding is idempotent with deterministic UUIDs. |

---

## 4. Future Integrity and Proctoring Roadmap

1. **Face Presence and Posture Monitoring**:
   - WebRTC camera stream processed client-side via OpenCV/MediaPipe.
   - Emits structured `IntegrityEvent` records with confidence scores rather than binary "cheating" judgments.
2. **Window and Focus Telemetry**:
   - Main process tracks `blur` and `focus` events with millisecond timestamps.
   - Telemetry forwarded to `POST /api/sessions/{session_id}/events`.
3. **Audit Trail and Explainability**:
   - Examiner timeline records all candidate events with confidence metrics, raw observations, and timestamps for post-exam review.
