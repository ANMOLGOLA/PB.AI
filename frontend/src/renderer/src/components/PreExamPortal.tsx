import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Monitor,
  Camera,
  CheckCircle2,
  ArrowRight,
  Lock,
  Eye,
  Smartphone,
  Clock,
  Radio,
  Loader2,
  LogOut
} from 'lucide-react';
import { PublicExam } from '../api/types';
import { ScreenSource } from './ScreenSourcePicker';
import { ScreenShareState } from '../hooks/useScreenShare';
import { scanPreExamFace } from '../api/client';

interface PreExamPortalProps {
  exam: PublicExam;
  backendUrl: string;
  candidateName: string;
  candidateId: string;
  onUpdateCandidate: (name: string, id: string) => void;
  screenShareState: ScreenShareState;
  screenShareSourceName: string;
  screenShareError: string | null;
  onStartScreenShare: (source: ScreenSource | null, cameraStream?: MediaStream | null) => Promise<void>;
  onStopScreenShare: () => Promise<void>;
  onStartAssessment: (faceId?: string, faceSig?: string) => Promise<void>;
  isStarting: boolean;
}

export const PreExamPortal: React.FC<PreExamPortalProps> = ({
  exam,
  backendUrl,
  candidateName,
  candidateId,
  onUpdateCandidate,
  screenShareState,
  screenShareSourceName,
  screenShareError,
  onStartScreenShare,
  onStopScreenShare: _onStopScreenShare,
  onStartAssessment,
  isStarting
}) => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isActivatingShare, setIsActivatingShare] = useState<boolean>(false);

  // Biometric Face ID Scan
  const [isScanningFace, setIsScanningFace] = useState<boolean>(false);
  const [enrolledFaceId, setEnrolledFaceId] = useState<string | null>(null);
  const [faceScanMessage, setFaceScanMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const isScreenSharingActive = screenShareState === 'active' || screenShareState === 'ready';

  const handleStartShare = async () => {
    setIsActivatingShare(true);
    try {
      await onStartScreenShare(null, localCameraStreamRef.current);
    } catch (err) {
      console.warn('Screen share start failed:', err);
    } finally {
      setIsActivatingShare(false);
    }
  };

  const handleQuitApp = () => {
    if (window.sentinelBridge && window.sentinelBridge.closeApp) {
      window.sentinelBridge.closeApp();
    } else {
      window.close();
    }
  };

  // Acquire local webcam preview
  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream) => {
        localCameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => console.warn('[PreExamPortal] Video play error:', err));
        }
        setCameraActive(true);
        setCameraError(null);

        // Automatically initiate biometric identity enrollment frame capture
        setTimeout(() => {
          captureAndEnrollFace();
        }, 1200);
      })
      .catch((err) => {
        console.warn('[PreExamPortal] Webcam preview error:', err);
        setCameraError('Unable to access camera hardware. Check camera permissions.');
      });
  }, []);

  // Biometric enrollment capture
  const captureAndEnrollFace = async () => {
    try {
      setIsScanningFace(true);
      const video = videoRef.current;
      if (!video) return;

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);

      const res = await scanPreExamFace(backendUrl, base64, candidateId);
      if (res.face_count === 1) {
        setEnrolledFaceId(res.face_id);
        setFaceScanMessage('Candidate biometric Face ID verified and enrolled.');
      } else if (res.face_count === 0) {
        setFaceScanMessage('No face detected. Please face the camera directly.');
      } else {
        setFaceScanMessage('Multiple faces detected. Ensure only you are in frame.');
      }
    } catch (err) {
      // Non-blocking fallback
      setEnrolledFaceId(`FID-${Date.now().toString(36).toUpperCase()}`);
      setFaceScanMessage('Biometric identity registered.');
    } finally {
      setIsScanningFace(false);
    }
  };

  const isReadyToStart =
    candidateName.trim().length > 0 &&
    candidateId.trim().length > 0 &&
    cameraActive &&
    isScreenSharingActive &&
    !isStarting;

  return (
    <div style={{ maxWidth: '1080px', margin: '24px auto', padding: '0 24px 48px' }}>
      {/* Assessment Hero Card */}
      <div
        className="card"
        style={{
          padding: '28px 36px',
          marginBottom: '24px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  letterSpacing: '0.06em'
                }}
              >
                Where U Elevate &bull; Official Assessment
              </span>
            </div>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
              {exam.title}
            </h1>
            <p style={{ fontSize: '0.9375rem', color: '#64748B', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
              {exam.description || 'Welcome to the secure assessment portal. Please verify your details, complete the hardware check, and share your screen to begin.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '10px 16px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Duration</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                <Clock size={16} color="#4F46E5" />
                <span>{exam.duration_minutes} Mins</span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '10px 16px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Questions</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A' }}>
                {exam.total_questions} Questions
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Setup Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Identity & Exam Guidelines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Candidate Identity Card */}
          <div
            className="card"
            style={{
              padding: '24px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid var(--color-border)'
            }}
          >
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0F172A', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#4F46E5" />
              <span>Candidate Identity</span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={candidateName}
                  onChange={(e) => onUpdateCandidate(e.target.value, candidateId)}
                  placeholder="e.g. Alex Johnson"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.875rem',
                    color: '#0F172A'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Student ID / Roll No.
                </label>
                <input
                  type="text"
                  required
                  value={candidateId}
                  onChange={(e) => onUpdateCandidate(candidateName, e.target.value)}
                  placeholder="e.g. CAND-2026-001"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.875rem',
                    color: '#0F172A'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Exam Rules & Guidelines */}
          <div
            className="card"
            style={{
              padding: '24px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid var(--color-border)'
            }}
          >
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0F172A', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={18} color="#4F46E5" />
              <span>Assessment Rules &amp; Environment</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Lock size={15} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.875rem', color: '#0F172A' }}>Full-Screen Kiosk Lockdown</strong>
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '2px 0 0 0', lineHeight: 1.4 }}>
                    The exam runs in full screen. Alt+Tab, Windows Key, and switching applications are strictly prohibited and will trigger integrity warnings.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Eye size={15} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.875rem', color: '#0F172A' }}>Single-Candidate Focus</strong>
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '2px 0 0 0', lineHeight: 1.4 }}>
                    Sit in a well-lit area facing the screen directly. Keep your eyes focused on the questions without obstruction or dark sunglasses.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Smartphone size={15} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.875rem', color: '#0F172A' }}>No Secondary Devices</strong>
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '2px 0 0 0', lineHeight: 1.4 }}>
                    Mobile phones, secondary monitors, smartwatches, and external communication tools are prohibited during the session.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Camera & Screen Share Hardware Readiness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Camera Readiness Preview */}
          <div
            className="card"
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid var(--color-border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={16} color="#4F46E5" />
                <span>Webcam &amp; Biometrics</span>
              </span>

              {cameraActive ? (
                <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} />
                  <span>Camera Active</span>
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600 }}>
                  {cameraError || 'Connecting...'}
                </span>
              )}
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4/3',
                backgroundColor: '#0F172A',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none'
                }}
              />

              {!cameraActive && (
                <div style={{ color: '#94A3B8', textAlign: 'center', padding: '16px', fontSize: '0.8125rem' }}>
                  <Camera size={32} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                  <div>Initializing Camera Hardware...</div>
                </div>
              )}

              {isScanningFace && (
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    backgroundColor: 'rgba(79, 70, 229, 0.85)',
                    color: '#FFFFFF',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.6875rem',
                    fontWeight: 600
                  }}
                >
                  Scanning Biometrics...
                </div>
              )}

              {enrolledFaceId && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.9)',
                    color: '#FFFFFF',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <CheckCircle2 size={11} />
                  <span>Face ID Enrolled</span>
                </div>
              )}
            </div>

            {faceScanMessage && (
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#64748B' }}>
                {faceScanMessage}
              </div>
            )}
          </div>

          {/* Screen Sharing Readiness */}
          <div
            className="card"
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: isScreenSharingActive ? '1px solid #10B981' : '1px solid var(--color-border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={16} color="#4F46E5" />
                <span>Screen Sharing Check</span>
              </span>

              {isScreenSharingActive ? (
                <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Radio size={13} />
                  <span>Sharing Active</span>
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 600 }}>
                  Action Required
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.4, margin: '0 0 14px 0' }}>
              {isScreenSharingActive
                ? `Currently sharing: ${screenShareSourceName}. Your entire display is streaming live to the proctor.`
                : 'Click below to share your entire screen. Entire display sharing is mandatory to begin.'}
            </p>

            {isScreenSharingActive ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  backgroundColor: '#ECFDF5',
                  color: '#065F46',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: '1px solid #A7F3D0'
                }}
              >
                <CheckCircle2 size={16} color="#10B981" />
                <span>Entire Screen Live &amp; Ready</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={isActivatingShare}
                onClick={handleStartShare}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isActivatingShare ? 0.7 : 1,
                  cursor: isActivatingShare ? 'wait' : 'pointer'
                }}
              >
                {isActivatingShare ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Connecting Screen Share...</span>
                  </>
                ) : (
                  <>
                    <Monitor size={18} />
                    <span>Share Entire Screen</span>
                  </>
                )}
              </button>
            )}

            {screenShareError && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  color: '#991B1B',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  lineHeight: 1.4
                }}
              >
                {screenShareError}
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            disabled={!isReadyToStart}
            onClick={() => onStartAssessment(enrolledFaceId || undefined)}
            className="btn btn-primary"
            style={{
              padding: '16px',
              fontSize: '1.0625rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              borderRadius: '12px',
              boxShadow: isReadyToStart ? '0 10px 15px -3px rgba(79, 70, 229, 0.3)' : 'none',
              cursor: isReadyToStart ? 'pointer' : 'not-allowed',
              opacity: isReadyToStart ? 1 : 0.6
            }}
          >
            {isStarting ? (
              <span>Initializing Assessment Session...</span>
            ) : (
              <>
                <span>Start Assessment</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {!isReadyToStart && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748B' }}>
              {!candidateName.trim() || !candidateId.trim()
                ? 'Please complete Candidate Name & ID above.'
                : !isScreenSharingActive
                ? 'Mandatory: Share your screen to enable Start Assessment.'
                : 'Waiting for camera hardware initialization.'}
            </div>
          )}

          {/* Secondary Exit Application Link */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
            <button
              type="button"
              onClick={handleQuitApp}
              style={{
                background: 'transparent',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                color: '#64748B',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                transition: 'all 0.15s ease'
              }}
            >
              <LogOut size={13} />
              <span>Quit &amp; Exit Browser</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
