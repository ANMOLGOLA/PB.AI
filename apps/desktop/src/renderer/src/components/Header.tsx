import React from 'react';
import { Shield } from 'lucide-react';

interface HeaderProps {
  platform?: string;
  appVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({ platform, appVersion }) => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon-box" aria-hidden="true">
          <Shield size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="brand-title">Sentinel Exam</h1>
          <p className="brand-tagline">
            Secure assessments. Explainable integrity. Fair evaluation.
          </p>
        </div>
      </div>

      <div className="header-meta">
        <span className="environment-tag">
          {platform ? `Desktop (${platform})` : 'Desktop Client'}
        </span>
        <span className="environment-tag">
          v{appVersion || '0.1.0'}
        </span>
      </div>
    </header>
  );
};
