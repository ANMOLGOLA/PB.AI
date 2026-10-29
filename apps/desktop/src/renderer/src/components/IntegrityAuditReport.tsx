import React from 'react';
import { Award, ShieldCheck, RotateCcw } from 'lucide-react';
import { SubmitSessionResult } from '../api/types';

interface IntegrityAuditReportProps {
  result: SubmitSessionResult;
  onReset: () => void;
}

export const IntegrityAuditReport: React.FC<IntegrityAuditReportProps> = ({ result, onReset }) => {
  const isClean = !result.events_summary['MULTIPLE_FACES_DETECTED'] && (result.events_summary['WINDOW_BLUR'] || 0) <= 1;

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', padding: '32px 0' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="brand-icon-box" style={{ width: '48px', height: '48px', backgroundColor: isClean ? '#13653F' : '#8F520A' }}>
              <Award size={26} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.375rem', fontWeight: 600 }}>Assessment Submission & Integrity Report</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Completed at {new Date(result.submitted_at).toLocaleString()} &bull; Session: <code>{result.session_id.slice(0, 8)}</code>
              </p>
            </div>
          </div>

          <span className={`status-badge ${isClean ? 'connected' : 'warning'}`}>
            <ShieldCheck size={14} />
            {isClean ? 'Verified Integrity' : 'Review Recommended'}
          </span>
        </div>

        {/* Evaluation Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Score</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {result.score} / {result.total_questions}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{result.percentage}% Accuracy</div>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Window Transitions</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: (result.events_summary['WINDOW_BLUR'] || 0) > 0 ? '#DC2626' : 'var(--color-text-primary)', marginTop: '4px' }}>
              {result.events_summary['WINDOW_BLUR'] || 0}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Focus lost events</div>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Vision Anomalies</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: ((result.events_summary['NO_FACE_DETECTED'] || 0) + (result.events_summary['MULTIPLE_FACES_DETECTED'] || 0)) > 0 ? '#DC2626' : 'var(--color-text-primary)', marginTop: '4px' }}>
              {(result.events_summary['NO_FACE_DETECTED'] || 0) + (result.events_summary['MULTIPLE_FACES_DETECTED'] || 0)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Absence or multiple face signals</div>
          </div>
        </div>

        {/* Detailed Timeline Table */}
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: '12px' }}>
          Explainable Integrity Timeline ({result.events.length} Events)
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          All computer vision and OS desktop lifecycle events are chronologically logged with detector confidence metrics.
        </p>

        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-surface-muted)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>Time</th>
                <th style={{ padding: '10px 14px' }}>Event Type</th>
                <th style={{ padding: '10px 14px' }}>Source</th>
                <th style={{ padding: '10px 14px' }}>Severity</th>
                <th style={{ padding: '10px 14px' }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((ev) => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                    {new Date(ev.occurred_at).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {ev.event_type}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary)' }}>
                    {ev.source}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor:
                          ev.severity === 'critical' || ev.severity === 'high'
                            ? '#FEE2E2'
                            : ev.severity === 'medium'
                            ? '#FEF3C7'
                            : '#ECFDF5',
                        color:
                          ev.severity === 'critical' || ev.severity === 'high'
                            ? '#DC2626'
                            : ev.severity === 'medium'
                            ? '#B45309'
                            : '#065F46'
                      }}
                    >
                      {ev.severity.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(ev.confidence * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReset}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RotateCcw size={16} /> Return to Home
          </button>
        </div>
      </div>
    </div>
  );
};
