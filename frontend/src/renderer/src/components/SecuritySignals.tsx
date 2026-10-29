import React from 'react';
import { Lock, Eye, Monitor } from 'lucide-react';

interface SecuritySignalsProps {
  isWindowFocused: boolean;
  lastFocusEventTime: number | null;
  sandboxEnabled: boolean;
}

export const SecuritySignals: React.FC<SecuritySignalsProps> = ({
  isWindowFocused,
  lastFocusEventTime,
  sandboxEnabled
}) => {
  return (
    <section className="card" aria-labelledby="security-card-title">
      <div className="card-header">
        <div className="card-title-group">
          <Lock size={18} className="card-icon" aria-hidden="true" />
          <h2 id="security-card-title" className="card-title">
            Desktop Isolation & Integrity
          </h2>
        </div>

        <span className={`status-badge ${isWindowFocused ? 'connected' : 'warning'}`}>
          <Monitor size={14} aria-hidden="true" />
          {isWindowFocused ? 'Window Active' : 'Window Blurred'}
        </span>
      </div>

      <div className="meta-list">
        <div className="meta-row">
          <span className="meta-label">Context Isolation</span>
          <span className="meta-value">Enabled (Enforced)</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Node.js Integration</span>
          <span className="meta-value">Disabled (Isolated)</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Chromium Sandbox</span>
          <span className="meta-value">
            {sandboxEnabled ? 'Active (Standard)' : 'Active (Process Sandboxed)'}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Focus State Telemetry</span>
          <span className="meta-value">
            {isWindowFocused ? 'Focused (In Session)' : 'Lost Focus (Logged)'}
          </span>
        </div>
      </div>

      <div className="notice-box info">
        <Eye size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
        <div style={{ fontSize: '0.8125rem' }}>
          <strong>Explainable Telemetry:</strong> Window focus changes are tracked via native desktop
          events for post-assessment integrity timelines without accessing external personal data.
          {lastFocusEventTime && (
            <div style={{ marginTop: '4px', opacity: 0.85 }}>
              Last observed transition: {new Date(lastFocusEventTime).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
