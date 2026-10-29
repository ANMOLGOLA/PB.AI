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

## 4. Real-Time WebRTC Screen Sharing & Examiner Architecture

### 4.1 Screen Capture & Informed Consent
- **Source Selection**: Uses Electron's `desktopCapturer.getSources()` via `window.sentinelBridge.getScreenSources()`, displaying visual thumbnails and names of entire displays and application windows.
- **Informed Consent**: Explicit user selection with clear explanation before capture initiates; never captures secretly or defaults without user confirmation.
- **OS Anti-Overlay Harmony**: Windows `setContentProtection(true)` blocks third-party screen capture (OBS, Discord) by default. When the candidate explicitly shares their screen with the examiner, `set-screen-share-active` temporarily adjusts display affinity so the stream is not blacked out, and immediately reinstates protection once sharing terminates.
- **Track Lifecycle**: Candidate can stop sharing at any time; OS track termination (`videoTrack.onended`) and session submission automatically stop all tracks and close WebRTC peer connections.

### 4.2 WebRTC Media & Signaling Architecture
- **No Base64 Screen Spam**: Screen video flows entirely over encrypted peer-to-peer WebRTC (`MediaStream`), never as base64 images uploaded to REST endpoints or sent to LLMs.
- **Signaling Gateway**: FastAPI WebSocket endpoint `/api/webrtc/signal/{session_id}` relays SDP offers, SDP answers, and ICE candidates between candidate and authorized examiner.
- **STUN/TURN Traversal**: Configured dynamically via `GET /api/webrtc/config` using environment variables (`WEBRTC_STUN_SERVER`, `WEBRTC_TURN_SERVER`, `WEBRTC_TURN_USERNAME`, `WEBRTC_TURN_CREDENTIAL`) without bundling credentials in client binaries.
- **Connection States**: Explicit state transitions (`idle`, `ready`, `connecting`, `active`, `interrupted`, `stopped`) with automatic reconnection handling on network hiccups.

### 4.3 Normalized Audit Events
- Automatically recorded in SQLite audit ledger on state transitions:
  - `SCREEN_SHARE_STARTED`: Records display source name, resolution, and timestamp.
  - `SCREEN_SHARE_STOPPED`: Records stop reason and total duration in seconds.
  - `SCREEN_SHARE_INTERRUPTED`: Triggered if the WebSocket or WebRTC connection drops unexpectedly.
  - `SCREEN_SHARE_RECONNECTED`: Emitted upon peer renegotiation.

### 4.4 Examiner Live Monitoring Hub
- **Authentication**: Protected by examiner authorization codes (`TEACHER-UNLOCK-2026`, `ELEV8-2026`, `778899`).
- **Live Screen Video**: Real HTML5 `<video autoPlay playsInline>` element rendering candidate's screen via WebRTC `ontrack`.
- **Synchronized Timeline**: Chronological incident audit stream displaying camera proctoring events (`FACE_ABSENT`, `MULTIPLE_FACES`, `EYE_GAZE_DEV`, `UNAUTHORIZED_PHONE`) side-by-side with screen share events.
- **Remote Unlock**: One-click teacher remote unlock action if candidate reaches 5-warning lockout.

### 4.5 Remote Deployment & Network Configuration
For remote examiner viewing across different machines or network boundaries:
1. **Bind Backend to Reachable IP/Host**: Run FastAPI on `0.0.0.0` or behind a reverse proxy (e.g., Nginx, Caddy with TLS).
2. **Configure STUN/TURN**: Set `WEBRTC_STUN_SERVER` and `WEBRTC_TURN_SERVER` in `.env` for NAT/firewall traversal.
3. **Set API URL**: Point desktop client `VITE_API_URL` to the public or intranet backend URL.

---

## 5. Future Integrity and Proctoring Roadmap

1. **Face Presence and Posture Monitoring**:
   - WebRTC camera stream processed client-side via OpenCV/MediaPipe.
   - Emits structured `IntegrityEvent` records with confidence scores rather than binary "cheating" judgments.
2. **Window and Focus Telemetry**:
   - Main process tracks `blur` and `focus` events with millisecond timestamps.
   - Telemetry forwarded to `POST /api/sessions/{session_id}/events`.
3. **Audit Trail and Explainability**:
   - Examiner timeline records all candidate events with confidence metrics, raw observations, and timestamps for post-exam review.


---

## 6. Window Lockdown Hardening & OS Keystroke Boundaries

### 6.1 Application-Level Lockdown Protections
During an active assessment session, Sentinel Exam applies comprehensive desktop defenses:
- **Kiosk & Full-Screen Enforcement**: The window enters full kiosk mode (`setKiosk(true)`, `setFullScreen(true)`, `setAlwaysOnTop(true, 'screen-saver', 9999)`), suppresses the taskbar (`setSkipTaskbar(true)`), and disables minimizing, resizing, or moving.
- **Application Menu & Menu Bar Removal**: `Menu.setApplicationMenu(null)` removes the application menu globally; `setMenuBarVisibility(false)` and `autoHideMenuBar = true` ensure no system or hotkey menus appear.
- **Keystroke & Shortcut Traps**: In `before-input-event` and global shortcut registrations, the application intercepts and cancels:
  - Function keys: `F1`, `F3`, `F5` (reload), `F11` (fullscreen toggle), `F12` (devtools).
  - Navigation & Reload combinations: `Ctrl+R`, `Ctrl+Shift+R`, `Ctrl+W` (close), `Alt+F4`.
  - Multi-tasking keys: `Alt+Tab`, `Alt+Escape`, `Ctrl+Escape`.
  - Escape key and context menu keys.
  - Windows / Meta key taps and combinations.
- **Focus Recovery Watchdog**: A high-priority 150ms watchdog timer continuously monitors window focus, fullscreen state, and kiosk state. If focus or fullscreen is lost through an OS notification or interruption, focus is immediately reclaimed.
- **Navigation & DevTools Lockdown**: External navigation is blocked (`will-navigate`), and any attempt to open DevTools during an active exam or production run immediately triggers `closeDevTools()`.

### 6.2 OS-Level Boundaries & Security Disclosure
- **Kernel-Level Key Combinations**: In modern desktop operating systems (specifically Microsoft Windows), certain system hotkeys—most notably `Ctrl+Alt+Delete` (Secure Attention Sequence / SAS) and the hardware Windows Start Menu interrupt—are processed directly by the Windows Kernel (`winlogon.exe` / `csrss.exe`) at Session 0 before any user-space application or Chromium hook can intercept them.
- **Enterprise Lockdown Recommendation**: In high-stakes production environments, user-space application hardening should be paired with Windows OS-level kiosk policies:
  1. **Windows Assigned Access (Single-App Kiosk)**: Configures Windows to launch Sentinel Exam as the dedicated shell, completely disabling the Start menu, Task Manager, Action Center, and hotkeys.
  2. **Windows Keyboard Filter Driver (`WEKF`)**: An optional Windows feature enabling granular hardware suppression of `Ctrl+Alt+Del`, Windows Logo keys, and accessibility shortcuts at the kernel filter level.
