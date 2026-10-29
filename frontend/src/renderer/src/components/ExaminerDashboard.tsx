import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor,
  Shield,
  KeyRound,
  AlertTriangle,
  RefreshCw,
  Activity,
  Maximize2,
  Unlock,
  Radio,
  ArrowLeft,
  User
} from 'lucide-react';
import { unlockWithTeacherCode } from '../api/client';

interface ExaminerDashboardProps {
  backendUrl: string;
  onExitExaminer: () => void;
}

interface ExaminerSessionSummary {
  session_id: string;
  candidate_name: string;
  candidate_id: string;
  exam_id: string;
  exam_title: string;
  status: string;
  is_locked: boolean;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  is_screen_active: boolean;
  integrity_events_count: number;
}

interface IncidentEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  severity: string;
  confidence: number;
  metadata: Record<string, any>;
}

type StreamState = 'idle' | 'connecting' | 'connected' | 'interrupted' | 'stopped';

export const ExaminerDashboard: React.FC<ExaminerDashboardProps> = ({
  backendUrl,
  onExitExaminer
}) => {
  // Authorization State
  const [authCode, setAuthCode] = useState<string>('TEACHER-UNLOCK-2026');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sessions and Active Selection
  const [sessions, setSessions] = useState<ExaminerSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);
  const [sessionEvents, setSessionEvents] = useState<IncidentEvent[]>([]);

  // WebRTC Examiner Receiver State
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamStartedAt, setStreamStartedAt] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>('Candidate Screen');
  const [hasScreenStream, setHasScreenStream] = useState<boolean>(false);
  const [hasWebcamStream, setHasWebcamStream] = useState<boolean>(false);

  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const remoteScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteWebcamStreamRef = useRef<MediaStream | null>(null);
  const offerMetaRef = useRef<{
    screenTrackId?: string;
    webcamTrackId?: string;
    screenStreamId?: string;
    webcamStreamId?: string;
  }>({});
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef<boolean>(false);

  // Remote Unlock Status
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);

  // Re-assert video.srcObject on each render to prevent React from clearing streams
  useEffect(() => {
    if (screenVideoRef.current && remoteScreenStreamRef.current && screenVideoRef.current.srcObject !== remoteScreenStreamRef.current) {
      console.log('[WebRTC Examiner Desktop] Diagnostic: Re-attaching Screen video.srcObject');
      screenVideoRef.current.srcObject = remoteScreenStreamRef.current;
      screenVideoRef.current.play().catch((err) => console.warn('[WebRTC Examiner Desktop] Screen video play rejected:', err));
    }
    if (webcamVideoRef.current && remoteWebcamStreamRef.current && webcamVideoRef.current.srcObject !== remoteWebcamStreamRef.current) {
      console.log('[WebRTC Examiner Desktop] Diagnostic: Re-attaching Webcam video.srcObject');
      webcamVideoRef.current.srcObject = remoteWebcamStreamRef.current;
      webcamVideoRef.current.play().catch((err) => console.warn('[WebRTC Examiner Desktop] Webcam video play rejected:', err));
    }
  });

  // Authenticate Examiner
  const handleAuthenticate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authCode.trim()) {
      setAuthError('Please enter an authorization code');
      return;
    }

    setIsLoadingSessions(true);
    setAuthError(null);

    try {
      const res = await fetch(
        `${backendUrl}/api/examiner/sessions?auth_code=${encodeURIComponent(authCode.trim())}`
      );
      if (res.status === 403) {
        setAuthError('Invalid examiner authorization code.');
        setIsAuthenticated(false);
      } else if (!res.ok) {
        setAuthError('Backend returned error loading sessions');
      } else {
        const data: ExaminerSessionSummary[] = await res.json();
        setSessions(data);
        setIsAuthenticated(true);
        if (data.length > 0 && !selectedSessionId) {
          setSelectedSessionId(data[0].session_id);
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to connect to backend');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Poll Sessions List
  const refreshSessions = useCallback(async () => {
    if (!isAuthenticated || !authCode) return;
    try {
      const res = await fetch(
        `${backendUrl}/api/examiner/sessions?auth_code=${encodeURIComponent(authCode.trim())}`
      );
      if (res.ok) {
        const data: ExaminerSessionSummary[] = await res.json();
        setSessions(data);
      }
    } catch {
      // silent refresh error
    }
  }, [backendUrl, authCode, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refreshSessions, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshSessions]);

  // Fetch Detailed Events for Selected Session
  const refreshSessionDetail = useCallback(async () => {
    if (!selectedSessionId || !isAuthenticated) return;
    try {
      const res = await fetch(
        `${backendUrl}/api/examiner/sessions/${selectedSessionId}?auth_code=${encodeURIComponent(authCode.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setSessionEvents(data.events || []);
      }
    } catch {
      // ignore
    }
  }, [selectedSessionId, isAuthenticated, backendUrl, authCode]);

  useEffect(() => {
    if (!selectedSessionId || !isAuthenticated) return;
    refreshSessionDetail();
    const interval = setInterval(refreshSessionDetail, 2500);
    return () => clearInterval(interval);
  }, [selectedSessionId, isAuthenticated, refreshSessionDetail]);

  // WebRTC Receiver Setup for Selected Session
  useEffect(() => {
    if (!selectedSessionId || !isAuthenticated) return;

    let isCleanedUp = false;
    setStreamState('connecting');
    setStreamStartedAt(null);

    const cleanupWebRTC = () => {
      console.log('[WebRTC Examiner Desktop] Cleaning up WebRTC receiver connection...');
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
      remoteScreenStreamRef.current = null;
      remoteWebcamStreamRef.current = null;
      iceCandidateQueueRef.current = [];
      hasRemoteDescRef.current = false;
      setHasScreenStream(false);
      setHasWebcamStream(false);
    };

    cleanupWebRTC();

    const setupStream = async () => {
      try {
        // 1. Fetch ICE Configuration
        let rtcConfig: RTCConfiguration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        };
        try {
          const cfgRes = await fetch(`${backendUrl}/api/webrtc/config`);
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            rtcConfig = {
              iceServers: cfg.iceServers || rtcConfig.iceServers,
              iceTransportPolicy: (cfg.iceTransportPolicy as RTCIceTransportPolicy) || 'all'
            };
          }
        } catch {}

        if (isCleanedUp) return;

        // 2. Initialize RTCPeerConnection
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.ontrack = (event) => {
          const track = event.track;
          console.log('[WebRTC Examiner Desktop] Received remote track:', {
            kind: track.kind,
            id: track.id,
            readyState: track.readyState,
            streamLength: event.streams.length
          });

          const incomingStream = (event.streams && event.streams[0])
            ? event.streams[0]
            : new MediaStream([track]);

          const isScreen =
            track.id === offerMetaRef.current.screenTrackId ||
            incomingStream.id === offerMetaRef.current.screenStreamId ||
            (!remoteScreenStreamRef.current && track.id !== offerMetaRef.current.webcamTrackId);

          if (isScreen) {
            console.log('[WebRTC Examiner Desktop] Routing track to Screen Video:', track.id);
            remoteScreenStreamRef.current = incomingStream;
            setHasScreenStream(true);
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = incomingStream;
              screenVideoRef.current.play().catch((err) => {
                console.warn('[WebRTC Examiner Desktop] Screen video play rejected:', err);
              });
            }
          } else {
            console.log('[WebRTC Examiner Desktop] Routing track to Webcam Video:', track.id);
            remoteWebcamStreamRef.current = incomingStream;
            setHasWebcamStream(true);
            if (webcamVideoRef.current) {
              webcamVideoRef.current.srcObject = incomingStream;
              webcamVideoRef.current.play().catch((err) => {
                console.warn('[WebRTC Examiner Desktop] Webcam video play rejected:', err);
              });
            }
          }

          setStreamState('connected');
        };

        pc.onconnectionstatechange = () => {
          const cState = pc.connectionState;
          console.log('[WebRTC Examiner Desktop] Connection state:', cState);
          if (cState === 'connected') {
            setStreamState('connected');
          } else if (cState === 'disconnected' || cState === 'failed') {
            setStreamState('interrupted');
          } else if (cState === 'closed') {
            setStreamState('stopped');
          }
        };

        // 3. Connect Signaling WebSocket
        const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
        const host = backendUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${host}/api/webrtc/signal/${selectedSessionId}?role=examiner&token=${encodeURIComponent(
          authCode.trim()
        )}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate
              })
            );
          }
        };

        ws.onopen = () => {
          console.log('[WebRTC Examiner Desktop] Signaling socket connected to session:', selectedSessionId);
        };

        ws.onmessage = async (evt) => {
          try {
            const data = JSON.parse(evt.data);

            if (data.type === 'peer_status') {
              console.log('[WebRTC Examiner Desktop] Candidate status:', data);
              if (!data.peer_connected) {
                setStreamState('stopped');
              }
            } else if (data.type === 'offer') {
              console.log('[WebRTC Examiner Desktop] Received SDP offer with metadata');
              if (data.source_name) {
                setActiveSourceName(data.source_name);
              }
              setStreamStartedAt(new Date().toLocaleTimeString());

              offerMetaRef.current = {
                screenTrackId: data.screen_track_id,
                webcamTrackId: data.webcam_track_id,
                screenStreamId: data.screen_stream_id,
                webcamStreamId: data.webcam_stream_id
              };

              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              hasRemoteDescRef.current = true;
              console.log('[WebRTC Examiner Desktop] Remote description set. Draining ICE candidate queue:', iceCandidateQueueRef.current.length);

              while (iceCandidateQueueRef.current.length > 0) {
                const cand = iceCandidateQueueRef.current.shift();
                if (cand) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (err) {
                    console.warn('[WebRTC Examiner Desktop] Error applying queued candidate:', err);
                  }
                }
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'answer',
                    sdp: answer
                  })
                );
              }
            } else if (data.type === 'ice-candidate' && data.candidate) {
              if (hasRemoteDescRef.current && pc.remoteDescription) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (err) {
                  console.warn('[WebRTC Examiner Desktop] Error applying candidate:', err);
                }
              } else {
                console.log('[WebRTC Examiner Desktop] Queueing ICE candidate (remoteDescription not set yet)');
                iceCandidateQueueRef.current.push(data.candidate);
              }
            } else if (data.type === 'stream_stopped') {
              console.log('[WebRTC Examiner Desktop] Candidate stopped screen stream');
              setStreamState('stopped');
              if (screenVideoRef.current) {
                screenVideoRef.current.srcObject = null;
              }
              if (webcamVideoRef.current) {
                webcamVideoRef.current.srcObject = null;
              }
              remoteScreenStreamRef.current = null;
              remoteWebcamStreamRef.current = null;
              setHasScreenStream(false);
              setHasWebcamStream(false);
            }
          } catch (err) {
            console.error('[WebRTC Examiner Desktop] Error processing message:', err);
          }
        };

        ws.onclose = () => {
          if (!isCleanedUp) {
            setStreamState('interrupted');
          }
        };
      } catch (err) {
        console.error('[WebRTC Examiner] Setup failure:', err);
        if (!isCleanedUp) {
          setStreamState('stopped');
        }
      }
    };

    setupStream();

    return () => {
      isCleanedUp = true;
      cleanupWebRTC();
    };
  }, [selectedSessionId, isAuthenticated, backendUrl, authCode]);

  // Handle Remote Teacher Unlock
  const handleRemoteUnlock = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await unlockWithTeacherCode(backendUrl, selectedSessionId, authCode);
      if (res.unlocked) {
        setUnlockMessage('Candidate lock successfully cleared');
        refreshSessions();
        refreshSessionDetail();
        setTimeout(() => setUnlockMessage(null), 3000);
      } else {
        setUnlockMessage(res.message || 'Unlock was rejected');
      }
    } catch (err: any) {
      setUnlockMessage(err.message || 'Failed to issue remote unlock');
    }
  };

  // Toggle Video Fullscreen
  const toggleVideoFullscreen = () => {
    const el = videoContainerRef.current || screenVideoRef.current;
    if (el) {
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const selectedSession = sessions.find((s) => s.session_id === selectedSessionId) || null;

  // Render Login Barrier if not authenticated
  if (!isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '600px',
          padding: '24px'
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: '#0F172A',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}
            >
              <Shield size={24} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
              Where U Elevate Examiner Console
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '6px' }}>
              Authorized Proctor &amp; Live Screen Monitoring Gateway
            </p>
          </div>

          <form onSubmit={handleAuthenticate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#CBD5E1',
                  marginBottom: '6px'
                }}
              >
                Teacher / Examiner Access Code
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B'
                  }}
                />
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="e.g. TEACHER-UNLOCK-2026"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: '#1E293B',
                    color: '#F8FAFC',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            {authError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#F87171',
                  fontSize: '0.8125rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  padding: '8px 12px',
                  borderRadius: '6px'
                }}
              >
                <AlertTriangle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoadingSessions}
              className="btn btn-primary"
              style={{
                padding: '10px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoadingSessions ? <div className="spinner" /> : <Shield size={16} />}
              <span>Enter Examiner Console</span>
            </button>

            <button
              type="button"
              onClick={onExitExaminer}
              className="btn btn-secondary"
              style={{
                backgroundColor: 'transparent',
                borderColor: '#334155',
                color: '#94A3B8'
              }}
            >
              Back to Candidate Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Examiner Top Bar */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0F172A',
          border: '1px solid #334155',
          borderRadius: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onExitExaminer}
            style={{
              background: '#1E293B',
              border: '1px solid #334155',
              color: '#CBD5E1',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem'
            }}
          >
            <ArrowLeft size={16} />
            <span>Return to Candidate Mode</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#F8FAFC' }}>
              Where U Elevate Examiner Hub
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                color: '#818CF8',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600
              }}
            >
              Live Proctoring Active
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={refreshSessions}
            style={{
              background: '#1E293B',
              border: '1px solid #334155',
              color: '#94A3B8',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem'
            }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          <div
            style={{
              fontSize: '0.75rem',
              color: '#94A3B8',
              backgroundColor: '#1E293B',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #334155'
            }}
          >
            Code: <strong>{authCode}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Sessions List, Center Live Stream, Right Incident Timeline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px minmax(440px, 1fr) 340px',
          gap: '20px',
          minHeight: '620px'
        }}
      >
        {/* Left Column: Sessions List */}
        <div
          className="card"
          style={{
            backgroundColor: '#0F172A',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid #1E293B'
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Exam Sessions ({sessions.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 8px', color: '#64748B', fontSize: '0.8125rem' }}>
                No active exam sessions found
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = s.session_id === selectedSessionId;
                return (
                  <div
                    key={s.session_id}
                    onClick={() => setSelectedSessionId(s.session_id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #6366F1' : '1px solid #1E293B',
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.15)' : '#1E293B',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: isSelected ? '#FFFFFF' : '#F1F5F9'
                        }}
                      >
                        {s.candidate_name}
                      </span>
                      {s.is_screen_active && (
                        <span
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            color: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Radio size={10} />
                          LIVE
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                      {s.candidate_id} • {s.status}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        fontSize: '0.6875rem'
                      }}
                    >
                      <span style={{ color: s.is_locked ? '#EF4444' : '#10B981', fontWeight: 600 }}>
                        {s.is_locked ? '🔒 LOCKED OUT' : '✓ Unlocked'}
                      </span>
                      <span style={{ color: s.integrity_events_count > 0 ? '#F59E0B' : '#94A3B8' }}>
                        {s.integrity_events_count} incidents
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Column: Live Screen Video */}
        <div
          className="card"
          style={{
            backgroundColor: '#0F172A',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {/* Stream Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '10px',
              borderBottom: '1px solid #1E293B'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={18} color="#818CF8" />
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#F8FAFC' }}>
                  {selectedSession ? selectedSession.candidate_name : 'No Session Selected'}
                </span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor:
                      streamState === 'connected'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : streamState === 'connecting'
                        ? 'rgba(99, 102, 241, 0.2)'
                        : streamState === 'interrupted'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(148, 163, 184, 0.15)',
                    color:
                      streamState === 'connected'
                        ? '#34D399'
                        : streamState === 'connecting'
                        ? '#818CF8'
                        : streamState === 'interrupted'
                        ? '#FBBF24'
                        : '#94A3B8'
                  }}
                >
                  {streamState === 'connected'
                    ? 'Live WebRTC Connected'
                    : streamState === 'connecting'
                    ? 'Connecting to candidate...'
                    : streamState === 'interrupted'
                    ? 'Stream Interrupted'
                    : 'Stream Inactive'}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '3px 0 0 0' }}>
                Source: {activeSourceName}
                {streamStartedAt && ` • Started at ${streamStartedAt}`}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedSession?.is_locked && (
                <button
                  onClick={handleRemoteUnlock}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Unlock size={14} />
                  <span>Remote Unlock Candidate</span>
                </button>
              )}

              <button
                onClick={toggleVideoFullscreen}
                title="Fullscreen Stream"
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#94A3B8',
                  borderRadius: '6px',
                  padding: '6px',
                  cursor: 'pointer'
                }}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          {unlockMessage && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34D399',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.8125rem'
              }}
            >
              {unlockMessage}
            </div>
          )}

          {/* Video Container */}
          <div
            ref={videoContainerRef}
            style={{
              flex: 1,
              backgroundColor: '#000000',
              borderRadius: '8px',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '380px'
            }}
          >
            {/* Screen Video Stream */}
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                console.log('[WebRTC Examiner Desktop] Screen video metadata loaded:', {
                  videoWidth: v.videoWidth,
                  videoHeight: v.videoHeight
                });
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: streamState === 'connected' && hasScreenStream ? 'block' : 'none'
              }}
            />

            {/* Candidate Live Webcam Feed (Picture-in-Picture) */}
            {streamState === 'connected' && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '180px',
                  height: '115px',
                  backgroundColor: '#0F172A',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '2px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    console.log('[WebRTC Examiner Desktop] Webcam video metadata loaded:', {
                      videoWidth: v.videoWidth,
                      videoHeight: v.videoHeight
                    });
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: hasWebcamStream ? 'block' : 'none'
                  }}
                />
                {!hasWebcamStream && (
                  <div style={{ textAlign: 'center', color: '#94A3B8', padding: '6px', fontSize: '0.6875rem' }}>
                    <User size={18} style={{ margin: '0 auto 4px auto', opacity: 0.7 }} />
                    <div style={{ fontWeight: 600, color: '#E2E8F0' }}>Candidate Camera</div>
                    <div style={{ color: '#64748B', fontSize: '0.625rem' }}>Awaiting feed...</div>
                  </div>
                )}
                {hasWebcamStream && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.625rem',
                      color: '#10B981',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                    LIVE CAM
                  </div>
                )}
              </div>
            )}

            {streamState !== 'connected' && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                {streamState === 'connecting' ? (
                  <>
                    <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
                    <p style={{ fontWeight: 600, color: '#F1F5F9' }}>
                      Awaiting Candidate WebRTC Transmission...
                    </p>
                    <p style={{ fontSize: '0.8125rem' }}>
                      Signaling room established for session {selectedSessionId?.slice(0, 8)}...
                    </p>
                  </>
                ) : streamState === 'interrupted' ? (
                  <>
                    <AlertTriangle size={40} color="#F59E0B" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontWeight: 600, color: '#FBBF24' }}>Stream Interrupted</p>
                    <p style={{ fontSize: '0.8125rem' }}>
                      Candidate network dropped or capture paused. Retrying WebRTC handshake...
                    </p>
                  </>
                ) : (
                  <>
                    <Monitor size={48} color="#475569" style={{ margin: '0 auto 16px auto' }} />
                    <p style={{ fontWeight: 600, color: '#CBD5E1' }}>Candidate Screen Share Inactive</p>
                    <p style={{ fontSize: '0.8125rem', maxWidth: '340px', margin: '6px auto 0 auto' }}>
                      When the candidate activates screen sharing in Sentinel Exam, the live display will stream here automatically via WebRTC.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Synchronized Real-time Incident Timeline */}
        <div
          className="card"
          style={{
            backgroundColor: '#0F172A',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid #1E293B'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="#818CF8" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                Incident Audit Timeline
              </span>
            </div>
            <span
              style={{
                fontSize: '0.6875rem',
                backgroundColor: '#1E293B',
                color: '#94A3B8',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              {sessionEvents.length} events
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1 }}>
            {sessionEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 8px', color: '#64748B', fontSize: '0.8125rem' }}>
                No proctoring incidents logged for this session
              </div>
            ) : (
              sessionEvents.map((evt) => {
                const isScreenEvent = evt.event_type.startsWith('SCREEN_SHARE');
                const isSevere = evt.severity === 'critical' || evt.severity === 'high';
                const isWarning = evt.severity === 'medium';

                const badgeBg = isScreenEvent
                  ? 'rgba(99, 102, 241, 0.2)'
                  : isSevere
                  ? 'rgba(239, 68, 68, 0.2)'
                  : isWarning
                  ? 'rgba(245, 158, 11, 0.2)'
                  : 'rgba(148, 163, 184, 0.15)';

                const badgeColor = isScreenEvent
                  ? '#818CF8'
                  : isSevere
                  ? '#F87171'
                  : isWarning
                  ? '#FBBF24'
                  : '#94A3B8';

                return (
                  <div
                    key={evt.id}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: '#1E293B',
                      border: '1px solid #334155',
                      fontSize: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        {evt.event_type}
                      </span>
                      <span style={{ color: '#64748B', fontSize: '0.6875rem' }}>
                        {evt.occurred_at ? new Date(evt.occurred_at).toLocaleTimeString() : ''}
                      </span>
                    </div>

                    <div style={{ color: '#CBD5E1', marginTop: '6px' }}>
                      Source: <span style={{ color: '#94A3B8' }}>{evt.source}</span>
                      {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                        <div
                          style={{
                            marginTop: '4px',
                            backgroundColor: '#0F172A',
                            padding: '6px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.6875rem',
                            color: '#94A3B8'
                          }}
                        >
                          {JSON.stringify(evt.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
