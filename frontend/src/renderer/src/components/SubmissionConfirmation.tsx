import React from 'react';
import { CheckCircle2, ShieldCheck, LogOut, Clock } from 'lucide-react';
import { SubmitSessionResult } from '../api/types';

interface SubmissionConfirmationProps {
  result: SubmitSessionResult;
  candidateName: string;
  candidateId: string;
  examTitle: string;
}

export const SubmissionConfirmation: React.FC<SubmissionConfirmationProps> = ({
  result,
  candidateName,
  candidateId,
  examTitle
}) => {
  const handleExit = () => {
    if (window.sentinelBridge && window.sentinelBridge.closeApp) {
      window.sentinelBridge.closeApp();
    } else {
      window.close();
    }
  };

  const formattedTime = result.submitted_at
    ? new Date(result.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : new Date().toLocaleTimeString();

  return (
    <div
      style={{
        maxWidth: '680px',
        margin: '40px auto',
        padding: '0 20px'
      }}
    >
      <div
        className="card"
        style={{
          padding: '48px 40px',
          textAlign: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          border: '1px solid var(--color-border)'
        }}
      >
        {/* Success Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: '#10B981',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}
        >
          <CheckCircle2 size={36} strokeWidth={2.5} />
        </div>

        {/* Title & Brand Tagline */}
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#0F172A',
            marginBottom: '8px',
            letterSpacing: '-0.02em'
          }}
        >
          Assessment Successfully Submitted
        </h2>

        <p
          style={{
            color: '#64748B',
            fontSize: '0.9375rem',
            lineHeight: 1.5,
            marginBottom: '32px'
          }}
        >
          Your answers have been securely recorded and finalized for <strong>Where U Elevate</strong> evaluation.
        </p>

        {/* Summary Details Card */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'left',
            marginBottom: '32px',
            border: '1px solid #E2E8F0'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              fontSize: '0.875rem'
            }}
          >
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Candidate
              </span>
              <strong style={{ color: '#0F172A', fontSize: '0.9375rem' }}>{candidateName}</strong>
              <div style={{ color: '#64748B', fontSize: '0.8125rem' }}>ID: {candidateId}</div>
            </div>

            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Assessment
              </span>
              <strong style={{ color: '#0F172A', fontSize: '0.9375rem' }}>{examTitle}</strong>
              <div style={{ color: '#64748B', fontSize: '0.8125rem' }}>{result.total_questions} Questions</div>
            </div>

            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Status
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#10B981',
                  fontWeight: 700,
                  fontSize: '0.875rem'
                }}
              >
                <ShieldCheck size={16} />
                Submitted &amp; Verified
              </span>
            </div>

            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Submission Time
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0F172A', fontWeight: 600 }}>
                <Clock size={15} color="#64748B" />
                <span>{formattedTime}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #E2E8F0',
              fontSize: '0.75rem',
              color: '#94A3B8',
              fontFamily: 'monospace'
            }}
          >
            Session ID: {result.session_id}
          </div>
        </div>

        {/* Notice Message */}
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '10px',
            padding: '14px 18px',
            fontSize: '0.8125rem',
            color: '#1E40AF',
            textAlign: 'left',
            marginBottom: '32px',
            lineHeight: 1.5
          }}
        >
          All proctoring video streams and screen capture sessions have been terminated. Official assessment scores and feedback will be published on the Where U Elevate talent portal. You may now close this window safely.
        </div>

        {/* Exit Button */}
        <button
          type="button"
          onClick={handleExit}
          className="btn btn-primary"
          style={{
            padding: '12px 32px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            margin: '0 auto'
          }}
        >
          <LogOut size={16} />
          <span>Exit Application</span>
        </button>
      </div>
    </div>
  );
};
