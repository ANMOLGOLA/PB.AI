import {
  HealthStatus,
  PublicExam,
  CandidateSession,
  AnalyzeFrameResult,
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
  candidateId: string
): Promise<CandidateSession> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_id: examId,
      candidate_name: candidateName,
      candidate_id: candidateId
    })
  });
  if (!response.ok) throw new Error(`Failed to create exam session: HTTP ${response.status}`);
  return response.json();
}

/**
 * Record an MCQ choice answer.
 */
export async function saveAnswer(
  baseUrl: string,
  sessionId: string,
  questionId: string,
  selectedChoiceId: string
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${sessionId}/answers/${questionId}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_choice_id: selectedChoiceId })
  });
}

/**
 * Log an integrity event (window blur, key blocked, etc.).
 */
export async function logEvent(
  baseUrl: string,
  sessionId: string,
  eventType: string,
  source: string,
  severity: string,
  confidence = 1.0,
  metadata: Record<string, unknown> = {}
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
    console.warn('Failed to log telemetry event:', err);
  }
}

/**
 * Send webcam frame to OpenCV computer vision analyzer.
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
  if (!response.ok) throw new Error(`Proctoring frame analysis failed: HTTP ${response.status}`);
  return response.json();
}

/**
 * Submit exam session and retrieve score & explainable integrity audit.
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
  if (!response.ok) throw new Error(`Exam submission failed: HTTP ${response.status}`);
  return response.json();
}
