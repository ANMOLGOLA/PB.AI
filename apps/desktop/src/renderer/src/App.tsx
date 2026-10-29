import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ServiceStatus } from './components/ServiceStatus';
import { SecuritySignals } from './components/SecuritySignals';
import { ExamOverview } from './components/ExamOverview';
import { CandidateOnboarding } from './components/CandidateOnboarding';
import { ExamRulesPage } from './components/ExamRulesPage';
import { ExamWorkspace } from './components/ExamWorkspace';
import { IntegrityAuditReport } from './components/IntegrityAuditReport';
import { fetchHealth, fetchExams, createSession, submitSession } from './api/client';
import {
  HealthStatus,
  PublicExam,
  ConnectionState,
  CandidateSession,
  SubmitSessionResult
} from './api/types';
import { Play, Camera, Eye, Lock, Sparkles } from 'lucide-react';

const resolveInitialApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')) {
    if (window.location.port === '5173') {
      return 'http://127.0.0.1:8000';
    }
    return window.location.origin;
  }
  return 'http://127.0.0.1:8000';
};

type AppMode = 'status' | 'onboarding' | 'rules' | 'exam' | 'report';

export const App: React.FC = () => {
  const [backendUrl, setBackendUrl] = useState<string>(resolveInitialApiUrl);
  const [platform, setPlatform] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('0.1.0');
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(true);

  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Proctoring Workflow State
  const [mode, setMode] = useState<AppMode>('status');
  const [candidateName, setCandidateName] = useState<string>('Parv Mishra');
  const [candidateId, setCandidateId] = useState<string>('CAND-2026-001');
  const [candidateFaceId, setCandidateFaceId] = useState<string>('');
  const [candidateFaceSig, setCandidateFaceSig] = useState<string>('');
  const [activeSession, setActiveSession] = useState<CandidateSession | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmitSessionResult | null>(null);
  const [isStartingExam, setIsStartingExam] = useState<boolean>(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState<boolean>(false);

  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);
  const [lastFocusEventTime, setLastFocusEventTime] = useState<number | null>(null);

  // Initialize bridge and telemetry listener
  useEffect(() => {
    if (window.sentinelBridge) {
      window.sentinelBridge.getSystemInfo().then((info) => {
        if (info.backendUrl) setBackendUrl(info.backendUrl);
        if (info.platform) setPlatform(info.platform);
        if (info.appVersion) setAppVersion(info.appVersion);
        setSandboxEnabled(info.sandboxEnabled);
      }).catch((err) => {
        console.error('Failed to query system bridge:', err);
      });

      const unsubscribe = window.sentinelBridge.onFocusChange(({ focused, timestamp }) => {
        setIsWindowFocused(focused);
        setLastFocusEventTime(timestamp);
      });

      return () => {
        unsubscribe();
      };
    } else {
      setPlatform('Web Browser');
      const handleBlur = () => {
        setIsWindowFocused(false);
        setLastFocusEventTime(Date.now());
      };
      const handleFocus = () => {
        setIsWindowFocused(true);
        setLastFocusEventTime(Date.now());
      };
      window.addEventListener('blur', handleBlur);
      window.addEventListener('focus', handleFocus);
      return () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, []);

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

  // Stage 1: Candidate inputs details -> Moves to Rules
  const handleProceedToRules = (name: string, id: string, faceId?: string, faceSig?: string) => {
    setCandidateName(name);
    setCandidateId(id);
    if (faceId) setCandidateFaceId(faceId);
    if (faceSig) setCandidateFaceSig(faceSig);
    setMode('rules');
  };

  // Stage 2: Candidate agrees to all rules -> Enforces mandatory lockdown & starts session
  const handleLaunchAssessment = async () => {
    if (exams.length === 0) return;
    setIsStartingExam(true);
    try {
      const session = await createSession(
        backendUrl,
        exams[0].id,
        candidateName,
        candidateId,
        candidateFaceId,
        candidateFaceSig
      );
      setActiveSession(session);

      // Trigger mandatory Electron fullscreen & Kiosk lockdown
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
      alert(`Could not start exam session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsStartingExam(false);
    }
  };

  // Stage 3: Submit exam and exit fullscreen
  const handleSubmitExam = async () => {
    if (!activeSession) return;
    setIsSubmittingExam(true);
    try {
      const result = await submitSession(backendUrl, activeSession.id);
      setSubmissionResult(result);

      // Release fullscreen & kiosk mode upon successful completion
      if (window.sentinelBridge) {
        await window.sentinelBridge.setFullscreen(false);
      } else if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen().catch(console.warn);
      }

      setMode('report');
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
        onSubmitExam={handleSubmitExam}
        isSubmitting={isSubmittingExam}
      />
    );
  }

  // Render Submission Report View
  if (mode === 'report' && submissionResult) {
    return (
      <div className="app-container">
        <Header platform={platform} appVersion={appVersion} />
        <IntegrityAuditReport
          result={submissionResult}
          onReset={() => {
            setMode('status');
            setActiveSession(null);
            setSubmissionResult(null);
          }}
        />
      </div>
    );
  }

  // Render Visual Rules & Guidelines Page
  if (mode === 'rules' && exams.length > 0) {
    return (
      <div className="app-container">
        <Header platform={platform} appVersion={appVersion} />
        <ExamRulesPage
          exam={exams[0]}
          candidateName={candidateName}
          candidateId={candidateId}
          onAcceptRules={handleLaunchAssessment}
          onBack={() => setMode('onboarding')}
        />
      </div>
    );
  }

  // Render Candidate Onboarding View
  if (mode === 'onboarding' && exams.length > 0) {
    return (
      <div className="app-container">
        <Header platform={platform} appVersion={appVersion} />
        <CandidateOnboarding
          exam={exams[0]}
          backendUrl={backendUrl}
          onProceedToRules={handleProceedToRules}
          isLoading={isStartingExam}
        />
      </div>
    );
  }

  // Default: Where U Elevate Assessment Status & Launch Screen
  return (
    <div className="app-container">
      <Header platform={platform} appVersion={appVersion} />

      <main>
        <section className="page-intro" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', letterSpacing: '0.06em' }}>
                Where U Elevate &bull; Proctoring Suite
              </span>
            </div>
            <h2 className="page-title">Next-Gen Intelligent Assessment Browser</h2>
            <p className="page-description">
              Candidate identity verification, mandatory full-screen Kiosk lockdown, hardware anti-overlay protection,
              MediaPipe deep-learning eye gaze tracking, and explainable integrity telemetry.
            </p>
          </div>

          {exams.length > 0 && connectionState === 'connected' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setMode('onboarding')}
              style={{ padding: '14px 24px', fontSize: '1rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '10px' }}
            >
              <Play size={18} fill="currentColor" />
              <span>Begin Examination Check-In</span>
            </button>
          )}
        </section>

        {/* Feature Highlights Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '32px'
          }}
        >
          <div style={{ padding: '18px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-accent)' }}>
              <Lock size={18} />
              <span>Kiosk Lockdown</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Mandatory full-screen enforcement. Moving out of the exam or Alt+Tab switching is completely prevented.
            </p>
          </div>

          <div style={{ padding: '18px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-accent)' }}>
              <Eye size={18} />
              <span>Eye Gaze Tracking</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              MediaPipe neural facial keypoints track pupil orientation to verify candidate eyes remain focused on the screen.
            </p>
          </div>

          <div style={{ padding: '18px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-accent)' }}>
              <Camera size={18} />
              <span>Multi-Face Detection</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Deep BlazeFace detector continuously verifies single-candidate presence and flags secondary individuals.
            </p>
          </div>

          <div style={{ padding: '18px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-accent)' }}>
              <Sparkles size={18} />
              <span>Anti-Overlay Guard</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Hardware Content Protection blocks OBS, Discord screen sharing, Game Bar, and third-party overlays.
            </p>
          </div>
        </div>

        <div className="dashboard-grid">
          <ServiceStatus
            connectionState={connectionState}
            health={health}
            errorDetail={errorDetail}
            backendUrl={backendUrl}
            onRefresh={() => checkConnectivity(backendUrl)}
            isRefreshing={isRefreshing}
          />

          <SecuritySignals
            isWindowFocused={isWindowFocused}
            lastFocusEventTime={lastFocusEventTime}
            sandboxEnabled={sandboxEnabled}
          />
        </div>

        <ExamOverview
          exams={exams}
          isLoading={isRefreshing && exams.length === 0}
          onRefresh={() => checkConnectivity(backendUrl)}
        />
      </main>

      <footer className="app-footer">
        <div>Where U Elevate &bull; Sentinel Exam Proctoring System</div>
        <div>Eye Gaze Tracking &bull; Anti-Overlay Content Protection &bull; Kiosk Fullscreen Lock</div>
      </footer>
    </div>
  );
};
