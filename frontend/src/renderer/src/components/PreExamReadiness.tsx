import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Monitor,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Lock,
  RefreshCw
} from 'lucide-react';
import { PublicExam, CandidateSession } from '../api/types';
import { ScreenSource, ScreenSourcePicker } from './ScreenSourcePicker';
import { ScreenShareState } from '../hooks/useScreenShare';
import { startAssessmentSession } from '../api/client';

interface PreExamReadinessProps {
  exam: PublicExam;
  session: CandidateSession;
  backendUrl: string;
  screenShareState: ScreenShareState;
  screenShareSourceName: string;
  screenShareError: string | null;
  onStartShare: (source: ScreenSource | null, externalWebcamStream?: MediaStream | null) => Promise<void>;
  onStopShare: () => Promise<void>;
  onEnterExam: () => void;
  onBack: () => void;
}

export const PreExamReadiness: React.FC<PreExamReadinessProps> = ({
  exam,
  session,
  backendUrl,
  screenShareState,
  screenShareSourceName,
  screenShareError,
  onStartShare,
  onStopShare,
  onEnterExam,
  onBack
}) => {
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Webcam self-check video preview
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const hasEnteredExamRef = useRef<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 480, height: 360 }, audio: false })
      .then((stream) => {
        currentStream = stream;
        localCameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => console.warn('[PreExamReadiness] Video play error:', err));
        }
        setCameraActive(true);
        setCameraError(null);
      })
      .catch((err) => {
        console.warn('Webcam preview error:', err);
        setCameraError('Unable to access camera hardware. Check camera permissions.');
      });

    return () => {
      // Only stop local tracks if NOT proceeding into active exam
      if (!hasEnteredExamRef.current && currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // When screen sharing transitions to active or ready, verify against backend session gate
  useEffect(() => {
    const isStreaming = screenShareState === 'active' || screenShareState === 'ready';
    if (isStreaming && !isVerified && !isVerifying) {
      setIsVerifying(true);
      setVerifyError(null);

      startAssessmentSession(backendUrl, session.id)
        .then(() => {
          setIsVerified(true);
          setIsVerifying(false);
        })
        .catch((err) => {
          console.warn('Backend start verification failed:', err);
          setVerifyError(err.message || 'Screen sharing verification failed. Please try sharing again.');
          setIsVerifying(false);
          setIsVerified(false);
        });
    } else if (!isStreaming && isVerified) {
      // Screen share was stopped or interrupted
      setIsVerified(false);
    }
  }, [screenShareState, isVerified, isVerifying, backendUrl, session.id]);

  const handleSelectSource = async (source: ScreenSource | null) => {
    setShowPicker(false);
    setVerifyError(null);
    try {
      await onStartShare(source, localCameraStreamRef.current);
    } catch (err: any) {
      setVerifyError(err?.message || 'Failed to capture screen.');
    }
  };

  const handleConfirmEnterExam = () => {
    hasEnteredExamRef.current = true;
    onEnterExam();
  };

  const isShareActive = screenShareState === 'active' || screenShareState === 'ready';

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 0 48px' }}>
      <div className="card" style={{ padding: '36px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: '20px',
            marginBottom: '28px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  letterSpacing: '0.05em'
                }}
              >
                Where U Elevate &bull; Final Verification
              </span>
            </div>
            <h2 style={{ fontSize: '1.625rem', fontWeight: 800 }}>Pre-Exam Readiness &amp; Screen Verification</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
              Candidate: <strong>{session.candidate_name}</strong> &bull; Assessment: <strong>{exam.title}</strong>
            </p>
          </div>

          <span className="status-badge connected">
            <Lock size={14} /> Mandatory Gating
          </span>
        </div>

        {/* 2-Column Readiness Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          {/* Card 1: Webcam Self-Check */}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-muted)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="var(--color-accent)" />
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Webcam Self-Check</h4>
              </div>
              {cameraActive ? (
                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> Ready
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 700 }}>Action Required</span>
              )}
            </div>

            <div
              style={{
                width: '100%',
                height: '180px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#0F172A',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {cameraError ? (
                <div style={{ color: '#F87171', padding: '16px', textAlign: 'center', fontSize: '0.8125rem' }}>
                  <AlertCircle size={24} style={{ marginBottom: '6px' }} />
                  <div>{cameraError}</div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
              )}
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '12px', lineHeight: 1.4 }}>
              Ensure your face is well-lit and directly centered. Background MediaPipe tracking will monitor head orientation throughout the session.
            </p>
          </div>

          {/* Card 2: Mandatory Screen Sharing Verification */}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: isVerified ? '2px solid #10B981' : isShareActive ? '2px solid #3B82F6' : '1px solid var(--color-border)',
              backgroundColor: isVerified ? '#F0FDF4' : 'var(--color-surface)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={18} color={isVerified ? '#10B981' : 'var(--color-accent)'} />
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Screen Sharing (Mandatory)</h4>
              </div>

              {isVerified ? (
                <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> Verified
                </span>
              ) : isShareActive ? (
                <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={14} className="spin" /> Verifying...
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 700 }}>Required</span>
              )}
            </div>

            {/* Screen Sharing Status Message Box */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isVerified ? '#DCFCE7' : isShareActive ? '#EFF6FF' : '#F8FAFC',
                border: `1px solid ${isVerified ? '#86EFAC' : isShareActive ? '#BFDBFE' : '#E2E8F0'}`,
                marginBottom: '14px'
              }}
            >
              {isVerified ? (
                <>
                  <CheckCircle2 size={32} color="#16A34A" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#166534' }}>
                    You're ready to begin
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#15803D', marginTop: '4px' }}>
                    Streaming: <strong>{screenShareSourceName}</strong>
                  </div>
                </>
              ) : isShareActive ? (
                <>
                  <RefreshCw size={28} color="#2563EB" className="spin" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1E40AF' }}>
                    Connecting screen share stream...
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#3B82F6', marginTop: '4px' }}>
                    Validating backend session coordinator
                  </div>
                </>
              ) : screenShareState === 'interrupted' || screenShareState === 'stopped' ? (
                <>
                  <AlertCircle size={32} color="#DC2626" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#991B1B' }}>
                    Screen sharing stopped. Resume sharing to continue
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#B91C1C', marginTop: '4px' }}>
                    Screen sharing is required. Allow access and try again
                  </div>
                </>
              ) : (
                <>
                  <Monitor size={32} color="#64748B" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#334155' }}>
                    Share your screen to begin the assessment
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '4px' }}>
                    Authorized examiners will view your display in real-time
                  </div>
                </>
              )}
            </div>

            {verifyError && (
              <div style={{ fontSize: '0.75rem', color: '#DC2626', marginBottom: '10px', textAlign: 'center', fontWeight: 600 }}>
                {verifyError}
              </div>
            )}
            {screenShareError && !verifyError && (
              <div style={{ fontSize: '0.75rem', color: '#DC2626', marginBottom: '10px', textAlign: 'center', fontWeight: 600 }}>
                {screenShareError}
              </div>
            )}

            {/* Share / Stop Sharing Action Button */}
            {!isShareActive ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowPicker(true)}
                style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <Monitor size={16} />
                <span>Share Screen</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onStopShare}
                style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <span>Change / Stop Screen Share</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Bottom Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '24px'
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} /> Back to Rules
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!isVerified && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                Screen sharing verification required to enter
              </span>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={!isVerified}
              onClick={handleConfirmEnterExam}
              style={{
                padding: '12px 32px',
                fontSize: '1rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                cursor: !isVerified ? 'not-allowed' : 'pointer',
                opacity: !isVerified ? 0.5 : 1
              }}
            >
              <ShieldCheck size={18} />
              <span>Enter Exam</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Screen Source Picker Modal */}
      <ScreenSourcePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelectSource={handleSelectSource}
      />
    </div>
  );
};
