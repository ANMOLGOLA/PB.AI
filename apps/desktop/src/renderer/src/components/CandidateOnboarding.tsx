import React, { useState } from 'react';
import { Shield, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { WebcamProctor } from './WebcamProctor';
import { PublicExam } from '../api/types';

interface CandidateOnboardingProps {
  exam: PublicExam;
  backendUrl: string;
  onProceedToRules: (candidateName: string, candidateId: string) => void;
  isLoading: boolean;
}

export const CandidateOnboarding: React.FC<CandidateOnboardingProps> = ({
  exam,
  backendUrl,
  onProceedToRules,
  isLoading
}) => {
  const [candidateName, setCandidateName] = useState('Parv Mishra');
  const [candidateId, setCandidateId] = useState('CAND-2026-001');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !candidateId.trim()) return;
    onProceedToRules(candidateName.trim(), candidateId.trim());
  };

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 0' }}>
      <div className="card" style={{ padding: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div className="brand-icon-box" style={{ width: '48px', height: '48px' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', letterSpacing: '0.05em' }}>
                Where U Elevate Assessment Center
              </span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Candidate Verification & Self-Check</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              {exam.title} &bull; {exam.total_questions} Questions &bull; {exam.duration_minutes} Minutes
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', margin: '24px 0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Candidate Full Name
              </label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.9375rem',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--color-surface)'
                }}
              />

              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '16px', marginBottom: '6px' }}>
                Candidate Registration ID
              </label>
              <input
                type="text"
                required
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '0.9375rem',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--color-surface)'
                }}
              />

              <div className="notice-box info" style={{ marginTop: '20px' }}>
                <Shield size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-accent)' }} />
                <div style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                  <strong>Proctoring Protection Active:</strong>
                  <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                    <li>Where U Elevate eye tracking verifies screen focus.</li>
                    <li>OS-level Kiosk locks window from Alt+Tab and overlays.</li>
                    <li>Hardware Content Protection blocks screen sharing/OBS.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Camera & Eye Tracking Self-Check
              </label>
              <WebcamProctor backendUrl={backendUrl} compact />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                <AlertCircle size={14} />
                <span>Verify that your eyes are tracked with green indicators.</span>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ padding: '12px 28px', fontSize: '1rem', fontWeight: 700 }}
            >
              <span>Continue to Exam Rules & Guidelines</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
