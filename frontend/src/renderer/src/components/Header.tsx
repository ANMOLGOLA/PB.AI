import React from 'react';
import { Layers, Shield, LogOut } from 'lucide-react';

interface HeaderProps {
  platform?: string;
  appVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({
  platform,
  appVersion
}) => {
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
    <header className="app-header">
      <div className="brand-section">
        {/* Where U Elevate Staircase Crest Icon */}
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
                padding: '2px 8px',
                borderRadius: '4px'
              }}
            >
              ASSESSMENT PORTAL
            </span>
          </div>
          <p className="brand-tagline">
            Accelerating Innovation. Elevating Assessments.
          </p>
        </div>
      </div>

      <div className="header-meta" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            padding: '4px 10px',
            borderRadius: '20px',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}
        >
          <Shield size={13} />
          <span>Secure Examination Client</span>
        </div>
        <span className="environment-tag">
          {platform ? platform : 'Desktop'} &bull; v{appVersion || '0.1.0'}
        </span>

        {/* Prominent Application Quit Button */}
        <button
          type="button"
          onClick={handleQuit}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '0.8125rem',
            fontWeight: 700,
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)',
            transition: 'background-color 0.15s ease'
          }}
          title="Quit and close application (Shortcut: Ctrl+Shift+Q)"
        >
          <LogOut size={14} />
          <span>Quit App</span>
        </button>
      </div>
    </header>
  );
};
