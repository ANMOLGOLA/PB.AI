import { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer, shell, Menu } from 'electron';
import path from 'path';
import { setupSecurityPolicies } from './security';

// Strip application menu across the entire app
Menu.setApplicationMenu(null);

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

function applyKioskLockdown(enable: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isExamLocked = enable;
  if (enable) {
    mainWindow.setKiosk(true);
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 9999);
    mainWindow.setMinimizable(false);
    mainWindow.setResizable(false);
    mainWindow.setMovable(false);
    mainWindow.setClosable(false);
    mainWindow.setFullScreenable(false);
    mainWindow.setSkipTaskbar(true); // Suppress Windows taskbar completely

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

    // Continuous Focus & Fullscreen Watchdog
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
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setClosable(true);
    mainWindow.setFullScreenable(true);
    mainWindow.setSkipTaskbar(false);
  }
}

function createWindow(): void {
  isExamLocked = false;

  mainWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#0F172A',
    title: 'Where U Elevate — Sentinel Exam Secure Assessment',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      devTools: process.env.NODE_ENV === 'development'
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Apply defensive process security and anti-overlay policies
  setupSecurityPolicies(mainWindow);

  // Suppress right-click context menu so student cannot open developer inspection
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  // Ensure DevTools cannot be kept open in student exam portal
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow?.webContents.closeDevTools();
  });

  // Prevent accidental or deliberate window closure during active exam lockdown
  mainWindow.on('close', (event) => {
    if (isExamLocked) {
      event.preventDefault();
      mainWindow?.webContents.send('security-alert', {
        type: 'WINDOW_CLOSE_ATTEMPT',
        message: 'Window closure is prohibited during active assessment.',
        timestamp: Date.now()
      });
      forceReclaimFocus();
    }
  });

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
      forceReclaimFocus();
      mainWindow.webContents.send('security-alert', {
        type: 'FULLSCREEN_EXIT_ATTEMPT',
        message: 'Lockdown breach: Full-screen exit attempt was blocked and logged.',
        timestamp: Date.now()
      });
    }
  });

  // Intercept and prevent bypass keystrokes in lockdown mode & block DevTools globally
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const keyUpper = (input.key || '').toUpperCase();

    // Universal Emergency Quit key: Ctrl+Q or Cmd+Q or Ctrl+Shift+Q terminates immediately
    const isQuitKey = (input.control || input.meta) && keyUpper === 'Q';
    if (isQuitKey) {
      event.preventDefault();
      console.log('[Main Process] Universal quit key triggered (Ctrl+Q)');
      if (lockdownWatchdog) {
        clearInterval(lockdownWatchdog);
        lockdownWatchdog = null;
      }
      globalShortcut.unregisterAll();
      isExamLocked = false;
      app.exit(0);
      return;
    }

    const isReload = (input.control || input.meta) && keyUpper === 'R';
    const isHardReload = (input.control || input.meta) && input.shift && keyUpper === 'R';
    const isDevTools =
      ((input.control || input.meta) && input.shift && keyUpper === 'I') || keyUpper === 'F12';
    const isF5 = keyUpper === 'F5';

    // Disallow DevTools and reload shortcuts unconditionally in student portal
    if (isDevTools || isReload || isHardReload || isF5) {
      event.preventDefault();
      return;
    }

    if (isExamLocked) {
      const isCloseTab = (input.control || input.meta) && keyUpper === 'W';
      const isBlockedKey =
        ['F1', 'F3', 'F11', 'ESCAPE', 'ALT', 'META', 'TAB', 'PRINTSCREEN', 'CONTEXTMENU', 'WINDOWS'].includes(keyUpper);

      if (
        isBlockedKey ||
        isCloseTab ||
        input.meta ||
        (input.alt && keyUpper === 'TAB') ||
        (input.control && keyUpper === 'ESCAPE') ||
        (input.alt && keyUpper === 'F4')
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
    mainWindow?.setFullScreen(true);
    mainWindow?.setKiosk(true);
    mainWindow?.setSkipTaskbar(true);
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
    applyKioskLockdown(enable);
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

// Register system info IPC handler
ipcMain.handle('get-webview-preload-path', () => {
  return path.join(__dirname, '../preload/webviewPreload.js');
});

ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    appVersion: app.getVersion(),
    backendUrl: process.env.VITE_API_URL || 'http://127.0.0.1:8000',
    sandboxEnabled: true
  };
});

// Close application upon candidate assessment submission or quit request
ipcMain.handle('close-app', () => {
  console.log('[Main Process] Received close-app request. Terminating application...');
  if (lockdownWatchdog) {
    clearInterval(lockdownWatchdog);
    lockdownWatchdog = null;
  }
  globalShortcut.unregisterAll();
  isExamLocked = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setClosable(true);
    mainWindow.destroy();
  }
  app.exit(0);
});

// Screen Capture & Source Enumeration for Candidate Screen Sharing (Strictly Entire Screen)
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 }
    });
    console.log(`[Main Process] Diagnostic: Enumerated ${sources.length} entire display screen sources:`, sources.map(s => `${s.id} (${s.name})`));
    return sources.map((source, idx) => ({
      id: source.id,
      name: source.name || `Entire Screen ${idx + 1}`,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: null,
      display_id: source.display_id
    }));
  } catch (err: any) {
    console.error('[Main Process] Failed to get desktop sources:', err);
    throw new Error(err.message || 'Failed to enumerate screen sources');
  }
});

// Content Protection Control during active screen sharing
ipcMain.handle('set-screen-share-active', (_event, active: boolean) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      // Temporarily lift OS content protection while candidate actively shares screen
      // so Windows OS does not blank out the exam window in the captured stream.
      console.log(`[Main Process] Diagnostic: Setting window contentProtection to ${!active} (active share=${active})`);
      mainWindow.setContentProtection(!active);
      return true;
    } catch (err) {
      console.warn('[Main Process] Failed to toggle content protection:', err);
      return false;
    }
  }
  return false;
});

app.whenReady().then(() => {
  createWindow();

  // Global Emergency Exit shortcuts: Ctrl+Q, Cmd+Q, Ctrl+Shift+Q immediately quit
  const triggerEmergencyQuit = () => {
    console.log('[Lockdown] Emergency Quit shortcut triggered');
    if (lockdownWatchdog) {
      clearInterval(lockdownWatchdog);
      lockdownWatchdog = null;
    }
    globalShortcut.unregisterAll();
    isExamLocked = false;
    app.exit(0);
  };

  try {
    globalShortcut.register('CommandOrControl+Q', triggerEmergencyQuit);
    globalShortcut.register('CommandOrControl+Shift+Q', triggerEmergencyQuit);
  } catch (err) {
    console.warn('[Main Process] Could not register emergency exit shortcut:', err);
  }

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
