import { BrowserWindow } from 'electron';

/**
 * Configure comprehensive security boundaries for the Electron process.
 */
export function setupSecurityPolicies(mainWindow: BrowserWindow): void {
  const currentSession = mainWindow.webContents.session;

  // 1. Enforce strict Content Security Policy (CSP) on HTTP/file responses
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 ws://127.0.0.1:8000 ws://localhost:8000; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self'; " +
          "img-src 'self' data: blob:; " +
          "media-src 'self' blob: mediastream:; " +
          "object-src 'none'; " +
          "base-uri 'self';"
        ]
      }
    });
  });

  // 2. Deny unauthorized navigation away from the application origin
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isAllowedOrigin =
      parsedUrl.protocol === 'file:' ||
      (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

    if (!isAllowedOrigin) {
      event.preventDefault();
      console.warn(`[Security Policy] Blocked external navigation to: ${navigationUrl}`);
    }
  });

  // 3. Prevent creation of auxiliary child windows or untrusted browser tabs
  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.warn(`[Security Policy] Blocked window.open attempt for: ${details.url}`);
    return { action: 'deny' };
  });

  // 4. Grant webcam media permissions for camera proctoring; deny everything else
  currentSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      console.warn(`[Security Policy] Denied device permission request: ${permission}`);
      callback(false);
    }
  });
}
