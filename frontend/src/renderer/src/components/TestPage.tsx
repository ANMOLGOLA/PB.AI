import React, { useState } from 'react';

interface TestPageProps {
  onNavigateHome: () => void;
  onLaunchAssessment?: () => void;
}

export const TestPage: React.FC<TestPageProps> = ({ onNavigateHome, onLaunchAssessment }) => {
  const [examCode, setExamCode] = useState<string>('WUE-MCQ-102');
  const [candidateId, setCandidateId] = useState<string>('STU-2026-8841');
  const [isReady, setIsReady] = useState<boolean>(true);

  return (
    <div className="test-page-container">
      {/* Top Banner Navigation */}
      <div className="test-page-topbar">
        <div className="test-page-topbar-left">
          <button className="test-back-btn" onClick={onNavigateHome} title="Return to Where U Elevate">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Where U Elevate</span>
          </button>
          <div className="test-page-breadcrumb">
            <span>Home</span>
            <span>/</span>
            <span className="current">ExamZone Proctoring Platform (/test)</span>
          </div>
        </div>

        <div className="test-page-topbar-right">
          <div className="test-status-pill">
            <span className="test-status-dot" />
            <span>ExamZone Proctoring Standby</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="test-page-content">
        {/* Hero Card */}
        <div className="test-hero-card">
          <div className="test-badge-row">
            <span className="test-chip">ExamZone Assessment Node</span>
            <span className="test-version">v2.4.0 · Sandboxed Chromium</span>
          </div>

          <h1 className="test-main-title">ExamZone Smart Proctoring Platform</h1>
          <p className="test-main-subtitle">
            Secure browser assessment environment with multimodal vision verification, eye gaze estimation,
            anti-escape lockdown, and continuous behavioral telemetry.
          </p>

          <div className="test-quick-meta-grid">
            <div className="test-meta-item">
              <span className="test-meta-label">Active Assessment</span>
              <span className="test-meta-value">Where U Elevate · Sentinel Exam</span>
            </div>
            <div className="test-meta-item">
              <span className="test-meta-label">Assessment Code</span>
              <span className="test-meta-value code-pill">{examCode}</span>
            </div>
            <div className="test-meta-item">
              <span className="test-meta-label">Candidate Identifier</span>
              <span className="test-meta-value">{candidateId}</span>
            </div>
            <div className="test-meta-item">
              <span className="test-meta-label">Environment Mode</span>
              <span className="test-meta-value ready-text">Strict Kiosk Lockdown</span>
            </div>
          </div>
        </div>

        {/* 3 Status / Capability Placeholder Cards */}
        <div className="test-grid-3">
          <div className="test-feature-card">
            <div className="test-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h3 className="test-feature-title">Multimodal Vision &amp; Face ID</h3>
            <p className="test-feature-desc">
              Continuous face verification, multi-person presence detection, and head yaw/pitch monitoring.
            </p>
            <div className="test-feature-status ok">Sensor Hardware Ready</div>
          </div>

          <div className="test-feature-card">
            <div className="test-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <h3 className="test-feature-title">Ambient Acoustic Telemetry</h3>
            <p className="test-feature-desc">
              Background noise frequency profiling, secondary voice isolation, and continuous audio decibel metering.
            </p>
            <div className="test-feature-status ok">Microphone Calibrated</div>
          </div>

          <div className="test-feature-card">
            <div className="test-feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="test-feature-title">Integrity Watchdog &amp; Kiosk</h3>
            <p className="test-feature-desc">
              Full-screen enforcement, blur event detection, keyboard shortcut blocking, and tamper-resistant storage.
            </p>
            <div className="test-feature-status ok">Enforcement Active</div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="test-action-panel">
          <div className="test-action-info">
            <h4 className="test-action-heading">Ready to Begin Examination?</h4>
            <p className="test-action-text">
              Click below to launch the proctored assessment workflow, verify your biometric identity, and complete the test.
            </p>
          </div>

          <div className="test-action-buttons">
            <button
              className="test-btn-primary"
              onClick={onLaunchAssessment}
            >
              <span>Launch Assessment Workspace</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
