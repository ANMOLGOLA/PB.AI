export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  database: string;
}

export interface PublicChoice {
  id: string;
  choice_letter: string;
  text: string;
}

export interface PublicQuestion {
  id: string;
  question_number: number;
  text: string;
  choices: PublicChoice[];
}

export interface PublicExam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  total_questions: number;
  questions: PublicQuestion[];
}

export type ConnectionState = 'loading' | 'connected' | 'disconnected' | 'error';

export interface CandidateSession {
  id: string;
  exam_id: string;
  candidate_name: string;
  candidate_id: string;
  status: string;
  started_at: string;
  duration_minutes: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalyzeFrameResult {
  face_detected: boolean;
  face_count: number;
  confidence: number;
  status: 'verified' | 'no_face' | 'multiple_faces' | string;
  bounding_boxes: BoundingBox[];
}

export interface IntegrityEventRecord {
  id: string;
  session_id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  severity: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface SubmitSessionResult {
  session_id: string;
  status: string;
  score: number;
  total_questions: number;
  percentage: number;
  submitted_at: string;
  events_summary: Record<string, number>;
  events: IntegrityEventRecord[];
}
