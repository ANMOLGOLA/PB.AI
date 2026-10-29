import React, { useState } from 'react';
import { BookOpen, Clock, FileQuestion, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { PublicExam } from '../api/types';

interface ExamOverviewProps {
  exams: PublicExam[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ExamOverview: React.FC<ExamOverviewProps> = ({ exams, isLoading }) => {
  const [expandedExamId, setExpandedExamId] = useState<string | null>(
    exams.length > 0 ? exams[0].id : null
  );

  const toggleExpand = (id: string) => {
    setExpandedExamId((prev) => (prev === id ? null : id));
  };

  if (isLoading && exams.length === 0) {
    return (
      <section className="exam-section" aria-busy="true">
        <h2 className="card-title">Available Assessments</h2>
        <p style={{ marginTop: '8px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          Querying assessment repository...
        </p>
      </section>
    );
  }

  if (exams.length === 0) {
    return (
      <section className="exam-section">
        <div className="card-header">
          <div className="card-title-group">
            <BookOpen size={18} className="card-icon" aria-hidden="true" />
            <h2 className="card-title">Available Assessments</h2>
          </div>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          No active assessments available. Ensure database is seeded via <code>npm run backend:seed</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="exam-section" aria-labelledby="assessments-title">
      <div className="exam-header">
        <div>
          <div className="card-title-group">
            <BookOpen size={18} className="card-icon" aria-hidden="true" />
            <h2 id="assessments-title" className="card-title">
              Configured Assessments ({exams.length})
            </h2>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Seeded evaluation module ready for examination workflows.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="status-badge connected">
            <ShieldCheck size={14} aria-hidden="true" />
            Answer Keys Sealed
          </span>
        </div>
      </div>

      {exams.map((exam) => {
        const isExpanded = expandedExamId === exam.id;
        return (
          <div
            key={exam.id}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              backgroundColor: 'var(--color-surface)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }}
              onClick={() => toggleExpand(exam.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(exam.id);
                }
              }}
              aria-expanded={isExpanded}
            >
              <div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{exam.title}</h3>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    marginTop: '4px'
                  }}
                >
                  {exam.description}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '8px',
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-tertiary)'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} aria-hidden="true" />
                    {exam.duration_minutes} Minutes
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <FileQuestion size={13} aria-hidden="true" />
                    {exam.total_questions} Questions
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.8125rem' }}
                aria-label={isExpanded ? 'Collapse questions' : 'Expand questions'}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {isExpanded && (
              <div className="question-preview-list">
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-tertiary)'
                  }}
                >
                  Public Question Structure (5 Items)
                </div>

                {exam.questions.map((q) => (
                  <article key={q.id} className="question-item">
                    <h4 className="question-title">
                      Question {q.question_number}: {q.text}
                    </h4>
                    <div className="choices-grid">
                      {q.choices.map((choice) => (
                        <div key={choice.id} className="choice-chip">
                          <span className="choice-chip-letter">{choice.choice_letter}.</span>
                          <span>{choice.text}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};
