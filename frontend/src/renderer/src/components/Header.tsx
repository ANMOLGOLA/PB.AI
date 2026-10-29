import React, { useState, useEffect, useRef } from 'react';
import { Layers, LogOut } from 'lucide-react';

interface HeaderProps {
  currentStep?: number;
  onStepClick?: (step: number) => void;
  showSteps?: boolean;
  onNavigateToTest?: () => void;
  onNavigateHome?: () => void;
  isLanding?: boolean;
  firstName?: string;
  platform?: string;
  appVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateToTest,
  onNavigateHome,
  isLanding = false,
  firstName = 'Candidate',
  platform,
  appVersion
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
    return 'light';
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

  const handleQuit = () => {
    if (window.confirm('Are you sure you want to exit the application?')) {
      if (window.sentinelBridge && window.sentinelBridge.closeApp) {
        window.sentinelBridge.closeApp();
      } else {
        window.close();
      }
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
          <a href="https://whereuelevate.com/events" target="_blank" rel="noopener noreferrer">Events</a>
          <a href="https://whereuelevate.com/solutions-for-enterprises" target="_blank" rel="noopener noreferrer">For Enterprises</a>
        </nav>

        {/* User Profile Avatar with Interactive Dropdown */}
        <div className="uwrap" ref={profileRef} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Emergency Quit for Desktop */}
          {typeof window !== 'undefined' && window.sentinelBridge && (
            <button
              type="button"
              onClick={handleQuit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              title="Quit Application"
            >
              <LogOut size={12} />
              <span>Quit</span>
            </button>
          )}

          <div
            className="uavatar-btn"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            title="User Profile Menu"
          >
            <div className="uavatar">{firstName.charAt(0).toUpperCase()}</div>
            <span className="uavatar-name">{firstName}</span>
            <svg
              className={`uavatar-chevron ${showProfileMenu ? 'open' : ''}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {/* Frosted Dropdown Menu */}
          {showProfileMenu && (
            <div className="uprofile-dropdown">
              <div className="uprofile-header">
                <div className="uprofile-avatar-large">{firstName.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="uprofile-fullname">{firstName} Candidate</div>
                  <div className="uprofile-email">candidate@whereuelevate.com</div>
                </div>
              </div>

              <div className="uprofile-divider" />

              <div className="uprofile-section">
                <button
                  className="uprofile-item"
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

                <button
                  className="uprofile-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowActivitiesModal(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <span>My Activities</span>
                  <span className="uprofile-badge">2 Active</span>
                </button>

                <button
                  className="uprofile-item"
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

              <div className="uprofile-divider" />

              {/* Theme Selector Toggle */}
              <div className="uprofile-theme-row">
                <span className="uprofile-theme-label">Theme</span>
                <div className="uprofile-theme-toggle">
                  <button
                    className={`theme-pill-btn ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => selectTheme('light')}
                  >
                    Light
                  </button>
                  <button
                    className={`theme-pill-btn ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => selectTheme('dark')}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="uprofile-divider" />

              <div className="uprofile-section">
                <a
                  href="https://whereuelevate.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="uprofile-item"
                  style={{ textDecoration: 'none' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Help Center & FAQ</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3 className="settings-modal-title">Settings & Preferences</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowSettingsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-field">
                <label className="settings-label">Color Theme</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn sm ${theme === 'light' ? 'primary' : 'secondary'}`}
                    onClick={() => selectTheme('light')}
                  >
                    Light Mode (Default)
                  </button>
                  <button
                    className={`btn sm ${theme === 'dark' ? 'primary' : 'secondary'}`}
                    onClick={() => selectTheme('dark')}
                  >
                    Dark Slate Mode
                  </button>
                </div>
              </div>
              <div className="settings-field" style={{ marginTop: '16px' }}>
                <label className="settings-label">Audio Notifications</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" defaultChecked />
                  <span>Play gentle chime on proctor notifications</span>
                </label>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button className="btn primary sm" onClick={() => setShowSettingsModal(false)}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3 className="settings-modal-title">Candidate Profile</h3>
              <button
                className="settings-modal-close"
                onClick={() => setShowProfileModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="settings-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div className="uavatar" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{firstName} Candidate</div>
                  <div style={{ fontSize: '12px', color: 'var(--mute)' }}>Candidate ID: CAND-2026-WUE</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--mute)', lineHeight: 1.6 }}>
                Identity enrolled for Where U Elevate assessment cycles. Protected by biometric anti-impersonation and continuous integrity verification.
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

      {/* Activities Modal */}
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
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Where U Elevate Technical Assessment</div>
                  <div style={{ fontSize: '11px', color: 'var(--mute)' }}>Active Screening Session · In Progress</div>
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
