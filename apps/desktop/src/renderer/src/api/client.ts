import { HealthStatus, PublicExam } from './types';

/**
 * Fetch health status from Sentinel Exam API.
 */
export async function fetchHealth(baseUrl: string): Promise<HealthStatus> {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API health check returned HTTP ${response.status}`);
  }

  const data: HealthStatus = await response.json();
  return data;
}

/**
 * Fetch public examination records from Sentinel Exam API.
 */
export async function fetchExams(baseUrl: string): Promise<PublicExam[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/exams`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API exam query returned HTTP ${response.status}`);
  }

  const data: PublicExam[] = await response.json();
  return data;
}
