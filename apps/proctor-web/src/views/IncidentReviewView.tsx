import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Search,
  ChevronRight,
  Shield
} from 'lucide-react';
import {
  IncidentEventRecord,
  fetchIncidents,
  submitReviewDecision
} from '../api/proctorClient';

interface IncidentReviewViewProps {
  backendUrl: string;
  authCode: string;
  onRefreshMetrics: () => void;
}

export const IncidentReviewView: React.FC<IncidentReviewViewProps> = ({
  backendUrl,
  authCode,
  onRefreshMetrics
}) => {
  const [incidents, setIncidents] = useState<IncidentEventRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('unreviewed');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Review Modal State
  const [selectedEvent, setSelectedEvent] = useState<IncidentEventRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'reviewed' | 'dismissed' | 'escalated'>('reviewed');
  const [reviewReason, setReviewReason] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchIncidents(backendUrl, authCode, {
        reviewStatus: reviewStatusFilter,
        severity: severityFilter
      });
      setIncidents(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch incident queue');
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl, authCode, reviewStatusFilter, severityFilter]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const filteredIncidents = incidents.filter((evt) => {
    const term = searchTerm.toLowerCase();
    const candidateName = (evt.candidate_name || '').toLowerCase();
    const candidateId = (evt.candidate_id || '').toLowerCase();
    const eventType = evt.event_type.toLowerCase();
    const source = evt.source.toLowerCase();
    return (
      candidateName.includes(term) ||
      candidateId.includes(term) ||
      eventType.includes(term) ||
      source.includes(term)
    );
  });

  const handleOpenReviewModal = (evt: IncidentEventRecord) => {
    setSelectedEvent(evt);
    setReviewDecision(evt.review_status === 'unreviewed' ? 'reviewed' : evt.review_status);
    setReviewReason(evt.review_notes || '');
  };

  const handleConfirmDecision = async () => {
    if (!selectedEvent) return;
    setIsSubmittingReview(true);
    try {
      await submitReviewDecision(backendUrl, selectedEvent.id, authCode, {
        status: reviewDecision,
        reason: reviewReason || `Proctor confirmed ${reviewDecision} determination`,
        proctor_id: 'LEAD-PROCTOR-01'
      });
      setActionSuccess(`Incident marked as ${reviewDecision.toUpperCase()}`);
      setSelectedEvent(null);
      loadIncidents();
      onRefreshMetrics();
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      alert(`Error saving decision: ${err.message}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div>
      {/* Top Filter Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '440px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
            />
            <input
              type="text"
              placeholder="Search candidate, incident type, or source..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Status:</span>
            {(['all', 'unreviewed', 'reviewed', 'dismissed', 'escalated'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setReviewStatusFilter(st)}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: reviewStatusFilter === st ? '#4F46E5' : '#E2E8F0',
                  backgroundColor: reviewStatusFilter === st ? '#EEF2FF' : '#FFFFFF',
                  color: reviewStatusFilter === st ? '#4F46E5' : '#475569',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Severity Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Severity:</span>
            {(['all', 'critical', 'high', 'medium', 'info'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: severityFilter === sev ? '#0D9488' : '#E2E8F0',
                  backgroundColor: severityFilter === sev ? '#F0FDFA' : '#FFFFFF',
                  color: severityFilter === sev ? '#0D9488' : '#475569',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Incidents Table Panel */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#D97706" />
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A' }}>
              Normalized Detector Incidents Queue ({filteredIncidents.length})
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Shows real-time telemetry events emitted by on-device computer vision and security hooks
          </span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
            <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
            <p>Loading incident events queue...</p>
          </div>
        ) : errorMsg ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#DC2626' }}>
            <AlertOctagon size={32} style={{ margin: '0 auto 10px auto' }} />
            <p style={{ fontWeight: 600 }}>{errorMsg}</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div style={{ padding: '50px', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
            No incident events match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Candidate</th>
                  <th>Incident Type</th>
                  <th>Severity</th>
                  <th>Source / Confidence</th>
                  <th>Review Status</th>
                  <th>Reviewer Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((evt) => {
                  const isTechInterruption = evt.event_type.startsWith('SCREEN_SHARE_INTERRUPTED') || evt.source === 'webrtc_signaling';
                  return (
                    <tr key={evt.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '0.75rem' }}>
                        {new Date(evt.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{evt.candidate_name || 'Candidate'}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>{evt.candidate_id}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{evt.event_type}</div>
                        {isTechInterruption && (
                          <div style={{ fontSize: '0.6875rem', color: '#0D9488', fontWeight: 600 }}>
                            Technical Connection Interruption
                          </div>
                        )}
                        {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                          <div style={{ fontSize: '0.6875rem', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                            {JSON.stringify(evt.metadata).slice(0, 60)}...
                          </div>
                        )}
                      </td>
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
                      <td>
                        <div style={{ fontSize: '0.75rem', color: '#334155' }}>{evt.source}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748B' }}>
                          Confidence: {(evt.confidence * 100).toFixed(0)}%
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            evt.review_status === 'escalated'
                              ? 'danger'
                              : evt.review_status === 'reviewed'
                              ? 'success'
                              : evt.review_status === 'dismissed'
                              ? 'muted'
                              : 'warning'
                          }`}
                        >
                          {evt.review_status}
                        </span>
                        {evt.reviewed_by && (
                          <div style={{ fontSize: '0.6875rem', color: '#64748B', marginTop: '2px' }}>
                            By {evt.reviewed_by}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleOpenReviewModal(evt)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: evt.review_status === 'unreviewed' ? '#EEF2FF' : '#FFFFFF',
                            borderColor: evt.review_status === 'unreviewed' ? '#6366F1' : '#E2E8F0',
                            color: evt.review_status === 'unreviewed' ? '#4F46E5' : '#475569'
                          }}
                        >
                          <span>Review</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Decision Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={20} color="#4F46E5" />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                    Review Incident: {selectedEvent.event_type}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Candidate: {selectedEvent.candidate_name} ({selectedEvent.candidate_id})
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Event Metadata Breakdown */}
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.8125rem'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Recorded At:</span>{' '}
                    <strong>{new Date(selectedEvent.occurred_at).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Severity:</span>{' '}
                    <strong style={{ textTransform: 'uppercase' }}>{selectedEvent.severity}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Detection Source:</span>{' '}
                    <strong>{selectedEvent.source}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Model Confidence:</span>{' '}
                    <strong>{(selectedEvent.confidence * 100).toFixed(0)}%</strong>
                  </div>
                </div>

                {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '0.6875rem', color: '#64748B', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Context Metadata:
                    </div>
                    <pre
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid var(--border-light)',
                        padding: '8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        overflowX: 'auto',
                        fontFamily: 'monospace'
                      }}
                    >
                      {JSON.stringify(selectedEvent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Review Decision Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  Proctor Determination:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setReviewDecision('reviewed')}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: reviewDecision === 'reviewed' ? '#059669' : '#E2E8F0',
                      backgroundColor: reviewDecision === 'reviewed' ? '#ECFDF5' : '#FFFFFF',
                      color: reviewDecision === 'reviewed' ? '#065F46' : '#475569',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Acknowledge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('dismissed')}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: reviewDecision === 'dismissed' ? '#64748B' : '#E2E8F0',
                      backgroundColor: reviewDecision === 'dismissed' ? '#F1F5F9' : '#FFFFFF',
                      color: reviewDecision === 'dismissed' ? '#1E293B' : '#475569',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <XCircle size={16} />
                    <span>Dismiss False Alarm</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('escalated')}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: reviewDecision === 'escalated' ? '#DC2626' : '#E2E8F0',
                      backgroundColor: reviewDecision === 'escalated' ? '#FEF2F2' : '#FFFFFF',
                      color: reviewDecision === 'escalated' ? '#991B1B' : '#475569',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <AlertOctagon size={16} />
                    <span>Escalate Violation</span>
                  </button>
                </div>
              </div>

              {/* Justification Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Reviewer Notes &amp; Rationale:
                </label>
                <textarea
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Enter specific evidence, candidate explanation, or observation notes..."
                  className="form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={isSubmittingReview}
                className="btn btn-primary"
              >
                {isSubmittingReview ? 'Saving Decision...' : 'Save Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
