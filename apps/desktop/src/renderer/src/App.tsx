import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ServiceStatus } from './components/ServiceStatus';
import { SecuritySignals } from './components/SecuritySignals';
import { ExamOverview } from './components/ExamOverview';
import { fetchHealth, fetchExams } from './api/client';
import { HealthStatus, PublicExam, ConnectionState } from './api/types';

export const App: React.FC = () => {
  const [backendUrl, setBackendUrl] = useState<string>('http://127.0.0.1:8000');
  const [platform, setPlatform] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('0.1.0');
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(true);

  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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
      // Browser fallback for development
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

      // Fetch public exams if backend is operational
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

  return (
    <div className="app-container">
      <Header platform={platform} appVersion={appVersion} />

      <main>
        <section className="page-intro">
          <h2 className="page-title">Assessment Environment Status</h2>
          <p className="page-description">
            Sentinel Exam desktop client foundation verified with Chromium sandboxing, strict
            Content Security Policy, and local FastAPI assessment service integration.
          </p>
        </section>

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
        <div>Sentinel Exam Foundation Milestone</div>
        <div>Process Isolation: Active &bull; Zero Answer Leakage Enforced</div>
      </footer>
    </div>
  );
};
