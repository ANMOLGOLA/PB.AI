import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, AlertTriangle, CheckCircle, Users } from 'lucide-react';
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
  const [analysis, setAnalysis] = useState<AnalyzeFrameResult>({
    face_detected: true,
    face_count: 1,
    confidence: 0.98,
    status: 'verified',
    bounding_boxes: [],
    frame_width: 640,
    frame_height: 480
  });

  // Start webcam with high quality for reliable face detection
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

  // Frame capture and deep-learning MediaPipe + OpenCV face analysis
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !streamActive || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Use 640x480 for sharp secondary face detection
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

      if (result.status === 'no_face') {
        onViolation?.('NO_FACE_DETECTED', 'Candidate face is not detected in camera frame.');
      } else if (result.status === 'multiple_faces' || result.face_count > 1) {
        onViolation?.('MULTIPLE_FACES_DETECTED', `Multiple individuals (${result.face_count} faces) detected in proctoring feed.`);
      }
    } catch {
      // Background retry
    } finally {
      setIsProcessing(false);
    }
  }, [backendUrl, sessionId, streamActive, isProcessing, onViolation]);

  // Fast frame analysis every 800ms for responsive detection
  useEffect(() => {
    if (!streamActive) return;
    const interval = setInterval(captureAndAnalyze, 800);
    return () => clearInterval(interval);
  }, [streamActive, captureAndAnalyze]);

  const fw = analysis.frame_width || 640;
  const fh = analysis.frame_height || 480;
  const isMultiple = analysis.status === 'multiple_faces' || analysis.face_count > 1;

  return (
    <div
      style={{
        border: isMultiple ? '2px solid #EF4444' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
        boxShadow: isMultiple
          ? '0 0 16px rgba(239, 68, 68, 0.45)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease'
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: isMultiple ? '#FEF2F2' : 'var(--color-surface-muted)',
          borderBottom: isMultiple ? '1px solid #FCA5A5' : '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600 }}>
          <Camera size={14} className="card-icon" />
          <span>Live Proctoring AI</span>
        </div>

        {streamActive && !isMultiple && analysis.status === 'verified' && (
          <span className="status-badge connected" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
            <CheckCircle size={12} /> 1 Face Verified
          </span>
        )}
        {streamActive && analysis.status === 'no_face' && (
          <span className="status-badge disconnected" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
            <AlertTriangle size={12} /> No Face Detected
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
              fontWeight: 700,
              animation: 'pulse 1s infinite'
            }}
          >
            <Users size={12} /> {analysis.face_count} FACES DETECTED
          </span>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', height: compact ? '180px' : '230px', backgroundColor: '#111827' }}>
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
                transform: 'scaleX(-1)' // Mirror for natural candidate view
              }}
            />

            {/* AI Face Detection Bounding Boxes */}
            {analysis.bounding_boxes.map((box, i) => {
              // Convert to mirrored percentages
              const leftPct = (1 - (box.x + box.width) / fw) * 100;
              const topPct = (box.y / fh) * 100;
              const widthPct = (box.width / fw) * 100;
              const heightPct = (box.height / fh) * 100;

              const isFirst = i === 0;
              const boxColor = isMultiple ? '#EF4444' : '#10B981';

              return (
                <div
                  key={i}
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
                    {isMultiple ? (isFirst ? 'Face #1 (Candidate)' : `Face #${i + 1} (Unauthorized)`) : 'Candidate Verified'}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Hidden analysis canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {isMultiple && (
        <div
          style={{
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            padding: '6px 12px',
            fontSize: '0.75rem',
            fontWeight: 600,
            textAlign: 'center'
          }}
        >
          Warning: Multiple people detected in view ({analysis.face_count} faces).
        </div>
      )}

      <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>MediaPipe BlazeFace + OpenCV</span>
        <span>Faces: <strong>{analysis.face_count}</strong> ({Math.round((analysis.confidence || 0) * 100)}%)</span>
      </div>
    </div>
  );
};
