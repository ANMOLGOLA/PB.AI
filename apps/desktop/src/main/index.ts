import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { setupSecurityPolicies } from './security';

let mainWindow: BrowserWindow | null = null;
let isExamLocked = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F5F4F0',
    title: 'Sentinel Exam — Secure Assessment Browser',
    show: true,
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

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', { isFullScreen: true });
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', { isFullScreen: false });
    if (isExamLocked) {
      mainWindow?.webContents.send('security-alert', {
        type: 'FULLSCREEN_EXIT_ATTEMPT',
        message: 'Candidate exited mandatory fullscreen lockdown.',
        timestamp: Date.now()
      });
    }
  });

  // Prevent bypass keystrokes in lockdown mode
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isExamLocked) {
      // Catch escape or F11 attempting to drop fullscreen
      if (input.key === 'F11' || input.key === 'Escape') {
        event.preventDefault();
        mainWindow?.webContents.send('security-alert', {
          type: 'LOCKDOWN_KEY_BLOCKED',
          message: `Blocked restricted keypress: ${input.key}`,
          timestamp: Date.now()
        });
      }
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main Process] Renderer successfully loaded bundle');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Main Process] Failed to load renderer: ${errorDescription} (${errorCode})`);
  });

  // Load renderer
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.warn(`[Main Process] Could not load local file ${indexPath}: ${err.message}. Trying dev server fallback...`);
      mainWindow?.loadURL('http://127.0.0.1:5173');
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Fullscreen & Kiosk Lock IPC Handlers
ipcMain.handle('set-fullscreen', (_event, enable: boolean) => {
  if (mainWindow) {
    isExamLocked = enable;
    mainWindow.setFullScreen(enable);
    if (enable) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
      mainWindow.setAlwaysOnTop(false);
    }
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

// Register system info IPC handler
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
