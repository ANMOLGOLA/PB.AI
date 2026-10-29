import React from 'react';
import {
  Users,
  Clock,
  Shield,
  Layers,
  ArrowRight,
  Radio
} from 'lucide-react';
import { OverviewMetrics, CandidateSessionSummary } from '../api/proctorClient';
import { DashboardTab } from '../components/Sidebar';

interface OverviewViewProps {
  metrics: OverviewMetrics | null;
  sessions: CandidateSessionSummary[];
  onNavigateTab: (tab: DashboardTab) => void;
  onSelectCandidate: (sessionId: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  metrics,
  sessions,
  onNavigateTab,
  onSelectCandidate
}) => {
  if (!metrics) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
        <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
        <p>Loading assessment metrics and proctoring status...</p>
      </div>
    );
  }

  const { candidates, incidents, exams, assigned_proctors } = metrics;

  return (
    <div>
      {/* Real Backend Statistics Grid */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-label">Active Candidates</div>
          <div className="stat-value" style={{ color: '#0F172A' }}>
            {candidates.active}
          </div>
          <div className="stat-desc">
            {candidates.total} total registered across all exams
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Live Screen Streams</div>
          <div className="stat-value" style={{ color: candidates.live_screens_streaming > 0 ? '#0D9488' : '#0F172A' }}>
            {candidates.live_screens_streaming}
          </div>
          <div className="stat-desc">
            Real-time peer-to-peer WebRTC active feeds
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Unreviewed Incidents</div>
          <div className="stat-value" style={{ color: incidents.unreviewed > 0 ? '#D97706' : '#059669' }}>
            {incidents.unreviewed}
          </div>
          <div className="stat-desc">
            {incidents.total} total logged &bull; {incidents.escalated} escalated
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-label">Locked / Interrupted</div>
          <div className="stat-value" style={{ color: candidates.locked > 0 ? '#DC2626' : '#64748B' }}>
            {candidates.locked}
          </div>
          <div className="stat-desc">
            Sessions requiring teacher review or code unlock
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }}>
        {/* Active Candidate Sessions Panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <Users size={18} color="#4F46E5" />
              <span>Active Assessment Sessions</span>
            </div>
            <button
              onClick={() => onNavigateTab('monitoring')}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Monitoring Room</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
              No candidate sessions currently registered. Once candidates enter Sentinel Exam, their sessions will appear here automatically.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Assessment</th>
                    <th>Status</th>
                    <th>Live Stream</th>
                    <th>Incidents</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 6).map((s) => (
                    <tr key={s.session_id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.candidate_name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>{s.candidate_id}</div>
                      </td>
                      <td>
                        <span style={{ color: '#334155' }}>{s.exam_title}</span>
                      </td>
                      <td>
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
                      </td>
                      <td>
                        {s.is_screen_active ? (
                          <span className="status-pill success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Radio size={10} />
                            Screen Live
                          </span>
                        ) : (
                          <span className="status-pill muted">Offline</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: s.integrity_events_count > 0 ? '#D97706' : '#059669' }}>
                          {s.integrity_events_count}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            onSelectCandidate(s.session_id);
                            onNavigateTab('monitoring');
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Monitor
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assigned Proctors & Assessment Info Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title">
                <Layers size={18} color="#4F46E5" />
                <span>Active Assessments</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface-subtle)'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>
                    {ex.title}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '0.75rem',
                      color: '#64748B',
                      marginTop: '6px'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} />
                      {ex.duration_minutes} mins
                    </span>
                    <span>&bull;</span>
                    <span>{ex.total_questions} Questions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title">
                <Shield size={18} color="#0D9488" />
                <span>Assigned Proctor Coverage</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {assigned_proctors.map((proc) => (
                <div
                  key={proc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>
                      {proc.name}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>
                      {proc.role} &bull; {proc.id}
                    </div>
                  </div>
                  <span className="status-pill success">
                    {proc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
