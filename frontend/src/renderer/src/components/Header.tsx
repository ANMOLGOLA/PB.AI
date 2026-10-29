import React from 'react';

interface HeaderProps {
  currentStep?: number;
  onStepClick?: (step: number) => void;
}

const STEP_LABELS = ['Sign in', 'Face ID', 'System', 'Rules', 'Test', 'Done'];

export const Header: React.FC<HeaderProps> = ({ currentStep = 0, onStepClick }) => {
  const toggleTheme = () => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const isDark = currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
  };

  return (
    <header>
      <div className="logo">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <path d="M4 22a13 13 0 0 1 26 0" fill="none" stroke="#0a58b8" strokeWidth="3" strokeLinecap="round" />
          <rect x="11" y="20" width="12" height="4" rx="1" fill="#0e7bf0" />
          <rect x="13" y="15" width="10" height="4" rx="1" fill="#0a58b8" />
          <rect x="16" y="10" width="8" height="4" rx="1" fill="#0e7bf0" />
        </svg>
        <div>
          Where U Elevate
          <small>Assess · Smart Proctor</small>
        </div>
      </div>

      <nav className="mnav">
        <a href="https://whereuelevate.com/drills" target="_blank" rel="noopener noreferrer">Hackathons</a>
        <a href="https://whereuelevate.com/jobs" target="_blank" rel="noopener noreferrer">Jobs</a>
        <a href="https://whereuelevate.com/internships" target="_blank" rel="noopener noreferrer">Internships</a>
        <a href="https://whereuelevate.com/events" target="_blank" rel="noopener noreferrer">Events &amp; Bootcamps</a>
      </nav>

      <div className="sp"></div>

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

      <button className="btn ghost sm" onClick={toggleTheme} aria-label="Toggle theme">
        ◐ Theme
      </button>
    </header>
  );
};
