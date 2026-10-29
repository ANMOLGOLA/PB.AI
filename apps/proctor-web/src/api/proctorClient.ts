/**
 * Typed Proctor API Client for Sentinel Exam
 */

export interface CandidateSessionSummary {
  session_id: string;
  candidate_name: string;
  candidate_id: string;
  exam_id: string;
  exam_title: string;
  status: string;
  is_locked: number;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  is_screen_active: boolean;
  integrity_events_count: number;
}

export interface IncidentEventRecord {
  id: string;
  session_id: string;
  candidate_name?: string;
  candidate_id?: string;
  exam_title?: string;
  event_type: string;
  occurred_at: string;
  source: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  metadata: Record<string, any>;
  review_status: 'unreviewed' | 'reviewed' | 'dismissed' | 'escalated';
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface OverviewMetrics {
  status: string;
  system_time: string;
  assessments_count: number;
  exams: Array<{
    id: string;
    title: string;
    duration_minutes: number;
    total_questions: number;
    assigned_proctors: string[];
  }>;
  candidates: {
    total: number;
    active: number;
    submitted: number;
    locked: number;
    live_screens_streaming: number;
  };
  incidents: {
    total: number;
    unreviewed: number;
    escalated: number;
    dismissed: number;
    reviewed: number;
    breakdown_by_severity: {
      critical: number;
      high: number;
      medium: number;
      info: number;
    };
  };
  assigned_proctors: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
}

export interface SessionComprehensiveReport {
  report_id: string;
  generated_at: string;
  candidate: {
    name: string;
    id: string;
    face_id: string;
  };
  assessment: {
    id: string;
    title: string;
    allocated_duration_minutes: number;
  };
  session: {
    session_id: string;
    status: string;
    is_locked: boolean;
    started_at: string;
    submitted_at: string | null;
    duration_seconds: number;
    duration_formatted: string;
    score: number | null;
    total_questions: number;
    percentage: number | null;
  };
  integrity_summary: {
    verdict: string;
    total_events: number;
    incident_types: Record<string, number>;
    review_outcomes: Record<string, number>;
  };
  events_timeline: IncidentEventRecord[];
}

export interface ReviewDecisionPayload {
  status: 'reviewed' | 'dismissed' | 'escalated';
  reason?: string;
  proctor_id?: string;
}

export interface CreateAssessmentPayload {
  title: string;
  description: string;
  duration_minutes: number;
  questions?: Array<{
    question_number: number;
    text: string;
    choices: Array<{
      choice_letter: string;
      text: string;
      is_correct?: boolean;
    }>;
  }>;
}

export const resolveBackendUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '127.0.0.1';
    if (window.location.port === '5174' || window.location.port === '5173') {
      return `http://${host}:8000`;
    }
    return window.location.origin;
  }
  return 'http://127.0.0.1:8000';
};

export async function fetchOverview(backendUrl: string, authCode: string): Promise<OverviewMetrics> {
  const res = await fetch(`${backendUrl}/api/examiner/overview?auth_code=${encodeURIComponent(authCode)}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error('Invalid examiner authorization code.');
    throw new Error(`Failed to fetch overview: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSessions(backendUrl: string, authCode: string): Promise<CandidateSessionSummary[]> {
  const res = await fetch(`${backendUrl}/api/examiner/sessions?auth_code=${encodeURIComponent(authCode)}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error('Invalid examiner authorization code.');
    throw new Error(`Failed to list candidate sessions: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSessionDetail(backendUrl: string, sessionId: string, authCode: string) {
  const res = await fetch(`${backendUrl}/api/examiner/sessions/${sessionId}?auth_code=${encodeURIComponent(authCode)}`);
  if (!res.ok) {
    throw new Error(`Failed to load session details: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchIncidents(
  backendUrl: string,
  authCode: string,
  filters?: {
    sessionId?: string;
    severity?: string;
    reviewStatus?: string;
    eventType?: string;
  }
): Promise<IncidentEventRecord[]> {
  const params = new URLSearchParams({ auth_code: authCode });
  if (filters?.sessionId) params.append('session_id', filters.sessionId);
  if (filters?.severity && filters.severity !== 'all') params.append('severity', filters.severity);
  if (filters?.reviewStatus && filters.reviewStatus !== 'all') params.append('review_status', filters.reviewStatus);
  if (filters?.eventType && filters.eventType !== 'all') params.append('event_type', filters.eventType);

  const res = await fetch(`${backendUrl}/api/examiner/incidents?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load incidents queue: ${res.statusText}`);
  }
  return res.json();
}

export async function submitReviewDecision(
  backendUrl: string,
  eventId: string,
  authCode: string,
  payload: ReviewDecisionPayload
) {
  const res = await fetch(`${backendUrl}/api/examiner/events/${eventId}/review?auth_code=${encodeURIComponent(authCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to submit review decision: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSessionReport(
  backendUrl: string,
  sessionId: string,
  authCode: string
): Promise<SessionComprehensiveReport> {
  const res = await fetch(`${backendUrl}/api/examiner/sessions/${sessionId}/report?auth_code=${encodeURIComponent(authCode)}`);
  if (!res.ok) {
    throw new Error(`Failed to generate session report: ${res.statusText}`);
  }
  return res.json();
}

export async function terminateCandidateSession(
  backendUrl: string,
  sessionId: string,
  authCode: string,
  reason: string,
  proctorId?: string
) {
  const res = await fetch(`${backendUrl}/api/examiner/sessions/${sessionId}/terminate?auth_code=${encodeURIComponent(authCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, proctor_id: proctorId || 'PROCTOR-LEAD-01' })
  });
  if (!res.ok) {
    throw new Error(`Failed to terminate candidate session: ${res.statusText}`);
  }
  return res.json();
}

export async function remoteUnlockCandidate(backendUrl: string, sessionId: string, authCode: string) {
  const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher_code: authCode })
  });
  if (!res.ok) {
    throw new Error(`Failed to unlock session: ${res.statusText}`);
  }
  return res.json();
}

export async function createAssessment(backendUrl: string, authCode: string, payload: CreateAssessmentPayload) {
  const res = await fetch(`${backendUrl}/api/examiner/exams?auth_code=${encodeURIComponent(authCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to create assessment: ${res.statusText}`);
  }
  return res.json();
}
