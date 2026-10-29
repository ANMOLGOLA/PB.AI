import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { fetchExams, createSession, submitSession, saveAnswer } from './api/client';
import { PublicExam, CandidateSession } from './api/types';

interface QuestionItem {
  id: string;
  text: string;
  options: string[];
  correctIndex?: number;
}

const DEFAULT_QUESTIONS: QuestionItem[] = [
  { id: 'q1', text: 'Which data structure uses the LIFO principle?', options: ['Queue', 'Stack', 'Heap', 'Graph'], correctIndex: 1 },
  { id: 'q2', text: 'Time complexity of binary search on a sorted array?', options: ['O(n)', 'O(n log n)', 'O(log n)', 'O(1)'], correctIndex: 2 },
  { id: 'q3', text: 'Which algorithm is used for supervised classification?', options: ['K-Means', 'Apriori', 'Logistic Regression', 'PCA'], correctIndex: 2 },
  { id: 'q4', text: 'What does CNN stand for in deep learning?', options: ['Central Neural Net', 'Convolutional Neural Network', 'Cyclic Node Network', 'Connected Neuron Node'], correctIndex: 1 },
  { id: 'q5', text: 'Which activation function outputs values between 0 and 1?', options: ['ReLU', 'Tanh', 'Sigmoid', 'Softplus'], correctIndex: 2 },
  { id: 'q6', text: 'Overfitting is best reduced by…', options: ['More layers', 'Regularization', 'Fewer samples', 'Higher learning rate'], correctIndex: 1 },
  { id: 'q7', text: 'Which HTTP method is idempotent by design?', options: ['POST', 'PUT', 'PATCH', 'CONNECT'], correctIndex: 1 },
  { id: 'q8', text: 'Electron.js is used to build…', options: ['Mobile apps', 'Desktop apps with web tech', 'Databases', 'ML models'], correctIndex: 1 }
];

const SYS_CHECKS = [
  'Single monitor / no screen mirroring',
  'No virtual machine detected',
  'No other active session for this account',
  'Stable network connection',
  'Microphone & camera permission',
  'Clipboard & screenshot tools locked'
];

interface LogEntry {
  time: string;
  type: 'i' | 'w' | 'b';
  text: string;
}

interface AIEntry {
  name: string;
  url: string;
  q: string;
  time: string;
}

