import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  Monitor,
  KeyRound,
  AlertOctagon,
  Flag,
  LogOut
} from 'lucide-react';
import { WebcamProctor } from './WebcamProctor';
import { ScreenSource } from './ScreenSourcePicker';
import { ScreenShareState } from '../hooks/useScreenShare';
import { PublicExam, CandidateSession } from '../api/types';
import { saveAnswer, fetchAnswers, logEvent, unlockWithTeacherCode } from '../api/client';

interface ExamWorkspaceProps {
  exam: PublicExam;
  session: CandidateSession;
  backendUrl: string;
  screenShareState: ScreenShareState;
  screenShareSourceName: string;
  screenShareError: string | null;
  webcamStream?: MediaStream | null;
  onStartScreenShare: (source: ScreenSource | null) => Promise<void>;
  onStopScreenShare: (reason?: string) => Promise<void>;
  onSubmitExam: () => void;
  isSubmitting: boolean;
}

export const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({
  exam,
  session,
  backendUrl,
  screenShareState,
  screenShareSourceName: _screenShareSourceName,
  screenShareError,
  webcamStream = null,
  onStartScreenShare,
  onStopScreenShare,
  onSubmitExam,
  isSubmitting
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [reviewedQuestions, setReviewedQuestions] = useState<Record<string, boolean>>({});
  const [secondsRemaining, setSecondsRemaining] = useState<number>(exam.duration_minutes * 60);

  // Restore saved answers from server on mount (supports recoverable interruptions)
  useEffect(() => {
    fetchAnswers(backendUrl, session.id).then((saved) => {
      if (saved && Object.keys(saved).length > 0) {
        setSelectedAnswers((prev) => ({ ...prev, ...saved }));
      }
    });
  }, [backendUrl, session.id]);

  // Background incident counters for security thresholds (hidden from candidate view)
  const [warningCount, setWarningCount] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [teacherCodeInput, setTeacherCodeInput] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const hasInterruptionLoggedRef = useRef<boolean>(false);

  const handleExecuteExit = useCallback(() => {
    setIsExiting(true);
    if (window.sentinelBridge && window.sentinelBridge.closeApp) {
      window.sentinelBridge.closeApp();
    } else {
      window.close();
    }
  }, []);

  const handleRemoteUnlockDismiss = useCallback(() => {
    console.log('[ExamWorkspace] Remote unlock applied. Restoring exam workspace.');
    setIsLockedOut(false);
    setWarningCount(0);
    setTeacherCodeInput('');
    setUnlockError(null);
  }, []);

  // Poll session status while locked out to support one-click remote unlock from proctor dashboard
  useEffect(() => {
    if (!isLockedOut) return undefined;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/sessions/${session.id}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.is_locked === false) {
            console.log('[ExamWorkspace] Detected session unlocked by proctor via status poll.');
            handleRemoteUnlockDismiss();
          }
        }
      } catch {
        // ignore network glitches
      }
    }, 1500);

    const handleCustomRemoteUnlock = () => {
      handleRemoteUnlockDismiss();
    };
    window.addEventListener('sentinel-remote-unlock', handleCustomRemoteUnlock);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('sentinel-remote-unlock', handleCustomRemoteUnlock);
    };
  }, [isLockedOut, backendUrl, session.id, handleRemoteUnlockDismiss]);

  const isScreenSharingActive =
    screenShareState === 'active' || screenShareState === 'ready';

  // Handle final exam submission
  const handleFinalSubmit = useCallback(() => {
    onStopScreenShare('Exam session submitted by candidate');
    onSubmitExam();
  }, [onStopScreenShare, onSubmitExam]);

  const currentQuestion = exam.questions[currentQuestionIndex];

  // Freeze countdown timer if locked out or if mandatory screen sharing is interrupted
  useEffect(() => {
    if (isLockedOut || !isScreenSharingActive) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleFinalSubmit, isLockedOut, isScreenSharingActive]);

  // Log SCREEN_SHARE_INTERRUPTED event when stream stops mid-exam
  useEffect(() => {
    if (!isScreenSharingActive && !hasInterruptionLoggedRef.current) {
      hasInterruptionLoggedRef.current = true;
      logEvent(backendUrl, session.id, 'SCREEN_SHARE_INTERRUPTED', 'webrtc_screenshare', 'high', 1.0, {
        reason: screenShareError || 'Screen sharing stopped during examination'
      });
    } else if (isScreenSharingActive) {
      hasInterruptionLoggedRef.current = false;
    }
  }, [isScreenSharingActive, backendUrl, session.id, screenShareError]);

  // Check 5-warning lockout threshold
  useEffect(() => {
    if (warningCount >= 5 && !isLockedOut) {
      setIsLockedOut(true);
      logEvent(backendUrl, session.id, 'EXAM_LOCKED_OUT_5_WARNINGS', 'lockout_guard', 'critical', 1.0, {
        total_warnings: warningCount
      });
    }
  }, [warningCount, isLockedOut, backendUrl, session.id]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainderSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainderSecs.toString().padStart(2, '0')}`;
  };

  // Handle Answer Selection
  const handleSelectChoice = async (questionId: string, choiceId: string) => {
    if (isLockedOut || !isScreenSharingActive) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    try {
      await saveAnswer(backendUrl, session.id, questionId, choiceId);
    } catch (err) {
      console.warn('Failed to save answer:', err);
    }
  };

  // Background violation handler (ingests into proctoring database without cluttering candidate UI)
  const handleViolation = useCallback(
    (type: string, message: string) => {
      if (isLockedOut) return;
      setWarningCount((prev) => prev + 1);

      let severity = 'medium';
      if (type === 'MULTIPLE_FACES_DETECTED' || type === 'PHONE_OR_DEVICE_DETECTED' || type === 'FACE_MISMATCH_IMPERSONATION') {
        severity = 'critical';
      } else if (type === 'NO_FACE_DETECTED' || type === 'RESTRICTED_EYEWEAR_DETECTED') {
        severity = 'high';
      }

      logEvent(backendUrl, session.id, type, 'local_mediapipe_vision', severity, 0.95, { message });
    },
    [backendUrl, session.id, isLockedOut]
  );

  // Intercept window focus/blur and fullscreen changes via bridge
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
    }
    return undefined;
  }, [handleViolation]);

  // Handle Teacher Code Unlock
  const handleTeacherUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherCodeInput.trim()) return;

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      await unlockWithTeacherCode(backendUrl, session.id, teacherCodeInput.trim());
      setWarningCount(0);
      setIsLockedOut(false);
      setTeacherCodeInput('');
    } catch (err: unknown) {
      setUnlockError(err instanceof Error ? err.message : 'Invalid authorization code.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const isInteractionDisabled = isLockedOut || !isScreenSharingActive || isSubmitting;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC' }}>
      {/* Background Video Proctoring Engine (Runs local MediaPipe gaze/face analysis & event ingestion) */}
      <WebcamProctor
        hidden={true}
        webcamStream={webcamStream}
        backendUrl={backendUrl}
        sessionId={session.id}
        onViolation={handleViolation}
      />

      {/* Top Header: Minimal & Focused */}
      <header
        style={{
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          padding: '12px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #1E293B'
        }}
      >
        {/* Left: Assessment Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.01em', color: '#38BDF8' }}>
            Where U Elevate
          </span>
          <span style={{ color: '#64748B' }}>&bull;</span>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#F1F5F9' }}>
            {exam.title}
          </span>
        </div>

        {/* Center: Unobtrusive Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isScreenSharingActive ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34D399',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  boxShadow: '0 0 6px #10B981'
                }}
              />
              <span>Proctoring Active &bull; Screen Sharing Active</span>
            </div>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#F87171',
                fontSize: '0.75rem',
                fontWeight: 700
              }}
            >
              <AlertTriangle size={13} />
              <span>Screen Sharing Interrupted</span>
            </div>
          )}
        </div>

        {/* Right: Countdown Timer & Submit Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '1rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: secondsRemaining < 300 ? '#EF4444' : '#F8FAFC'
            }}
          >
            <Clock size={16} />
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitConfirm(true)}
            className="btn btn-primary"
            disabled={isInteractionDisabled}
            style={{ padding: '8px 20px', fontSize: '0.875rem', fontWeight: 600 }}
          >
            <Send size={14} />
            <span>Submit Exam</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            style={{
              padding: '7px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#FCA5A5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Quit Application (Ctrl+Q)"
          >
            <LogOut size={13} />
            <span>Quit</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main
        style={{
          flex: 1,
          maxWidth: '1280px',
          width: '100%',
          margin: '0 auto',
          padding: '24px 32px',
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: '28px'
        }}
      >
        {/* Left Column: Active Question & Choices */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card" style={{ padding: '36px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Progress Bar & Question Counter */}
            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#E2E8F0',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  marginBottom: '14px'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((Object.keys(selectedAnswers).length / exam.total_questions) * 100)}%`,
                    backgroundColor: '#4F46E5',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  Question {currentQuestion.question_number} of {exam.total_questions}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setReviewedQuestions((prev) => ({
                      ...prev,
                      [currentQuestion.id]: !prev[currentQuestion.id]
                    }));
                  }}
                  disabled={isInteractionDisabled}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: isInteractionDisabled ? 'not-allowed' : 'pointer',
                    backgroundColor: reviewedQuestions[currentQuestion.id] ? '#FEF3C7' : '#F1F5F9',
                    color: reviewedQuestions[currentQuestion.id] ? '#B45309' : '#64748B',
                    border: reviewedQuestions[currentQuestion.id] ? '1px solid #F59E0B' : '1px solid #CBD5E1',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Flag
                    size={13}
                    fill={reviewedQuestions[currentQuestion.id] ? '#D97706' : 'none'}
                    color={reviewedQuestions[currentQuestion.id] ? '#D97706' : '#64748B'}
                  />
                  <span>{reviewedQuestions[currentQuestion.id] ? 'Marked for Review' : 'Mark for Review'}</span>
                </button>
              </div>
            </div>

            {/* Question Text */}
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                lineHeight: 1.55,
                marginBottom: '32px',
                color: 'var(--color-text-primary)'
              }}
            >
              {currentQuestion.text}
            </h2>

            {/* MCQ Answer Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {currentQuestion.choices.map((choice) => {
                const isSelected = selectedAnswers[currentQuestion.id] === choice.id;

                return (
                  <div
                    key={choice.id}
                    onClick={() => !isInteractionDisabled && handleSelectChoice(currentQuestion.id, choice.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px 20px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                      cursor: isInteractionDisabled ? 'not-allowed' : 'pointer',
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
                    <span
                      style={{
                        fontSize: '0.9375rem',
                        fontWeight: isSelected ? 600 : 400,
                        color: 'var(--color-text-primary)',
                        flex: 1
                      }}
                    >
                      {choice.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Navigation Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '36px',
                paddingTop: '20px',
                borderTop: '1px solid var(--color-border)'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={currentQuestionIndex === 0 || isInteractionDisabled}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              {currentQuestionIndex < exam.total_questions - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isInteractionDisabled}
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
                  disabled={isInteractionDisabled}
                >
                  <span>Review &amp; Submit</span>
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Question Navigation Palette */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                Question Palette
              </span>
              <span style={{ fontSize: '0.75rem', color: '#4F46E5', fontWeight: 700 }}>
                {Object.keys(selectedAnswers).length} / {exam.total_questions}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {exam.questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIndex;
                const isAnswered = !!selectedAnswers[q.id];
                const isMarked = !!reviewedQuestions[q.id];

                let bgColor = '#FFFFFF';
                let borderColor = '#CBD5E1';
                let textColor = '#334155';

                if (isMarked) {
                  bgColor = '#FEF3C7';
                  borderColor = '#F59E0B';
                  textColor = '#B45309';
                } else if (isAnswered) {
                  bgColor = '#4F46E5';
                  borderColor = '#4F46E5';
                  textColor = '#FFFFFF';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => !isInteractionDisabled && setCurrentQuestionIndex(idx)}
                    disabled={isInteractionDisabled}
                    style={{
                      height: '40px',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      cursor: isInteractionDisabled ? 'not-allowed' : 'pointer',
                      border: isCurrent ? '2px solid #0F172A' : `1px solid ${borderColor}`,
                      backgroundColor: bgColor,
                      color: textColor,
                      boxShadow: isCurrent ? '0 0 0 2px rgba(79, 70, 229, 0.4)' : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    {q.question_number}
                    {isMarked && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '3px',
                          right: '3px',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: '#D97706'
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Question Palette Legend */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#4F46E5' }} />
                <span style={{ color: '#475569' }}>Answered ({Object.keys(selectedAnswers).length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B' }} />
                <span style={{ color: '#475569' }}>Marked for Review ({Object.values(reviewedQuestions).filter(Boolean).length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1' }} />
                <span style={{ color: '#475569' }}>Unanswered ({exam.total_questions - Object.keys(selectedAnswers).length})</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Screen Sharing Interruption Blocker Modal */}
      {!isScreenSharingActive && !isLockedOut && !isExiting && !showExitConfirm && !isSubmitting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '24px'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '32px',
              textAlign: 'center',
              border: '2px solid #EF4444',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Monitor size={28} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              Screen sharing stopped. Resume sharing to continue
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.5, marginBottom: '24px' }}>
              Screen sharing is required. Allow access and try again. Exam question interactions and the countdown timer are paused until sharing is restored.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStartScreenShare(null)}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.9375rem', fontWeight: 700 }}
              >
                <Monitor size={16} />
                <span>Resume Entire Screen Sharing</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExitConfirm(true)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  color: '#EF4444',
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Quit / Exit Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Lockout Modal (Threshold Exceeded) */}
      {isLockedOut && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001,
            padding: '24px'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '36px',
              border: '2px solid #EF4444'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626'
                }}
              >
                <AlertOctagon size={28} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#DC2626' }}>
                  Assessment Paused
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Proctor Authorization Required
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
              Your assessment session has been locked due to repeated integrity alerts. A proctor or examiner must authorize your session to resume.
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              backgroundColor: '#EFF6FF',
              borderRadius: '8px',
              border: '1px solid #BFDBFE',
              marginBottom: '18px',
              color: '#1D4ED8',
              fontSize: '0.8125rem'
            }}>
              <span style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: '#2563EB',
                boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.25)',
                display: 'inline-block'
              }} />
              <span>Waiting for Proctor Remote Unlock (or enter invigilator code below):</span>
            </div>

            <form onSubmit={handleTeacherUnlock}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                Proctor / Teacher Authorization Code
              </label>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    value={teacherCodeInput}
                    onChange={(e) => setTeacherCodeInput(e.target.value)}
                    placeholder="Enter teacher authorization code..."
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 36px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.9375rem'
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isUnlocking || !teacherCodeInput.trim()}
                  className="btn btn-primary"
                  style={{ padding: '12px 20px', fontWeight: 700 }}
                >
                  {isUnlocking ? 'Verifying...' : 'Unlock'}
                </button>
              </div>

              {unlockError && (
                <div style={{ color: '#DC2626', fontSize: '0.8125rem', marginTop: '8px', fontWeight: 600 }}>
                  {unlockError}
                </div>
              )}
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setShowExitConfirm(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '0.8125rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Quit Assessment (All saved answers are preserved)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '24px'
          }}
        >
          <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '28px', backgroundColor: '#FFFFFF', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>
              Confirm Assessment Submission
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '16px', lineHeight: 1.5 }}>
              Are you sure you want to finish and submit your assessment? Once submitted, your answers will be locked and cannot be modified.
            </p>

            {/* Summary Breakdown */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.8125rem',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Total Questions:</span>
                <strong style={{ color: '#0F172A' }}>{exam.total_questions}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4F46E5' }}>
                <span>Answered:</span>
                <strong>{Object.keys(selectedAnswers).length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D97706' }}>
                <span>Marked for Review:</span>
                <strong>{Object.values(reviewedQuestions).filter(Boolean).length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: exam.total_questions - Object.keys(selectedAnswers).length > 0 ? '#DC2626' : '#64748B' }}>
                <span>Unanswered:</span>
                <strong>{exam.total_questions - Object.keys(selectedAnswers).length}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSubmitConfirm(false)}
                disabled={isSubmitting}
              >
                Return to Exam
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100005,
            padding: '24px'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '28px',
              textAlign: 'center',
              border: '2px solid #EF4444',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              Exit Assessment Application?
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.5, marginBottom: '24px' }}>
              Are you sure you want to exit the exam browser? All answered questions have been securely saved to the server.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowExitConfirm(false)}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cancel / Return
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleExecuteExit}
                style={{ flex: 1, justifyContent: 'center', backgroundColor: '#DC2626', color: '#FFFFFF' }}
              >
                Yes, Exit App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
