import React, { useState } from 'react';
import { Monitor, StopCircle } from 'lucide-react';
import { ScreenSourcePicker, ScreenSource } from './ScreenSourcePicker';
import { ScreenShareState } from '../hooks/useScreenShare';

interface ScreenShareControlProps {
  state: ScreenShareState;
  sourceName: string;
  errorMessage: string | null;
  onStartShare: (source: ScreenSource | null) => void;
  onStopShare: () => void;
}

export const ScreenShareControl: React.FC<ScreenShareControlProps> = ({
  state,
  sourceName,
  errorMessage,
  onStartShare,
  onStopShare
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleSourceSelected = (source: ScreenSource | null) => {
    setIsPickerOpen(false);
    onStartShare(source);
  };

  const isLive = state === 'active';
  const isConnecting = state === 'connecting' || state === 'ready';
  const isInterrupted = state === 'interrupted';

  return (
    <>
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isLive
            ? 'rgba(16, 185, 129, 0.08)'
            : isInterrupted
            ? 'rgba(245, 158, 11, 0.08)'
            : '#1E293B',
          border: isLive
            ? '1px solid rgba(16, 185, 129, 0.3)'
            : isInterrupted
            ? '1px solid rgba(245, 158, 11, 0.3)'
            : '1px solid #334155',
          borderRadius: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: isLive
                ? 'rgba(16, 185, 129, 0.2)'
                : isInterrupted
                ? 'rgba(245, 158, 11, 0.2)'
                : 'rgba(99, 102, 241, 0.15)',
              color: isLive ? '#10B981' : isInterrupted ? '#F59E0B' : '#818CF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <Monitor size={20} />
            {isLive && (
              <span
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  boxShadow: '0 0 8px #10B981'
                }}
              />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#F8FAFC' }}>
                Examiner Screen Share
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: isLive
                    ? 'rgba(16, 185, 129, 0.2)'
                    : isConnecting
                    ? 'rgba(99, 102, 241, 0.2)'
                    : isInterrupted
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(148, 163, 184, 0.15)',
                  color: isLive
                    ? '#34D399'
                    : isConnecting
                    ? '#818CF8'
                    : isInterrupted
                    ? '#FBBF24'
                    : '#94A3B8'
                }}
              >
                {state === 'active'
                  ? 'Live Transmitting'
                  : state === 'connecting' || state === 'ready'
                  ? 'Connecting...'
                  : state === 'interrupted'
                  ? 'Interrupted'
                  : 'Inactive'}
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '3px 0 0 0' }}>
              {isLive ? (
                <span>Streaming <strong>{sourceName}</strong> to authorized proctor</span>
              ) : isInterrupted ? (
                <span style={{ color: '#FBBF24' }}>
                  {errorMessage || 'Connection temporarily interrupted. Re-establishing link...'}
                </span>
              ) : isConnecting ? (
                <span>Negotiating secure WebRTC signaling gateway...</span>
              ) : state === 'failed' ? (
                <span style={{ color: '#F87171' }}>{errorMessage || 'Screen sharing stopped with an error'}</span>
              ) : (
                <span>Share entire screen or window with remote examiners</span>
              )}
            </p>
          </div>
        </div>

        <div>
          {isLive || isConnecting || isInterrupted ? (
            <button
              type="button"
              onClick={onStopShare}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
                padding: '8px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#F87171',
                borderColor: 'rgba(239, 68, 68, 0.4)'
              }}
            >
              <StopCircle size={16} />
              <span>Stop Sharing</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
                padding: '8px 16px',
                fontWeight: 600
              }}
            >
              <Monitor size={16} />
              <span>Share Screen</span>
            </button>
          )}
        </div>
      </div>

      <ScreenSourcePicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectSource={handleSourceSelected}
      />
    </>
  );
};
