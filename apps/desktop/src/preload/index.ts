import { contextBridge, ipcRenderer } from 'electron';

export interface FocusChangePayload {
  focused: boolean;
  timestamp: number;
}

export interface SystemInfo {
  platform: string;
  appVersion: string;
  backendUrl: string;
  sandboxEnabled: boolean;
}

export interface SentinelBridge {
  getSystemInfo: () => Promise<SystemInfo>;
  onFocusChange: (callback: (payload: FocusChangePayload) => void) => () => void;
}

const api: SentinelBridge = {
  getSystemInfo: (): Promise<SystemInfo> => {
    return ipcRenderer.invoke('get-system-info');
  },
  onFocusChange: (callback: (payload: FocusChangePayload) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: FocusChangePayload) => {
      callback(data);
    };
    ipcRenderer.on('window-focus-change', subscription);
    return () => {
      ipcRenderer.removeListener('window-focus-change', subscription);
    };
  }
};

contextBridge.exposeInMainWorld('sentinelBridge', api);
