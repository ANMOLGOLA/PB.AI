import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Shield,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Eye,
  RefreshCw,
  Cpu,
  Check
} from 'lucide-react';
import { scanPreExamFace, fetchGroqEngineStatus, configureGroqEngine } from '../api/client';
import { PublicExam, PreExamScanResult } from '../api/types';

interface CandidateOnboardingProps {
  exam: PublicExam;
  backendUrl: string;
  onProceedToRules: (candidateName: string, candidateId: string, faceId?: string, faceSig?: string) => void;
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

  // Pre-exam biometric & device scan states
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PreExamScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Groq Vision Engine states
  const [groqConfigured, setGroqConfigured] = useState<boolean>(false);
  const [groqKeyInput, setGroqKeyInput] = useState<string>('');
  const [groqSavedMessage, setGroqSavedMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // Fetch Groq engine status on mount
  useEffect(() => {
    fetchGroqEngineStatus(backendUrl)
      .then((res) => {
        setGroqConfigured(res.groq_configured);
      })
      .catch(console.warn);
  }, [backendUrl]);

  // Handle saving Groq API Key
  const handleSaveGroqKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groqKeyInput.trim()) return;
    try {
      await configureGroqEngine(backendUrl, groqKeyInput.trim());
      setGroqConfigured(true);
      setGroqSavedMessage('Groq Vision AI active (LLaMA 3.2 Vision)');
      setTimeout(() => setGroqSavedMessage(null), 4000);
      // Trigger fresh scan with Groq
      handlePerformScan();
    } catch {
      setScanError('Failed to configure Groq API Key');
    }
  };

  // Initialize camera for self-check & scan
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 } })
      .then((stream) => {
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
        }
      })
      .catch((err) => {
        console.warn('Camera initialization error:', err);
        setScanError('Unable to access camera hardware. Please check webcam permissions.');
      });

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Perform Pre-Exam Face ID & Phone Scan
  const handlePerformScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !cameraActive) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    setIsScanning(true);
    setScanError(null);
    try {
      const res = await scanPreExamFace(backendUrl, dataUrl, candidateId);
      setScanResult(res);
      if (!res.all_passed) {
        setScanError(res.details);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setScanError(err.message);
      } else {
        setScanError('Failed to complete biometric scan');
      }
    } finally {
      setIsScanning(false);
    }
  }, [backendUrl, candidateId, cameraActive]);

  // Auto-scan once camera activates
  useEffect(() => {
    if (cameraActive && !scanResult && !isScanning) {
      const timer = setTimeout(() => {
        handlePerformScan();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cameraActive, scanResult, isScanning, handlePerformScan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !candidateId.trim()) return;
    onProceedToRules(
      candidateName.trim(),
      candidateId.trim(),
      scanResult?.face_id,
      scanResult?.face_signature_json
    );
  };

  const isScanPassed = scanResult && scanResult.all_passed;

  return (
    <div style={{ maxWidth: '940px', margin: '0 auto', padding: '24px 0' }}>
      <div className="card" style={{ padding: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="brand-icon-box" style={{ width: '48px', height: '48px' }}>
              <Sparkles size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', letterSpacing: '0.05em' }}>
                  Where U Elevate Assessment Center
                </span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Candidate Biometric Face ID Enrollment</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                {exam.title} &bull; {exam.total_questions} Questions &bull; {exam.duration_minutes} Minutes
              </p>
            </div>
          </div>

          {/* Groq Engine Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: groqConfigured ? '#EEF2FF' : '#F1F5F9',
              border: `1px solid ${groqConfigured ? '#C7D2FE' : '#E2E8F0'}`,
              color: groqConfigured ? '#4F46E5' : '#64748B',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            <Cpu size={14} />
            <span>{groqConfigured ? 'Groq LLaMA 3.2 Vision' : 'AI Vision Engine Active'}</span>
          </div>
        </div>

        {/* Optional Groq API Key Input Form */}
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', display: 'block' }}>
              Groq Vision API Key (Optional Override)
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
              Powered by Groq LLaMA 3.2 Vision for rapid face identification &amp; phone detection.
            </span>
          </div>
          <form onSubmit={handleSaveGroqKey} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder="Enter Groq Key (gsk_...)"
              value={groqKeyInput}
              onChange={(e) => setGroqKeyInput(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: '0.8125rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontFamily: 'inherit',
                width: '210px'
              }}
            />
            <button type="submit" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8125rem' }}>
              Save Key
            </button>
          </form>
        </div>

        {groqSavedMessage && (
          <div style={{ marginBottom: '14px', color: '#059669', fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} />
            <span>{groqSavedMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', margin: '20px 0' }}>
            {/* Left Column: Candidate Info & Protections */}
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
                  <strong>Security &amp; Integrity Protections:</strong>
                  <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                    <li><strong>Candidate Face ID:</strong> Locks exam to your biometric identity. If anyone else sits in your place, impersonation warning triggers immediately.</li>
                    <li><strong>Phone &amp; Object Detection:</strong> Detects unauthorized mobile phones or objects in frame.</li>
                    <li><strong>Strict Anti-Escape Lockdown:</strong> Window, Windows key, and Alt+Tab are intercepted.</li>
                    <li><strong>5-Warning Policy:</strong> Reaching 5 warnings locks the exam, requiring Teacher Code unlock.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Column: Camera & Pre-Exam Biometric Scan */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Candidate Face ID Self-Check
              </label>

              {/* Video feed with scanning overlay */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '240px',
                  backgroundColor: '#0F172A',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  border: isScanPassed ? '2px solid #10B981' : '1px solid var(--color-border)'
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)'
                  }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Biometric Scanning Reticle */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '140px',
                    height: '180px',
                    border: `2px dashed ${isScanPassed ? '#10B981' : 'rgba(79, 70, 229, 0.7)'}`,
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    boxShadow: isScanPassed ? '0 0 15px rgba(16, 185, 129, 0.5)' : 'none'
                  }}
                />

                {isScanning && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      gap: '8px'
                    }}
                  >
                    <RefreshCw size={28} className="spin-icon" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Enrolling Candidate Biometrics...</span>
                  </div>
                )}
              </div>

              {/* Scan Trigger Button */}
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handlePerformScan}
                  disabled={isScanning || !cameraActive}
                  className="btn btn-secondary"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '9px 14px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    backgroundColor: isScanPassed ? '#F0FDF4' : undefined,
                    borderColor: isScanPassed ? '#10B981' : undefined,
                    color: isScanPassed ? '#065F46' : undefined
                  }}
                >
                  {isScanPassed ? <CheckCircle2 size={16} color="#10B981" /> : <Camera size={16} />}
                  <span>{isScanPassed ? 'Re-enroll Face ID' : 'Capture & Enroll Face ID'}</span>
                </button>
              </div>

              {/* Scan Results Feedback Card */}
              {scanResult && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isScanPassed ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${isScanPassed ? '#BBF7D0' : '#FECACA'}`,
                    fontSize: '0.8125rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: isScanPassed ? '#065F46' : '#991B1B' }}>
                    {isScanPassed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{isScanPassed ? 'Candidate Face ID Enrolled & Active' : 'Face Enrollment Incomplete'}</span>
                  </div>

                  <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: '1fr', gap: '4px', color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600 }}>Enrolled Token:</span>
                      <code style={{ fontSize: '0.75rem', backgroundColor: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                        {scanResult.face_id}
                      </code>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Smartphone size={14} color={scanResult.phone_detected ? '#DC2626' : '#10B981'} />
                      <span>Phone Check: {scanResult.phone_detected ? 'Unauthorized phone detected in frame!' : 'Clear (No phones detected)'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Eye size={14} color={scanResult.eyewear_detected ? '#DC2626' : '#10B981'} />
                      <span>Eyewear Check: {scanResult.eyewear_detected ? 'Sunglasses/tinted lenses detected!' : 'Clear (Eyes visible)'}</span>
                    </div>
                  </div>
                </div>
              )}

              {scanError && !scanResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.75rem', color: '#DC2626' }}>
                  <AlertCircle size={14} />
                  <span>{scanError}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {isScanPassed ? (
                <span style={{ color: '#059669', fontWeight: 600 }}>✓ Face ID enrolled. Ready to enter exam.</span>
              ) : (
                <span>Camera active. Enrolling candidate face...</span>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ padding: '12px 28px', fontSize: '1rem', fontWeight: 700 }}
            >
              <span>Continue to Exam Rules &amp; Guidelines</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
