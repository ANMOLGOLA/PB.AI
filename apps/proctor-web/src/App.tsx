import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, DashboardTab } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { OverviewView } from './views/OverviewView';
import { LiveMonitoringView } from './views/LiveMonitoringView';
import { IncidentReviewView } from './views/IncidentReviewView';
import { IntegrityReplayView } from './views/IntegrityReplayView';
import { ReportsView } from './views/ReportsView';
import { AdminView } from './views/AdminView';
import {
  resolveBackendUrl,
  fetchOverview,
  fetchSessions,
  OverviewMetrics,
  CandidateSessionSummary
} from './api/proctorClient';
import { Shield, KeyRound, AlertTriangle } from 'lucide-react';
import './styles/dashboard.css';

export const App: React.FC = () => {
  const [backendUrl] = useState<string>(resolveBackendUrl);
  const [authCode, setAuthCode] = useState<string>(() => {
    return sessionStorage.getItem('sentinel_proctor_auth') || 'TEACHER-UNLOCK-2026';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!sessionStorage.getItem('sentinel_proctor_auth');
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Active Navigation
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Shared Data
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [sessions, setSessions] = useState<CandidateSessionSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Selected candidate to inspect in live monitor or replay
  const [selectedCandidateSessionId, setSelectedCandidateSessionId] = useState<string | null>(null);

  // Authentication submission
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authCode.trim()) {
      setAuthError('Please enter a proctor access token.');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const data = await fetchOverview(backendUrl, authCode.trim());
      setMetrics(data);
      sessionStorage.setItem('sentinel_proctor_auth', authCode.trim());
      setIsAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Authorization failed.');
      setIsAuthenticated(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('sentinel_proctor_auth');
    setIsAuthenticated(false);
  };

  // Synchronize Overview & Sessions Data
  const syncData = useCallback(async () => {
    if (!isAuthenticated || !authCode) return;
    setIsRefreshing(true);
    try {
      const [m, s] = await Promise.all([
        fetchOverview(backendUrl, authCode.trim()),
        fetchSessions(backendUrl, authCode.trim())
      ]);
      setMetrics(m);
      setSessions(s);
    } catch (err) {
      console.warn('[Proctor Hub] Auto-sync error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [backendUrl, authCode, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      syncData();
    }
  }, [isAuthenticated, syncData]);

  // Periodic Auto-Sync
  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return;
    const interval = setInterval(syncData, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefresh, syncData]);

  // If not authenticated, render Login Gate
  if (!isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          padding: '24px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: '#1E293B',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '36px 32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}
            >
              <Shield size={26} strokeWidth={2.4} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F8FAFC', margin: 0 }}>
              Where U Elevate
            </h1>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginTop: '4px' }}>
              Sentinel Exam &bull; Proctor Web Portal
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                Examiner Authorization Code
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
                    backgroundColor: '#0F172A',
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
              disabled={isAuthenticating}
              className="btn btn-primary"
              style={{
                padding: '12px',
                fontWeight: 600,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isAuthenticating ? <div className="spinner" /> : <Shield size={16} />}
              <span>Authenticate as Examiner</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const unreviewedCount = metrics?.incidents?.unreviewed || 0;
  const activeScreensCount = metrics?.candidates?.live_screens_streaming || 0;

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        unreviewedCount={unreviewedCount}
        activeScreensCount={activeScreensCount}
        proctorId="PROCTOR-LEAD-01"
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <TopNavbar
          activeTab={activeTab}
          backendUrl={backendUrl}
          isRefreshing={isRefreshing}
          onRefresh={syncData}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
          authCode={authCode}
        />

        <main className="content-scrollable">
          {activeTab === 'overview' && (
            <OverviewView
              metrics={metrics}
              sessions={sessions}
              onNavigateTab={setActiveTab}
              onSelectCandidate={(sessionId) => {
                setSelectedCandidateSessionId(sessionId);
                setActiveTab('monitoring');
              }}
            />
          )}

          {activeTab === 'monitoring' && (
            <LiveMonitoringView
              sessions={sessions}
              backendUrl={backendUrl}
              authCode={authCode}
              selectedSessionId={selectedCandidateSessionId}
              onSelectCandidate={setSelectedCandidateSessionId}
              onRefreshSessions={syncData}
            />
          )}

          {activeTab === 'incidents' && (
            <IncidentReviewView
              backendUrl={backendUrl}
              authCode={authCode}
              onRefreshMetrics={syncData}
            />
          )}

          {activeTab === 'replay' && (
            <IntegrityReplayView
              sessions={sessions}
              backendUrl={backendUrl}
              authCode={authCode}
              initialSessionId={selectedCandidateSessionId}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              sessions={sessions}
              backendUrl={backendUrl}
              authCode={authCode}
            />
          )}

          {activeTab === 'admin' && (
            <AdminView
              backendUrl={backendUrl}
              authCode={authCode}
              onRefreshAll={syncData}
            />
          )}
        </main>
      </div>
    </div>
  );
};
