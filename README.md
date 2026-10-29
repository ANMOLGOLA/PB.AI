# Sentinel Exam &times; Where U Elevate

> **Smart Proctoring Browser for Technical & MCQ Assessments**  
> Built for the WUElev8 Hackathon.

---

## 1. Design Philosophy: Observe & Explain, Not Block

Sentinel Exam adheres to a modern, human-centric assessment philosophy:

* **Observe, Don't Block**: Tab switching is permitted but tracked. Candidates are never locked out by rigid OS kiosks or artificial shortcut blocking.
* **Explainable Telemetry**: Every flagged event provides context (timestamps, matched keywords, confidence ratings, and category breakdowns) rather than a black-box cheating score.
* **Non-Blocking Warnings**: Proctors can dispatch non-intrusive warnings directly to candidate viewports.
* **Zero Answer Leakage**: Answer keys and grading algorithms remain strictly server-side.
* **Privacy By Design**: Passwords, OTPs, and personal communications are never intercepted or logged. Query capture is strictly limited to the managed research sandbox.

---

## 2. System Architecture & Monorepo Structure

```
vistarx/
├── backend/                             # Canonical FastAPI Core Service & SQLite Database
│   ├── app/
│   │   ├── main.py                      # App entry point & static portal mounting
│   │   ├── database.py                  # SQLAlchemy engine & SQLite persistence
│   │   ├── models.py                    # Schema: Exam, Question, Session, Event, Answer
│   │   ├── schemas.py                   # Pydantic v2 validation contracts
│   │   ├── airtable.py                  # Airtable exam sync with local fallback cache
│   │   ├── policy/                      # Policy engine, risk scoring, answer-seeking similarity
│   │   ├── vision/                      # OpenCV head pose (solvePnP), face analysis
│   │   └── routes/                      # Auth, Exams, Sessions, WebRTC signaling
│   ├── tests/                           # 180+ pytest verification test suites
│   ├── sentinel_exam.db                 # Seeded SQLite database (do not delete)
│   └── requirements.txt
├── frontend/                            # Electron Desktop Candidate Application
│   ├── src/
│   │   ├── main/                        # Electron main process (lifecycle, IPC, sandbox)
│   │   ├── preload/                     # Context isolation bridge & webview preload
│   │   └── renderer/                    # React 18 + TypeScript candidate UI
│   │       └── src/
│   │           ├── components/          # ExamWorkspace, ManagedBrowserTab, WebcamProctor
│   │           └── api/                 # Autosave, offline queue, telemetry dispatch
│   └── package.json
└── apps/
    └── proctor-web/                     # Examiner Live Monitoring Web Dashboard
        ├── src/
        │   ├── views/                   # LiveMonitoringView, ReportsView
        │   └── hooks/                   # WebRTC signaling, WebSocket streams
        └── package.json
```

---

## 3. Windows Setup & Prerequisites

### Prerequisites
* **Operating System**: Windows 10/11 (or macOS / Linux)
* **Python**: `3.11.x` or higher
* **Node.js**: `v18.x` or `v20.x` LTS
* **npm**: `v9.x` or higher

### Installation Steps

1. **Clone the repository**:
   ```powershell
   git clone <repo-url>
   cd vistarx
   ```

2. **Configure Python Virtual Environment & Dependencies**:
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   cd ..
   ```

3. **Install Node.js Dependencies**:
   ```powershell
   # Install Electron desktop client dependencies
   cd frontend
   npm install
   cd ..

   # Install Examiner dashboard dependencies
   cd apps/proctor-web
   npm install
   cd ..
   ```

---

## 4. Execution Commands

### 1. Start the FastAPI Backend Server
From the repository root (or `backend/` directory):
```powershell
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
* **API Documentation**: `http://localhost:8000/docs`
* **Health Endpoint**: `http://localhost:8000/health`
* **Student Web Portal**: `http://localhost:8000/portal`
* **Built Examiner Dashboard**: `http://localhost:8000/proctor/`

### 2. Start the Examiner Web Dashboard
The dashboard is automatically compiled and served by FastAPI at `http://localhost:8000/proctor/`.  
To run it in hot-reload developer mode independently:
```powershell
cd apps/proctor-web
npm run dev
```

### 3. Start the Electron Desktop Application
In a separate terminal:
```powershell
cd frontend
npm run start
```
*(Or use `npm run dev` for hot-reloading development mode).*

---

## 5. Two-Laptop LAN Demonstration Checklist

Use this checklist for an end-to-end evaluation across two laptops on the same Wi-Fi or LAN router:

```
[Laptop A: Examiner & Server]                     [Laptop B: Student Candidate]
  FastAPI Backend (0.0.0.0:8000)   <-- Wi-Fi -->    Electron Proctoring Browser
  Examiner Dashboard (/proctor/)                    (VITE_API_URL=http://<Laptop-A-IP>:8000)
```

