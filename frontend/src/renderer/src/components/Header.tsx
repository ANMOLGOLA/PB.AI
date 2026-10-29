import React, { useState, useEffect, useRef } from 'react';

interface HeaderProps {
  currentStep?: number;
  onStepClick?: (step: number) => void;
  showSteps?: boolean;
  onNavigateToTest?: () => void;
  onNavigateHome?: () => void;
  isLanding?: boolean;
  firstName?: string;
}

const STEP_LABELS = ['Sign in', 'Face ID', 'System', 'Rules', 'Test', 'Done'];

export const Header: React.FC<HeaderProps> = ({
  currentStep = 0,
  onStepClick,
  showSteps = false,
  onNavigateToTest,
  onNavigateHome,
  isLanding = false,
  firstName = 'Anmol'
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showActivitiesModal, setShowActivitiesModal] = useState<boolean>(false);

  const profileRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return 'light'; // Default is strictly light theme with subtle colours
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Click outside to close profile dropdown
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleDocumentClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [showProfileMenu]);

  const selectTheme = (selectedTheme: 'light' | 'dark') => {
    setTheme(selectedTheme);
    document.documentElement.setAttribute('data-theme', selectedTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', selectedTheme);
    }
  };

  return (
    <>
      <header className={`header-nav ${isLanding ? 'is-landing' : ''}`}>
        {/* Brand Logo - Where U Elevate Circular Stamp */}
        <div
          className="logo"
          onClick={() => {
            if (onNavigateHome) onNavigateHome();
          }}
          style={{ cursor: onNavigateHome ? 'pointer' : 'default' }}
          title="Where U Elevate"
        >
          <div className="wue-brand-circle-stamp">
            <svg width="40" height="40" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="var(--pri)" strokeWidth="3.5" />
              <g fill="var(--pri)">
                <rect x="34" y="60" width="32" height="7" rx="3" transform="rotate(-15 50 50)" />
                <rect x="37" y="47" width="26" height="7" rx="3" transform="rotate(-15 50 50)" />
                <rect x="40" y="34" width="20" height="7" rx="3" transform="rotate(-15 50 50)" />
              </g>
              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
            </svg>
          </div>
          <div>
            <div className="brand-title-text">Where U Elevate</div>
            <small>{isLanding ? 'Platform' : 'Assess · Smart Proctor'}</small>
          </div>
        </div>

        {/* Navigation Links - Frosted Capsule Pill */}
        <nav className="mnav">
          <a
            href="/test"
            className="nav-link-pbai"
            onClick={(e) => {
              e.preventDefault();
              if (onNavigateToTest) onNavigateToTest();
            }}
            title="Go to ExamZone Proctoring Platform"
          >
            <span className="pbai-badge">ExamZone</span>
          </a>
          <a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">Hackathons</a>
          <a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">Jobs</a>
          <a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">Internships</a>
          <a href="https://whereuelevate.com/events" target="_blank" rel="noopener noreferrer">Events &amp; Bootcamps</a>
        </nav>

        <div className="sp"></div>

        {/* Assessment Steps if in exam */}
        {showSteps && (
          <div className="steps" id="steps">
            {STEP_LABELS.map((label, idx) => {
              let dotClass = 'dot';
              if (idx < currentStep) dotClass += ' done';
              else if (idx === currentStep) dotClass += ' on';

              return (
                <div
                  key={label}
                  className={dotClass}
                  title={label}
                  style={{ cursor: idx < currentStep && onStepClick ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (idx < currentStep && onStepClick) {
                      onStepClick(idx);
                    }
                  }}
                >
                  {idx + 1}
                </div>
              );
            })}
          </div>
        )}

        {/* Right Action: For Organization Button (Golden Amber Pill) */}
        <a
          href="https://whereuelevate.com/organization"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-for-organization"
          title="For Organizations and Employers"
        >
          For Organization
        </a>

        {/* Upper Right Corner: User Profile Pill (Avatar on Left + Hi Yashashvi... + Caret) */}
        <div className="header-profile-wrapper" ref={profileRef}>
          <div
            className={`header-user-profile ${showProfileMenu ? 'active' : ''}`}
            onClick={() => setShowProfileMenu((prev) => !prev)}
            title="Candidate Account Menu"
          >
            <div className="header-user-avatar">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <span className="header-user-name">Hi {firstName}...</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`profile-caret ${showProfileMenu ? 'rotate' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="profile-dropdown-menu">
              {/* User Identity Header */}
              <div className="dropdown-user-header">
                <div className="dropdown-user-avatar">
                  <span>A</span>
                </div>
                <div className="dropdown-user-details">
                  <div className="dropdown-user-fullname">{firstName} Sharma</div>
                  <div className="dropdown-user-email">anmol@whereuelevate.com</div>
                </div>
              </div>

              {/* 1. Profile Strength (Percentage) */}
              <div className="profile-strength-card">
                <div className="profile-strength-top">
                  <span className="profile-strength-label">Profile Strength</span>
                  <span className="profile-strength-pct">85%</span>
                </div>
                <div className="profile-strength-bar">
                  <div className="profile-strength-fill" style={{ width: '85%' }} />
                </div>
                <div className="profile-strength-tip">Almost there! Complete your bio &amp; skills</div>
              </div>

              <div className="dropdown-divider" />

              {/* Dropdown Navigation Actions */}
              <div className="dropdown-menu-list">
                {/* 2. My Dashboard */}
                <button
                  className="dropdown-menu-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (onNavigateToTest) onNavigateToTest();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="9" rx="1" />
                    <rect x="14" y="3" width="7" height="5" rx="1" />
                    <rect x="14" y="12" width="7" height="9" rx="1" />
                    <rect x="3" y="16" width="7" height="5" rx="1" />
                  </svg>
                  <span>My Dashboard</span>
                </button>

                {/* 3. My Profile */}
                <button
                  className="dropdown-menu-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowProfileModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>My Profile</span>
                </button>

                {/* 4. My Activities */}
                <button
                  className="dropdown-menu-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowActivitiesModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <span>My Activities</span>
                </button>

                {/* 5. Settings */}
                <button
                  className="dropdown-menu-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowSettingsModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Settings</span>
                </button>
              </div>

              <div className="dropdown-divider" />

              {/* 6. Logout (in red) */}
              <div className="dropdown-logout-wrap">
                <button
                  className="dropdown-menu-item logout-red"
                  onClick={() => {
                    setShowProfileMenu(false);
                    alert('You have logged out of your Where U Elevate / ExamZone account.');
                    if (onNavigateHome) onNavigateHome();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Settings & Preferences Modal (with Theme Selector) */}
      {showSettingsModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3 className="settings-modal-title">Settings &amp; Preferences</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="settings-modal-body">
              {/* Theme Settings Section */}
              <div>
                <span className="settings-group-label">Theme Appearance</span>
                <div className="theme-options-grid">
                  {/* Light Theme Card */}
                  <div
                    className={`theme-option-card ${theme === 'light' ? 'selected' : ''}`}
                    onClick={() => selectTheme('light')}
                  >
                    <div className="theme-option-icon">☀️</div>
                    <div className="theme-option-name">Light Theme</div>
                    <span className="theme-option-tag">Default</span>
                  </div>

                  {/* Dark Theme Card */}
                  <div
                    className={`theme-option-card ${theme === 'dark' ? 'selected' : ''}`}
                    onClick={() => selectTheme('dark')}
                  >
                    <div className="theme-option-icon">🌙</div>
                    <div className="theme-option-name">Dark Theme</div>
                  </div>
                </div>
              </div>

              {/* Candidate Info Section */}
              <div>
                <span className="settings-group-label">Account Preferences</span>
                <div className="settings-user-info">
                  <div><strong>Name:</strong> {firstName} Sharma</div>
                  <div><strong>Candidate ID:</strong> STU-2026-8841</div>
                  <div><strong>Assessment Platform:</strong> Where U Elevate · ExamZone</div>
                  <div><strong>Theme Status:</strong> {theme === 'light' ? 'Subtle Light Theme' : 'High-Contrast Dark Theme'}</div>
                </div>
              </div>
            </div>

            <div className="settings-modal-footer">
              <button
                className="btn primary sm"
                onClick={() => setShowSettingsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Profile Modal */}
      {showProfileModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3 className="settings-modal-title">My Profile</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowProfileModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
                <div className="dropdown-user-avatar" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                  <span>A</span>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{firstName} Sharma</h4>
                  <span style={{ fontSize: '12px', color: 'var(--mute)' }}>Computer Science &amp; Engineering</span>
                </div>
              </div>
              <div className="settings-user-info">
                <div><strong>Email:</strong> anmol@whereuelevate.com</div>
                <div><strong>Student ID:</strong> STU-2026-8841</div>
                <div><strong>Cohort:</strong> 2026 Engineering Fellowship</div>
                <div><strong>Profile Strength:</strong> 85% Complete</div>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button className="btn primary sm" onClick={() => setShowProfileModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Activities Modal */}
      {showActivitiesModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowActivitiesModal(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3 className="settings-modal-title">My Activities</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowActivitiesModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>hackFront India 2026</div>
                  <div style={{ fontSize: '11px', color: 'var(--mute)' }}>Screening Round Scheduled · Today</div>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Full Stack Engineering Assessment</div>
                  <div style={{ fontSize: '11px', color: 'var(--ok)', fontWeight: 600 }}>Score: 94/100 · Completed</div>
                </div>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button className="btn primary sm" onClick={() => setShowActivitiesModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
