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
