import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Shield,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Maximize2
} from 'lucide-react';
import { WebcamProctor } from './WebcamProctor';
import { PublicExam, CandidateSession } from '../api/types';
import { saveAnswer, logEvent } from '../api/client';

interface ExamWorkspaceProps {
  exam: PublicExam;
  session: CandidateSession;
  backendUrl: string;
  onSubmitExam: () => void;
  isSubmitting: boolean;
  onExitFullscreen?: () => void;
}

export const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({
  exam,
  session,
  backendUrl,
  onSubmitExam,
  isSubmitting
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [secondsRemaining, setSecondsRemaining] = useState<number>(exam.duration_minutes * 60);
  const [incidentCounts, setIncidentCounts] = useState<{ blur: number; face: number; multiple: number }>({
    blur: 0,
    face: 0,
    multiple: 0
  });
  const [showWarningModal, setShowWarningModal] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);

  const currentQuestion = exam.questions[currentQuestionIndex];

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onSubmitExam]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainderSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainderSecs.toString().padStart(2, '0')}`;
  };

  // Handle Answer Selection
  const handleSelectChoice = async (questionId: string, choiceId: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    try {
      await saveAnswer(backendUrl, session.id, questionId, choiceId);
    } catch (err) {
      console.warn('Failed to save answer:', err);
    }
  };

  // Telemetry event handler
  const handleViolation = useCallback((type: string, message: string) => {
    if (type === 'NO_FACE_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, face: prev.face + 1 }));
      setShowWarningModal('Warning: No face detected. Please face the webcam.');
    } else if (type === 'MULTIPLE_FACES_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, multiple: prev.multiple + 1 }));
      setShowWarningModal('Security Alert: Multiple individuals detected.');
    } else if (type === 'WINDOW_BLUR' || type === 'FULLSCREEN_EXIT') {
      setIncidentCounts((prev) => ({ ...prev, blur: prev.blur + 1 }));
      setShowWarningModal('Security Alert: Assessment window lost focus or exited full-screen.');
      logEvent(backendUrl, session.id, type, 'electron_monitor', 'medium', 1.0, { message });
    }
  }, [backendUrl, session.id]);

  // Window Focus / Blur & Fullscreen Listeners
  useEffect(() => {
    if (window.sentinelBridge) {
      const unsubFocus = window.sentinelBridge.onFocusChange(({ focused }) => {
        if (!focused) {
          handleViolation('WINDOW_BLUR', 'Window unfocused');
        }
      });
      const unsubAlert = window.sentinelBridge.onSecurityAlert((alert) => {
        handleViolation(alert.type, alert.message);
      });
      const unsubFs = window.sentinelBridge.onFullscreenChange(({ isFullScreen }) => {
        if (!isFullScreen) {
          handleViolation('FULLSCREEN_EXIT', 'Fullscreen exited');
        }
      });
      return () => {
        unsubFocus();
        unsubAlert();
        unsubFs();
      };
    } else {
      const handleWindowBlur = () => handleViolation('WINDOW_BLUR', 'Browser window lost focus');
      window.addEventListener('blur', handleWindowBlur);
      return () => window.removeEventListener('blur', handleWindowBlur);
    }
  }, [handleViolation]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)' }}>
      {/* Top Fixed Proctoring Header */}
      <header
        style={{
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="brand-section">
            <div className="brand-icon-box" style={{ width: '32px', height: '32px' }}>
              <Shield size={18} />
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{exam.title}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                Candidate: <strong>{session.candidate_name}</strong> ({session.candidate_id})
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Fullscreen indicator */}
          <span className="status-badge connected" style={{ fontSize: '0.75rem' }}>
            <Maximize2 size={13} /> Full-Screen Lockdown Active
          </span>

          {/* Countdown Clock */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: secondsRemaining < 120 ? '#FEE2E2' : 'var(--color-surface-muted)',
              color: secondsRemaining < 120 ? '#DC2626' : 'var(--color-text-primary)',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              border: `1px solid ${secondsRemaining < 120 ? '#F87171' : 'var(--color-border)'}`
            }}
          >
            <Clock size={16} />
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowSubmitConfirm(true)}
            style={{ padding: '8px 16px', fontSize: '0.875rem' }}
          >
            <Send size={14} /> Submit Exam
          </button>
        </div>
      </header>

      {/* Main Assessment Body: Questions + Floating Proctor */}
      <main
        style={{
          flex: 1,
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '24px',
          alignItems: 'start'
        }}
      >
        {/* Left Column: Question Navigator & Question Card */}
        <div>
          {/* Question Number Pills */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '20px',
              backgroundColor: 'var(--color-surface)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)'
            }}
          >
            {exam.questions.map((q, idx) => {
              const isAnswered = !!selectedAnswers[q.id];
              const isCurrent = idx === currentQuestionIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentQuestionIndex(idx)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--radius-sm)',
                    border: isCurrent
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    backgroundColor: isCurrent
                      ? 'var(--color-accent)'
                      : isAnswered
                      ? '#D1FAE5'
                      : 'var(--color-surface)',
                    color: isCurrent
                      ? '#FFFFFF'
                      : isAnswered
                      ? '#065F46'
                      : 'var(--color-text-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                  aria-label={`Go to Question ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Current Question View */}
          <div className="card" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Question {currentQuestion.question_number} of {exam.total_questions}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                {selectedAnswers[currentQuestion.id] ? 'Answer recorded' : 'Unanswered'}
              </span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5, marginBottom: '24px' }}>
              {currentQuestion.text}
            </h3>

            {/* MCQ Choices */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentQuestion.choices.map((choice) => {
                const isSelected = selectedAnswers[currentQuestion.id] === choice.id;
                return (
                  <div
                    key={choice.id}
                    onClick={() => handleSelectChoice(currentQuestion.id, choice.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 18px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected
                        ? '2px solid var(--color-accent)'
                        : '1px solid var(--color-border)',
                      backgroundColor: isSelected
                        ? 'var(--color-accent-subtle)'
                        : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-surface-muted)',
                        color: isSelected ? '#FFFFFF' : 'var(--color-text-primary)',
                        fontWeight: 600,
                        fontSize: '0.875rem'
                      }}
                    >
                      {choice.choice_letter}
                    </span>
                    <span style={{ fontSize: '0.9375rem', fontWeight: isSelected ? 500 : 400 }}>
                      {choice.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Navigation Buttons */}
            <div
              style={{
                marginTop: '32px',
                paddingTop: '20px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>

              {currentQuestionIndex < exam.questions.length - 1 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowSubmitConfirm(true)}
                >
                  <Send size={16} /> Review & Submit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Webcam Proctor & Telemetry Signals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Live Video Feed */}
          <WebcamProctor
            backendUrl={backendUrl}
            sessionId={session.id}
            onViolation={handleViolation}
          />

          {/* Session Telemetry Counters */}
          <div className="card" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>
              Integrity Monitor Status
            </h4>

            <div className="meta-list" style={{ margin: 0 }}>
              <div className="meta-row">
                <span className="meta-label">Focus Transitions</span>
                <span className="meta-value" style={{ color: incidentCounts.blur > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.blur}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Face Absences</span>
                <span className="meta-value" style={{ color: incidentCounts.face > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.face}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Multiple Faces Detected</span>
                <span className="meta-value" style={{ color: incidentCounts.multiple > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.multiple}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
              Events are timestamped with detector confidence and logged to the examiner review queue.
            </div>
          </div>
        </div>
      </main>

      {/* Warning Alert Modal */}
      {showWarningModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '90%',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              border: '2px solid #EF4444'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#DC2626', marginBottom: '12px' }}>
              <AlertTriangle size={28} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Proctoring Integrity Alert</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              {showWarningModal}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Please maintain your camera view and remain inside the assessment window. This observation has been logged to your timeline.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowWarningModal(null)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Acknowledge & Return to Exam
            </button>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div className="card" style={{ maxWidth: '440px', width: '90%', padding: '24px' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '8px' }}>
              Submit Assessment?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              You have answered {Object.keys(selectedAnswers).length} of {exam.total_questions} questions. Once submitted, your answers and integrity timeline will be sealed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSubmitConfirm(false)}
                disabled={isSubmitting}
              >
                Continue Assessment
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSubmitExam}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Finalizing...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
