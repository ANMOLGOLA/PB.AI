import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
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
    backgroundColor: '#0F172A',
    title: 'Where U Elevate — Sentinel Exam Secure Assessment',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Apply defensive process security and anti-overlay policies
  setupSecurityPolicies(mainWindow);

  // Monitor window focus/blur for telemetry signals and force reclaim in exam mode
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-focus-change', {
      focused: false,
      timestamp: Date.now()
    });

    // In lockdown exam mode, immediately reclaim focus and return to top
    if (isExamLocked && mainWindow) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        }
      }, 50);
    }
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
    if (isExamLocked && mainWindow) {
      // Instantly restore kiosk & fullscreen if candidate attempts to break out
      mainWindow.setFullScreen(true);
      mainWindow.setKiosk(true);
      mainWindow.webContents.send('security-alert', {
        type: 'FULLSCREEN_EXIT_ATTEMPT',
        message: 'Lockdown breach: Full-screen exit attempt was blocked and logged.',
        timestamp: Date.now()
      });
    }
  });

  // Intercept and prevent bypass keystrokes in lockdown mode
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isExamLocked) {
      const blockedKeys = [
        'F11', 'F12', 'Escape', 'Alt', 'Meta', 'Tab',
        'PrintScreen', 'ContextMenu'
      ];
      if (blockedKeys.includes(input.key) || (input.alt && input.key === 'Tab') || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
        mainWindow?.webContents.send('security-alert', {
          type: 'LOCKDOWN_KEY_BLOCKED',
          message: `Blocked restricted key combination: ${input.key}`,
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
    if (enable) {
      mainWindow.setKiosk(true);
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      mainWindow.setMinimizable(false);
      mainWindow.setMovable(false);

      // Register global shortcut traps
      globalShortcut.registerAll(['Alt+Tab', 'F11', 'CommandOrControl+Shift+I'], () => {
        mainWindow?.webContents.send('security-alert', {
          type: 'GLOBAL_HOTKEY_BLOCKED',
          message: 'System hotkey intercepted by exam lockdown.',
          timestamp: Date.now()
        });
      });
    } else {
      globalShortcut.unregisterAll();
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimizable(true);
      mainWindow.setMovable(true);
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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
