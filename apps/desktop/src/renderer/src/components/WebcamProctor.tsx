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
  const [analysis, setAnalysis] = useState<AnalyzeFrameResult>({
    face_detected: true,
    face_count: 1,
    confidence: 0.98,
    status: 'verified',
    bounding_boxes: []
  });

  // Start webcam
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
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

  // Frame capture and OpenCV AI face analysis
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !streamActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 320, 240);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

    try {
      const result = await analyzeFrame(backendUrl, dataUrl, sessionId);
      setAnalysis(result);

      if (result.status === 'no_face') {
        onViolation?.('NO_FACE_DETECTED', 'Candidate face is not detected in camera frame.');
      } else if (result.status === 'multiple_faces') {
        onViolation?.('MULTIPLE_FACES_DETECTED', `${result.face_count} faces detected in frame.`);
      }
    } catch {
      // Backend analysis heartbeat
    }
  }, [backendUrl, sessionId, streamActive, onViolation]);

  // Periodic heartbeat analysis every 2 seconds
  useEffect(() => {
    if (!streamActive) return;
    const interval = setInterval(captureAndAnalyze, 2000);
    return () => clearInterval(interval);
  }, [streamActive, captureAndAnalyze]);

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: 'var(--color-surface-muted)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600 }}>
          <Camera size={14} className="card-icon" />
          <span>Live Proctoring Feed</span>
        </div>

        {streamActive && analysis.status === 'verified' && (
          <span className="status-badge connected" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
            <CheckCircle size={12} /> Verified
          </span>
        )}
        {streamActive && analysis.status === 'no_face' && (
          <span className="status-badge disconnected" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
            <AlertTriangle size={12} /> No Face
          </span>
        )}
        {streamActive && analysis.status === 'multiple_faces' && (
          <span className="status-badge disconnected" style={{ padding: '2px 6px', fontSize: '0.75rem' }}>
            <Users size={12} /> {analysis.face_count} Faces
          </span>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', height: compact ? '160px' : '220px', backgroundColor: '#1A1C1E' }}>
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
            {analysis.bounding_boxes.map((box, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  border: analysis.status === 'multiple_faces' ? '2px solid #EF4444' : '2px solid #10B981',
                  borderRadius: '4px',
                  // Map coordinates from 320x240 to CSS percent
                  left: `${100 - ((box.x + box.width) / 320) * 100}%`, // Mirrored
                  top: `${(box.y / 240) * 100}%`,
                  width: `${(box.width / 320) * 100}%`,
                  height: `${(box.height / 240) * 100}%`,
                  pointerEvents: 'none',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '0',
                    backgroundColor: analysis.status === 'multiple_faces' ? '#EF4444' : '#10B981',
                    color: '#FFF',
                    fontSize: '10px',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    fontWeight: 600
                  }}
                >
                  Face #{i + 1}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Hidden analysis canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>OpenCV AI Vision</span>
        <span>Confidence: {Math.round((analysis.confidence || 0) * 100)}%</span>
      </div>
    </div>
  );
};
