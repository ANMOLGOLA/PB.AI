import React, { useState, useEffect } from 'react';
import { Monitor, AppWindow, Shield, AlertTriangle, X, Check } from 'lucide-react';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string | null;
  display_id?: string;
}

interface ScreenSourcePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (source: ScreenSource | null) => void;
}

export const ScreenSourcePicker: React.FC<ScreenSourcePickerProps> = ({
  isOpen,
  onClose,
  onSelectSource
}) => {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSources([]);
      setSelectedSourceId(null);
      setFetchError(null);
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    if (window.sentinelBridge && window.sentinelBridge.getScreenSources) {
      window.sentinelBridge.getScreenSources()
        .then((items) => {
          setSources(items);
          const firstScreen = items.find((s) => s.id.startsWith('screen:'));
          if (firstScreen) {
            setSelectedSourceId(firstScreen.id);
            setActiveTab('screens');
          } else if (items.length > 0) {
            setSelectedSourceId(items[0].id);
            setActiveTab('windows');
          }
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('[ScreenPicker] Failed to query screen sources:', err);
          setFetchError(err.message || 'Failed to enumerate screen sources');
          setIsLoading(false);
        });
    } else {
      // Running in standard browser environment where desktopCapturer IPC is unavailable
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const screenSources = sources.filter((s) => s.id.startsWith('screen:'));
  const windowSources = sources.filter((s) => !s.id.startsWith('screen:'));
  const currentList = activeTab === 'screens' ? screenSources : windowSources;
  const selectedSource = sources.find((s) => s.id === selectedSourceId) || null;

  const handleConfirm = () => {
    onSelectSource(selectedSource);
  };

  const handleBrowserDirectShare = () => {
    // When running in browser without desktopCapturer IPC
    onSelectSource(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-picker-title"
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0F172A',
          border: '1px solid #334155',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF'
              }}
            >
              <Monitor size={22} />
            </div>
            <div>
              <h3 id="screen-picker-title" style={{ fontSize: '1.125rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
                Select Display to Share
              </h3>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                Where U Elevate Live Proctoring Stream
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Informed Consent & Disclosure Notice */}
        <div
          style={{
            backgroundColor: 'rgba(79, 70, 229, 0.12)',
            borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <Shield size={18} color="#818CF8" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: '0.8125rem', color: '#CBD5E1', margin: 0, lineHeight: 1.4 }}>
            <strong style={{ color: '#FFFFFF' }}>Informed Consent:</strong> Your selected display will be streamed directly to authorized exam proctors in real-time via peer-to-peer WebRTC. No audio or keystrokes are recorded through this screen stream.
          </p>
        </div>

        {/* Tabs */}
        {sources.length > 0 && (
          <div
            style={{
              display: 'flex',
              padding: '12px 24px 0 24px',
              gap: '12px',
              borderBottom: '1px solid #1E293B'
            }}
          >
            <button
              onClick={() => setActiveTab('screens')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'screens' ? '#818CF8' : '#94A3B8',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'screens' ? '2px solid #6366F1' : '2px solid transparent',
                cursor: 'pointer'
              }}
            >
              <Monitor size={16} />
              <span>Entire Screens ({screenSources.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('windows')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'windows' ? '#818CF8' : '#94A3B8',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'windows' ? '2px solid #6366F1' : '2px solid transparent',
                cursor: 'pointer'
              }}
            >
              <AppWindow size={16} />
              <span>Application Windows ({windowSources.length})</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, maxHeight: '420px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
              <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
              <p>Scanning available displays and application windows...</p>
            </div>
          ) : fetchError ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#F87171' }}>
              <AlertTriangle size={32} style={{ margin: '0 auto 12px auto' }} />
              <p style={{ fontWeight: 600 }}>Error loading screen sources</p>
              <p style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>{fetchError}</p>
            </div>
          ) : sources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <Monitor size={48} color="#64748B" style={{ margin: '0 auto 16px auto' }} />
              <h4 style={{ color: '#F8FAFC', marginBottom: '8px' }}>Browser Display Capture</h4>
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', maxWidth: '440px', margin: '0 auto 20px auto' }}>
                You are currently running in a browser session. Click below to open your system display capture picker.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBrowserDirectShare}
                style={{ padding: '10px 24px', fontWeight: 600 }}
              >
                Open System Screen Picker
              </button>
            </div>
          ) : currentList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
              No {activeTab === 'screens' ? 'screens' : 'application windows'} found.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '16px'
              }}
            >
              {currentList.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    style={{
                      border: isSelected ? '2px solid #6366F1' : '1px solid #334155',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.15)' : '#1E293B',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingTop: '56.25%',
                        backgroundColor: '#000000',
                        overflow: 'hidden'
                      }}
                    >
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                      />
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#6366F1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF'
                          }}
                        >
                          <Check size={14} strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <div
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {source.appIcon ? (
                        <img
                          src={source.appIcon}
                          alt=""
                          style={{ width: '16px', height: '16px', flexShrink: 0 }}
                        />
                      ) : (
                        <Monitor size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: isSelected ? '#FFFFFF' : '#CBD5E1',
                          fontWeight: isSelected ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={source.name}
                      >
                        {source.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0F172A'
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>
            {selectedSource ? (
              <span>Selected: <strong style={{ color: '#F8FAFC' }}>{selectedSource.name}</strong></span>
            ) : (
              <span>Please select a display to stream</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{
                backgroundColor: '#1E293B',
                color: '#CBD5E1',
                borderColor: '#334155'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedSource && sources.length > 0}
              className="btn btn-primary"
              style={{
                fontWeight: 600,
                opacity: (!selectedSource && sources.length > 0) ? 0.5 : 1
              }}
            >
              Share Selected Display
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
