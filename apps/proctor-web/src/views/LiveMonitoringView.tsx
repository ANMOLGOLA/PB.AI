import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Search,
  Users,
  Radio,
  Unlock,
  AlertOctagon,
  Maximize2,
  CheckCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import {
  CandidateSessionSummary,
  IncidentEventRecord,
  fetchSessionDetail,
  remoteUnlockCandidate,
  terminateCandidateSession
} from '../api/proctorClient';

interface LiveMonitoringViewProps {
  sessions: CandidateSessionSummary[];
  backendUrl: string;
  authCode: string;
  selectedSessionId: string | null;
  onSelectCandidate: (sessionId: string | null) => void;
  onRefreshSessions: () => void;
}

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'interrupted' | 'stopped';

export const LiveMonitoringView: React.FC<LiveMonitoringViewProps> = ({
  sessions,
  backendUrl,
  authCode,
  selectedSessionId,
  onSelectCandidate,
  onRefreshSessions
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Detailed Modal Session State
  const [sessionDetail, setSessionDetail] = useState<{
    session: any;
    events: IncidentEventRecord[];
  } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // WebRTC Stream State
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [streamStartedAt, setStreamStartedAt] = useState<string | null>(null);
  const [activeSourceName, setActiveSourceName] = useState<string>('Candidate Display');
  const [hasScreenStream, setHasScreenStream] = useState<boolean>(false);
  const [hasWebcamStream, setHasWebcamStream] = useState<boolean>(false);

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const remoteScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteWebcamStreamRef = useRef<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const offerMetaRef = useRef<{
    screenTrackId?: string;
    webcamTrackId?: string;
    screenStreamId?: string;
    webcamStreamId?: string;
  }>({});

  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef<boolean>(false);

  // Interventions Feedback
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState<boolean>(false);
  const [terminateReason, setTerminateReason] = useState<string>('Confirmed unpermitted external communication');

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.candidate_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.exam_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.status === 'active' && !s.is_locked) ||
      (statusFilter === 'locked' && s.is_locked) ||
      (statusFilter === 'streaming' && s.is_screen_active) ||
      (statusFilter === 'submitted' && s.status === 'submitted');
    return matchesSearch && matchesStatus;
  });

  // Re-assert video.srcObject on each render to ensure React never drops streams
  useEffect(() => {
    if (screenVideoRef.current && remoteScreenStreamRef.current && screenVideoRef.current.srcObject !== remoteScreenStreamRef.current) {
      console.log('[WebRTC Examiner] Diagnostic: Re-attaching Screen video.srcObject after re-render');
      screenVideoRef.current.srcObject = remoteScreenStreamRef.current;
      screenVideoRef.current.play().catch((err) => console.warn('[WebRTC Examiner] Screen video play rejected:', err));
    }
    if (webcamVideoRef.current && remoteWebcamStreamRef.current && webcamVideoRef.current.srcObject !== remoteWebcamStreamRef.current) {
      console.log('[WebRTC Examiner] Diagnostic: Re-attaching Webcam video.srcObject after re-render');
      webcamVideoRef.current.srcObject = remoteWebcamStreamRef.current;
      webcamVideoRef.current.play().catch((err) => console.warn('[WebRTC Examiner] Webcam video play rejected:', err));
    }
  });

  // Load Session Detail and Start WebRTC when selected
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      setStreamStatus('idle');
      return;
    }

    let isCleanedUp = false;
    setIsLoadingDetail(true);

    fetchSessionDetail(backendUrl, selectedSessionId, authCode)
      .then((data) => {
        if (!isCleanedUp) {
          setSessionDetail(data);
          setIsLoadingDetail(false);
        }
      })
      .catch((err) => {
        if (!isCleanedUp) {
          console.error('[LiveMonitoring] Failed to fetch session detail:', err);
          setIsLoadingDetail(false);
        }
      });

    // Cleanup existing WebRTC connection
    const cleanupWebRTC = () => {
      console.log('[WebRTC Examiner] Cleaning up existing connection & media streams...');
      if (pcRef.current) {
        try { pcRef.current.close(); } catch {}
        pcRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
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
    setStreamStatus('connecting');

    const setupWebRTC = async () => {
      try {
        console.log('[WebRTC Examiner] Fetching ICE config from backend...');
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
        } catch (cfgErr) {
          console.warn('[WebRTC Examiner] Could not load ICE config, using fallback STUN:', cfgErr);
        }

        if (isCleanedUp) return;

        console.log('[WebRTC Examiner] Initializing RTCPeerConnection with ICE servers:', rtcConfig.iceServers);
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.ontrack = (event) => {
          const track = event.track;
          console.log('[WebRTC Examiner] Diagnostic: ontrack received:', {
            kind: track.kind,
            id: track.id,
            readyState: track.readyState,
            enabled: track.enabled,
            streamsLength: event.streams.length,
            streamId: event.streams[0]?.id
          });

          const incomingStream = (event.streams && event.streams[0])
            ? event.streams[0]
            : new MediaStream([track]);

          const isScreen =
            track.id === offerMetaRef.current.screenTrackId ||
            incomingStream.id === offerMetaRef.current.screenStreamId ||
            (!remoteScreenStreamRef.current && track.id !== offerMetaRef.current.webcamTrackId);

          if (isScreen) {
            console.log('[WebRTC Examiner] Assigned track to Screen Video:', track.id);
            remoteScreenStreamRef.current = incomingStream;
            setHasScreenStream(true);
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = incomingStream;
              screenVideoRef.current.play().catch((err) => {
                console.warn('[WebRTC Examiner] Screen video play() promise rejected:', err);
              });
            }
          } else {
            console.log('[WebRTC Examiner] Assigned track to Webcam Video:', track.id);
            remoteWebcamStreamRef.current = incomingStream;
            setHasWebcamStream(true);
            if (webcamVideoRef.current) {
              webcamVideoRef.current.srcObject = incomingStream;
              webcamVideoRef.current.play().catch((err) => {
                console.warn('[WebRTC Examiner] Webcam video play() promise rejected:', err);
              });
            }
          }

          setStreamStatus('connected');
        };

        pc.oniceconnectionstatechange = () => {
          console.log(`[WebRTC Examiner] Diagnostic: iceConnectionState: ${pc.iceConnectionState}`);
        };

        pc.onsignalingstatechange = () => {
          console.log(`[WebRTC Examiner] Diagnostic: signalingState: ${pc.signalingState}`);
        };

        pc.onconnectionstatechange = () => {
          const cState = pc.connectionState;
          console.log('[WebRTC Examiner] Diagnostic: connectionState:', cState);
          if (cState === 'connected') setStreamStatus('connected');
          else if (cState === 'disconnected' || cState === 'failed') setStreamStatus('interrupted');
          else if (cState === 'closed') setStreamStatus('stopped');
        };

        // 3. Connect Signaling WebSocket
        const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
        const host = backendUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${host}/api/webrtc/signal/${selectedSessionId}?role=examiner&token=${encodeURIComponent(
          authCode.trim()
        )}`;
        console.log('[WebRTC Examiner] Connecting WebSocket signaling gateway:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            console.log('[WebRTC Examiner] Generated ICE candidate, relaying to candidate');
            ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
          }
        };

        ws.onopen = () => {
          console.log('[WebRTC Examiner] WebSocket connected to session room:', selectedSessionId);
        };

        ws.onmessage = async (evt) => {
          try {
            const data = JSON.parse(evt.data);
            console.log('[WebRTC Examiner] Received message from gateway:', data.type);

            if (data.type === 'peer_status') {
              console.log('[WebRTC Examiner] Peer status:', data);
              if (!data.peer_connected) setStreamStatus('stopped');
            } else if (data.type === 'offer') {
              if (data.source_name) setActiveSourceName(data.source_name);
              setStreamStartedAt(new Date().toLocaleTimeString());

              offerMetaRef.current = {
                screenTrackId: data.screen_track_id,
                webcamTrackId: data.webcam_track_id,
                screenStreamId: data.screen_stream_id,
                webcamStreamId: data.webcam_stream_id
              };
              console.log('[WebRTC Examiner] Received SDP offer with track metadata:', offerMetaRef.current);

              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              hasRemoteDescRef.current = true;
              console.log('[WebRTC Examiner] Remote description set. Draining ICE candidate queue of', iceCandidateQueueRef.current.length, 'candidates...');

              // Drain queued ICE candidates
              while (iceCandidateQueueRef.current.length > 0) {
                const cand = iceCandidateQueueRef.current.shift();
                if (cand) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                    console.log('[WebRTC Examiner] Added queued ICE candidate');
                  } catch (iceErr) {
                    console.warn('[WebRTC Examiner] Failed to add queued candidate:', iceErr);
                  }
                }
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log('[WebRTC Examiner] Created and set local answer. Sending to candidate...');

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
              }
            } else if (data.type === 'ice-candidate' && data.candidate) {
              if (hasRemoteDescRef.current && pc.remoteDescription) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                  console.log('[WebRTC Examiner] Added remote ICE candidate');
                } catch (iceErr) {
                  console.warn('[WebRTC Examiner] Failed to add remote ICE candidate:', iceErr);
                }
              } else {
                console.log('[WebRTC Examiner] Queueing ICE candidate (remoteDescription not set yet)');
                iceCandidateQueueRef.current.push(data.candidate);
              }
            } else if (data.type === 'stream_stopped') {
              console.log('[WebRTC Examiner] Stream stopped by candidate');
              setStreamStatus('stopped');
              if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
              if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
              remoteScreenStreamRef.current = null;
              remoteWebcamStreamRef.current = null;
              setHasScreenStream(false);
              setHasWebcamStream(false);
            }
          } catch (err) {
            console.error('[WebRTC Examiner] Signaling parse error:', err);
          }
        };

        ws.onclose = () => {
          console.log('[WebRTC Examiner] WebSocket closed');
          if (!isCleanedUp) setStreamStatus('interrupted');
        };

        ws.onerror = (err) => {
          console.warn('[WebRTC Examiner] WebSocket error:', err);
        };
      } catch (err) {
        console.error('[WebRTC Examiner] Initialization error:', err);
        if (!isCleanedUp) setStreamStatus('stopped');
      }
    };

    setupWebRTC();

    return () => {
      isCleanedUp = true;
      cleanupWebRTC();
    };
  }, [selectedSessionId, backendUrl, authCode]);

  // Periodic poll of events for open detail
  useEffect(() => {
    if (!selectedSessionId) return;
    const interval = setInterval(() => {
      fetchSessionDetail(backendUrl, selectedSessionId, authCode)
        .then((data) => setSessionDetail(data))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [selectedSessionId, backendUrl, authCode]);

  const handleRemoteUnlock = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await remoteUnlockCandidate(backendUrl, selectedSessionId, authCode);
      if (res.unlocked) {
        setActionNotice('Lockout successfully lifted for candidate.');
        onRefreshSessions();
        setTimeout(() => setActionNotice(null), 3000);
      } else {
        setActionNotice(res.message || 'Unlock was rejected.');
      }
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to issue remote unlock.');
    }
  };

  const handleConfirmTerminate = async () => {
    if (!selectedSessionId) return;
    try {
      await terminateCandidateSession(backendUrl, selectedSessionId, authCode, terminateReason);
      setActionNotice('Session was terminated and locked by proctor.');
      setShowTerminateConfirm(false);
      onRefreshSessions();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to terminate session.');
    }
  };

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

  return (
    <div>
      {/* Search and Filter Controls */}
      <div
        className="panel"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '480px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
            />
            <input
              type="text"
              placeholder="Search candidate name, ID, or assessment title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Filter:</span>
          {(['all', 'streaming', 'active', 'locked', 'submitted'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              style={{
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: statusFilter === filter ? '#4F46E5' : '#E2E8F0',
                backgroundColor: statusFilter === filter ? '#EEF2FF' : '#FFFFFF',
                color: statusFilter === filter ? '#4F46E5' : '#475569',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {filter === 'streaming' ? 'Live Stream' : filter}
            </button>
          ))}
        </div>
      </div>

      {actionNotice && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Candidates Grid */}
      {filteredSessions.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <Users size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
          <h4 style={{ color: '#0F172A', marginBottom: '6px' }}>No matching candidates found</h4>
          <p style={{ fontSize: '0.8125rem' }}>
            Try adjusting your search criteria or filter to see candidates.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px'
          }}
        >
          {filteredSessions.map((s) => {
            const isSelected = s.session_id === selectedSessionId;
            return (
              <div
                key={s.session_id}
                className="panel"
                style={{
                  margin: 0,
                  cursor: 'pointer',
                  borderColor: isSelected ? '#4F46E5' : s.is_locked ? '#FECACA' : 'var(--border-light)',
                  boxShadow: isSelected ? '0 0 0 2px rgba(79, 70, 229, 0.2)' : 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => onSelectCandidate(s.session_id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#EEF2FF',
                        color: '#4F46E5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8125rem'
                      }}
                    >
                      {s.candidate_name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>
                        {s.candidate_name}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>
                        {s.candidate_id}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`status-pill ${
                      s.is_locked
                        ? 'danger'
                        : s.status === 'active'
                        ? 'success'
                        : s.status === 'submitted'
                        ? 'info'
                        : 'muted'
                    }`}
                  >
                    {s.is_locked ? 'Locked' : s.status}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '12px' }}>
                  <strong>{s.exam_title}</strong>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.75rem'
                  }}
                >
                  <div>
                    {s.is_screen_active ? (
                      <span className="status-pill success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Radio size={10} />
                        Screen Streaming
                      </span>
                    ) : (
                      <span className="status-pill muted">No Stream</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={13} color={s.integrity_events_count > 0 ? '#D97706' : '#10B981'} />
                    <span style={{ fontWeight: 600, color: s.integrity_events_count > 0 ? '#D97706' : '#10B981' }}>
                      {s.integrity_events_count} incidents
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Candidate Live Stream Detail Modal / Drawer */}
      {selectedSessionId && (
        <div className="modal-overlay" onClick={() => onSelectCandidate(null)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: '960px', height: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Monitor size={22} color="#4F46E5" />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    {sessionDetail ? sessionDetail.session.candidate_name : 'Loading Candidate...'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {sessionDetail?.session.candidate_id} &bull; {sessionDetail?.session.exam_title}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className={`status-pill ${
                    streamStatus === 'connected'
                      ? 'success'
                      : streamStatus === 'connecting'
                      ? 'info'
                      : streamStatus === 'interrupted'
                      ? 'warning'
                      : 'muted'
                  }`}
                >
                  {streamStatus === 'connected'
                    ? 'WebRTC Stream Connected'
                    : streamStatus === 'connecting'
                    ? 'Connecting...'
                    : streamStatus === 'interrupted'
                    ? 'Stream Interrupted'
                    : 'Stream Inactive'}
                </span>

                <button
                  onClick={() => onSelectCandidate(null)}
                  style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body: Left Video Stream, Right Incident Log */}
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', padding: '20px' }}>
              {/* Left Column: Video Feed (Screen + Picture-in-Picture Webcam) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  ref={videoContainerRef}
                  style={{
                    backgroundColor: '#000000',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    position: 'relative',
                    aspectRatio: '16/9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {/* Candidate Screen Video */}
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      console.log('[WebRTC Examiner] Diagnostic: Screen video metadata loaded:', {
                        videoWidth: v.videoWidth,
                        videoHeight: v.videoHeight,
                        readyState: v.readyState
                      });
                    }}
                    onPlay={() => console.log('[WebRTC Examiner] Diagnostic: Screen video playback active')}
                    onError={(e) => console.error('[WebRTC Examiner] Diagnostic: Screen video playback error:', e)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: (streamStatus === 'connected' && hasScreenStream) ? 'block' : 'none'
                    }}
                  />

                  {/* Candidate Live Webcam Feed (Picture-in-Picture) */}
                  {streamStatus === 'connected' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '200px',
                        height: '130px',
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
                          console.log('[WebRTC Examiner] Diagnostic: Webcam video metadata loaded:', {
                            videoWidth: v.videoWidth,
                            videoHeight: v.videoHeight,
                            readyState: v.readyState
                          });
                        }}
                        onPlay={() => console.log('[WebRTC Examiner] Diagnostic: Webcam video playback active')}
                        onError={(e) => console.error('[WebRTC Examiner] Diagnostic: Webcam video playback error:', e)}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: hasWebcamStream ? 'block' : 'none'
                        }}
                      />

                      {!hasWebcamStream && (
                        <div style={{ textAlign: 'center', color: '#94A3B8', padding: '8px', fontSize: '0.6875rem' }}>
                          <Users size={20} style={{ margin: '0 auto 4px auto', opacity: 0.7 }} />
                          <div style={{ fontWeight: 600, color: '#E2E8F0' }}>Candidate Camera</div>
                          <div style={{ color: '#64748B', fontSize: '0.625rem' }}>Connecting feed...</div>
                        </div>
                      )}

                      {hasWebcamStream && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '5px',
                            left: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'rgba(15, 23, 42, 0.85)',
                            color: '#34D399',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontSize: '0.625rem',
                            fontWeight: 700
                          }}
                        >
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                          <span>Candidate Camera</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback & State Overlays */}
                  {(!hasScreenStream || streamStatus !== 'connected') && (
                    <div style={{ textAlign: 'center', color: '#94A3B8', padding: '20px' }}>
                      {streamStatus === 'connecting' ? (
                        <>
                          <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
                          <p style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '0.875rem' }}>
                            Establishing WebRTC Peer Connection...
                          </p>
                          <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                            Awaiting SDP exchange with candidate desktop shell...
                          </p>
                        </>
                      ) : streamStatus === 'interrupted' ? (
                        <>
                          <AlertTriangle size={36} color="#F59E0B" style={{ margin: '0 auto 8px auto' }} />
                          <p style={{ fontWeight: 600, color: '#FBBF24', fontSize: '0.875rem' }}>
                            Stream Connection Interrupted
                          </p>
                          <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                            Candidate network connection dropped. Automatic recovery active.
                          </p>
                        </>
                      ) : (
                        <>
                          <Monitor size={42} color="#475569" style={{ margin: '0 auto 8px auto' }} />
                          <p style={{ fontWeight: 600, color: '#CBD5E1', fontSize: '0.875rem' }}>
                            Candidate Screen Share Inactive
                          </p>
                          <p style={{ fontSize: '0.75rem', maxWidth: '300px', margin: '4px auto 0 auto' }}>
                            When candidate triggers screen sharing in Sentinel Exam, the live display will render here.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {streamStatus === 'connected' && (
                    <button
                      onClick={toggleVideoFullscreen}
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        color: '#FFFFFF',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '4px',
                        padding: '6px',
                        cursor: 'pointer',
                        zIndex: 11
                      }}
                      title="Fullscreen"
                    >
                      <Maximize2 size={16} />
                    </button>
                  )}
                </div>

                {/* Session Actions Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Source: <strong>{activeSourceName}</strong>
                    {streamStartedAt && ` &bull; Started: ${streamStartedAt}`}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {sessionDetail?.session.is_locked ? (
                      <button
                        onClick={handleRemoteUnlock}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#059669', borderColor: '#A7F3D0' }}
                      >
                        <Unlock size={14} />
                        <span>Remote Unlock</span>
                      </button>
                    ) : null}

                    <button
                      onClick={() => setShowTerminateConfirm(true)}
                      className="btn btn-danger btn-sm"
                    >
                      <AlertOctagon size={14} />
                      <span>Terminate Exam</span>
                    </button>
                  </div>
                </div>

                {showTerminateConfirm && (
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: '6px' }}>
                      Confirm Candidate Termination
                    </div>
                    <p style={{ color: '#7F1D1D', marginBottom: '8px' }}>
                      This will permanently lock the candidate's exam workspace and log a proctor termination audit event.
                    </p>
                    <input
                      type="text"
                      value={terminateReason}
                      onChange={(e) => setTerminateReason(e.target.value)}
                      placeholder="Enter formal termination justification..."
                      className="form-input"
                      style={{ marginBottom: '10px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => setShowTerminateConfirm(false)}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmTerminate}
                        className="btn btn-danger btn-sm"
                      >
                        Confirm Termination
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Real-Time Incident Audit */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  backgroundColor: 'var(--bg-surface-subtle)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#0F172A', marginBottom: '10px' }}>
                  Candidate Incident Timeline ({sessionDetail?.events.length || 0})
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px' }}>
                  {isLoadingDetail ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748B' }}>
                      <div className="spinner" style={{ margin: '0 auto 8px auto' }} />
                      <span>Loading candidate details...</span>
                    </div>
                  ) : sessionDetail?.events.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748B', fontSize: '0.75rem' }}>
                      No proctoring incidents logged for this session.
                    </div>
                  ) : (
                    sessionDetail?.events.map((evt) => (
                      <div
                        key={evt.id}
                        style={{
                          padding: '10px',
                          borderRadius: '6px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span
                            className={`status-pill ${
                              evt.severity === 'critical' || evt.severity === 'high'
                                ? 'danger'
                                : evt.severity === 'medium'
                                ? 'warning'
                                : 'info'
                            }`}
                          >
                            {evt.event_type}
                          </span>
                          <span style={{ color: '#64748B', fontSize: '0.6875rem' }}>
                            {new Date(evt.occurred_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ color: '#475569', marginTop: '6px' }}>
                          Source: <span style={{ color: '#0F172A', fontWeight: 500 }}>{evt.source}</span>
                          {evt.confidence && ` &bull; Confidence: ${(evt.confidence * 100).toFixed(0)}%`}
                        </div>
                        {evt.review_status && evt.review_status !== 'unreviewed' && (
                          <div style={{ marginTop: '4px', fontSize: '0.6875rem', color: '#059669', fontWeight: 600 }}>
                            Reviewed: {evt.review_status.toUpperCase()} ({evt.reviewed_by})
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
