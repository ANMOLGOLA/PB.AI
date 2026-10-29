import React from 'react';
import {
  LayoutDashboard,
  Monitor,
  AlertTriangle,
  History,
  FileText,
  Sliders,
  Layers,
  Shield,
  LogOut
} from 'lucide-react';

export type DashboardTab =
  | 'overview'
  | 'monitoring'
  | 'incidents'
  | 'replay'
  | 'reports'
  | 'admin';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  unreviewedCount: number;
  activeScreensCount: number;
  proctorId: string;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  unreviewedCount,
  activeScreensCount,
  proctorId,
  onLogout
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}
        >
          <Layers size={20} strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#F8FAFC' }}>
            Where U Elevate
          </div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#818CF8', letterSpacing: '0.04em' }}>
            SENTINEL PROCTOR HUB
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => onSelectTab('overview')}
        >
          <LayoutDashboard size={18} />
          <span>Overview</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'monitoring' ? 'active' : ''}`}
          onClick={() => onSelectTab('monitoring')}
        >
          <Monitor size={18} />
          <span>Live Monitoring</span>
          {activeScreensCount > 0 && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.6875rem',
                padding: '2px 6px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#34D399',
                fontWeight: 700
              }}
            >
              {activeScreensCount} LIVE
            </span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={() => onSelectTab('incidents')}
        >
          <AlertTriangle size={18} />
          <span>Incident Queue</span>
          {unreviewedCount > 0 && (
            <span className="nav-badge">
              {unreviewedCount}
            </span>
          )}
        </button>

        <button
          className={`nav-item ${activeTab === 'replay' ? 'active' : ''}`}
          onClick={() => onSelectTab('replay')}
        >
          <History size={18} />
          <span>Integrity Replay</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => onSelectTab('reports')}
        >
          <FileText size={18} />
          <span>Exam Reports</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => onSelectTab('admin')}
        >
          <Sliders size={18} />
          <span>Administration</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={14} color="#10B981" />
          <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{proctorId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ color: '#64748B' }}>Authorized Session</span>
          <button
            onClick={onLogout}
            title="Switch authorization"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem'
            }}
          >
            <LogOut size={12} />
            <span>Lock</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
