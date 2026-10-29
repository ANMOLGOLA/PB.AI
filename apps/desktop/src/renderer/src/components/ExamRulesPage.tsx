import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  ArrowLeft,
  Lock
} from 'lucide-react';
import { PublicExam } from '../api/types';

interface ExamRulesPageProps {
  exam: PublicExam;
  candidateName: string;
  candidateId: string;
  onAcceptRules: () => void;
  onBack: () => void;
}

export const ExamRulesPage: React.FC<ExamRulesPageProps> = ({
  exam,
  candidateName,
  candidateId,
  onAcceptRules,
  onBack
}) => {
  const [agreedItems, setAgreedItems] = useState<{ [key: string]: boolean }>({
    noEyewear: false,
    properPosture: false,
    noDevices: false,
    lockdownAgreed: false,
    aiConsent: false
  });

  const toggleCheck = (key: string) => {
    setAgreedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allAgreed = Object.values(agreedItems).every(Boolean);

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px 0 40px' }}>
      <div className="card" style={{ padding: '32px' }}>
        {/* Banner Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '20px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', letterSpacing: '0.05em' }}>
                Where U Elevate &bull; Proctoring Protocol
              </span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Examination Rules & Candidate Guidelines</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
              Candidate: <strong>{candidateName}</strong> ({candidateId}) &bull; Assessment: <strong>{exam.title}</strong>
            </p>
          </div>

          <span className="status-badge connected">
            <Lock size={14} /> Fullscreen Kiosk Protocol
          </span>
        </div>

        {/* Visual Guidelines Grid */}
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '16px' }}>
          Visual Posture & Environment Standards
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {/* Card 1: Approved Posture */}
          <div
            style={{
              border: '2px solid #10B981',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              backgroundColor: '#F0FDF4',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>
                Rule 1: Approved Posture
              </span>
              <CheckCircle2 size={18} color="#10B981" />
            </div>

            {/* SVG Visual: Centered Face in Reticle */}
            <div style={{ width: '100%', height: '140px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Camera boundary box */}
                <rect x="10" y="10" width="100" height="100" rx="8" stroke="#10B981" strokeWidth="2" strokeDasharray="6 4" />
                {/* Person Head & Shoulders */}
                <circle cx="60" cy="50" r="22" fill="#E2E8F0" stroke="#0F172A" strokeWidth="2" />
                <path d="M28 102 C28 82 42 74 60 74 C78 74 92 82 92 102" fill="#CBD5E1" stroke="#0F172A" strokeWidth="2" />
                {/* Direct Eyes */}
                <circle cx="52" cy="48" r="3" fill="#0F172A" />
                <circle cx="68" cy="48" r="3" fill="#0F172A" />
                <path d="M54 58 Q60 63 66 58" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
                {/* Green Sightline Arrow */}
                <circle cx="60" cy="48" r="36" stroke="#10B981" strokeWidth="1.5" />
              </svg>
            </div>

            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
              Sit Upright & Center Face
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#047857', lineHeight: 1.5 }}>
              Position your face directly in the center of the camera. Maintain continuous eye contact with the monitor.
            </p>
          </div>

          {/* Card 2: Prohibited Eyewear */}
          <div
            style={{
              border: '2px solid #EF4444',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              backgroundColor: '#FEF2F2',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                Rule 2: No Tinted Eyewear
              </span>
              <AlertOctagon size={18} color="#EF4444" />
            </div>

            {/* SVG Visual: Sunglasses with Prohibition Slash */}
            <div style={{ width: '100%', height: '140px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', position: 'relative' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Head Silhouette */}
                <circle cx="60" cy="50" r="24" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
                {/* Dark Sunglasses */}
                <rect x="36" y="42" width="20" height="14" rx="3" fill="#0F172A" stroke="#0F172A" strokeWidth="2" />
                <rect x="64" y="42" width="20" height="14" rx="3" fill="#0F172A" stroke="#0F172A" strokeWidth="2" />
                <line x1="56" y1="48" x2="64" y2="48" stroke="#0F172A" strokeWidth="2" />
                {/* Red Prohibition Circle with Diagonal Slash */}
                <circle cx="60" cy="54" r="38" stroke="#DC2626" strokeWidth="3" />
                <line x1="33" y1="27" x2="87" y2="81" stroke="#DC2626" strokeWidth="3" />
              </svg>
            </div>

            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#991B1B', marginBottom: '4px' }}>
              No Sunglasses or Smart Glasses
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#B91C1C', lineHeight: 1.5 }}>
              Dark lenses, tinted eyewear, and smart glasses are strictly prohibited. Eyes must remain 100% visible for gaze tracking.
            </p>
          </div>

          {/* Card 3: Prohibited Devices & Audio */}
          <div
            style={{
              border: '2px solid #EF4444',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              backgroundColor: '#FEF2F2',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                Rule 3: No Headphones / Devices
              </span>
              <AlertOctagon size={18} color="#EF4444" />
            </div>

            {/* SVG Visual: Headphones & Phone with Slash */}
            <div style={{ width: '100%', height: '140px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', position: 'relative' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Over-ear headphones */}
                <path d="M35 55 C35 34 85 34 85 55" stroke="#334155" strokeWidth="3" fill="none" />
                <rect x="30" y="52" width="10" height="20" rx="3" fill="#0F172A" />
                <rect x="80" y="52" width="10" height="20" rx="3" fill="#0F172A" />
                {/* Mobile Phone */}
                <rect x="52" y="58" width="16" height="28" rx="2" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1.5" />
                {/* Red Prohibition Slash */}
                <circle cx="60" cy="54" r="38" stroke="#DC2626" strokeWidth="3" />
                <line x1="33" y1="27" x2="87" y2="81" stroke="#DC2626" strokeWidth="3" />
              </svg>
            </div>

            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#991B1B', marginBottom: '4px' }}>
              No Earphones or Phones
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#B91C1C', lineHeight: 1.5 }}>
              All AirPods, wireless/wired headsets, smartwatches, and smartphones must be powered off and removed from the testing area.
            </p>
          </div>
        </div>

        {/* Anti-Escape & Overlay Lockdown Callout */}
        <div className="notice-box info" style={{ marginBottom: '28px', padding: '18px' }}>
          <Lock size={22} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-accent)' }} />
          <div>
            <strong style={{ fontSize: '0.9375rem' }}>Strict Anti-Escape & Anti-Overlay Lockdown Enforced</strong>
            <p style={{ fontSize: '0.8125rem', marginTop: '6px', lineHeight: 1.6 }}>
              Upon entering the assessment, Sentinel Exam enforces <strong>OS-level Kiosk lockdown</strong>.
              You cannot exit full-screen, switch windows (<code>Alt+Tab</code> blocked), open developer tools,
              or use screen capture/overlay utilities (OBS, Discord, or Game Bar overlays are blocked via hardware Content Protection).
              Attempting to defocus the window will immediately log an audit anomaly.
            </p>
          </div>
        </div>

        {/* Mandatory Agreement Checklist */}
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, marginBottom: '12px' }}>
          Candidate Mandatory Acknowledgement Checklist
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: agreedItems.noEyewear ? '#EEF2FF' : 'var(--color-surface)', border: `1px solid ${agreedItems.noEyewear ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedItems.noEyewear}
              onChange={() => toggleCheck('noEyewear')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              I have removed all sunglasses, tinted lenses, and smart eyewear. My eyes are 100% uncovered.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: agreedItems.properPosture ? '#EEF2FF' : 'var(--color-surface)', border: `1px solid ${agreedItems.properPosture ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedItems.properPosture}
              onChange={() => toggleCheck('properPosture')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              I am seated upright facing the monitor with direct lighting and no secondary individuals in the room.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: agreedItems.noDevices ? '#EEF2FF' : 'var(--color-surface)', border: `1px solid ${agreedItems.noDevices ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedItems.noDevices}
              onChange={() => toggleCheck('noDevices')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              I have removed all headphones, earbuds, smartwatches, and secondary screens.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: agreedItems.lockdownAgreed ? '#EEF2FF' : 'var(--color-surface)', border: `1px solid ${agreedItems.lockdownAgreed ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedItems.lockdownAgreed}
              onChange={() => toggleCheck('lockdownAgreed')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              I understand that mandatory full-screen lockdown will be enforced and exiting or switching apps is strictly audited.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: agreedItems.aiConsent ? '#EEF2FF' : 'var(--color-surface)', border: `1px solid ${agreedItems.aiConsent ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreedItems.aiConsent}
              onChange={() => toggleCheck('aiConsent')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              I consent to continuous MediaPipe computer-vision eye tracking, face detection, and Where U Elevate audit logging.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} /> Back to Details
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!allAgreed}
            onClick={onAcceptRules}
            style={{
              padding: '12px 28px',
              fontSize: '1rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span>{allAgreed ? 'Launch Lockdown & Begin Assessment' : 'Acknowledge All Rules to Proceed'}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
