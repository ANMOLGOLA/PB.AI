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
  if (!response.ok) throw new Error(`Failed to create exam session: HTTP ${response.status}`);
  return response.json();
}

/**
 * Perform pre-exam candidate biometric identity scan and environment phone/device detection.
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
  if (!response.ok) throw new Error(`Pre-exam biometric scan failed: HTTP ${response.status}`);
  return response.json();
}

export const scanPreExamFaceAndEar = scanPreExamFace;

/**
 * Check whether Groq or Gemini Vision engine is configured on backend.
 */
export async function fetchGroqEngineStatus(baseUrl: string): Promise<{
  engine: string;
  model: string;
  gemini_model?: string;
  groq_configured: boolean;
  gemini_configured?: boolean;
}> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/proctor/engine`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return { engine: 'fallback_local', model: 'llama-3.2-11b-vision-preview', groq_configured: false };
  return response.json();
}

/**
 * Configure Groq and/or Gemini API Keys on backend.
 */
export async function configureGroqEngine(
  baseUrl: string,
  apiKey: string,
  geminiApiKey?: string,
  model = 'llama-3.2-11b-vision-preview'
): Promise<{ configured: boolean; engine: string; message: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/proctor/engine/configure`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, gemini_api_key: geminiApiKey, model })
  });
  if (!response.ok) throw new Error('Failed to configure vision engine');
  return response.json();
}

/**
 * Unlock a session locked out due to reaching 5 integrity warnings using teacher code.
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
 * Send webcam frame to OpenCV / MediaPipe proctoring analyzer.
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
