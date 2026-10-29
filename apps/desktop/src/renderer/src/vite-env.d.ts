/// <reference types="vite/client" />

interface Window {
  sentinelBridge?: {
    getSystemInfo: () => Promise<{
      platform: string;
      appVersion: string;
      backendUrl: string;
      sandboxEnabled: boolean;
    }>;
    onFocusChange: (
      callback: (payload: { focused: boolean; timestamp: number }) => void
    ) => () => void;
  };
}
