import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Printer,
  AlertTriangle,
  Shield
} from 'lucide-react';
import {
  CandidateSessionSummary,
  SessionComprehensiveReport,
  fetchSessionReport
} from '../api/proctorClient';

interface ReportsViewProps {
  sessions: CandidateSessionSummary[];
  backendUrl: string;
  authCode: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sessions,
  backendUrl,
  authCode
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.length > 0 ? sessions[0].session_id : ''
  );
  const [report, setReport] = useState<SessionComprehensiveReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].session_id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setIsLoading(true);
    setErrorMsg(null);
    fetchSessionReport(backendUrl, selectedSessionId, authCode)
      .then((data) => {
        setReport(data);
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Failed to fetch session report');
      })
      .finally(() => setIsLoading(false));
  }, [selectedSessionId, backendUrl, authCode]);

  const handleDownloadCSV = () => {
    if (!selectedSessionId) return;
    const url = `${backendUrl}/api/examiner/sessions/${selectedSessionId}/export.csv?auth_code=${encodeURIComponent(authCode)}`;
    window.open(url, '_blank');
  };

  const handleDownloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-report-${report.candidate.id}-${report.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      {/* Session Selection and Export Actions */}
      <div
        className="panel"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={18} color="#4F46E5" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>
            Select Assessment Session:
          </span>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="form-select"
            style={{ width: '320px' }}
          >
            {sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.candidate_name} ({s.candidate_id}) &bull; {s.status}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleDownloadCSV}
            disabled={!selectedSessionId}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleDownloadJSON}
            disabled={!report}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={!report}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Candidate Assessment Results Table */}
      <div className="panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A', marginBottom: '14px' }}>
          Candidate Assessment Results ({sessions.length})
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '8px 12px' }}>Candidate</th>
                <th style={{ padding: '8px 12px' }}>Assessment</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Score</th>
                <th style={{ padding: '8px 12px' }}>Percentage</th>
                <th style={{ padding: '8px 12px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.session_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.candidate_name}</div>
                    <div style={{ color: '#64748B', fontSize: '0.6875rem' }}>{s.candidate_id}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{s.exam_title}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      className={`status-pill ${
                        s.status === 'submitted'
                          ? 'success'
                          : s.is_locked
                          ? 'danger'
                          : 'info'
                      }`}
                    >
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    {s.score !== null ? `${s.score} / ${s.total_questions || '-'}` : 'In Progress'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {s.score !== null && s.total_questions
                      ? `${Math.round((s.score / s.total_questions) * 100)}%`
                      : '-'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => setSelectedSessionId(s.session_id)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.6875rem' }}
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
          <p>Compiling forensic integrity report...</p>
        </div>
      ) : errorMsg ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px', color: '#DC2626' }}>
          <AlertTriangle size={32} style={{ margin: '0 auto 10px auto' }} />
          <p>{errorMsg}</p>
        </div>
      ) : !report ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
          No session report selected.
        </div>
      ) : (
        /* Printable Report Document */
        <div
          className="panel"
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '36px',
            backgroundColor: '#FFFFFF',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          {/* Document Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              borderBottom: '2px solid #0F172A',
              paddingBottom: '20px',
              marginBottom: '24px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4F46E5' }}>
                  Where U Elevate &bull; Sentinel Exam
                </span>
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Candidate Forensic Integrity Report
              </h1>
              <p style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '4px' }}>
                Official Proctoring Record &bull; Document Reference: <strong>{report.report_id}</strong>
              </p>
            </div>

            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748B' }}>
              <div>Generated: {new Date(report.generated_at).toLocaleString()}</div>
              <div>Authority: Lead Proctoring Console</div>
            </div>
          </div>

          {/* Candidate & Assessment Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              padding: '18px',
              backgroundColor: '#F8FAFC',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #E2E8F0',
              marginBottom: '24px',
              fontSize: '0.8125rem'
            }}
          >
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Candidate Details</span>
              <strong style={{ fontSize: '0.9375rem', color: '#0F172A' }}>{report.candidate.name}</strong>
              <div style={{ color: '#475569' }}>Reg ID: {report.candidate.id}</div>
              <div style={{ color: '#475569' }}>Biometric Face ID: {report.candidate.face_id}</div>
            </div>

            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Assessment Assessment</span>
              <strong style={{ fontSize: '0.9375rem', color: '#0F172A' }}>{report.assessment.title}</strong>
              <div style={{ color: '#475569' }}>Allocated: {report.assessment.allocated_duration_minutes} minutes</div>
              <div style={{ color: '#475569' }}>Actual Duration: {report.session.duration_formatted}</div>
            </div>
          </div>

          {/* Integrity Verdict & Score Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr',
              gap: '18px',
              marginBottom: '24px'
            }}
          >
            {/* Verdict Box */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                backgroundColor:
                  report.integrity_summary.verdict === 'CLEARED_AUTOMATED_CHECKS'
                    ? '#ECFDF5'
                    : report.integrity_summary.verdict === 'FLAGGED_FOR_REVIEW'
                    ? '#FEF2F2'
                    : '#FFFBEB',
                border: '1px solid',
                borderColor:
                  report.integrity_summary.verdict === 'CLEARED_AUTOMATED_CHECKS'
                    ? '#A7F3D0'
                    : report.integrity_summary.verdict === 'FLAGGED_FOR_REVIEW'
                    ? '#FECACA'
                    : '#FDE68A'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Shield size={18} color={report.integrity_summary.verdict === 'CLEARED_AUTOMATED_CHECKS' ? '#059669' : '#DC2626'} />
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  Proctoring Integrity Verdict
                </span>
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A' }}>
                {report.integrity_summary.verdict.replace(/_/g, ' ')}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>
                Based on on-device MediaPipe biometric verification, full-screen lockdown telemetry, and examiner incident review.
              </p>
            </div>

            {/* Score Box */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Assessment Score
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {report.session.score !== null ? `${report.session.score} / ${report.session.total_questions}` : 'Not Scored'}
              </div>
              {report.session.percentage !== null && (
                <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                  {report.session.percentage}% Performance
                </div>
              )}
            </div>
          </div>

          {/* Incident Type Breakdown */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
              Integrity Signals Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {Object.entries(report.integrity_summary.incident_types).length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: '#059669', fontWeight: 600 }}>
                  ✓ Clean Session: Zero automated warnings or infractions recorded.
                </div>
              ) : (
                Object.entries(report.integrity_summary.incident_types).map(([type, count]) => (
                  <div
                    key={type}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #E2E8F0'
                    }}
                  >
                    <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 600 }}>{type}</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A' }}>{count}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Full Events Chronology */}
          <div>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
              Chronological Audit Trail ({report.events_timeline.length})
            </h3>
            <table className="data-table" style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Review Decision</th>
                </tr>
              </thead>
              <tbody>
                {report.events_timeline.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#64748B', padding: '16px' }}>
                      No events recorded
                    </td>
                  </tr>
                ) : (
                  report.events_timeline.map((evt) => (
                    <tr key={evt.id}>
                      <td style={{ fontFamily: 'monospace' }}>
                        {new Date(evt.occurred_at).toLocaleTimeString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{evt.event_type}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            evt.severity === 'critical' || evt.severity === 'high'
                              ? 'danger'
                              : evt.severity === 'medium'
                              ? 'warning'
                              : 'info'
                          }`}
                        >
                          {evt.severity}
                        </span>
                      </td>
                      <td>{evt.source}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: evt.review_status === 'escalated' ? '#DC2626' : evt.review_status === 'reviewed' ? '#059669' : '#64748B' }}>
                          {evt.review_status.toUpperCase()}
                        </span>
                        {evt.review_notes && <div style={{ color: '#475569', fontStyle: 'italic', fontSize: '0.6875rem' }}>"{evt.review_notes}"</div>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
