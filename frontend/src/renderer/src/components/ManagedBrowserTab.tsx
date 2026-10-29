import React, { useState, useEffect, useRef } from 'react';
import { Globe, ArrowLeft, ArrowRight, RotateCw, ExternalLink, ShieldCheck } from 'lucide-react';

interface ManagedBrowserTabProps {
  onTelemetryEvent: (eventType: string, metadata: Record<string, any>) => void;
}

const PRESET_DESTINATIONS = [
  { name: 'Google Search', url: 'https://www.google.com' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Gemini', url: 'https://gemini.google.com' }
];

export const ManagedBrowserTab: React.FC<ManagedBrowserTabProps> = ({ onTelemetryEvent }) => {
  const [currentUrl, setCurrentUrl] = useState<string>('https://www.google.com');
  const [inputUrl, setInputUrl] = useState<string>('https://www.google.com');
  const webviewRef = useRef<any>(null);

  // Preload script path for webview
  const preloadPath = typeof window !== 'undefined'
    ? 'file://' + (window as any).sentinelPreloadPath || ''
    : '';

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Listen to IPC messages sent from inside the webview preload script
    const handleIpcMessage = (event: any) => {
      if (event.channel === 'webview-telemetry') {
        const payload = event.args && event.args[0] ? event.args[0] : {};
        const { type, domain, query, url, ts } = payload;

        if (type === 'domain_opened') {
          onTelemetryEvent('EXTERNAL_DOMAIN_OPENED', {
            domain,
            url,
            ts
          });
        } else if (type === 'query_submitted') {
          onTelemetryEvent('EXTERNAL_QUERY_SUBMITTED', {
            domain,
            query,
            url,
            ts
          });
        } else if (type === 'query_capture_unavailable') {
          onTelemetryEvent('QUERY_CAPTURE_UNAVAILABLE', {
            domain,
            url,
            ts,
            reason: payload.reason || 'Input target unreadable'
          });
        }
      }
    };

    const handleDidNavigate = (event: any) => {
      if (event.url) {
        setCurrentUrl(event.url);
        setInputUrl(event.url);
      }
    };

    webview.addEventListener('ipc-message', handleIpcMessage);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);

    return () => {
      webview.removeEventListener('ipc-message', handleIpcMessage);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
    };
  }, [onTelemetryEvent]);

  const handleNavigate = (targetUrl: string) => {
    let url = targetUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    setCurrentUrl(url);
    setInputUrl(url);
    if (webviewRef.current) {
      webviewRef.current.loadURL(url);
    }
  };

  const handleGoBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) {
      webviewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) {
      webviewRef.current.goForward();
    }
  };

  const handleReload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0F172A', color: '#F8FAFC' }}>
      {/* Browser Navigation Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: '#1E293B',
          borderBottom: '1px solid #334155'
        }}
      >
        <button
          type="button"
          onClick={handleGoBack}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '6px' }}
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          onClick={handleGoForward}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '6px' }}
          title="Forward"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={handleReload}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '6px' }}
          title="Reload"
        >
          <RotateCw size={16} />
        </button>

        {/* URL Input Bar */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0F172A', borderRadius: '6px', padding: '6px 12px', border: '1px solid #334155' }}>
          <Globe size={14} color="#64748B" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(inputUrl);
            }}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#F8FAFC',
              fontSize: '0.8125rem'
            }}
          />
        </div>

        {/* Permitted AI/Search Shortcuts */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {PRESET_DESTINATIONS.map((dest) => (
            <button
              key={dest.name}
              type="button"
              onClick={() => handleNavigate(dest.url)}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: currentUrl.includes(new URL(dest.url).hostname) ? '#3B82F6' : '#334155',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {dest.name}
            </button>
          ))}
        </div>
      </div>

      {/* Monitoring Disclosure Ribbon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: '0.75rem',
          color: '#93C5FD'
        }}
      >
        <ShieldCheck size={14} color="#60A5FA" />
        <span>
          <strong>Permitted Research Surface:</strong> Tab switching is permitted. All destination domains and submitted queries are observed and logged into your examination audit report.
        </span>
      </div>

      {/* Sandboxed Webview Surface */}
      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0, overflow: 'hidden' }}>
        <webview
          ref={webviewRef}
          src={currentUrl}
          partition="persist:managed_browsing"
          allowpopups={true}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
};
