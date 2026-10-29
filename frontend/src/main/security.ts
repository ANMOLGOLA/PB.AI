import { BrowserWindow, desktopCapturer } from 'electron';

/**
 * Configure comprehensive security boundaries and anti-overlay protection.
 */
export function setupSecurityPolicies(mainWindow: BrowserWindow): void {
  const currentSession = mainWindow.webContents.session;

  // 1. Enforce Anti-Overlay & Screen Capture Protection
  try {
    mainWindow.setContentProtection(true);
  } catch (err) {
    console.warn('[Security Policy] Could not apply setContentProtection:', err);
  }

  // 2. Enforce Content Security Policy (CSP) allowing webview frame embedding
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 ws://127.0.0.1:8000 ws://localhost:8000; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self' data:; " +
          "img-src 'self' data: blob: https:; " +
          "media-src 'self' blob: mediastream:; " +
          "frame-src 'self' https:; " +
          "object-src 'none'; " +
          "base-uri 'self';"
        ]
      }
    });
  });

  // 3. Deny unauthorized navigation away from the application origin on the main window
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isAllowedOrigin =
      parsedUrl.protocol === 'file:' ||
      (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

    if (!isAllowedOrigin) {
      event.preventDefault();
      console.warn(`[Security Policy] Blocked external navigation on main window to: ${navigationUrl}`);
    }
  });

  // 4. Handle auxiliary window requests safely
  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.warn(`[Security Policy] Blocked window.open attempt for: ${details.url}`);
    return { action: 'deny' };
  });

  // 5. Grant webcam media and screen capture permissions for candidate proctoring
  const allowedPermissions = new Set(['media', 'display-capture', 'camera', 'microphone', 'screen']);

  currentSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (allowedPermissions.has(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  if (typeof (currentSession as any).setPermissionCheckHandler === 'function') {
    (currentSession as any).setPermissionCheckHandler((_webContents: any, permission: string) => {
      return allowedPermissions.has(permission);
    });
  }

  // 6. Handle display media requests for standard navigator.mediaDevices.getDisplayMedia
  if (typeof (currentSession as any).setDisplayMediaRequestHandler === 'function') {
    (currentSession as any).setDisplayMediaRequestHandler(async (_request: any, callback: any) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        if (sources && sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      } catch (err) {
        console.error('[Security Policy] setDisplayMediaRequestHandler failed:', err);
        callback({});
      }
    });
  }
}
