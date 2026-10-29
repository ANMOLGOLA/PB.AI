import React, { useState } from 'react';
import {
  Sliders,
  PlusCircle,
  CheckCircle2,
  KeyRound,
  AlertTriangle
} from 'lucide-react';
import { createAssessment } from '../api/proctorClient';

interface AdminViewProps {
  backendUrl: string;
  authCode: string;
  onRefreshAll: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  backendUrl,
  authCode,
  onRefreshAll
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createAssessment(backendUrl, authCode, {
        title,
        description: description || 'Custom proctored technical assessment',
        duration_minutes: Number(durationMinutes)
      });
      setSuccessMsg(`Successfully created assessment: "${res.title}" (${res.duration_minutes}m)`);
      setTitle('');
      setDescription('');
      onRefreshAll();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create assessment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Sliders size={18} color="#4F46E5" />
            <span>Assessment &amp; Proctor Configuration</span>
          </div>
        </div>

        {successMsg && (
          <div
            style={{
              padding: '12px 16px',
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
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateAssessment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
              Assessment Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Distributed Systems & Cloud Security"
              className="form-input"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
              Description &amp; Objective
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the scope and competencies evaluated..."
              className="form-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ maxWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
              Duration (Minutes)
            </label>
            <input
              type="number"
              min={5}
              max={180}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="form-input"
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <PlusCircle size={16} />
              <span>{isSubmitting ? 'Creating Assessment...' : 'Create Assessment'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Proctor Authorization Keys Reference */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <KeyRound size={18} color="#0D9488" />
            <span>Authorized Examiner Access Keys</span>
          </div>
        </div>

        <p style={{ fontSize: '0.8125rem', color: '#475569', marginBottom: '14px' }}>
          The following pre-configured authorization tokens grant proctor administrative oversight and WebRTC live stream access:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {['TEACHER-UNLOCK-2026', 'ELEV8-2026', '778899'].map((code) => (
            <div
              key={code}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-light)',
                textAlign: 'center'
              }}
            >
              <code style={{ fontSize: '0.875rem', fontWeight: 700, color: '#4F46E5' }}>{code}</code>
              <div style={{ fontSize: '0.6875rem', color: '#64748B', marginTop: '4px' }}>Full Examiner Scope</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
