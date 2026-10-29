import {
  HealthStatus,
  PublicExam,
  CandidateSession,
  AnalyzeFrameResult,
  PreExamScanResult,
  TeacherUnlockResult,
  SubmitSessionResult
} from './types';

/**
 * Fetch health status from Sentinel Exam API.
 */
export async function fetchHealth(baseUrl: string): Promise<HealthStatus> {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);
  return response.json();
}

/**
 * Fetch public examination records from Sentinel Exam API.
 */
export async function fetchExams(baseUrl: string): Promise<PublicExam[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/exams`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Exams query returned HTTP ${response.status}`);
  return response.json();
}

/**
 * Initialize a monitored examination session.
 */
export async function createSession(
  baseUrl: string,
  examId: string,
  candidateName: string,
  candidateId: string,
  faceId?: string,
  faceSignature?: string
): Promise<CandidateSession> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_id: examId,
      candidate_name: candidateName,
      candidate_id: candidateId,
      face_id: faceId,
      face_signature: faceSignature
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Session creation failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Validate screen sharing readiness and start examination timer.
 */
export async function startAssessmentSession(
  baseUrl: string,
  sessionId: string
): Promise<{ status: string; session_id: string; started_at: string; message: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/start`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Screen sharing verification failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Dispatch an OTP code for student identity verification.
 */
export async function sendOtp(
  baseUrl: string,
  identifier: string
): Promise<{ status: string; identifier: string; expires_in_seconds: number; dev_otp?: string; message: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/auth/otp/send`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `OTP dispatch failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Verify an entered OTP code for candidate login.
 */
export async function verifyOtp(
  baseUrl: string,
  identifier: string,
  otpCode: string
): Promise<{ status: string; verified: boolean; token: string; candidate_id: string; identifier: string; message: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/auth/otp/verify`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, otp_code: otpCode })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `OTP verification failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Batch autosave candidate answers with offline sync fallback.
 */
export async function batchAutosave(
  baseUrl: string,
  sessionId: string,
  answers: Record<string, string>
): Promise<{ status: string; saved_count: number; session_id: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/autosave`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Batch autosave failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Record an individual MCQ choice answer.
 */
export async function saveAnswer(
  baseUrl: string,
  sessionId: string,
  questionId: string,
  selectedChoiceId: string
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/answers/${questionId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_choice_id: selectedChoiceId })
  });
  if (!response.ok) {
    throw new Error(`Failed to save answer: HTTP ${response.status}`);
  }
}

/**
 * Retrieve saved answers for an assessment session (supports interruption recovery).
 */
export async function fetchAnswers(
  baseUrl: string,
  sessionId: string
): Promise<Record<string, string>> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/answers`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};
    const data = await res.json();
    return data.answers || {};
  } catch {
    return {};
  }
}

/**
 * Fetch server-authoritative timer for session.
 */
export async function fetchSessionTimer(
  baseUrl: string,
  sessionId: string
): Promise<{ total_seconds: number; elapsed_seconds: number; time_remaining_seconds: number; is_expired: boolean }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/timer`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Timer fetch failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Log behavioral integrity event to the backend audit log.
 */
export async function logEvent(
  baseUrl: string,
  sessionId: string,
  eventType: string,
  source: string,
  severity: string = 'info',
  confidence: number = 1.0,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/events`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        source,
        severity,
        confidence,
        metadata
      })
    });
  } catch (err) {
    console.warn('[Telemetry] Event transmission dropped:', err);
  }
}

/**
 * Finalize assessment session and receive scoring summary.
 */
export async function submitSession(
  baseUrl: string,
  sessionId: string
): Promise<SubmitSessionResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/submit`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Submit failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Pre-exam biometric face scan.
 */
export async function scanPreExamFace(
  baseUrl: string,
  imageBase64: string,
  candidateId?: string
): Promise<PreExamScanResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/proctor/pre-exam-scan`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      candidate_id: candidateId
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Pre-exam scan failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Analyze real-time camera frame with MediaPipe vision detector.
 */
export async function analyzeFrame(
  baseUrl: string,
  imageBase64: string,
  sessionId?: string
): Promise<AnalyzeFrameResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/proctor/analyze-frame`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      session_id: sessionId
    })
  });
  if (!response.ok) {
    throw new Error(`Frame analysis failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Unlock session using teacher code.
 */
export async function unlockWithTeacherCode(
  baseUrl: string,
  sessionId: string,
  teacherCode: string
): Promise<TeacherUnlockResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/unlock`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_code: teacherCode })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Teacher authorization failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Check proctor engine status.
 */
export async function fetchGroqEngineStatus(baseUrl: string): Promise<any> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/proctor/engine`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}
