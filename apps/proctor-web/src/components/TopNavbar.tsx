import React from 'react';
import { RefreshCw, Radio, Server } from 'lucide-react';
import { DashboardTab } from './Sidebar';

interface TopNavbarProps {
  activeTab: DashboardTab;
  backendUrl: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  authCode: string;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  backendUrl,
  isRefreshing,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  authCode
}) => {
  const titles: Record<DashboardTab, { title: string; subtitle: string }> = {
    overview: {
      title: 'Assessment Overview & Operations',
      subtitle: 'Real-time telemetry coverage, candidate counts, and active exam monitors'
    },
    monitoring: {
      title: 'Live Monitoring Room',
      subtitle: 'Real-time WebRTC display feeds, candidate status, and remote interventions'
    },
    incidents: {
      title: 'Incident Review Queue',
      subtitle: 'Evaluate automated computer-vision observations and record proctor verdicts'
    },
    replay: {
      title: 'Integrity Replay & Signal Audit',
      subtitle: 'Chronological timeline of observed events, raw metadata, and confidence scores'
    },
    reports: {
      title: 'Candidate Assessment Reports',
      subtitle: 'Exportable forensic proctoring summaries and verified grading data'
    },
    admin: {
      title: 'Assessment Administration',
      subtitle: 'Create assessments, manage proctor allocations, and enforce access policies'
    }
  };

  const current = titles[activeTab];

  return (
    <header className="top-navbar">
      <div>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
          {current.title}
        </h2>
        <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0' }}>
          {current.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            color: '#475569',
            backgroundColor: '#F1F5F9',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #E2E8F0'
          }}
        >
          <Server size={13} color="#64748B" />
          <span>{backendUrl}</span>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
              display: 'inline-block'
            }}
          />
        </div>

        <button
          onClick={onToggleAutoRefresh}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: 'transparent',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            padding: '4px 10px',
            cursor: 'pointer',
            color: autoRefresh ? '#0D9488' : '#64748B',
            backgroundColor: autoRefresh ? '#F0FDFA' : '#FFFFFF'
          }}
        >
          <Radio size={13} color={autoRefresh ? '#0D9488' : '#94A3B8'} />
          <span>Auto-sync {autoRefresh ? 'On' : 'Off'}</span>
        </button>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.75rem' }}
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
          <span>Refresh</span>
        </button>

        <div
          style={{
            fontSize: '0.75rem',
            color: '#4F46E5',
            backgroundColor: '#EEF2FF',
            padding: '4px 8px',
            borderRadius: '4px',
            fontWeight: 600,
            border: '1px solid rgba(79, 70, 229, 0.2)'
          }}
        >
          Auth: {authCode}
        </div>
      </div>
    </header>
  );
};
