/// <reference types="vite/client" />

interface Window {
  sentinelBridge?: {
    getSystemInfo: () => Promise<{
      platform: string;
      appVersion: string;
      backendUrl: string;
      sandboxEnabled: boolean;
    }>;
    getWebviewPreloadPath?: () => Promise<string>;
    setFullscreen: (enable: boolean) => Promise<boolean>;
    isFullScreen: () => Promise<boolean>;
    getScreenSources: () => Promise<
      Array<{
        id: string;
        name: string;
        thumbnail: string;
        appIcon?: string | null;
        display_id?: string;
      }>
    >;
    setScreenShareActive: (active: boolean) => Promise<boolean>;
    closeApp?: () => Promise<void>;
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

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      preload?: string;
      partition?: string;
      allowpopups?: string | boolean;
      webpreferences?: string;
      style?: React.CSSProperties;
      ref?: React.Ref<any>;
    };
  }
}