export const App: React.FC = () => {
  // Navigation: 0 = Login, 1 = Face ID, 2 = System Check, 3 = Rules, 4 = Exam, 5 = Result
  const [step, setStep] = useState<number>(0);
  const [backendUrl] = useState<string>('http://127.0.0.1:8000');

  // Backend state
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [activeSession, setActiveSession] = useState<CandidateSession | null>(null);

  // Login Form
  const [email, setEmail] = useState<string>('student@college.edu');
  const [code, setCode] = useState<string>('WUE-MCQ-102');
  const [loginStage, setLoginStage] = useState<'creds' | 'otp'>('creds');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);

  // Face ID Stage
  const [camAvailable, setCamAvailable] = useState<boolean>(false);
  const [isScanningFace, setIsScanningFace] = useState<boolean>(false);
  const [faceCheck1, setFaceCheck1] = useState<boolean | null>(null);
  const [faceCheck2, setFaceCheck2] = useState<boolean | null>(null);
  const [faceCheck3, setFaceCheck3] = useState<boolean | null>(null);
  const [showDemoFaceBtn, setShowDemoFaceBtn] = useState<boolean>(false);

  // System Check
  const [sysProgress, setSysProgress] = useState<boolean[]>([false, false, false, false, false, false]);

  // Rules Stage
  const [rulesAgreed, setRulesAgreed] = useState<boolean>(false);

  // Exam Stage
  const [questions, setQuestions] = useState<QuestionItem[]>(DEFAULT_QUESTIONS);
  const [qi, setQi] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<number>(600);
  const [examActive, setExamActive] = useState<boolean>(false);

  // Proctoring Metrics
  const [integrityScore, setIntegrityScore] = useState<number>(100);
  const [strikes, setStrikes] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [aiEntries, setAiEntries] = useState<AIEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitReason, setSubmitReason] = useState<'manual' | 'timeout' | 'violations'>('manual');

  // Video Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Fetch initial exams from backend
  useEffect(() => {
    fetchExams(backendUrl).then((fetched) => {
      if (fetched && fetched.length > 0) {
        setExams(fetched);
        const mapped: QuestionItem[] = fetched[0].questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: q.choices.map((c) => c.text),
          correctIndex: 0
        }));
        if (mapped.length > 0) {
          setQuestions(mapped);
        }
      }
    }).catch((err) => {
      console.warn('Backend exams fetch fallback:', err);
    });
  }, [backendUrl]);

  // Toast Helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const addLog = useCallback((text: string, type: 'i' | 'w' | 'b' = 'i') => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [{ time: timeStr, type, text }, ...prev]);
  }, []);

  const triggerViolation = useCallback((title: string, severity: 'w' | 'b', penalty: number) => {
    if (!examActive) return;
    addLog(title, severity);
    setIntegrityScore((prev) => Math.max(0, prev - penalty / 2));

    if (severity === 'b') {
      setStrikes((prev) => {
        const next = prev + 1;
        showToast(`⚠ Violation ${next}/3: ${title}`);
        if (next >= 3) {
          setTimeout(() => handleFinishExam('violations'), 800);
        }
        return next;
      });
    } else {
      showToast('⚠ ' + title);
    }
  }, [examActive, addLog, showToast]);

  // Step Change
  const goToStep = (n: number) => {
    setStep(n);
    window.scrollTo(0, 0);
    if (n === 2) {
      // Start system check simulation
      setSysProgress([false, false, false, false, false, false]);
      SYS_CHECKS.forEach((_, idx) => {
        setTimeout(() => {
          setSysProgress((prev) => {
            const copy = [...prev];
            copy[idx] = true;
            return copy;
          });
        }, 400 * (idx + 1));
      });
    }
  };

  // OTP Logic
  const handleOtpInput = (index: number, val: string) => {
    if (val.length > 1) val = val.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  // Face Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamAvailable(true);
      setFaceCheck1(true);
      runFaceVerification();
    } catch {
      setFaceCheck1(false);
      setShowDemoFaceBtn(true);
    }
  };

  const runFaceVerification = () => {
    setIsScanningFace(true);
    setTimeout(() => {
      setFaceCheck2(true);
    }, 1500);
    setTimeout(() => {
      setFaceCheck3(true);
      setIsScanningFace(false);
      setTimeout(() => goToStep(2), 900);
    }, 3000);
  };

  const fakeFaceDemo = () => {
    setFaceCheck1(true);
    runFaceVerification();
  };

  // Start Exam
  const handleStartExam = async () => {
    goToStep(4);
    setExamActive(true);

    if (mediaStreamRef.current && liveVideoRef.current) {
      liveVideoRef.current.srcObject = mediaStreamRef.current;
    }

    addLog('Assessment started', 'i');

    // Create session in backend if connected
    if (exams.length > 0) {
      try {
        const session = await createSession(backendUrl, exams[0].id, email.split('@')[0], 'CAND-' + code);
        setActiveSession(session);
      } catch (err) {
        console.warn('Backend session fallback:', err);
      }
    }

    // Request fullscreen
    if (window.sentinelBridge) {
      await window.sentinelBridge.setFullscreen(true).catch(console.warn);
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // Finish Exam
  const handleFinishExam = async (reason: 'manual' | 'timeout' | 'violations') => {
    if (!examActive) return;
    setExamActive(false);
    setSubmitReason(reason);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    if (window.sentinelBridge) {
      await window.sentinelBridge.setFullscreen(false).catch(console.warn);
    } else if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (activeSession) {
      try {
        await submitSession(backendUrl, activeSession.id);
      } catch (err) {
        console.warn('Backend submission error:', err);
      }
    }

    goToStep(5);
  };

  // Exam Timer
  useEffect(() => {
    if (!examActive) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinishExam('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examActive]);

  // Proctored Event Listeners (Window blur, Right-click, Copy)
  useEffect(() => {
    if (!examActive) return;

    const onBlur = () => triggerViolation('Window / tab lost focus', 'w', 8);
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerViolation('Right-click inspection attempt blocked', 'w', 4);
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation('Copy action blocked', 'w', 4);
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);

    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
    };
  }, [examActive, triggerViolation]);

  // AI Simulation Event
  const simulateAI = (name: string, url: string, query: string) => {
    if (!examActive) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAiEntries((prev) => [{ name, url, q: query, time: timeStr }, ...prev]);
    addLog(`Switched to ${name} (${url})`, 'w');
    addLog(`Search captured: “${query}”`, 'b');
    setIntegrityScore((prev) => Math.max(0, prev - 10));

    setStrikes((prev) => {
      const next = prev + 1;
      showToast(`⚠ ${name} opened – your search was recorded (${next}/3)`);
      if (next >= 3) {
        setTimeout(() => handleFinishExam('violations'), 800);
      }
      return next;
    });

    setActiveTab(1);
  };

  // Question Answer Selection
  const handlePickAnswer = (choiceIdx: number) => {
    setAnswers((prev) => ({ ...prev, [qi]: choiceIdx }));
    addLog(`Answered Question ${qi + 1}`, 'i');

    if (activeSession && exams.length > 0 && exams[0].questions[qi]) {
      const q = exams[0].questions[qi];
      const choiceId = q.choices[choiceIdx]?.id;
      if (choiceId) {
        saveAnswer(backendUrl, activeSession.id, q.id, choiceId).catch(console.warn);
      }
    }
  };

  const calculatedScore = Object.entries(answers).reduce((acc, [idx, choice]) => {
    const q = questions[Number(idx)];
    return acc + (q && q.correctIndex === choice ? 1 : 0);
  }, 0);

  const formatTimer = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <>
      <Header currentStep={step} onStepClick={goToStep} />

      {toastMessage && <div className="toast">{toastMessage}</div>}

      <main className="wrap">
        {/* STEP 0: LOGIN / ONBOARDING */}
        {step === 0 && (
          <section>
            <div className="hero">
              <div className="heroL">
                <h1>Prove your skills. Elevate your path.</h1>
                <p>
                  From your first hackathon to your first paycheck, every assessment on Where U Elevate is fair, transparent, and skills-first. Verify once, focus fully, and let your work speak louder than your résumé.
                </p>
                <div className="chips">
                  <span className="chip">Hackathon screening</span>
                  <span className="chip">Hiring challenges</span>
                  <span className="chip">Campus assessments</span>
                </div>
                <div className="stats">
                  <div><b>1M+</b>Users</div>
                  <div><b>500+</b>Institutions</div>
                  <div><b>100+</b>Customers</div>
                  <div><b>500+</b>Hackathons</div>
                </div>
                <div className="trust">
                  TRUSTED BY · Synchrony · Nasscom · Mercedes-Benz · DSCI CCoE · Grant Thornton · Govt. of NCT Delhi
                </div>
              </div>

              <div className="card">
                <span className="badge">hackFront India 2026 · Screening Round</span>
                <h2>Welcome back, Elevator</h2>
                <p className="mute">
                  Use the email on your Where U Elevate profile. New here?{' '}
                  <a href="https://whereuelevate.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pri)', fontWeight: 600 }}>
                    Create your profile
                  </a>
                </p>

                {loginStage === 'creds' ? (
                  <div>
                    <label>Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@college.edu"
                    />

                    <label>Assessment code</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. WUE-MCQ-102"
                    />

                    <button
                      className="btn"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (!email.includes('@')) {
                          showToast('Enter a valid email address');
                          return;
                        }
                        setLoginStage('otp');
                      }}
                    >
                      Send OTP
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="mute">
                      Enter the 6-digit code sent to your email.<br />
                      <small>(Demo: any 6 digits work)</small>
                    </p>
                    <div className="otp">
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          id={`otp-${i}`}
                          maxLength={1}
                          inputMode="numeric"
                          value={digit}
                          onChange={(e) => handleOtpInput(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        />
                      ))}
                    </div>
                    <button
                      className="btn"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (otp.join('').length < 6) {
                          showToast('Enter all 6 digits of the OTP');
                          return;
                        }
                        goToStep(1);
                      }}
                    >
                      Verify &amp; continue
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* STEP 1: FACE ID VERIFICATION */}
        {step === 1 && (
          <section>
            <div className="grid2">
              <div className="card">
                <div className="cam">
                  {!camAvailable && <span>Camera preview appears here</span>}
                  <video ref={videoRef} autoPlay muted playsInline />
                  <div className="face" />
                  {isScanningFace && <div className="scan" />}
                </div>
              </div>

              <div className="card">
                <h2>Identity verification</h2>
                <p className="mute">
                  Centre your face in the oval, in good lighting, with no hat or mask. We compare it with your profile photo.
                </p>

                <div className={`check ${faceCheck1 === true ? 'ok' : faceCheck1 === false ? 'bad' : ''}`}>
                  <div className="ic">{faceCheck1 === true ? '✓' : faceCheck1 === false ? '✕' : '○'}</div>
                  Camera access
                </div>

                <div className={`check ${faceCheck2 === true ? 'ok' : faceCheck2 === false ? 'bad' : ''}`}>
                  <div className="ic">{faceCheck2 === true ? '✓' : faceCheck2 === false ? '✕' : '○'}</div>
                  Single face detected
                </div>

                <div className={`check ${faceCheck3 === true ? 'ok' : faceCheck3 === false ? 'bad' : ''}`}>
                  <div className="ic">{faceCheck3 === true ? '✓' : faceCheck3 === false ? '✕' : '○'}</div>
                  Match with profile photo
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                  <button className="btn" onClick={startCamera}>
                    Enable camera &amp; verify
                  </button>
                  {showDemoFaceBtn && (
                    <button className="btn ghost" onClick={fakeFaceDemo}>
                      Continue in demo mode
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STEP 2: SYSTEM INTEGRITY CHECK */}
        {step === 2 && (
          <section>
            <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
              <h2>System integrity check</h2>
              <p className="mute">We confirm your device is a clean, secure environment before the test begins.</p>

              <div>
                {SYS_CHECKS.map((item, idx) => {
                  const isDone = sysProgress[idx];
                  return (
                    <div key={idx} className={`check ${isDone ? 'ok' : ''}`}>
                      <div className="ic">{isDone ? '✓' : '…'}</div>
                      {item}
                    </div>
                  );
                })}
              </div>

              <button
                className="btn"
                style={{ marginTop: '12px', width: '100%' }}
                disabled={!sysProgress.every(Boolean)}
                onClick={() => goToStep(3)}
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: RULES & SUMMARY */}
        {step === 3 && (
          <section>
            <div className="grid2">
              <div className="card">
                <h2>The Elevate Fair-Play Pledge</h2>
                <p className="mute">
                  Tab switching is allowed, but nothing happens in the dark: every switch and AI-tool search is recorded and shown to you and your examiner.
                </p>
                <ul className="rules">
                  <li>Webcam stays on; one face only.</li>
                  <li>Switching tabs is logged, including AI sites (ChatGPT, Claude…) and what is typed there.</li>
                  <li>Second monitors, screen mirroring and multiple logins are blocked.</li>
                  <li>3 high-risk violations trigger an automatic submission.</li>
                  <li>Your test auto-submits when the timer ends.</li>
                </ul>
              </div>

              <div className="card">
                <h2>Test summary</h2>
                <div className="kpi">
                  <div><b>{questions.length}</b>Questions</div>
                  <div><b>10</b>Minutes</div>
                  <div><b>3</b>Strikes</div>
                  <div><b>MCQ</b>Format</div>
                </div>

                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '16px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rulesAgreed}
                    onChange={(e) => setRulesAgreed(e.target.checked)}
                  />
                  <span>I consent to webcam, activity and tab monitoring for this assessment.</span>
                </label>

                <button
                  className="btn"
                  style={{ width: '100%' }}
                  disabled={!rulesAgreed}
                  onClick={handleStartExam}
                >
                  Begin assessment
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 4: EXAM WORKSPACE */}
        {step === 4 && (
          <section>
            <div className="exam">
              <div>
                <div className="card">
                  <div className="bar">
                    <span className="ctx">hackFront India 2026 · Screening</span>
                    <span className={`timer ${timeLeft < 60 ? 'low' : ''}`}>
                      {formatTimer(timeLeft)}
                    </span>
                    <div className="prog">
                      <i style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }} />
                    </div>
                    <span className="mute">
                      Question {qi + 1} of {questions.length}
                    </span>
                  </div>

                  <div className="q">
                    {questions[qi]?.text}
                  </div>

                  <div>
                    {questions[qi]?.options.map((option, optIdx) => {
                      const isSelected = answers[qi] === optIdx;
                      return (
                        <div
                          key={optIdx}
                          className={`opt ${isSelected ? 'sel' : ''}`}
                          onClick={() => handlePickAnswer(optIdx)}
                        >
                          <b>{'ABCD'[optIdx]}</b>
                          <span>{option}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="nav">
                    <button
                      className="btn ghost"
                      disabled={qi === 0}
                      onClick={() => setQi((prev) => Math.max(0, prev - 1))}
                    >
                      ← Previous
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setFlags((prev) => ({ ...prev, [qi]: !prev[qi] }))}
                    >
                      {flags[qi] ? '🏴 Flagged' : '⚑ Flag for review'}
                    </button>
                    <button
                      className="btn"
                      disabled={qi === questions.length - 1}
                      onClick={() => setQi((prev) => Math.min(questions.length - 1, prev + 1))}
                    >
                      Next →
                    </button>
                    <span className="sp" />
                    <button
                      className="btn danger"
                      onClick={() => handleFinishExam('manual')}
                    >
                      Submit test
                    </button>
                  </div>
                </div>

                {/* DEMO PROCTORING CONTROLS */}
                <div className="demo">
                  <h3>Demo controls <span className="mute" style={{ fontWeight: 400 }}>– simulate proctoring events</span></h3>
                  <div className="row">
                    <button className="btn ghost sm" onClick={() => simulateAI('ChatGPT', 'chat.openai.com', 'Explain time complexity of quicksort')}>
                      Open ChatGPT
                    </button>
                    <button className="btn ghost sm" onClick={() => simulateAI('Claude', 'claude.ai', 'Difference between supervised and unsupervised learning')}>
                      Open Claude
                    </button>
                    <button className="btn ghost sm" onClick={() => triggerViolation('Looking away from screen (4s)', 'w', 8)}>
                      Look away
                    </button>
                    <button className="btn ghost sm" onClick={() => triggerViolation('Multiple faces detected', 'b', 20)}>
                      2nd face
                    </button>
                    <button className="btn ghost sm" onClick={() => triggerViolation('Screen mirroring / external display detected', 'b', 20)}>
                      Mirror screen
                    </button>
                    <button className="btn ghost sm" onClick={() => triggerViolation('Second login attempt blocked', 'b', 20)}>
                      2nd login
                    </button>
                  </div>
                </div>
              </div>

              {/* SIDEBAR */}
              <aside className="side">
                <div className="card mini">
                  <div className="cam" style={{ aspectRatio: '16/10' }}>
                    <video ref={liveVideoRef} autoPlay muted playsInline />
                    <span style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px', color: '#4cd6a4', fontSize: '11px', fontWeight: 600 }}>
                      ● Live
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 4px' }}>
                    <b>Elevate Trust Score</b>
                    <b style={{ color: integrityScore > 70 ? 'var(--ok)' : integrityScore > 40 ? 'var(--warn)' : 'var(--bad)' }}>
                      {integrityScore}%
                    </b>
                  </div>
                  <div className="meter">
                    <i
                      style={{
                        width: `${integrityScore}%`,
                        background: integrityScore > 70 ? 'var(--ok)' : integrityScore > 40 ? 'var(--warn)' : 'var(--bad)'
                      }}
                    />
                  </div>
                  <div className="mute" style={{ fontSize: '12px', marginTop: '6px' }}>
                    Strikes: <b style={{ color: strikes > 0 ? 'var(--bad)' : 'inherit' }}>{strikes}</b> / 3
                  </div>
                </div>

                <div className="card mini">
                  <h3>Questions</h3>
                  <div className="pal">
                    {questions.map((_, i) => {
                      let btnCls = '';
                      if (i === qi) btnCls = 'a';
                      else if (flags[i]) btnCls = 'f';
                      else if (answers[i] != null) btnCls = 'c';

                      return (
                        <button
                          key={i}
                          className={btnCls}
                          onClick={() => setQi(i)}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="card mini">
                  <div className="tabs">
                    <button
                      className={activeTab === 0 ? 'on' : ''}
                      onClick={() => setActiveTab(0)}
                    >
                      Activity
                    </button>
                    <button
                      className={activeTab === 1 ? 'on' : ''}
                      onClick={() => setActiveTab(1)}
                    >
                      AI tab tracker ({aiEntries.length})
                    </button>
                  </div>

                  {activeTab === 0 ? (
                    <div className="log">
                      {logs.length === 0 ? (
                        <div className="mute" style={{ padding: '8px 0' }}>Monitoring started.</div>
                      ) : (
                        logs.map((item, idx) => (
                          <div key={idx} className="li">
                            <time>{item.time}</time>
                            <span className={`tag t-${item.type}`}>
                              {item.type === 'i' ? 'INFO' : item.type === 'w' ? 'WARN' : 'HIGH'}
                            </span>
                            <span>{item.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="log">
                      {aiEntries.length === 0 ? (
                        <div className="mute" style={{ padding: '8px 0' }}>No AI tools opened yet.</div>
                      ) : (
                        aiEntries.map((ai, idx) => (
                          <div key={idx} className="ai">
                            <b>{ai.name}</b> · {ai.url} · {ai.time}<br />
                            <span className="mute">Typed:</span> <span className="u">“{ai.q}”</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* STEP 5: RESULT / DONE */}
        {step === 5 && (
          <section>
            <div className="card" style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
              <div style={{ fontSize: '44px', marginBottom: '8px' }}>
                {submitReason === 'violations' ? '⚠️' : '✅'}
              </div>
              <h1>
                {submitReason === 'violations'
                  ? 'Test auto-submitted'
                  : submitReason === 'timeout'
                  ? 'Time’s up – submitted'
                  : 'Test submitted'}
              </h1>
              <p className="mute">
                {submitReason === 'violations'
                  ? 'Repeated violations reached the limit of 3 strikes.'
                  : submitReason === 'timeout'
                  ? 'Your answers were submitted automatically upon time expiration.'
                  : 'Thank you for completing the assessment.'}
              </p>

              <div className="kpi">
                <div><b>{calculatedScore}/{questions.length}</b>Score</div>
                <div><b>{integrityScore}%</b>Integrity</div>
                <div><b>{strikes}</b>Flags</div>
                <div><b>{aiEntries.length}</b>AI visits</div>
              </div>

              <p className="mute" style={{ margin: '20px 0' }}>
                Your answers and proctoring activity report were securely synced. Results will appear on your Where U Elevate dashboard.
              </p>

              <h3 style={{ textAlign: 'left', marginTop: '24px' }}>Keep elevating – what’s next</h3>
              <div className="next">
                <a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">
                  <b>Hackathons</b>Compete in real challenges that matter
                </a>
                <a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">
                  <b>Jobs</b>Roles matched to your skills, not just a résumé
                </a>
                <a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">
                  <b>Internships</b>Build real-world experience
                </a>
                <a href="https://whereuelevate.com/events" target="_blank" rel="noopener noreferrer">
                  <b>Events &amp; Bootcamps</b>Action-first learning
                </a>
              </div>

              <button
                className="btn"
                style={{ marginTop: '20px' }}
                onClick={() => {
                  setStep(0);
                  setLoginStage('creds');
                  setAnswers({});
                  setFlags({});
                  setIntegrityScore(100);
                  setStrikes(0);
                  setLogs([]);
                  setAiEntries([]);
                  setTimeLeft(600);
                }}
              >
                Back to start
              </button>
            </div>
          </section>
        )}
      </main>

      <footer>
        <div className="fgrid">
          <div>
            <h4>Where U Elevate</h4>
            Building the next-generation innovative workforce: agile, adaptable and innovative.
          </div>
          <div>
            <h4>For Participants</h4>
            <a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">Hackathons</a>
            <a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">Jobs</a>
            <a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">Internships</a>
          </div>
          <div>
            <h4>For Organizations</h4>
            <a href="https://whereuelevate.com/solutions-for-academia" target="_blank" rel="noopener noreferrer">Solutions for Academia</a>
            <a href="https://whereuelevate.com/solutions-for-enterprises" target="_blank" rel="noopener noreferrer">Solutions for Enterprises</a>
            <a href="https://whereuelevate.com/book-a-demo" target="_blank" rel="noopener noreferrer">Book a demo</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="https://whereuelevate.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="https://whereuelevate.com/terms-and-conditions" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>
            <a href="https://whereuelevate.com/contact-us" target="_blank" rel="noopener noreferrer">Contact us</a>
          </div>
        </div>
        <div className="copy">
          Copyright © 2026 WUELEV8 Innovation Services Pvt. Ltd. – All rights reserved.
        </div>
      </footer>
    </>
  );
};
