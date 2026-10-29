import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import path from 'path';
import { setupSecurityPolicies } from './security';

let mainWindow: BrowserWindow | null = null;
let isExamLocked = false;
let lockdownWatchdog: NodeJS.Timeout | null = null;

function forceReclaimFocus(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !isExamLocked) return;
  try {
    if (!mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(true);
    }
    if (!mainWindow.isKiosk()) {
      mainWindow.setKiosk(true);
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 9999);
    mainWindow.moveTop();
    mainWindow.show();
    mainWindow.focus();
  } catch (err) {
    console.warn('[Lockdown] Failed to reclaim focus:', err);
  }
}

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

  // Monitor window focus/blur for telemetry signals and force immediate reclaim in exam mode
  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-focus-change', {
      focused: false,
      timestamp: Date.now()
    });

    if (isExamLocked && mainWindow) {
      mainWindow.webContents.send('security-alert', {
        type: 'WINDOW_BLUR_ATTEMPT',
        message: 'Window focus switch attempt detected and suppressed.',
        timestamp: Date.now()
      });
      // Aggressively force focus back immediately
      forceReclaimFocus();
      setTimeout(forceReclaimFocus, 30);
      setTimeout(forceReclaimFocus, 100);
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
      forceReclaimFocus();
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
        'PrintScreen', 'ContextMenu', 'Windows'
      ];
      if (
        blockedKeys.includes(input.key) ||
        input.key === 'Escape' ||
        input.key === 'Meta' ||
        input.meta ||
        (input.alt && input.key === 'Tab') ||
        (input.control && input.key === 'Escape') ||
        (input.alt && input.key === 'F4') ||
        (input.control && input.shift && input.key === 'I')
      ) {
        event.preventDefault();
        mainWindow?.webContents.send('security-alert', {
          type: 'LOCKDOWN_KEY_BLOCKED',
          message: `Blocked restricted key combination: ${input.key}`,
          timestamp: Date.now()
        });
        forceReclaimFocus();
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
    if (lockdownWatchdog) {
      clearInterval(lockdownWatchdog);
      lockdownWatchdog = null;
    }
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
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 9999);
      mainWindow.setMinimizable(false);
      mainWindow.setMovable(false);
      mainWindow.setClosable(false);
      mainWindow.setFullScreenable(false);
      mainWindow.setSkipTaskbar(true); // Prevent Windows taskbar from overlaying

      // Register global shortcut traps to catch Windows key combinations & Alt+Tab
      const trapShortcuts = [
        'Alt+Tab',
        'Alt+Escape',
        'Control+Escape',
        'F11',
        'Escape',
        'Alt+F4',
        'PrintScreen',
        'CommandOrControl+Shift+I'
      ];

      for (const sc of trapShortcuts) {
        try {
          globalShortcut.register(sc, () => {
            mainWindow?.webContents.send('security-alert', {
              type: 'GLOBAL_HOTKEY_BLOCKED',
              message: `System shortcut ${sc} intercepted by exam lockdown.`,
              timestamp: Date.now()
            });
            forceReclaimFocus();
          });
        } catch {
          // Some keys might already be registered by OS
        }
      }

      // Continuous Focus & Fullscreen Watchdog (ensures Windows Start menu or background app cannot steal focus)
      if (lockdownWatchdog) clearInterval(lockdownWatchdog);
      lockdownWatchdog = setInterval(() => {
        if (isExamLocked && mainWindow && !mainWindow.isDestroyed()) {
          if (!mainWindow.isFocused() || !mainWindow.isFullScreen() || !mainWindow.isKiosk()) {
            forceReclaimFocus();
          }
        }
      }, 150);

      forceReclaimFocus();
    } else {
      if (lockdownWatchdog) {
        clearInterval(lockdownWatchdog);
        lockdownWatchdog = null;
      }
      globalShortcut.unregisterAll();
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimizable(true);
      mainWindow.setMovable(true);
      mainWindow.setClosable(true);
      mainWindow.setFullScreenable(true);
      mainWindow.setSkipTaskbar(false);
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
  if (lockdownWatchdog) {
    clearInterval(lockdownWatchdog);
    lockdownWatchdog = null;
  }
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
