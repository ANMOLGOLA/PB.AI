import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ServiceStatus } from './components/ServiceStatus';
import { SecuritySignals } from './components/SecuritySignals';
import { ExamOverview } from './components/ExamOverview';
import { CandidateOnboarding } from './components/CandidateOnboarding';
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
import { Play, Camera, Maximize } from 'lucide-react';

const resolveInitialApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')) {
    if (window.location.port === '5173') {
      return 'http://127.0.0.1:8000';
    }
    return window.location.origin;
  }
  return 'http://127.0.0.1:8000';
};

type AppMode = 'status' | 'onboarding' | 'exam' | 'report';

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

  // Proctoring and Workflow State
  const [mode, setMode] = useState<AppMode>('status');
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

  // Start exam session & request mandatory full-screen lockdown
  const handleStartExam = async (candidateName: string, candidateId: string) => {
    if (exams.length === 0) return;
    setIsStartingExam(true);
    try {
      const session = await createSession(backendUrl, exams[0].id, candidateName, candidateId);
      setActiveSession(session);

      // Trigger mandatory Electron fullscreen lockdown
      if (window.sentinelBridge) {
        await window.sentinelBridge.setFullscreen(true);
      } else if (document.documentElement.requestFullscreen) {
        // Standard Web Fullscreen API fallback
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Fullscreen request optional in browser
        }
      }

      setMode('exam');
    } catch (err) {
      alert(`Could not start exam session: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsStartingExam(false);
    }
  };

  // Submit exam and leave fullscreen
  const handleSubmitExam = async () => {
    if (!activeSession) return;
    setIsSubmittingExam(true);
    try {
      const result = await submitSession(backendUrl, activeSession.id);
      setSubmissionResult(result);

      // Exit fullscreen mode upon completion
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

  // Render Active Exam View (Full Window Workspace)
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

  // Render Candidate Onboarding View
  if (mode === 'onboarding' && exams.length > 0) {
    return (
      <div className="app-container">
        <Header platform={platform} appVersion={appVersion} />
        <CandidateOnboarding
          exam={exams[0]}
          backendUrl={backendUrl}
          onStartExam={handleStartExam}
          isLoading={isStartingExam}
        />
      </div>
    );
  }

  // Default: Assessment Status & Proctoring Launch Screen
  return (
    <div className="app-container">
      <Header platform={platform} appVersion={appVersion} />

      <main>
        <section className="page-intro" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="page-title">Secure Assessment & Proctoring System</h2>
            <p className="page-description">
              Candidate identity verification, mandatory full-screen lockdown, live OpenCV computer-vision
              face monitoring, and explainable integrity telemetry.
            </p>
          </div>

          {exams.length > 0 && connectionState === 'connected' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setMode('onboarding')}
              style={{ padding: '12px 20px', fontSize: '0.9375rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Play size={16} fill="currentColor" />
              <span>Launch Proctoring Exam</span>
            </button>
          )}
        </section>

        {/* Feature Highlights Banner */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginBottom: '32px'
          }}
        >
          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '6px' }}>
              <Camera size={18} className="card-icon" />
              <span>OpenCV Vision Proctoring</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Continuous real-time face detection, absence detection, and multiple-face alert signals.
            </p>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '6px' }}>
              <Maximize size={18} className="card-icon" />
              <span>Mandatory Fullscreen Lock</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Assessment window locks to full screen. Window blur and keypress attempts are logged.
            </p>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '6px' }}>
              <Play size={18} className="card-icon" />
              <span>Interactive Assessment</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Timed 5-question technical exam with automated backend evaluation and integrity timeline.
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
        <div>Sentinel Exam — Smart Secure Proctoring Platform</div>
        <div>OpenCV Face Detection &bull; Full-Screen Lockdown &bull; Zero Answer Leakage</div>
      </footer>
    </div>
  );
};
