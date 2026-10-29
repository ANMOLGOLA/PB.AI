import React, { useState } from 'react';
import { Shield, Maximize2, AlertCircle, ArrowRight } from 'lucide-react';
import { WebcamProctor } from './WebcamProctor';
import { PublicExam } from '../api/types';

interface CandidateOnboardingProps {
  exam: PublicExam;
  backendUrl: string;
  onStartExam: (candidateName: string, candidateId: string) => void;
  isLoading: boolean;
}

export const CandidateOnboarding: React.FC<CandidateOnboardingProps> = ({
  exam,
  backendUrl,
  onStartExam,
  isLoading
}) => {
  const [candidateName, setCandidateName] = useState('Parv Mishra');
  const [candidateId, setCandidateId] = useState('CAND-2026-001');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !candidateId.trim()) return;
    onStartExam(candidateName.trim(), candidateId.trim());
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 0' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div className="brand-icon-box" style={{ width: '44px', height: '44px' }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 600 }}>Assessment Check-In & Proctoring Setup</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              {exam.title} &bull; {exam.total_questions} MCQs &bull; {exam.duration_minutes} Minutes
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', margin: '24px 0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Full Name
              </label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--color-surface)'
                }}
              />

              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '16px', marginBottom: '6px' }}>
                Candidate ID
              </label>
              <input
                type="text"
                required
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--color-surface)'
                }}
              />

              <div className="notice-box warning" style={{ marginTop: '20px' }}>
                <Maximize2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8125rem' }}>
                  <strong>Mandatory Lockdown Protocol:</strong>
                  <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                    <li>The assessment runs in mandatory full-screen mode.</li>
                    <li>Tab switching, window unfocusing, and desktop shortcuts are audited.</li>
                    <li>Webcam feeds are continuously analyzed by OpenCV computer vision.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Webcam Self-Check
              </label>
              <WebcamProctor backendUrl={backendUrl} compact />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                <AlertCircle size={14} />
                <span>Ensure your face is well lit and centered inside the camera reticle.</span>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 600 }}
            >
              <span>{isLoading ? 'Entering Secure Environment...' : 'Enter Full-Screen & Begin Assessment'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
