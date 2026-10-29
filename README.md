# Sentinel Exam (PB.AI) &times; Where U Elevate

> **Intelligent, Secure Examination Browser &amp; Live AI Proctoring Platform**  
> Accelerating Innovation. Elevating Assessments.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Electron](https://img.shields.io/badge/Electron-33.x-47848F.svg?logo=electron)](https://www.electronjs.org)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg?logo=react)](https://react.dev)
[![WebRTC](https://img.shields.io/badge/WebRTC-Live%20Streaming-333333.svg?logo=webrtc)](https://webrtc.org)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python)](https://www.python.org)

---

## Table of Contents
1. [Overview & Highlights](#1-overview--highlights)
2. [Ecosystem Architecture](#2-ecosystem-architecture)
3. [Key Features](#3-key-features)
4. [Prerequisites](#4-prerequisites)
5. [Quickstart Guide](#5-quickstart-guide)
6. [Testing Across Laptops (LAN / Wi-Fi)](#6-testing-across-laptops-lan--wi-fi)
7. [Student Download & Readiness Portal](#7-student-download--readiness-portal)
8. [Proctor Web Dashboard](#8-proctor-web-dashboard)
9. [Automated Verification & Testing](#9-automated-verification--testing)
10. [API Reference & WebRTC Signaling](#10-api-reference--webrtc-signaling)
11. [Security & Anti-Cheat Specifications](#11-security--anti-cheat-specifications)

---

## 1. Overview & Highlights

**Sentinel Exam** is a production-grade, secure smart examination browser developed for **Where U Elevate**. It delivers a high-integrity assessment environment combining:
- **A Candidate Desktop Kiosk (`apps/desktop`)**: Fully locks down the candidate's operating system, prevents application switching and overlay injection, enforces single-candidate gaze/face presence via local MediaPipe computer vision, and automatically transmits full-screen display feeds.
- **A Remote Examiner Web Dashboard (`apps/proctor-web`)**: A standalone web portal where proctors monitor live video streams (screen share + webcam) in real time over WebRTC, inspect real-time integrity incident logs, and remotely authorize locked sessions.
- **A High-Performance Backend (`services/api`)**: Built with FastAPI, SQLite/SQLAlchemy, and WebRTC WebSocket signaling gateways with sub-50ms event ingestion and zero-answer-leakage evaluation.
- **A Candidate Download & Readiness Portal (`/download`)**: A browser-accessible portal allowing candidates to perform pre-flight hardware checks (camera, microphone, screen capture, network ping) and download the client.

---

## 2. Ecosystem Architecture

```
                                  +-----------------------------------------------+
                                  |              PROCTOR DASHBOARD                |
                                  |            (apps/proctor-web)                 |
                                  |  - Live WebRTC Candidate Screen Stream        |
                                  |  - Live WebRTC Webcam Stream                  |
                                  |  - Incident Timeline & Teacher Unlock Code    |
                                  +-----------------------^-----------------------+
                                                          | WebRTC Streams & Events
                                                          | (via WebSocket Gateway)
                                                          v
+-----------------------------+          +-----------------------------------------------+
|      STUDENT CANDIDATE      |          |              FASTAPI BACKEND                  |
|       (apps/desktop)        | <======> |              (services/api)                   |
| - Kiosk Full-Screen Lockdown|  HTTPS / |  - REST APIs (Exams, Sessions, Submissions)   |
| - OS Content Protection     |  WebRTC  |  - WebRTC WebSocket Signaling Room Gateway     |
| - Mandatory Screen Share    |          |  - Temporal Event Ingestion & Incident Engine |
| - Local MediaPipe CV Engine |          |  - Static Downloads & Readiness Portal (/download)
+-----------------------------+          +-----------------------------------------------+
```

### Monorepo Structure

```
vistarx/
├── apps/
│   ├── desktop/                         # Electron Desktop Candidate Application
│   │   ├── src/
│   │   │   ├── main/                    # Main Process (Kiosk Lockdown, Hotkey Traps, IPC)
│   │   │   │   ├── index.ts
│   │   │   │   └── security.ts          # DisplayMediaRequestHandler & CSP
│   │   │   ├── preload/                 # Secure Context Isolation Bridge
│   │   │   │   └── index.ts
│   │   │   └── renderer/                # Sandboxed React 18 Application
│   │   │       ├── src/
│   │   │       │   ├── api/             # Typed API & Event Logging Client
│   │   │       │   ├── components/      # PreExamPortal, ExamWorkspace, Confirmation
│   │   │       │   ├── hooks/           # useScreenShare (WebRTC Candidate Peer)
│   │   │       │   └── App.tsx
│   │   └── package.json
│   └── proctor-web/                     # Examiner Live Monitoring Web Dashboard
│       ├── src/
│       │   ├── components/              # LiveCandidateMonitor, IncidentTimeline
│       │   ├── hooks/                   # useExaminerWebRTC (Remote Video Receiver)
│       │   └── App.tsx
│       ├── package.json
│       └── vite.config.ts
├── services/
│   └── api/                             # FastAPI Backend & Signaling Service
│       ├── app/
│       │   ├── database.py              # SQLAlchemy ORM
│       │   ├── main.py                  # Endpoints & Static Portal Mounting
│       │   ├── models.py                # Database Schema (Sessions, Events, Answers)
│       │   ├── schemas.py               # Pydantic Schemas (Zero Answer Leakage)
│       │   ├── seed.py                  # Idempotent Exam & Question Seeder
│       │   ├── routes/
│       │   │   ├── exams.py             # Public Exam Endpoints
│       │   │   ├── health.py            # Service Health & Ping Check
│       │   │   ├── sessions.py          # Session Lifecycle & Event Ingestion
│       │   │   └── webrtc.py            # WebRTC Signaling Gateway & ICE Config
│       │   └── static/
│       │       ├── download/            # In-Browser Readiness & Download Portal
│       │       └── downloads/           # Portable Client ZIP & Batch Launchers
│       ├── tests/                       # 33 Comprehensive Pytest Test Suites
│       └── requirements.txt
├── start-exam.bat                       # One-Click Candidate Launcher
├── package.json                         # Root Workspace Orchestration
└── README.md
```

---

## 3. Key Features

### For Candidates (Student Portal)
- **Full-Screen Kiosk Mode**: Window operates borderless with `kiosk: true`, `fullscreen: true`, `skipTaskbar: true`, and `alwaysOnTop: true`.
- **System Shortcut Interception**: Traps <kbd>Alt</kbd>+<kbd>Tab</kbd>, <kbd>Alt</kbd>+<kbd>F4</kbd>, <kbd>Windows Key</kbd>, <kbd>Escape</kbd>, and DevTools shortcuts.
- **Continuous Watchdog**: Runs a 150ms focus-reclaim watchdog to prevent OS overlay steal.
- **Mandatory Entire-Screen Capture**: Automatically enumerates and streams the primary display over WebRTC; pauses exam questions and timer if display sharing is stopped.
- **Local MediaPipe Vision**: Performs on-device gaze tracking, face presence verification, and secondary face detection with zero cloud latency.
- **Question Palette & Review**: Allows jumping between questions, marking for review, and viewing remaining answered counts.
- **Answer Persistence**: In-flight answers are stored continuously on the backend, ensuring zero loss if connection recovers.
- **Emergency Exit**: Safe Quit button on the portal and emergency hotkey (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Q</kbd>).

### For Examiners (Proctor Web)
- **Dual Live Feeds**: View candidate's entire display stream and candidate's live webcam feed side-by-side.
- **Real-Time Incident Stream**: Instant alerts for gaze loss, secondary faces, window blur attempts, or hotkey interruptions.
- **Session Locking & Recovery**: Automatic exam lockout after critical threshold violations with Teacher Code override (`TEACHER-UNLOCK-2026`).

---

## 4. Prerequisites

- **Node.js**: `v18.x` or higher (verified on `v20.x` & `v24.x`)
- **npm**: `v9.x` or higher
- **Python**: `3.11.x` or higher
- **Operating System**: Windows 10/11 (fully supported for Kiosk & Screen Sharing), macOS, or Linux.

---

## 5. Quickstart Guide

### 1. Install Dependencies
```bash
# Install root monorepo & workspaces (desktop + proctor-web)
npm install

# Install Python backend dependencies
pip install -r services/api/requirements.txt
```

### 2. Seed Database
Seeds a standard 5-question technical assessment:
```bash
npm run backend:seed
```

### 3. Start Backend & Proctor Servers
In your primary terminal:
```bash
# Start FastAPI backend on 0.0.0.0:8000
python -m uvicorn app.main:app --app-dir services/api --host 0.0.0.0 --port 8000 --reload
```

In a second terminal:
```bash
# Start Proctor Web Dashboard on 0.0.0.0:5174
npm run proctor:dev
```

### 4. Launch Desktop Assessment Client
```bash
# Build desktop renderer & main process
npm run desktop:build

# Launch candidate client
npx electron apps/desktop
```

---

## 6. Testing Across Laptops (LAN / Wi-Fi)

To test Sentinel Exam with a friend's laptop acting as the candidate while your laptop acts as the proctor:

1. **Connect both laptops to the same Wi-Fi network**.
2. **Find your host IP address**:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" }
   ```
   *(e.g., `172.16.176.193` or `192.168.1.X`)*

3. **On Your Host Laptop**:
   - Keep the backend running on `0.0.0.0:8000`.
   - Open the **Proctor Dashboard** in your browser at `http://localhost:5174`.

4. **On Your Friend's Laptop (Candidate)**:
   - **Method A (Web Download)**: Open Chrome/Edge and navigate to `http://<YOUR_HOST_IP>:8000/download`. Download and double-click `start-exam.bat`.
   - **Method B (PowerShell)**:
     ```powershell
     $env:VITE_API_URL="http://<YOUR_HOST_IP>:8000"
     npx electron apps/desktop
     ```
   - **Method C (In-App Connect)**: If the app starts and is offline, type `http://<YOUR_HOST_IP>:8000` into the server input box on screen and click **Connect**.

---

## 7. Student Download & Readiness Portal

The platform includes an automated download and onboarding website accessible by any browser on the network:

**URL**: `http://<YOUR_HOST_IP>:8000/download`

Features:
- **Interactive Hardware Tests**: Tests candidate's webcam and screen capture directly inside the browser before launching.
- **Server Ping Indicator**: Measures round-trip HTTP latency to the backend.
- **Download Packages**: Direct download of `sentinel-exam-client.zip` and `start-exam.bat`.

---

## 8. Proctor Web Dashboard

**URL**: `http://<YOUR_HOST_IP>:5174` (or `http://localhost:5174`)

- **Candidate List**: Displays all active and submitted candidate sessions.
- **WebRTC Peer Monitor**: Connects to the candidate's WebRTC signaling room and renders live screen and webcam video tracks.
- **Incident Feed**: Chronological timeline of high-, medium-, and low-severity violations.
- **Remote Unlock**: Unlocks candidate sessions paused due to excessive warnings using authorization code `TEACHER-UNLOCK-2026`.

---

## 9. Automated Verification & Testing

The repository includes a comprehensive automated test suite verifying security, API contracts, WebRTC signaling, and database isolation.

```bash
# Run all backend unit & integration tests (33 tests)
python -m pytest services/api/tests -v

# Run TypeScript compilation checks across all desktop processes
npm run desktop:check

# Run Proctor Dashboard typecheck
npm run proctor:check
```

---

## 10. API Reference & WebRTC Signaling

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health status and database connectivity |
| `/api/exams` | `GET` | Public exam listing (without answer keys) |
| `/api/sessions` | `POST` | Create candidate assessment session |
| `/api/sessions/{id}/start` | `POST` | Enforce readiness gate & begin exam |
| `/api/sessions/{id}/answers` | `GET` / `POST` | Fetch or persist question answers |
| `/api/sessions/{id}/submit` | `POST` | Complete and evaluate assessment |
| `/api/sessions/{id}/events` | `POST` | Ingest proctoring violation telemetry |
| `/api/webrtc/config` | `GET` | Retrieve STUN/TURN ICE configuration |
| `/api/webrtc/signal/{id}` | `WebSocket` | Real-time SDP offer/answer/ICE exchange |
| `/download` | `GET` | Candidate download & pre-flight test portal |

---

## 11. Security & Anti-Cheat Specifications

1. **OS Content Protection**: Toggles OS-level window protection (`setContentProtection(true)`) so background capture tools cannot invisibly record without authorization.
2. **Kiosk Lock**: Disables window resizing, movement, minimization, and closure during the active exam phase.
3. **Zero Answer Key Leakage**: Exam schemas omit `correct_choice_id`. All evaluation occurs server-side upon final submission.
4. **Sandboxed IPC**: The renderer operates in an isolated context with no direct access to Node.js filesystem, network, or process execution APIs.
5. **Emergency Safety**: Hotkey <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Q</kbd> forcefully releases kiosk mode and exits in case of hardware or network freezes.

---

**Where U Elevate &bull; Sentinel Exam** &mdash; Built with rigorous security and real-time AI integrity.
