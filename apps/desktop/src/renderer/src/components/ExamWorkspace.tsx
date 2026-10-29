import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Lock,
  Layers,
  Eye
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
  const [incidentCounts, setIncidentCounts] = useState<{
    blur: number;
    face: number;
    multiple: number;
    gaze: number;
    eyewear: number;
  }>({
    blur: 0,
    face: 0,
    multiple: 0,
    gaze: 0,
    eyewear: 0
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
      setShowWarningModal('Security Alert: Multiple individuals detected in the testing area.');
    } else if (type === 'GAZE_AWAY_FROM_SCREEN') {
      setIncidentCounts((prev) => ({ ...prev, gaze: prev.gaze + 1 }));
      setShowWarningModal('Gaze Alert: Candidate looking away from the assessment monitor.');
      logEvent(backendUrl, session.id, type, 'opencv_gaze_tracker', 'medium', 0.88, { message });
    } else if (type === 'RESTRICTED_EYEWEAR_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, eyewear: prev.eyewear + 1 }));
      setShowWarningModal('Restricted Eyewear Alert: Tinted or dark glasses detected. Please remove them.');
      logEvent(backendUrl, session.id, type, 'opencv_vision_analyzer', 'high', 0.90, { message });
    } else if (type === 'WINDOW_BLUR' || type === 'FULLSCREEN_EXIT' || type === 'LOCKDOWN_KEY_BLOCKED') {
      setIncidentCounts((prev) => ({ ...prev, blur: prev.blur + 1 }));
      setShowWarningModal('Lockdown Violation: Moving out of the exam or switching windows is prohibited.');
      logEvent(backendUrl, session.id, type, 'electron_lockdown', 'critical', 1.0, { message });
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
      {/* Top Fixed Where U Elevate Proctoring Header */}
      <header
        style={{
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="brand-icon-box" style={{ width: '32px', height: '32px' }}>
              <Layers size={18} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '-0.01em' }}>Where U Elevate</span>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', marginLeft: '8px' }}>
                {exam.title} &bull; Candidate: <strong>{session.candidate_name}</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Active Security Badges */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1E293B',
              color: '#10B981',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid #334155'
            }}
          >
            <Lock size={12} /> OS Kiosk Lockdown Active
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1E293B',
              color: '#818CF8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid #334155'
            }}
          >
            <Eye size={12} /> Eye Tracking Active
          </span>

          {/* Countdown Clock */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: secondsRemaining < 120 ? '#EF4444' : '#1E293B',
              color: '#FFFFFF',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              border: `1px solid ${secondsRemaining < 120 ? '#F87171' : '#334155'}`
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
          maxWidth: '1320px',
          margin: '0 auto',
          width: '100%',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 360px',
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
              border: '1px solid var(--color-border)',
              boxShadow: '0 1px 3px rgba(15,23,42,0.04)'
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
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-sm)',
                    border: isCurrent
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    backgroundColor: isCurrent
                      ? 'var(--color-accent)'
                      : isAnswered
                      ? '#EEF2FF'
                      : 'var(--color-surface)',
                    color: isCurrent
                      ? '#FFFFFF'
                      : isAnswered
                      ? 'var(--color-accent)'
                      : 'var(--color-text-primary)',
                    fontWeight: 700,
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
          <div className="card" style={{ padding: '36px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Question {currentQuestion.question_number} of {exam.total_questions}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                {selectedAnswers[currentQuestion.id] ? 'Answer recorded' : 'Unanswered'}
              </span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5, marginBottom: '28px', color: '#0F172A' }}>
              {currentQuestion.text}
            </h3>

            {/* MCQ Choices */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                      padding: '16px 20px',
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
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-surface-muted)',
                        color: isSelected ? '#FFFFFF' : 'var(--color-text-primary)',
                        fontWeight: 700,
                        fontSize: '0.875rem'
                      }}
                    >
                      {choice.choice_letter}
                    </span>
                    <span style={{ fontSize: '0.9375rem', fontWeight: isSelected ? 600 : 400, color: '#0F172A' }}>
                      {choice.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Navigation Buttons */}
            <div
              style={{
                marginTop: '36px',
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
          <div className="card" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '14px', color: '#0F172A' }}>
              Where U Elevate Integrity Telemetry
            </h4>

            <div className="meta-list" style={{ margin: 0 }}>
              <div className="meta-row">
                <span className="meta-label">Eye Gaze Deviations</span>
                <span className="meta-value" style={{ color: incidentCounts.gaze > 0 ? '#D97706' : 'inherit' }}>
                  {incidentCounts.gaze}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Window Switch Attempts</span>
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
              <div className="meta-row">
                <span className="meta-label">Restricted Eyewear Alerts</span>
                <span className="meta-value" style={{ color: incidentCounts.eyewear > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.eyewear}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '14px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
              Protected against Discord/OBS overlays via hardware Content Protection. Window switching is permanently trapped.
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
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '500px',
              width: '90%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              border: '2px solid #EF4444'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#DC2626', marginBottom: '14px' }}>
              <AlertTriangle size={32} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Where U Elevate Integrity Alert</h3>
            </div>
            <p style={{ fontSize: '0.9375rem', color: '#0F172A', fontWeight: 600, marginBottom: '12px' }}>
              {showWarningModal}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              You are in mandatory full-screen lockdown. You cannot switch windows, move out of the exam, or look away from the monitor. This violation is logged in your permanent assessment timeline.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowWarningModal(null)}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Acknowledge & Return to Assessment
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
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999
          }}
        >
          <div className="card" style={{ maxWidth: '460px', width: '90%', padding: '28px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
              Submit Assessment?
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              You have answered {Object.keys(selectedAnswers).length} of {exam.total_questions} questions.
              Once submitted, your responses and complete integrity telemetry timeline will be permanently sealed.
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
                {isSubmitting ? 'Sealing Responses...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
