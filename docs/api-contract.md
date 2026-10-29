# Sentinel Exam — API Contract Specification

This document defines the HTTP REST and WebSocket API contracts for Sentinel Exam.

The contract is explicitly divided into:
1. **Implemented and Tested in Foundation Milestone**
2. **Planned Endpoints (Documented for Subsequent Milestones)**

---

## 1. Conventions and Standards

- **Base URL**: `http://127.0.0.1:8000`
- **Content-Type**: `application/json; charset=utf-8`
- **Identifiers**: Canonical UUIDv4 strings (e.g. `c0a80101-0000-4000-8000-000000000001`).
- **Timestamps**: ISO 8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ`).
- **Integrity Signal Principle**: The `confidence` field in integrity events represents the statistical confidence of the detector algorithm (0.0 to 1.0), **not** the probability that the candidate cheated.

---

## 2. Implemented and Tested Endpoints

### 2.1 Health Check
Checks backend operational status and database connectivity.

- **Method**: `GET`
- **Path**: `/health`
- **Authentication**: None
- **Expected Status**: `200 OK`

#### Response Body
```json
{
  "status": "ok",
  "service": "sentinel-exam-api",
  "version": "0.1.0",
  "database": "connected"
}
```

#### Status Codes
- `200 OK`: Service is active and database is queryable.
- `503 Service Unavailable`: Service is starting or database unreachable.

---

### 2.2 List Available Exams (Public)
Retrieves the list of active examinations, including question and choice data.

> [!IMPORTANT]
> Correct answer keys and grading solutions are strictly excluded from this response.

- **Method**: `GET`
- **Path**: `/api/exams`
- **Authentication**: None
- **Expected Status**: `200 OK`

#### Response Body
```json
[
  {
    "id": "e0000000-0000-4000-8000-000000000001",
    "title": "Systems Engineering & Secure Computing Assessment",
    "description": "Comprehensive 5-question technical evaluation covering system architecture, process boundaries, and secure protocols.",
    "duration_minutes": 30,
    "total_questions": 5,
    "questions": [
      {
        "id": "q0000000-0000-4000-8000-000000000001",
        "question_number": 1,
        "text": "In a secure Electron desktop architecture, which setting guarantees that Node.js APIs are never directly accessible within the renderer context?",
        "choices": [
          {
            "id": "c0000000-0000-4000-8000-00000000001a",
            "choice_letter": "A",
            "text": "nodeIntegration: false and contextIsolation: true"
          },
          {
            "id": "c0000000-0000-4000-8000-00000000001b",
            "choice_letter": "B",
            "text": "webSecurity: false and allowRunningInsecureContent: true"
          },
          {
            "id": "c0000000-0000-4000-8000-00000000001c",
            "choice_letter": "C",
            "text": "enableRemoteModule: true"
          },
          {
            "id": "c0000000-0000-4000-8000-00000000001d",
            "choice_letter": "D",
            "text": "sandbox: false and nodeIntegrationInWorker: true"
          }
        ]
      }
    ]
  }
]
```

#### Status Codes
- `200 OK`: Success.
- `500 Internal Server Error`: Database query failed.

---

## 3. Planned Endpoints (Future Milestones)

### 3.1 Exam Details
- **Method**: `GET`
- **Path**: `/api/exams/{exam_id}`
- **Status**: `200 OK`, `404 Not Found`

### 3.2 Candidate Sessions
- **Create Session**: `POST /api/sessions`
  - Request: `{"exam_id": "...", "candidate_name": "...", "candidate_id": "..."}`
  - Response `201 Created`: `{"session_id": "...", "status": "active", "started_at": "..."}`
- **Get Session**: `GET /api/sessions/{session_id}`
  - Response `200 OK`: Session metadata, time remaining, answered question count.
- **Submit Exam**: `POST /api/sessions/{session_id}/submit`
  - Request: `{"final_note": "Candidate submitted on time"}`
  - Response `200 OK`: `{"status": "submitted", "submitted_at": "...", "total_answered": 5}`

### 3.3 Answer Submissions
- **Save Answer**: `PUT /api/sessions/{session_id}/answers/{question_id}`
  - Request: `{"selected_choice_id": "c0000000-0000-4000-8000-00000000001a"}`
  - Response `200 OK`: `{"status": "recorded", "saved_at": "..."}`

### 3.4 Integrity Event Logging & Audit
- **Log Event**: `POST /api/sessions/{session_id}/events`
  - Emitted by the Electron main process (window focus) or renderer (face detection).
  - Request:
```json
{
  "event_id": "evt-7a8b9c0d-1e2f-4a3b-9c8d-7e6f5a4b3c2d",
  "session_id": "s0000000-0000-4000-8000-000000000001",
  "event_type": "WINDOW_BLUR",
  "occurred_at": "2026-10-29T10:45:00.120Z",
  "source": "desktop_main_process",
  "severity": "medium",
  "confidence": 1.0,
  "metadata": {
    "duration_ms": 2400,
    "active_window_title": null
  },
  "simulated": false
}
```
  - Response `201 Created`: `{"status": "logged", "event_id": "..."}`

- **Get Session Events**: `GET /api/sessions/{session_id}/events`
- **Get Integrity Summary**: `GET /api/sessions/{session_id}/summary`
  - Returns explainable event distribution, anomaly counts, and timelines for examiner review.

### 3.5 Examiner Administration
- **List All Sessions**: `GET /api/admin/sessions`
  - Query parameters: `?status=active|submitted&min_anomaly=0`

### 3.6 Real-Time Proctoring WebSocket
- **Connection**: `WS /ws/admin`
- **Protocol**: JSON message envelope.
- **Message Structure**:
```json
{
  "type": "INTEGRITY_ALERT",
  "timestamp": "2026-10-29T10:45:00.150Z",
  "payload": {
    "session_id": "s0000000-0000-4000-8000-000000000001",
    "event_type": "MULTIPLE_FACES_DETECTED",
    "confidence": 0.88,
    "face_count": 2
  }
}
```
