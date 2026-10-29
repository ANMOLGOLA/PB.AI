import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Lock,
  Layers,
  AlertOctagon,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { WebcamProctor } from './WebcamProctor';
import { PublicExam, CandidateSession } from '../api/types';
import { saveAnswer, logEvent, unlockWithTeacherCode } from '../api/client';

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

  // Granular incident counts
  const [incidentCounts, setIncidentCounts] = useState<{
    blur: number;
    face: number;
    multiple: number;
    gaze: number;
    eyewear: number;
    earpiece: number;
    impersonation: number;
  }>({
    blur: 0,
    face: 0,
    multiple: 0,
    gaze: 0,
    eyewear: 0,
    earpiece: 0,
    impersonation: 0
  });

  const [showWarningModal, setShowWarningModal] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);

  // Teacher Lockout State (Triggered when 5 total warnings accumulated)
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [teacherCodeInput, setTeacherCodeInput] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockSuccessMsg, setUnlockSuccessMsg] = useState<string | null>(null);

  const currentQuestion = exam.questions[currentQuestionIndex];

  // Calculate total active warnings
  const totalWarnings =
    incidentCounts.blur +
    incidentCounts.face +
    incidentCounts.multiple +
    incidentCounts.gaze +
    incidentCounts.eyewear +
    incidentCounts.earpiece +
    incidentCounts.impersonation;

  // Check if warnings hit the maximum threshold of 5
  useEffect(() => {
    if (totalWarnings >= 5 && !isLockedOut) {
      setIsLockedOut(true);
      setShowWarningModal(null); // Dismiss transient modal in favor of strict lockout
      logEvent(backendUrl, session.id, 'EXAM_LOCKED_OUT_5_WARNINGS', 'lockout_guard', 'critical', 1.0, {
        total_warnings: totalWarnings,
        breakdown: incidentCounts
      });
    }
  }, [totalWarnings, isLockedOut, backendUrl, session.id, incidentCounts]);

  // Timer countdown
  useEffect(() => {
    if (isLockedOut) return; // Freeze timer during teacher lockout
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
  }, [onSubmitExam, isLockedOut]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainderSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainderSecs.toString().padStart(2, '0')}`;
  };

  // Handle Answer Selection
  const handleSelectChoice = async (questionId: string, choiceId: string) => {
    if (isLockedOut) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    try {
      await saveAnswer(backendUrl, session.id, questionId, choiceId);
    } catch (err) {
      console.warn('Failed to save answer:', err);
    }
  };

  // Telemetry event handler
  const handleViolation = useCallback((type: string, message: string) => {
    if (isLockedOut) return;

    if (type === 'NO_FACE_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, face: prev.face + 1 }));
      setShowWarningModal('Warning: No face detected. Please face the webcam.');
      logEvent(backendUrl, session.id, type, 'opencv_cv_engine', 'high', 0.95, { message });
    } else if (type === 'MULTIPLE_FACES_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, multiple: prev.multiple + 1 }));
      setShowWarningModal('Security Alert: Multiple individuals detected in the testing area.');
      logEvent(backendUrl, session.id, type, 'opencv_cv_engine', 'critical', 0.96, { message });
    } else if (type === 'GAZE_AWAY_FROM_SCREEN') {
      setIncidentCounts((prev) => ({ ...prev, gaze: prev.gaze + 1 }));
      setShowWarningModal('Gaze Alert: Candidate looking away from the assessment monitor for sustained duration.');
      logEvent(backendUrl, session.id, type, 'opencv_gaze_tracker', 'medium', 0.88, { message });
    } else if (type === 'FACE_MISMATCH_IMPERSONATION') {
      setIncidentCounts((prev) => ({ ...prev, impersonation: prev.impersonation + 1 }));
      setShowWarningModal('Biometric Impersonation Alert: Face does not match candidate Face ID enrolled.');
      logEvent(backendUrl, session.id, type, 'mediapipe_biometrics', 'critical', 0.92, { message });
    } else if (type === 'EARPIECE_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, earpiece: prev.earpiece + 1 }));
      setShowWarningModal('Audio Device Alert: Concealed Bluetooth earbud or earpiece detected.');
      logEvent(backendUrl, session.id, type, 'auricular_vision_scanner', 'high', 0.94, { message });
    } else if (type === 'RESTRICTED_EYEWEAR_DETECTED') {
      setIncidentCounts((prev) => ({ ...prev, eyewear: prev.eyewear + 1 }));
      setShowWarningModal('Restricted Eyewear Alert: Tinted or dark glasses detected. Please remove them.');
      logEvent(backendUrl, session.id, type, 'opencv_vision_analyzer', 'high', 0.90, { message });
    } else if (type === 'WINDOW_BLUR' || type === 'FULLSCREEN_EXIT' || type === 'LOCKDOWN_KEY_BLOCKED') {
      setIncidentCounts((prev) => ({ ...prev, blur: prev.blur + 1 }));
      setShowWarningModal('Lockdown Violation: Moving out of the exam or switching windows is prohibited.');
      logEvent(backendUrl, session.id, type, 'electron_lockdown', 'critical', 1.0, { message });
    }
  }, [backendUrl, session.id, isLockedOut]);

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

  // Handle Teacher Code Unlock
  const handleTeacherUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherCodeInput.trim()) return;

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      await unlockWithTeacherCode(backendUrl, session.id, teacherCodeInput.trim());
      // Reset warnings on successful unlock
      setIncidentCounts({
        blur: 0,
        face: 0,
        multiple: 0,
        gaze: 0,
        eyewear: 0,
        earpiece: 0,
        impersonation: 0
      });
      setIsLockedOut(false);
      setTeacherCodeInput('');
      setUnlockSuccessMsg('Teacher authorization approved. Assessment access has been restored.');
      setTimeout(() => setUnlockSuccessMsg(null), 5000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUnlockError(err.message);
      } else {
        setUnlockError('Invalid teacher authorization code. Access denied.');
      }
    } finally {
      setIsUnlocking(false);
    }
  };

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
                {session.face_id && (
                  <span style={{ marginLeft: '8px', color: '#A5B4FC', fontWeight: 600 }}>
                    [{session.face_id}]
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Warnings Indicator (X / 5) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: totalWarnings >= 4 ? '#7F1D1D' : totalWarnings >= 2 ? '#78350F' : '#1E293B',
              border: `1px solid ${totalWarnings >= 4 ? '#EF4444' : totalWarnings >= 2 ? '#F59E0B' : '#334155'}`,
              color: '#FFFFFF',
              fontSize: '0.8125rem',
              fontWeight: 700,
              transition: 'all 0.3s ease'
            }}
          >
            <AlertTriangle size={15} color={totalWarnings >= 4 ? '#EF4444' : totalWarnings >= 2 ? '#F59E0B' : '#94A3B8'} />
            <span>Warnings: {totalWarnings} / 5</span>
            {totalWarnings >= 4 && <span style={{ color: '#FCA5A5', fontSize: '0.7rem' }}>(Critical)</span>}
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#1E293B',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #334155',
              color: '#10B981'
            }}
          >
            <Lock size={12} /> KIOSK LOCKED &bull; ANTI-OVERLAY
          </div>
        </div>

        {/* Right: Timer & Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '1.0625rem',
              fontWeight: 700,
              color: secondsRemaining < 300 ? '#EF4444' : '#F8FAFC'
            }}
          >
            <Clock size={18} />
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitConfirm(true)}
            className="btn btn-primary"
            disabled={isSubmitting || isLockedOut}
            style={{ padding: '8px 18px', fontSize: '0.875rem', fontWeight: 600 }}
          >
            <Send size={15} />
            <span>Submit Exam</span>
          </button>
        </div>
      </header>

      {/* Success Notification after teacher unlock */}
      {unlockSuccessMsg && (
        <div
          style={{
            backgroundColor: '#059669',
            color: '#FFFFFF',
            padding: '10px 24px',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <ShieldCheck size={18} />
          <span>{unlockSuccessMsg}</span>
        </div>
      )}

      {/* Main Examination Assessment Workspace */}
      <main
        style={{
          flex: 1,
          maxWidth: '1360px',
          width: '100%',
          margin: '0 auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '24px'
        }}
      >
        {/* Left Column: MCQ Navigation & Question Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Question Number Navigation Badges */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                Assessment Questions ({exam.total_questions})
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                Answered: {Object.keys(selectedAnswers).length} / {exam.total_questions}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {exam.questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIndex;
                const isAnswered = !!selectedAnswers[q.id];

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(idx)}
                    disabled={isLockedOut}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      cursor: isLockedOut ? 'not-allowed' : 'pointer',
                      border: isCurrent
                        ? '2px solid var(--color-accent)'
                        : isAnswered
                        ? '1px solid #10B981'
                        : '1px solid var(--color-border)',
                      backgroundColor: isCurrent
                        ? 'var(--color-accent)'
                        : isAnswered
                        ? '#ECFDF5'
                        : 'var(--color-surface)',
                      color: isCurrent
                        ? '#FFFFFF'
                        : isAnswered
                        ? '#065F46'
                        : 'var(--color-text-primary)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {q.question_number}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Question Display */}
          <div className="card" style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
                Question {currentQuestion.question_number} of {exam.total_questions}
              </span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5, marginBottom: '28px', color: 'var(--color-text-primary)' }}>
              {currentQuestion.text}
            </h3>

            {/* MCQ Choice Radio Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {currentQuestion.choices.map((choice) => {
                const isSelected = selectedAnswers[currentQuestion.id] === choice.id;

                return (
                  <div
                    key={choice.id}
                    onClick={() => !isLockedOut && handleSelectChoice(currentQuestion.id, choice.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px 20px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected
                        ? '2px solid var(--color-accent)'
                        : '1px solid var(--color-border)',
                      backgroundColor: isSelected ? '#EEF2FF' : 'var(--color-surface)',
                      cursor: isLockedOut ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-surface-muted)',
                        color: isSelected ? '#FFFFFF' : 'var(--color-text-secondary)',
                        border: isSelected ? 'none' : '1px solid var(--color-border)'
                      }}
                    >
                      {choice.choice_letter}
                    </div>
                    <span style={{ fontSize: '0.9375rem', fontWeight: isSelected ? 600 : 400, color: 'var(--color-text-primary)' }}>
                      {choice.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Navigation Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={currentQuestionIndex === 0 || isLockedOut}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              {currentQuestionIndex < exam.total_questions - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isLockedOut}
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                >
                  <span>Next Question</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={isSubmitting || isLockedOut}
                >
                  <span>Review & Submit</span>
                  <Send size={16} />
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
                <span className="meta-label">Total Warnings</span>
                <span className="meta-value" style={{ color: totalWarnings >= 4 ? '#DC2626' : totalWarnings >= 2 ? '#D97706' : '#10B981', fontWeight: 700 }}>
                  {totalWarnings} / 5
                </span>
              </div>
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
                <span className="meta-label">Face ID Mismatch (Impersonation)</span>
                <span className="meta-value" style={{ color: incidentCounts.impersonation > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.impersonation}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Earpiece / Audio Alerts</span>
                <span className="meta-value" style={{ color: incidentCounts.earpiece > 0 ? '#DC2626' : 'inherit' }}>
                  {incidentCounts.earpiece}
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

      {/* Warning Alert Modal (Transient warning acknowledgment before lockout) */}
      {showWarningModal && !isLockedOut && (
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
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '0.8125rem',
                color: '#991B1B',
                fontWeight: 600
              }}
            >
              Warning Count: {totalWarnings} / 5. (At 5 warnings, the assessment will be permanently locked out).
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              You are in mandatory full-screen lockdown. You cannot switch windows, move out of the exam, or look away from the monitor. This violation is logged in your permanent assessment timeline.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowWarningModal(null)}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Acknowledge &amp; Return to Assessment
            </button>
          </div>
        </div>
      )}

      {/* TEACHER LOCKOUT MODAL (Triggered when 5 Warnings Reached) */}
      {isLockedOut && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '560px',
              width: '92%',
              padding: '36px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              border: '2px solid #EF4444',
              backgroundColor: '#FFFFFF'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '12px',
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626'
                }}
              >
                <AlertOctagon size={32} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#DC2626', letterSpacing: '0.05em' }}>
                  Integrity Limit Exceeded
                </span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                  Assessment Access Revoked
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '0.9375rem', color: '#334155', lineHeight: 1.5, marginBottom: '16px' }}>
              Candidate <strong>{session.candidate_name}</strong> has accumulated <strong>5 integrity warnings</strong>.
              In accordance with Where U Elevate assessment policies, access to question inputs and submission is blocked.
            </p>

            {/* Violation Audit Breakdown */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: '0.8125rem'
              }}
            >
              <strong style={{ display: 'block', marginBottom: '6px', color: '#0F172A' }}>
                Accumulated Warnings Breakdown:
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', color: '#64748B' }}>
                <div>Eye Gaze Deviations: <strong>{incidentCounts.gaze}</strong></div>
                <div>Window Blur / Alt+Tab: <strong>{incidentCounts.blur}</strong></div>
                <div>Face Absences: <strong>{incidentCounts.face}</strong></div>
                <div>Multiple Faces: <strong>{incidentCounts.multiple}</strong></div>
                <div>Face ID Mismatch: <strong>{incidentCounts.impersonation}</strong></div>
                <div>Earpiece / Audio: <strong>{incidentCounts.earpiece}</strong></div>
              </div>
            </div>

            {/* Teacher Code Input Form */}
            <form onSubmit={handleTeacherUnlock}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                Teacher / Proctor Authorization Code
              </label>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <KeyRound size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    value={teacherCodeInput}
                    onChange={(e) => setTeacherCodeInput(e.target.value)}
                    placeholder="Enter unique teacher code..."
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 38px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.9375rem',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isUnlocking || !teacherCodeInput.trim()}
                  className="btn btn-primary"
                  style={{ padding: '12px 20px', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {isUnlocking ? 'Authorizing...' : 'Unlock Exam'}
                </button>
              </div>

              {unlockError && (
                <div style={{ color: '#DC2626', fontSize: '0.8125rem', marginTop: '8px', fontWeight: 600 }}>
                  {unlockError}
                </div>
              )}

              {/* Developer / Testing Helper Callout */}
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  backgroundColor: '#EEF2FF',
                  border: '1px solid #C7D2FE',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem'
                }}
              >
                <div>
                  <span style={{ color: '#4338CA', fontWeight: 600 }}>Test Teacher Code: </span>
                  <code style={{ fontWeight: 700, backgroundColor: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #A5B4FC' }}>
                    TEACHER-UNLOCK-2026
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => setTeacherCodeInput('TEACHER-UNLOCK-2026')}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#4F46E5',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    textDecoration: 'underline'
                  }}
                >
                  Auto-Fill Code
                </button>
              </div>
            </form>
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