### Step 1: Identify Server IP on Laptop A
1. Open PowerShell on **Laptop A** and run:
   ```powershell
   ipconfig
   ```
2. Note your **IPv4 Address** (e.g., `192.168.1.50`).
3. Ensure Windows Firewall permits incoming TCP traffic on port 8000.

### Step 2: Start Backend & Dashboard on Laptop A
1. Start the FastAPI service:
   ```powershell
   cd vistarx/backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
2. In Google Chrome or Edge, navigate to: `http://localhost:8000/proctor/`
3. Enter examiner access code: `TEACHER-UNLOCK-2026` (or `ELEV8-2026`).

### Step 3: Launch Candidate App on Laptop B
1. On **Laptop B**, set the backend URL pointing to Laptop A:
   ```powershell
   $env:VITE_API_URL="http://192.168.1.50:8000"
   cd vistarx/frontend
   npm run start
   ```
2. The candidate application will open to the Welcome screen.

### Step 4: Step Through the Verification Flow
* [x] **OTP Verification**: Enter candidate email and any 6-digit dev code (e.g. `123456`).
* [x] **Camera & Hardware Check**: Candidate verifies webcam stream and microphone readiness.
* [x] **Monitoring Disclosure**: Candidate reviews the explainable proctoring policy and clicks "I Understand & Agree".
* [x] **Assessment Workspace**:
  - Live candidate webcam feed renders in the Picture-in-Picture card in the bottom-right corner.
  - Active question, choice palette, and server timer display clearly.
* [x] **Laptop A Dashboard Verification**:
  - Laptop A immediately shows candidate as "Active" in the candidate roster.
  - WebRTC live camera stream connects.
* [x] **Trigger Focus Loss**:
  - On Laptop B, press <kbd>Alt</kbd>+<kbd>Tab</kbd> or click outside the Electron window.
  - On Laptop A, the narrative timeline displays: *"Candidate switched away from MCQ assessment workspace"*.
  - When returning, the timeline records exact duration away (e.g. *"Returned after 3.2s"*).
* [x] **Managed Research & AI Query Detection**:
  - On Laptop B, click the **Research & Permitted Web** tab.
  - Notice the dark slate interface with no white bars, featuring Google, ChatGPT, Claude, and Gemini quick-launch buttons.
  - In Google or Claude, search a question-related query (e.g. *"Electron contextIsolation nodeIntegration web renderer isolation"*).
  - On Laptop A, the timeline displays:
    ```
    Search query on Google:
    "Electron contextIsolation nodeIntegration..."
    [LIKELY ANSWER-SEEKING (78% MATCH)]
    Matched keywords: contextisolation, electron, isolated, renderer
    ```
  - The SVG **Risk Trajectory Chart** updates its risk score curve in real time.
* [x] **Submit & Score Storage**:
  - On Laptop B, answer questions (observe autosave status badge in header: `saved`).
  - Click **Submit Assessment**.
  - Laptop A reflects status `submitted`. The Results table updates with server-side percentage, score, and complete audit trail exportable to CSV and JSON.

---

## 6. Access Credentials & Demo Keys

| Role | Key / Code | Purpose |
| :--- | :--- | :--- |
| **Examiner Access Code** | `TEACHER-UNLOCK-2026` | Login to Proctor Web Dashboard |
| **Alternative Access Codes**| `ELEV8-2026`, `SUPERVISOR-KEY` | Secondary teacher override codes |
| **Candidate OTP (Dev Mode)**| Any 6 digits (e.g. `123456`) | Student verification login |
| **Seeded Assessment ID** | `e0000000-0000-4000-8000-000000000001` | *Systems Engineering Assessment* |

---

## 7. Honest Technical Limitations

We believe transparency is critical for proctoring integrity:

1. **Passive Hardware Splitters & Second Devices**:
   - Software running on an operating system cannot detect passive physical HDMI splitters, secondary hardware capture cards, or separate physical mobile phones positioned off-camera.
   - Dual-display software detection monitors OS display configurations (`screen.getAllDisplays()`), but physical hardware cloning bypasses OS-level screen enumeration.

2. **Managed Sandbox Boundary**:
   - Query capture and prompt observation operate strictly within the Electron application's embedded `<webview>` surface.
   - Keystrokes typed into native external applications running outside the Electron shell (e.g., an independent Chrome browser window or third-party desktop app) cannot be intercepted due to operating system process isolation and user privacy boundaries.

---

## 8. Automated Verification Suite

Run all automated unit, integration, and security test suites:

```powershell
cd backend
pytest tests/
```

Expected output: **180+ tests passing (100% pass rate)** including:
- Backend core OTP, sessions, autosave, server-authoritative timer, and scoring.
- Policy engine, unified event model, and explainable risk decomposition.
- Answer-seeking semantic similarity detection and duplicate-login detection.
- Milestone 1 empirical challenge and adversarial computer vision tests.
- Zero answer key leakage verification.
