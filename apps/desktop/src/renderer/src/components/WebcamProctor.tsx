import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, AlertTriangle, Users, Eye, EyeOff, UserX, Smartphone } from 'lucide-react';
import { analyzeFrame } from '../api/client';
import { AnalyzeFrameResult } from '../api/types';

interface WebcamProctorProps {
  backendUrl: string;
  sessionId?: string;
  onViolation?: (type: string, message: string) => void;
  compact?: boolean;
}

export const WebcamProctor: React.FC<WebcamProctorProps> = ({
  backendUrl,
  sessionId,
  onViolation,
  compact = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Consecutive anomaly frame counters to prevent false positive flickering
  const gazeAwayCountRef = useRef<number>(0);
  const noFaceCountRef = useRef<number>(0);
  const mismatchCountRef = useRef<number>(0);
  const phoneCountRef = useRef<number>(0);

  const [analysis, setAnalysis] = useState<AnalyzeFrameResult>({
    face_detected: true,
    face_count: 1,
    confidence: 0.98,
    status: 'verified',
    bounding_boxes: [],
    gaze_direction: 'CENTER',
    looking_at_screen: true,
    eyes: [],
    eyewear_detected: false,
    phone_detected: false,
    phone_boxes: [],
    face_id_match: true,
    face_id_similarity: 1.0,
    frame_width: 640,
    frame_height: 480
  });

  // Start webcam with high quality for reliable face & eye tracking
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      })
      .then((stream) => {
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.warn);
        }
        setStreamActive(true);
        setCameraError(null);
      })
      .catch((err) => {
        console.warn('Webcam access error:', err);
        setCameraError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in browser settings.'
            : 'No camera hardware detected.'
        );
      });

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Frame capture and deep-learning MediaPipe + Eye Tracking face analysis
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !streamActive || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const targetW = 640;
    const targetH = 480;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);

    setIsProcessing(true);
    try {
      const result = await analyzeFrame(backendUrl, dataUrl, sessionId);
      setAnalysis(result);

      // 1. No Face Check (Requires 3 consecutive frames ~2.4s)
      if (result.status === 'no_face' || result.face_count === 0) {
        noFaceCountRef.current += 1;
        if (noFaceCountRef.current >= 3) {
          onViolation?.('NO_FACE_DETECTED', 'Candidate face is not detected in camera frame.');
          noFaceCountRef.current = 0;
        }
      } else {
        noFaceCountRef.current = 0;
      }

      // 2. Multiple Faces Check (Immediate trigger)
      if (result.status === 'multiple_faces' || result.face_count > 1) {
        onViolation?.('MULTIPLE_FACES_DETECTED', `Multiple individuals (${result.face_count} faces) detected in proctoring feed.`);
      }

      // 3. Eye Gaze Tracking (Dampened sensitivity: Requires 4 consecutive frames ~3.2s sustained gaze away)
      if (!result.looking_at_screen && result.face_count === 1) {
        gazeAwayCountRef.current += 1;
        if (gazeAwayCountRef.current >= 4) {
          onViolation?.('GAZE_AWAY_FROM_SCREEN', `Candidate looking away from screen (${result.gaze_direction}).`);
          gazeAwayCountRef.current = 0;
        }
      } else if (result.looking_at_screen) {
        gazeAwayCountRef.current = 0;
      }

      // 4. Biometric Face ID Anti-Impersonation Check
      if (result.status === 'face_mismatch' || result.face_id_match === false) {
        mismatchCountRef.current += 1;
        if (mismatchCountRef.current >= 2) {
          onViolation?.('FACE_MISMATCH_IMPERSONATION', 'Biometric Face ID mismatch: Active person does not match enrolled candidate.');
          mismatchCountRef.current = 0;
        }
      } else {
        mismatchCountRef.current = 0;
      }

      // 5. Mobile Phone or Foreign Object Detection
      if (result.phone_detected) {
        phoneCountRef.current += 1;
        if (phoneCountRef.current >= 2) {
          onViolation?.('PHONE_OR_DEVICE_DETECTED', 'Unauthorized mobile phone or foreign object detected in camera frame.');
          phoneCountRef.current = 0;
        }
      } else {
        phoneCountRef.current = 0;
      }

      // 6. Eyewear Check
      if (result.eyewear_detected) {
        onViolation?.('RESTRICTED_EYEWEAR_DETECTED', 'Tinted eyewear or sunglasses detected covering eyes.');
      }
    } catch {
      // Heartbeat retry
    } finally {
      setIsProcessing(false);
    }
  }, [backendUrl, sessionId, streamActive, isProcessing, onViolation]);

  // Frame analysis loop every 800ms
  useEffect(() => {
    if (!streamActive) return;
    const interval = setInterval(captureAndAnalyze, 800);
    return () => clearInterval(interval);
  }, [streamActive, captureAndAnalyze]);

  const fw = analysis.frame_width || 640;
  const fh = analysis.frame_height || 480;
  const isMultiple = analysis.status === 'multiple_faces' || analysis.face_count > 1;
  const isGazeAway = !analysis.looking_at_screen && analysis.face_count === 1;
  const isMismatch = analysis.status === 'face_mismatch' || analysis.face_id_match === false;
  const isPhone = !!analysis.phone_detected;

  return (
    <div
      style={{
        border: isMultiple || isMismatch || isPhone
          ? '2px solid #EF4444'
          : isGazeAway
          ? '2px solid #F59E0B'
          : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
        boxShadow: isMultiple || isMismatch || isPhone
          ? '0 0 16px rgba(239, 68, 68, 0.45)'
          : isGazeAway
          ? '0 0 12px rgba(245, 158, 11, 0.35)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease'
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: isMultiple || isMismatch || isPhone ? '#FEF2F2' : isGazeAway ? '#FFFBEB' : 'var(--color-surface-muted)',
          borderBottom: isMultiple || isMismatch || isPhone ? '1px solid #FCA5A5' : isGazeAway ? '1px solid #FCD34D' : '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600 }}>
          <Camera size={14} className="card-icon" />
          <span>Where U Elevate AI Proctor</span>
        </div>

        {streamActive && !isMultiple && !isMismatch && !isPhone && analysis.looking_at_screen && analysis.status === 'verified' && (
          <span className="status-badge connected" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
            <Eye size={12} /> Verified &bull; On Screen
          </span>
        )}
        {streamActive && isPhone && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            <Smartphone size={12} /> Phone Detected
          </span>
        )}
        {streamActive && isMismatch && !isPhone && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            <UserX size={12} /> Face ID Mismatch
          </span>
        )}
        {streamActive && isGazeAway && !isMultiple && !isMismatch && !isPhone && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#F59E0B',
              color: '#FFFFFF',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            <EyeOff size={12} /> Gaze: {analysis.gaze_direction}
          </span>
        )}
        {streamActive && isMultiple && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            <Users size={12} /> {analysis.face_count} FACES DETECTED
          </span>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', height: compact ? '180px' : '230px', backgroundColor: '#0F172A' }}>
        {cameraError ? (
          <div
            style={{
              padding: '16px',
              color: '#F87171',
              fontSize: '0.8125rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center'
            }}
          >
            <AlertTriangle size={24} style={{ marginBottom: '8px' }} />
            <span>{cameraError}</span>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)' // Mirror view
              }}
            />

            {/* AI Face Detection Bounding Boxes */}
            {analysis.bounding_boxes.map((box, i) => {
              const leftPct = (1 - (box.x + box.width) / fw) * 100;
              const topPct = (box.y / fh) * 100;
              const widthPct = (box.width / fw) * 100;
              const heightPct = (box.height / fh) * 100;

              const isFirst = i === 0;
              const boxColor = isMultiple || isMismatch ? '#EF4444' : isGazeAway ? '#F59E0B' : '#10B981';

              return (
                <div
                  key={`face-${i}`}
                  style={{
                    position: 'absolute',
                    border: `2px solid ${boxColor}`,
                    borderRadius: '6px',
                    left: `${Math.max(0, leftPct)}%`,
                    top: `${Math.max(0, topPct)}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    pointerEvents: 'none',
                    boxShadow: `0 0 10px ${boxColor}`
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '-20px',
                      left: '0',
                      backgroundColor: boxColor,
                      color: '#FFF',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isMultiple
                      ? (isFirst ? 'Candidate' : `Unauthorized Face #${i + 1}`)
                      : isMismatch
                      ? 'Unauthorized Substitute Person'
                      : isGazeAway
                      ? 'Candidate (Reading Away)'
                      : 'Candidate (Verified Face ID)'}
                  </div>
                </div>
              );
            })}

            {/* Phone / Device Bounding Boxes */}
            {analysis.phone_boxes && analysis.phone_boxes.map((pBox, i) => {
              const pLeftPct = (1 - (pBox.x + pBox.width) / fw) * 100;
              const pTopPct = (pBox.y / fh) * 100;
              const pWidthPct = (pBox.width / fw) * 100;
              const pHeightPct = (pBox.height / fh) * 100;

              return (
                <div
                  key={`phone-${i}`}
                  style={{
                    position: 'absolute',
                    border: '2px dashed #EF4444',
                    borderRadius: '4px',
                    left: `${Math.max(0, pLeftPct)}%`,
                    top: `${Math.max(0, pTopPct)}%`,
                    width: `${pWidthPct}%`,
                    height: `${pHeightPct}%`,
                    pointerEvents: 'none',
                    boxShadow: '0 0 12px rgba(239, 68, 68, 0.7)'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '-20px',
                      left: '0',
                      backgroundColor: '#DC2626',
                      color: '#FFF',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Unauthorized Phone/Device
                  </div>
                </div>
              );
            })}

            {/* Real-time Eye Tracking Reticles */}
            {analysis.eyes && analysis.eyes.map((eye, i) => {
              const eyeLeftPct = (1 - eye.x / fw) * 100;
              const eyeTopPct = (eye.y / fh) * 100;
              return (
                <div
                  key={`eye-${i}`}
                  style={{
                    position: 'absolute',
                    left: `${eyeLeftPct}%`,
                    top: `${eyeTopPct}%`,
                    width: '10px',
                    height: '10px',
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    backgroundColor: analysis.looking_at_screen ? '#10B981' : '#F59E0B',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 6px #10B981',
                    pointerEvents: 'none'
                  }}
                />
              );
            })}
          </>
        )}

        {/* Hidden analysis canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* Warning status alerts */}
      {isMultiple && (
        <div style={{ backgroundColor: '#DC2626', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
          Multiple individuals detected in view ({analysis.face_count} faces).
        </div>
      )}
      {!isMultiple && isMismatch && (
        <div style={{ backgroundColor: '#B91C1C', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
          Biometric Impersonation Alert: Face ID mismatch with enrolled candidate.
        </div>
      )}
      {!isMultiple && !isMismatch && isPhone && (
        <div style={{ backgroundColor: '#B91C1C', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
          Prohibited Device Alert: Mobile phone or foreign object detected in camera view!
        </div>
      )}
      {!isMultiple && !isMismatch && !isPhone && isGazeAway && (
        <div style={{ backgroundColor: '#D97706', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
          Gaze Alert: Looking away from screen ({analysis.gaze_direction}). Please face monitor.
        </div>
      )}
      {analysis.eyewear_detected && (
        <div style={{ backgroundColor: '#B91C1C', color: '#FFFFFF', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
          Eyewear Alert: Tinted or dark glasses detected. Please remove eyewear.
        </div>
      )}

      <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Gaze: <strong>{analysis.gaze_direction}</strong></span>
        <span>
          Face ID:{' '}
          <strong style={{ color: isMismatch ? '#DC2626' : '#059669' }}>
            {isMismatch ? 'MISMATCH (IMPERSONATION)' : 'VERIFIED MATCH'}
          </strong>
        </span>
      </div>
    </div>
  );
};
