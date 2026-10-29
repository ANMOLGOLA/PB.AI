import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { setupSecurityPolicies } from './security';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F5F4F0',
    title: 'Sentinel Exam',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Apply defensive process security policies
  setupSecurityPolicies(mainWindow);

  // Monitor window focus/blur for telemetry signals
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-focus-change', {
      focused: false,
      timestamp: Date.now()
    });
  });

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focus-change', {
      focused: true,
      timestamp: Date.now()
    });
  });

  // Load renderer
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    // In production or compiled build, load static bundle
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath).catch(() => {
      // Fallback to local dev server if local file is not yet built
      mainWindow?.loadURL('http://127.0.0.1:5173');
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register minimal read-only IPC handler
ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    appVersion: app.getVersion(),
    backendUrl: process.env.VITE_API_URL || 'http://127.0.0.1:8000',
    sandboxEnabled: true
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
