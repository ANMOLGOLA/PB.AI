import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { PreExamPortal } from './components/PreExamPortal';
import { ExamWorkspace } from './components/ExamWorkspace';
import { SubmissionConfirmation } from './components/SubmissionConfirmation';
import { useScreenShare } from './hooks/useScreenShare';
import { fetchHealth, fetchExams, createSession, submitSession, startAssessmentSession } from './api/client';
import {
  HealthStatus,
  PublicExam,
  ConnectionState,
  CandidateSession,
  SubmitSessionResult
} from './api/types';
import { ScreenSource } from './components/ScreenSourcePicker';

const resolveInitialApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('sentinel_backend_url');
    if (saved && saved.startsWith('http')) return saved;
    if (window.location?.origin && window.location.origin.startsWith('http')) {
      if (window.location.port === '5173') {
        return 'http://127.0.0.1:8000';
      }
      return window.location.origin;
    }
  }
  return 'http://127.0.0.1:8000';
};

type AppMode = 'portal' | 'exam' | 'submitted';

export const App: React.FC = () => {
  const [backendUrl, setBackendUrl] = useState<string>(resolveInitialApiUrl);
  const [platform, setPlatform] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('0.1.0');

  const [_connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [_health, setHealth] = useState<HealthStatus | null>(null);
  const [_errorDetail, setErrorDetail] = useState<string | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [_isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Student Examination Workflow State: portal -> exam -> submitted
  const [mode, setMode] = useState<AppMode>('portal');
  const [candidateName, setCandidateName] = useState<string>('Parv Mishra');
  const [candidateId, setCandidateId] = useState<string>('CAND-2026-001');
  const [candidateFaceId, setCandidateFaceId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<CandidateSession | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmitSessionResult | null>(null);
  const [isStartingExam, setIsStartingExam] = useState<boolean>(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState<boolean>(false);

  // Initialize bridge listeners
  useEffect(() => {
    if (window.sentinelBridge) {
      window.sentinelBridge.getSystemInfo().then((info) => {
        const saved = localStorage.getItem('sentinel_backend_url');
        if (saved) {
          setBackendUrl(saved);
        } else if (info.backendUrl && info.backendUrl !== 'http://127.0.0.1:8000') {
          setBackendUrl(info.backendUrl);
        }
        if (info.platform) setPlatform(info.platform);
        if (info.appVersion) setAppVersion(info.appVersion);
      }).catch((err) => {
        console.error('Failed to query system bridge:', err);
      });
    } else {
      setPlatform('Web');
    }
  }, []);

  // Fetch initial exam data
  const checkConnectivity = useCallback(async (targetUrl: string) => {
    setIsRefreshing(true);
    setErrorDetail(null);
    try {
      const healthData = await fetchHealth(targetUrl);
      setHealth(healthData);
      setConnectionState('connected');

      try {
        const examsData = await fetchExams(targetUrl);
        setExams(examsData);
      } catch (examErr) {
        console.warn('Exams fetch error:', examErr);
      }
    } catch (err: unknown) {
      setConnectionState('disconnected');
      setHealth(null);
      setExams([]);
      if (err instanceof Error) {
        setErrorDetail(err.message);
      } else {
        setErrorDetail('Failed to communicate with assessment service');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkConnectivity(backendUrl);
  }, [backendUrl, checkConnectivity]);

  // WebRTC Screen Sharing coordinator
  const {
    state: screenShareState,
    sourceName: screenShareSourceName,
    errorMessage: screenShareError,
    stream: _screenStream,
    webcamStream,
    startSharing: startScreenShare,
    stopSharing: stopScreenShare
  } = useScreenShare({
    backendUrl,
    sessionId: activeSession?.id || ''
  });

  const [screenShareErrorOverride, setScreenShareErrorOverride] = useState<string | null>(null);

  // Ensure an active session exists on backend before initiating stream
  const ensureSession = useCallback(
    async (faceId?: string): Promise<CandidateSession> => {
      if (activeSession) return activeSession;

      let targetExams = exams;
      if (targetExams.length === 0) {
        try {
          targetExams = await fetchExams(backendUrl);
          setExams(targetExams);
        } catch (fetchErr) {
          console.warn('Could not auto-fetch exams in ensureSession:', fetchErr);
        }
      }

      if (targetExams.length === 0) {
        throw new Error('Assessment backend is unreachable. Ensure the backend is running at http://127.0.0.1:8000.');
      }

      const session = await createSession(
        backendUrl,
        targetExams[0].id,
        candidateName.trim(),
        candidateId.trim(),
        faceId || candidateFaceId || undefined
      );
      setActiveSession(session);
      return session;
    },
    [activeSession, exams, backendUrl, candidateName, candidateId, candidateFaceId]
  );

  // Candidate initiates screen sharing from pre-exam portal
  const handleStartScreenShare = useCallback(
    async (source: ScreenSource | null = null, cameraStream?: MediaStream | null) => {
      try {
        setScreenShareErrorOverride(null);
        let session = activeSession;
        if (!session) {
          session = await ensureSession();
        }
        await startScreenShare(source, cameraStream, session.id);
      } catch (err: any) {
        console.error('Failed to start screen share:', err);
        setScreenShareErrorOverride(err.message || 'Failed to initialize screen sharing');
      }
    },
    [activeSession, ensureSession, startScreenShare]
  );

  // Candidate starts exam after readiness verification
  const handleStartAssessment = async (faceId?: string) => {
    if (exams.length === 0) return;
    setIsStartingExam(true);

    try {
      if (faceId) setCandidateFaceId(faceId);
      const session = await ensureSession(faceId);

      // Verify server readiness gate with mandatory screen sharing
      await startAssessmentSession(backendUrl, session.id);

      // Enter full-screen Kiosk lockdown
      if (window.sentinelBridge) {
        await window.sentinelBridge.setFullscreen(true);
      } else if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Browser fallback
        }
      }

      setMode('exam');
    } catch (err) {
      alert(`Could not start assessment: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsStartingExam(false);
    }
  };

  // Submit exam and transition to confirmation
  const handleSubmitExam = async () => {
    if (!activeSession) return;
    setIsSubmittingExam(true);

    try {
      await stopScreenShare('Exam completed by candidate');
      const result = await submitSession(backendUrl, activeSession.id);
      setSubmissionResult(result);

      // Release fullscreen & kiosk mode upon successful completion
      if (window.sentinelBridge) {
        await window.sentinelBridge.setFullscreen(false);
      } else if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen().catch(console.warn);
      }

      setMode('submitted');
    } catch (err) {
      alert(`Failed to submit exam: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingExam(false);
    }
  };

  // Render Fullscreen Exam Workspace
  if (mode === 'exam' && exams.length > 0 && activeSession) {
    return (
      <ExamWorkspace
        exam={exams[0]}
        session={activeSession}
        backendUrl={backendUrl}
        screenShareState={screenShareState}
        screenShareSourceName={screenShareSourceName}
        screenShareError={screenShareError}
        webcamStream={webcamStream}
        onStartScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
        onSubmitExam={handleSubmitExam}
        isSubmitting={isSubmittingExam}
      />
    );
  }

  // Render Submission Confirmation (clean, no answers/keys/examiner controls)
  if (mode === 'submitted' && submissionResult && exams.length > 0) {
    return (
      <div className="app-container">
        <Header platform={platform} appVersion={appVersion} />
        <main>
          <SubmissionConfirmation
            result={submissionResult}
            candidateName={candidateName}
            candidateId={candidateId}
            examTitle={exams[0].title}
          />
        </main>
      </div>
    );
  }

  // Default: Where U Elevate Pre-Exam Entry Portal
  return (
    <div className="app-container">
      <Header platform={platform} appVersion={appVersion} />
      <main>
        {exams.length > 0 ? (
          <PreExamPortal
            exam={exams[0]}
            backendUrl={backendUrl}
            candidateName={candidateName}
            candidateId={candidateId}
            onUpdateCandidate={(name, id) => {
              setCandidateName(name);
              setCandidateId(id);
            }}
            screenShareState={screenShareState}
            screenShareSourceName={screenShareSourceName}
            screenShareError={screenShareError || screenShareErrorOverride}
            onStartScreenShare={handleStartScreenShare}
            onStopScreenShare={() => stopScreenShare('Candidate stopped sharing')}
            onStartAssessment={handleStartAssessment}
            isStarting={isStartingExam}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: '#64748B', maxWidth: '460px', margin: '0 auto' }}>
            <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
            <p style={{ fontWeight: 700, fontSize: '1.125rem', color: '#0F172A', marginBottom: '8px' }}>
              Connecting to Assessment Service...
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#64748B', marginBottom: '16px' }}>
              Enter the examiner host IP or URL below to connect:
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g. http://172.16.176.193:8000"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('sentinel_backend_url', backendUrl);
                  checkConnectivity(backendUrl);
                }}
                className="btn btn-primary"
                style={{ padding: '10px 16px', fontSize: '0.875rem', fontWeight: 600 }}
              >
                Connect
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => checkConnectivity(backendUrl)}
                className="btn btn-secondary"
                style={{ padding: '8px 18px', fontSize: '0.875rem' }}
              >
                Retry
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.sentinelBridge && window.sentinelBridge.closeApp) {
                    window.sentinelBridge.closeApp();
                  } else {
                    window.close();
                  }
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 18px', fontSize: '0.875rem' }}
              >
                Quit Application
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="app-footer">
        <div>Where U Elevate &bull; Official Candidate Assessment Portal</div>
        <div>Protected by Hardware Anti-Overlay &bull; Kiosk Full-Screen Lockdown &bull; Real-Time AI Proctoring</div>
      </footer>
    </div>
  );
};
