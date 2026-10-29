import React from 'react';
import { Server, CheckCircle2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';
import { HealthStatus, ConnectionState } from '../api/types';

interface ServiceStatusProps {
  connectionState: ConnectionState;
  health: HealthStatus | null;
  errorDetail: string | null;
  backendUrl: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ServiceStatus: React.FC<ServiceStatusProps> = ({
  connectionState,
  health,
  errorDetail,
  backendUrl,
  onRefresh,
  isRefreshing
}) => {
  return (
    <section className="card" aria-labelledby="status-card-title">
      <div className="card-header">
        <div className="card-title-group">
          <Server size={18} className="card-icon" aria-hidden="true" />
          <h2 id="status-card-title" className="card-title">
            Backend Service Status
          </h2>
        </div>

        {connectionState === 'connected' && (
          <span className="status-badge connected">
            <CheckCircle2 size={14} aria-hidden="true" />
            Connected
          </span>
        )}
        {connectionState === 'disconnected' && (
          <span className="status-badge disconnected">
            <XCircle size={14} aria-hidden="true" />
            Disconnected
          </span>
        )}
        {connectionState === 'error' && (
          <span className="status-badge warning">
            <AlertCircle size={14} aria-hidden="true" />
            Degraded
          </span>
        )}
        {connectionState === 'loading' && (
          <span className="status-badge neutral">
            <RefreshCw size={14} className="spin" aria-hidden="true" />
            Connecting...
          </span>
        )}
      </div>

      <div className="meta-list">
        <div className="meta-row">
          <span className="meta-label">API Endpoint</span>
          <span className="meta-value">{backendUrl}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Service Name</span>
          <span className="meta-value">
            {health?.service || (connectionState === 'loading' ? 'Checking...' : 'Unreachable')}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Database Health</span>
          <span className="meta-value">
            {health?.database || (connectionState === 'loading' ? 'Checking...' : 'Unavailable')}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-label">API Version</span>
          <span className="meta-value">{health?.version || 'N/A'}</span>
        </div>
      </div>

      {connectionState === 'disconnected' && (
        <div className="notice-box error" role="alert">
          <div>
            <strong>Unable to reach the assessment service.</strong>
            <p style={{ marginTop: '4px', fontSize: '0.8125rem' }}>
              Ensure the backend is active at <code>{backendUrl}</code>. Start it via:{' '}
              <code>npm run backend:run</code>
            </p>
            {errorDetail && (
              <p style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.85 }}>
                Error: {errorDetail}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="button-group">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Retry connection to backend service"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} aria-hidden="true" />
          {isRefreshing ? 'Checking...' : 'Retry Connection'}
        </button>
      </div>
    </section>
  );
};
