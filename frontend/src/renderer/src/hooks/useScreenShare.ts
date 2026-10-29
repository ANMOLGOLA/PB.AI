import { useState, useRef, useCallback, useEffect } from 'react';
import { ScreenSource } from '../components/ScreenSourcePicker';

export type ScreenShareState =
  | 'idle'
  | 'ready'
  | 'connecting'
  | 'active'
  | 'interrupted'
  | 'stopped'
  | 'failed';

interface UseScreenShareOptions {
  backendUrl: string;
  sessionId: string;
  onStateChange?: (state: ScreenShareState, details?: string) => void;
}

export function useScreenShare({
  backendUrl,
  sessionId,
  onStateChange
}: UseScreenShareOptions) {
  const [state, setState] = useState<ScreenShareState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('Display');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Queue ICE candidates received before setRemoteDescription completes
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef<boolean>(false);

  const updateState = useCallback(
    (newState: ScreenShareState, details?: string) => {
      console.log(`[WebRTC Candidate] State transition: ${newState}${details ? ` (${details})` : ''}`);
      setState(newState);
      if (details) {
        setErrorMessage(details);
      }
      onStateChange?.(newState, details);
    },
    [onStateChange]
  );

  // Fetch ICE Configuration from Backend
  const getIceConfig = useCallback(async (): Promise<RTCConfiguration> => {
    try {
      console.log('[WebRTC Candidate] Fetching ICE configuration from backend:', `${backendUrl}/api/webrtc/config`);
      const res = await fetch(`${backendUrl}/api/webrtc/config`);
      if (res.ok) {
        const data = await res.json();
        console.log('[WebRTC Candidate] Loaded ICE servers config:', data.iceServers);
        return {
          iceServers: data.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
          iceTransportPolicy: (data.iceTransportPolicy as RTCIceTransportPolicy) || 'all'
        };
      }
    } catch (err) {
      console.warn('[WebRTC Candidate] Could not load ICE config from backend, falling back to public STUN:', err);
    }
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    };
  }, [backendUrl]);

  // Clean up media tracks and WebRTC resources
  const cleanup = useCallback(async () => {
    console.log('[WebRTC Candidate] Cleaning up media streams and peer connection...');

    // 1. Restore OS content protection in Electron
    if (window.sentinelBridge && window.sentinelBridge.setScreenShareActive) {
      try {
        await window.sentinelBridge.setScreenShareActive(false);
      } catch (err) {
        console.warn('[WebRTC Candidate] Error resetting content protection:', err);
      }
    }

    // 2. Stop screen capture tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          console.log('[WebRTC Candidate] Stopping screen track:', track.id);
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
      setStream(null);
    }

    // 3. Stop webcam tracks owned by this hook
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => {
        try {
          console.log('[WebRTC Candidate] Stopping webcam track:', track.id);
          track.stop();
        } catch {
          // ignore
        }
      });
      webcamStreamRef.current = null;
      setWebcamStream(null);
    }

    // 4. Close RTCPeerConnection
    if (pcRef.current) {
      try {
        console.log('[WebRTC Candidate] Closing RTCPeerConnection');
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }

    // 5. Close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'stop_share',
              reason: 'Candidate ended stream'
            })
          );
        }
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    iceCandidateQueueRef.current = [];
    hasRemoteDescRef.current = false;
  }, []);

  // Stop sharing action
  const stopSharing = useCallback(
    async (reason = 'Screen share stopped by user') => {
      if (isStoppingRef.current) return;
      isStoppingRef.current = true;
      try {
        await cleanup();
        updateState('stopped', reason);
      } finally {
        isStoppingRef.current = false;
      }
    },
    [cleanup, updateState]
  );

  // Send an SDP offer over WebSocket
  const sendOffer = useCallback(async (activePc: RTCPeerConnection, activeWs: WebSocket, title: string) => {
    try {
      if (activePc.signalingState !== 'stable') {
        console.log(`[WebRTC Candidate] Postponing offer: current signalingState is '${activePc.signalingState}'`);
        return;
      }

      console.log('[WebRTC Candidate] Creating SDP offer...');
      const offer = await activePc.createOffer();
      await activePc.setLocalDescription(offer);
      console.log('[WebRTC Candidate] Local description set. Negotiated senders:', activePc.getSenders().map(s => ({
        kind: s.track?.kind,
        id: s.track?.id,
        readyState: s.track?.readyState,
        enabled: s.track?.enabled
      })));

      const screenT = streamRef.current?.getVideoTracks()[0];
      const webcamT = webcamStreamRef.current?.getVideoTracks()[0];

      if (activeWs.readyState === WebSocket.OPEN) {
        console.log('[WebRTC Candidate] Dispatching SDP offer to signaling gateway with tracks:', {
          screenTrackId: screenT?.id,
          webcamTrackId: webcamT?.id,
          screenStreamId: streamRef.current?.id,
          webcamStreamId: webcamStreamRef.current?.id
        });

        activeWs.send(
          JSON.stringify({
            type: 'offer',
            sdp: offer,
            source_name: title,
            resolution: `${window.screen.width}x${window.screen.height}`,
            screen_track_id: screenT?.id,
            webcam_track_id: webcamT?.id,
            screen_stream_id: streamRef.current?.id,
            webcam_stream_id: webcamStreamRef.current?.id
          })
        );
      }
    } catch (err: any) {
      console.error('[WebRTC Candidate] Failed to create or dispatch SDP offer:', err);
    }
  }, []);

  // Start Screen Sharing (with optional external webcam stream or automatic acquisition)
  const startSharing = useCallback(
    async (
      source?: ScreenSource | null,
      externalWebcamStream?: MediaStream | null,
      targetSessionId?: string
    ) => {
      const effectiveSessionId = targetSessionId || sessionId;
      if (!effectiveSessionId) {
        updateState('failed', 'No active session ID provided');
        return;
      }

      updateState('connecting');
      setErrorMessage(null);
      iceCandidateQueueRef.current = [];
      hasRemoteDescRef.current = false;

      let screenStream: MediaStream | null = null;
      let camStream: MediaStream | null = externalWebcamStream || null;

      try {
        // 1. Temporarily allow window capture in Electron
        if (window.sentinelBridge && window.sentinelBridge.setScreenShareActive) {
          console.log('[WebRTC Candidate] Temporarily disabling content protection for screen capture...');
          await window.sentinelBridge.setScreenShareActive(true);
        }

        // 2. Discover & Resolve Primary Entire Screen Source
        let chosenSource = source;
        if (!chosenSource && window.sentinelBridge && window.sentinelBridge.getScreenSources) {
          try {
            const availableSources = await window.sentinelBridge.getScreenSources();
            console.log('[WebRTC Candidate] Auto-discovering full display sources:', availableSources);
            if (availableSources && availableSources.length > 0) {
              chosenSource = availableSources[0];
            }
          } catch (srcErr) {
            console.warn('[WebRTC Candidate] Failed to get screen sources via bridge:', srcErr);
          }
        }

        const displayTitle = chosenSource?.name || 'Entire Screen';
        setSourceName(displayTitle);

        console.log('[WebRTC Candidate] Capturing screen source:', { id: chosenSource?.id, name: displayTitle });

        // Method A: Native getDisplayMedia (intercepted by Electron setDisplayMediaRequestHandler)
        try {
          console.log('[WebRTC Candidate] Attempting native getDisplayMedia capture...');
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
          console.log('[WebRTC Candidate] Screen stream successfully acquired via getDisplayMedia');
        } catch (gdmErr: any) {
          console.warn('[WebRTC Candidate] getDisplayMedia fallback to desktopCapturer getUserMedia:', gdmErr);

          // Method B: Electron desktopCapturer with chromeMediaSourceId
          if (chosenSource && chosenSource.id) {
            try {
              screenStream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: chosenSource.id,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 30
                  }
                }
              });
            } catch (deskErr) {
              console.warn('[WebRTC Candidate] Desktop constraints failed, attempting fallback constraints:', deskErr);
              screenStream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: chosenSource.id
                  }
                }
              });
            }
          } else {
            throw new Error(`Screen capture failed: ${gdmErr?.message || 'Access denied'}`);
          }
        }

        if (!screenStream || screenStream.getVideoTracks().length === 0) {
          throw new Error('Screen capture did not return an active video track');
        }

        const screenTrack = screenStream.getVideoTracks()[0];
        console.log('[WebRTC Candidate] Diagnostic: Screen video track acquired:', {
          trackId: screenTrack.id,
          label: screenTrack.label,
          readyState: screenTrack.readyState,
          enabled: screenTrack.enabled
        });

        streamRef.current = screenStream;
        setStream(screenStream);

        // Handle user stopping stream via OS notification bar
        screenTrack.onended = () => {
          console.log('[WebRTC Candidate] Screen capture track ended by user/OS');
          stopSharing('Display stream ended by OS');
        };

        // 3. Capture or verify Webcam MediaStream for examiner delivery
        if (!camStream || camStream.getVideoTracks().length === 0 || camStream.getVideoTracks()[0].readyState !== 'live') {
          try {
            console.log('[WebRTC Candidate] Requesting candidate webcam track for proctor delivery...');
            camStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
              audio: false
            });
          } catch (camErr) {
            console.warn('[WebRTC Candidate] Could not acquire webcam stream for examiner:', camErr);
          }
        }

        if (camStream && camStream.getVideoTracks().length > 0) {
          const webcamTrack = camStream.getVideoTracks()[0];
          console.log('[WebRTC Candidate] Diagnostic: Webcam video track acquired for transmission:', {
            trackId: webcamTrack.id,
            label: webcamTrack.label,
            readyState: webcamTrack.readyState,
            enabled: webcamTrack.enabled
          });
          webcamStreamRef.current = camStream;
          setWebcamStream(camStream);
        }

        // 4. Get ICE Servers Config
        const rtcConfig = await getIceConfig();

        // 5. Create RTCPeerConnection
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        // Add Screen Track
        pc.addTrack(screenTrack, screenStream);
        console.log('[WebRTC Candidate] Added screen track to RTCPeerConnection:', screenTrack.id);

        // Add Webcam Track
        if (camStream) {
          const camTrack = camStream.getVideoTracks()[0];
          if (camTrack) {
            pc.addTrack(camTrack, camStream);
            console.log('[WebRTC Candidate] Added webcam track to RTCPeerConnection:', camTrack.id);
          }
        }

        console.log('[WebRTC Candidate] RTCPeerConnection senders initialized:', pc.getSenders().map(s => ({
          kind: s.track?.kind,
          id: s.track?.id,
          readyState: s.track?.readyState,
          enabled: s.track?.enabled
        })));

        // 6. Open Signaling WebSocket
        const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
        const host = backendUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${host}/api/webrtc/signal/${effectiveSessionId}?role=candidate`;
        console.log('[WebRTC Candidate] Connecting signaling WebSocket:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // Candidate ICE candidates -> WebSocket
        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            console.log('[WebRTC Candidate] Generated ICE candidate, relaying to examiner');
            ws.send(
              JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate
              })
            );
          }
        };

        // Monitor RTCPeerConnection States
        pc.oniceconnectionstatechange = () => {
          console.log(`[WebRTC Candidate] Diagnostic: iceConnectionState: ${pc.iceConnectionState}`);
        };

        pc.onsignalingstatechange = () => {
          console.log(`[WebRTC Candidate] Diagnostic: signalingState: ${pc.signalingState}`);
        };

        pc.onconnectionstatechange = () => {
          const cState = pc.connectionState;
          console.log('[WebRTC Candidate] Diagnostic: connectionState:', cState);
          if (cState === 'connected') {
            updateState('active');
          } else if (cState === 'disconnected') {
            updateState('interrupted', 'Peer disconnected. Waiting for recovery...');
          } else if (cState === 'failed') {
            updateState('interrupted', 'ICE connection failed.');
          } else if (cState === 'closed') {
            updateState('stopped');
          }
        };

        ws.onopen = () => {
          console.log('[WebRTC Signaling] Candidate socket connected to session room:', sessionId);
          updateState('ready', 'Connected to signaling gateway.');
          // Dispatch initial offer
          sendOffer(pc, ws, displayTitle);
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WebRTC Candidate] Received signaling message:', data.type);

            if (data.type === 'peer_status') {
              console.log('[WebRTC Candidate] Peer status:', data);
              if (data.peer_connected) {
                if (pc.signalingState === 'stable') {
                  // Examiner joined and signaling is stable, dispatch fresh SDP offer
                  console.log('[WebRTC Candidate] Examiner joined, sending fresh SDP offer...');
                  sendOffer(pc, ws, displayTitle);
                } else if (pc.localDescription && ws.readyState === WebSocket.OPEN) {
                  // Examiner joined while offer was already created, re-dispatch to newly arrived peer
                  console.log('[WebRTC Candidate] Examiner joined while have-local-offer, re-sending local offer...');
                  const screenT = streamRef.current?.getVideoTracks()[0];
                  const webcamT = webcamStreamRef.current?.getVideoTracks()[0];
                  ws.send(
                    JSON.stringify({
                      type: 'offer',
                      sdp: pc.localDescription,
                      source_name: displayTitle,
                      resolution: `${window.screen.width}x${window.screen.height}`,
                      screen_track_id: screenT?.id,
                      webcam_track_id: webcamT?.id,
                      screen_stream_id: streamRef.current?.id,
                      webcam_stream_id: webcamStreamRef.current?.id
                    })
                  );
                }
              }
            } else if (data.type === 'answer') {
              console.log('[WebRTC Candidate] Received SDP answer from examiner');
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              hasRemoteDescRef.current = true;
              console.log('[WebRTC Candidate] Remote description set. Draining ICE candidate queue of', iceCandidateQueueRef.current.length, 'candidates...');

              // Drain queued ICE candidates
              while (iceCandidateQueueRef.current.length > 0) {
                const cand = iceCandidateQueueRef.current.shift();
                if (cand) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (drainErr) {
                    console.warn('[WebRTC Candidate] Error adding queued ICE candidate:', drainErr);
                  }
                }
              }

              updateState('active');
            } else if (data.type === 'ice-candidate' && data.candidate) {
              if (hasRemoteDescRef.current && pc.remoteDescription) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                  console.log('[WebRTC Candidate] Added remote ICE candidate');
                } catch (iceErr) {
                  console.warn('[WebRTC Candidate] Failed to add remote ICE candidate:', iceErr);
                }
              } else {
                console.log('[WebRTC Candidate] Queueing ICE candidate (remoteDescription not set yet)');
                iceCandidateQueueRef.current.push(data.candidate);
              }
            }
          } catch (err) {
            console.error('[WebRTC Candidate] Error handling signaling message:', err);
          }
        };

        ws.onerror = (err) => {
          console.warn('[WebRTC Signaling] Socket error:', err);
          updateState('interrupted', 'Signaling connection error');
        };

        ws.onclose = (event) => {
          console.log('[WebRTC Signaling] Candidate socket closed:', event.code, event.reason);
          if (state === 'active' || state === 'connecting') {
            updateState('interrupted', 'Signaling socket closed');
          }
        };
      } catch (err: any) {
        console.error('[WebRTC Candidate] Failed to initiate screen share:', err);
        await cleanup();
        const msg = err.name === 'NotAllowedError'
          ? 'Screen capture permission was denied by the user'
          : err.message || 'Failed to initialize screen sharing';
        updateState('failed', msg);
      }
    },
    [sessionId, backendUrl, updateState, getIceConfig, sendOffer, stopSharing, cleanup, state]
  );

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    errorMessage,
    sourceName,
    stream,
    webcamStream,
    startSharing,
    stopSharing
  };
}
