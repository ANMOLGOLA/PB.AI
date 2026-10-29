import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { WhereUElevateLanding } from './components/WhereUElevateLanding';
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
  // Routing: '/' for Where U Elevate Landing Page, '/test' for ExamZone Proctoring Assessment
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      const h = window.location.hash;
      if (p === '/test' || p.endsWith('/test') || h === '#/test' || h === '#test') {
        return '/test';
      }
    }
    return '/';
  });

  const navigate = (to: string) => {
    setCurrentRoute(to);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', to);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname;
      const h = window.location.hash;
      if (p === '/test' || p.endsWith('/test') || h === '#/test' || h === '#test') {
        setCurrentRoute('/test');
      } else {
        setCurrentRoute('/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [backendUrl, setBackendUrl] = useState<string>(resolveInitialApiUrl);
  const [platform, setPlatform] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('0.1.0');

  const [_connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [_health, setHealth] = useState<HealthStatus | null>(null);
  const [_errorDetail, setErrorDetail] = useState<string | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [_isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Assessment Workflow State: portal -> exam -> submitted
  const [mode, setMode] = useState<AppMode>('portal');
  const [candidateName, setCandidateName] = useState<string>('Candidate');
  const [candidateId, setCandidateId] = useState<string>('CAND-2026-WUE');
  const [activeSession, setActiveSession] = useState<CandidateSession | null>(null);
  const [isStartingExam, setIsStartingExam] = useState<boolean>(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitSessionResult | null>(null);

  // WebRTC Screen & Camera Streaming hook
  const {
    state: screenShareState,
    sourceName: screenShareSourceName,
    errorMessage: screenShareError,
    webcamStream,
    startSharing: startScreenShare,
    stopSharing: stopScreenShare
  } = useScreenShare({
    backendUrl,
    sessionId: activeSession?.id || ''
  });

  const [screenShareErrorOverride, setScreenShareErrorOverride] = useState<string | null>(null);

  // Read environment metadata from desktop preload bridge
  useEffect(() => {
    if (window.sentinelBridge && window.sentinelBridge.getSystemInfo) {
      window.sentinelBridge.getSystemInfo().then((info) => {
        if (info) {
          setPlatform(info.platform || '');
          setAppVersion(info.appVersion || '0.1.0');
        }
      }).catch(() => {});
    }
  }, []);

  // Check connectivity to backend service and retrieve available exams
  const checkConnectivity = useCallback(
    async (url: string) => {
      setIsRefreshing(true);
      setErrorDetail(null);
      try {
        const healthData = await fetchHealth(url);
        setHealth(healthData);
        setConnectionState('connected');

        const examsList = await fetchExams(url);
        setExams(examsList);
      } catch (err: unknown) {
        setConnectionState('error');
        setErrorDetail(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    checkConnectivity(backendUrl);
  }, [backendUrl, checkConnectivity]);

  // Handle Starting Screen Share
  const handleStartScreenShare = async (source: ScreenSource | null, cameraStream?: MediaStream | null) => {
    setScreenShareErrorOverride(null);
    try {
      await startScreenShare(source, cameraStream, activeSession?.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize screen sharing.';
      setScreenShareErrorOverride(msg);
      throw err;
    }
  };

  // Launch Active Assessment after OTP & verification checks
  const handleStartAssessment = async (faceId?: string, faceSig?: string) => {
    if (exams.length === 0) return;
    setIsStartingExam(true);

    try {
      const targetExam = exams[0];
      const session = await createSession(backendUrl, targetExam.id, candidateName, candidateId, faceId, faceSig);
      setActiveSession(session);

      await startAssessmentSession(backendUrl, session.id);
      setMode('exam');
      window.scrollTo(0, 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch examination session.';
      alert(`Launch error: ${msg}`);
    } finally {
      setIsStartingExam(false);
    }
  };

  // Finalize & Submit Examination
  const handleSubmitExam = async () => {
    if (!activeSession) return;
    setIsSubmittingExam(true);

    try {
      const result = await submitSession(backendUrl, activeSession.id);
      setSubmissionResult(result);
      setMode('submitted');
      window.scrollTo(0, 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please notify the proctor.';
      alert(`Submission error: ${msg}`);
    } finally {
      setIsSubmittingExam(false);
    }
  };

  // ==========================================
  // ROUTE 1: WHERE U ELEVATE OFFICIAL LANDING
  // ==========================================
  if (currentRoute === '/') {
    return (
      <div className="landing-root">
        <Header
          isLanding={true}
          onNavigateToTest={() => navigate('/test')}
          onNavigateHome={() => navigate('/')}
          firstName={candidateName || 'Candidate'}
          platform={platform}
          appVersion={appVersion}
        />
        <main>
          <WhereUElevateLanding onNavigateToTest={() => navigate('/test')} />
        </main>
        <footer>
          <div className="fgrid">
            <div>
              <h4>Where U Elevate</h4>
              Building the next-generation innovative workforce: agile, adaptable and innovative.
            </div>
            <div>
              <h4>For Participants</h4>
              <a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">Hackathons</a>
              <a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">Jobs</a>
              <a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">Internships</a>
            </div>
            <div>
              <h4>For Organizations</h4>
              <a href="https://whereuelevate.com/solutions-for-academia" target="_blank" rel="noopener noreferrer">Solutions for Academia</a>
              <a href="https://whereuelevate.com/solutions-for-enterprises" target="_blank" rel="noopener noreferrer">Solutions for Enterprises</a>
              <a href="https://whereuelevate.com/book-a-demo" target="_blank" rel="noopener noreferrer">Book a demo</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="https://whereuelevate.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
              <a href="https://whereuelevate.com/terms-and-conditions" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>
              <a href="https://whereuelevate.com/contact-us" target="_blank" rel="noopener noreferrer">Contact us</a>
            </div>
          </div>
          <div className="copy">
            Copyright &copy; 2026 WUELEV8 Innovation Services Pvt. Ltd. &ndash; All rights reserved.
          </div>
        </footer>
      </div>
    );
  }

  // ===================================================
  // ROUTE 2: EXAMZONE SMART PROCTORING ASSESSMENT (/test)
  // ===================================================

  // Mode: Active Exam Workspace
  if (mode === 'exam' && activeSession && exams.length > 0) {
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

  // Mode: Submission Confirmation
  if (mode === 'submitted' && submissionResult && exams.length > 0) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
        <Header
          isLanding={false}
          onNavigateToTest={() => navigate('/test')}
          onNavigateHome={() => navigate('/')}
          firstName={candidateName}
          platform={platform}
          appVersion={appVersion}
        />
        <main style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
          <SubmissionConfirmation
            result={submissionResult}
            candidateName={candidateName}
            candidateId={candidateId}
            examTitle={exams[0].title}
          />
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMode('portal');
                navigate('/');
              }}
            >
              Return to Where U Elevate
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Mode: Pre-Exam Verification Portal
  return (
    <div className="app-container" style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <Header
        isLanding={false}
        onNavigateToTest={() => navigate('/test')}
        onNavigateHome={() => navigate('/')}
        firstName={candidateName}
        platform={platform}
        appVersion={appVersion}
      />
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
              Ensure backend server is running on <code>http://127.0.0.1:8000</code> or enter custom host:
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g. http://127.0.0.1:8000"
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
                onClick={() => navigate('/')}
                className="btn btn-secondary"
                style={{ padding: '8px 18px', fontSize: '0.875rem' }}
              >
                Back to Landing
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="app-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 24px', textAlign: 'center', color: '#64748B', fontSize: '0.75rem' }}>
        <div>Where U Elevate &bull; Official Candidate Assessment Portal</div>
        <div>Protected by Hardware Anti-Overlay &bull; Real-Time WebRTC Streaming &bull; Explainable AI Proctoring</div>
      </footer>
    </div>
  );
};
