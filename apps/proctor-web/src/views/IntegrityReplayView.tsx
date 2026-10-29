import React, { useState, useEffect } from 'react';
import {
  History,
  Shield
} from 'lucide-react';
import {
  CandidateSessionSummary,
  IncidentEventRecord,
  fetchSessionDetail
} from '../api/proctorClient';

interface IntegrityReplayViewProps {
  sessions: CandidateSessionSummary[];
  backendUrl: string;
  authCode: string;
  initialSessionId?: string | null;
}

export const IntegrityReplayView: React.FC<IntegrityReplayViewProps> = ({
  sessions,
  backendUrl,
  authCode,
  initialSessionId
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId || (sessions.length > 0 ? sessions[0].session_id : '')
  );
  const [sessionDetail, setSessionDetail] = useState<{
    session: any;
    events: IncidentEventRecord[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeInspectEventId, setActiveInspectEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].session_id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setIsLoading(true);
    fetchSessionDetail(backendUrl, selectedSessionId, authCode)
      .then((data) => {
        setSessionDetail(data);
        if (data.events && data.events.length > 0 && !activeInspectEventId) {
          setActiveInspectEventId(data.events[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedSessionId, backendUrl, authCode]);

  const rawEvents = sessionDetail?.events || [];
  const filteredEvents = rawEvents.filter((e) => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'vision') {
      return (
        e.event_type.includes('FACE') ||
        e.event_type.includes('GAZE') ||
        e.event_type.includes('PHONE') ||
        e.event_type.includes('EYEWEAR')
      );
    }
    if (categoryFilter === 'screenshare') {
      return e.event_type.includes('SCREEN_SHARE');
    }
    if (categoryFilter === 'lockdown') {
      return (
        e.event_type.includes('WINDOW_BLUR') ||
        e.event_type.includes('FULLSCREEN') ||
        e.event_type.includes('KEY')
      );
    }
    return true;
  });

  const inspectEvent = rawEvents.find((e) => e.id === activeInspectEventId) || filteredEvents[0] || null;

  return (
    <div>
      {/* Session Selector & Category Bar */}
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
          <History size={18} color="#4F46E5" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>
            Select Candidate Session:
          </span>
          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSelectedSessionId(e.target.value);
              setActiveInspectEventId(null);
            }}
            className="form-select"
            style={{ width: '320px' }}
          >
            {sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.candidate_name} ({s.candidate_id}) &bull; {s.exam_title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Category:</span>
          {(['all', 'vision', 'screenshare', 'lockdown'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: categoryFilter === cat ? '#4F46E5' : '#E2E8F0',
                backgroundColor: categoryFilter === cat ? '#EEF2FF' : '#FFFFFF',
                color: categoryFilter === cat ? '#4F46E5' : '#475569',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {cat === 'all' ? 'All Signals' : cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
          <p>Loading chronological audit events...</p>
        </div>
      ) : !sessionDetail ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
          No session selected.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '24px' }}>
          {/* Left Column: Chronological Event Stream */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--bg-surface-subtle)'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>
                Chronological Signal Log ({filteredEvents.length})
              </div>
              <span style={{ fontSize: '0.6875rem', color: '#64748B' }}>
                Click any event to inspect telemetry
              </span>
            </div>

            <div style={{ maxHeight: '600px', overflowY: 'auto', padding: '12px' }}>
              {filteredEvents.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '0.8125rem' }}>
                  No recorded events match the selected category.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredEvents.map((evt) => {
                    const isSelected = evt.id === (inspectEvent?.id);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => setActiveInspectEventId(evt.id)}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #4F46E5' : '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span
                            className={`status-pill ${
                              evt.severity === 'critical' || evt.severity === 'high'
                                ? 'danger'
                                : evt.severity === 'medium'
                                ? 'warning'
                                : 'info'
                            }`}
                          >
                            {evt.event_type}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>
                            {new Date(evt.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '6px' }}>
                          Detector: <strong style={{ color: '#0F172A' }}>{evt.source}</strong>
                          {evt.confidence && ` &bull; ${(evt.confidence * 100).toFixed(0)}% confidence`}
                        </div>

                        {evt.review_status && evt.review_status !== 'unreviewed' && (
                          <div style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                            ✓ {evt.review_status.toUpperCase()} ({evt.reviewed_by})
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Detailed Signal Evidence & Forensic Analysis */}
          <div className="panel" style={{ padding: '24px' }}>
            <div className="panel-header" style={{ marginBottom: '18px' }}>
              <div className="panel-title">
                <Shield size={18} color="#4F46E5" />
                <span>Forensic Signal Inspection</span>
              </div>
              {inspectEvent && (
                <span
                  className={`status-pill ${
                    inspectEvent.severity === 'critical' || inspectEvent.severity === 'high'
                      ? 'danger'
                      : inspectEvent.severity === 'medium'
                      ? 'warning'
                      : 'info'
                  }`}
                >
                  {inspectEvent.severity} severity
                </span>
              )}
            </div>

            {!inspectEvent ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                Select an event from the timeline to inspect evidence.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Event Identification Card */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                    {inspectEvent.event_type}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.8125rem' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Event UUID:</span>{' '}
                      <code style={{ fontSize: '0.75rem', backgroundColor: '#FFFFFF', padding: '2px 4px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                        {inspectEvent.id}
                      </code>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Timestamp:</span>{' '}
                      <strong>{new Date(inspectEvent.occurred_at).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Detection Engine:</span>{' '}
                      <strong>{inspectEvent.source}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Measurement Confidence:</span>{' '}
                      <strong>{(inspectEvent.confidence * 100).toFixed(0)}%</strong>
                    </div>
                  </div>
                </div>

                {/* Evidence Separation Notice */}
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#F0FDFA',
                    border: '1px solid #CCFBF1',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    color: '#0F766E',
                    lineHeight: 1.5
                  }}
                >
                  <strong>Responsible Verification Standard:</strong> Automated detections reflect real-time on-device heuristics (MediaPipe keypoints, OS window focus). Single transient detections are smoothed by Layer B temporal tracker. No automatic disqualification occurs without proctor manual confirmation.
                </div>

                {/* Raw Telemetry JSON Payload */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                    Raw Telemetry &amp; Detector Metadata:
                  </div>
                  <pre
                    style={{
                      backgroundColor: '#0F172A',
                      color: '#E2E8F0',
                      padding: '16px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      maxHeight: '240px',
                      overflowY: 'auto'
                    }}
                  >
                    {JSON.stringify(inspectEvent.metadata, null, 2)}
                  </pre>
                </div>

                {/* Proctor Review Outcome History */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    backgroundColor: '#FFFFFF'
                  }}
                >
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                    Proctor Review Status:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
                    <span
                      className={`status-pill ${
                        inspectEvent.review_status === 'escalated'
                          ? 'danger'
                          : inspectEvent.review_status === 'reviewed'
                          ? 'success'
                          : inspectEvent.review_status === 'dismissed'
                          ? 'muted'
                          : 'warning'
                      }`}
                    >
                      {inspectEvent.review_status}
                    </span>
                    {inspectEvent.reviewed_by && (
                      <span style={{ color: '#475569' }}>
                        Reviewed by <strong>{inspectEvent.reviewed_by}</strong>
                        {inspectEvent.reviewed_at && ` on ${new Date(inspectEvent.reviewed_at).toLocaleDateString()}`}
                      </span>
                    )}
                  </div>
                  {inspectEvent.review_notes && (
                    <div style={{ marginTop: '8px', fontSize: '0.8125rem', color: '#334155', fontStyle: 'italic' }}>
                      "{inspectEvent.review_notes}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
