import { contextBridge, ipcRenderer } from 'electron';

export interface FocusChangePayload {
  focused: boolean;
  timestamp: number;
}

export interface SecurityAlertPayload {
  type: string;
  message: string;
  timestamp: number;
}

export interface SystemInfo {
  platform: string;
  appVersion: string;
  backendUrl: string;
  sandboxEnabled: boolean;
}

export interface DesktopCaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string | null;
  display_id?: string;
}

export interface SentinelBridge {
  getSystemInfo: () => Promise<SystemInfo>;
  setFullscreen: (enable: boolean) => Promise<boolean>;
  isFullScreen: () => Promise<boolean>;
  getScreenSources: () => Promise<DesktopCaptureSource[]>;
  setScreenShareActive: (active: boolean) => Promise<boolean>;
  closeApp: () => Promise<void>;
  onFocusChange: (callback: (payload: FocusChangePayload) => void) => () => void;
  onFullscreenChange: (callback: (payload: { isFullScreen: boolean }) => void) => () => void;
  onSecurityAlert: (callback: (payload: SecurityAlertPayload) => void) => () => void;
}

const api: SentinelBridge = {
  getSystemInfo: (): Promise<SystemInfo> => {
    return ipcRenderer.invoke('get-system-info');
  },
  setFullscreen: (enable: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('set-fullscreen', enable);
  },
  isFullScreen: (): Promise<boolean> => {
    return ipcRenderer.invoke('is-fullscreen');
  },
  getScreenSources: (): Promise<DesktopCaptureSource[]> => {
    return ipcRenderer.invoke('get-screen-sources');
  },
  setScreenShareActive: (active: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('set-screen-share-active', active);
  },
  closeApp: (): Promise<void> => {
    return ipcRenderer.invoke('close-app');
  },
  onFocusChange: (callback: (payload: FocusChangePayload) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: FocusChangePayload) => {
      callback(data);
    };
    ipcRenderer.on('window-focus-change', subscription);
    return () => {
      ipcRenderer.removeListener('window-focus-change', subscription);
    };
  },
  onFullscreenChange: (callback: (payload: { isFullScreen: boolean }) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: { isFullScreen: boolean }) => {
      callback(data);
    };
    ipcRenderer.on('fullscreen-change', subscription);
    return () => {
      ipcRenderer.removeListener('fullscreen-change', subscription);
    };
  },
  onSecurityAlert: (callback: (payload: SecurityAlertPayload) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: SecurityAlertPayload) => {
      callback(data);
    };
    ipcRenderer.on('security-alert', subscription);
    return () => {
      ipcRenderer.removeListener('security-alert', subscription);
    };
  }
};

contextBridge.exposeInMainWorld('sentinelBridge', api);
