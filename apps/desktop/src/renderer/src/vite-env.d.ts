/// <reference types="vite/client" />

interface Window {
  sentinelBridge?: {
    getSystemInfo: () => Promise<{
      platform: string;
      appVersion: string;
      backendUrl: string;
      sandboxEnabled: boolean;
    }>;
    setFullscreen: (enable: boolean) => Promise<boolean>;
    isFullScreen: () => Promise<boolean>;
    onFocusChange: (
      callback: (payload: { focused: boolean; timestamp: number }) => void
    ) => () => void;
    onFullscreenChange: (
      callback: (payload: { isFullScreen: boolean }) => void
    ) => () => void;
    onSecurityAlert: (
      callback: (payload: { type: string; message: string; timestamp: number }) => void
    ) => () => void;
  };
}
