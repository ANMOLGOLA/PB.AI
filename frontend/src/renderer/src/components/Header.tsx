import React from 'react';
import { Layers } from 'lucide-react';

interface HeaderProps {
  platform?: string;
  appVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({ platform, appVersion }) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        {/* Where U Elevate Staircase / Step Crest Icon */}
        <div className="brand-icon-box" aria-hidden="true">
          <Layers size={22} strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="brand-title">Where U Elevate</h1>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                backgroundColor: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              SENTINEL EXAM
            </span>
          </div>
          <p className="brand-tagline">
            Accelerating Innovation. Elevating Assessments.
          </p>
        </div>
      </div>

      <div className="header-meta">
        <span className="environment-tag">
          {platform ? `Client (${platform})` : 'Desktop Client'}
        </span>
        <span className="environment-tag">
          v{appVersion || '0.1.0'}
        </span>
      </div>
    </header>
  );
};
