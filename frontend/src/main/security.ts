import { BrowserWindow, desktopCapturer } from 'electron';

/**
 * Configure comprehensive security boundaries and anti-overlay protection.
 */
export function setupSecurityPolicies(mainWindow: BrowserWindow): void {
  const currentSession = mainWindow.webContents.session;

  // 1. Enforce Anti-Overlay & Screen Capture Protection
  // WDA_MONITOR (Windows) / NSWindowSharingNone (macOS) blocks OBS, Discord overlay, and screen recorders
  try {
    mainWindow.setContentProtection(true);
  } catch (err) {
    console.warn('[Security Policy] Could not apply setContentProtection:', err);
  }

  // 2. Enforce strict Content Security Policy (CSP)
  currentSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 ws://127.0.0.1:8000 ws://localhost:8000; " +
          "style-src 'self' 'unsafe-inline'; " +
          "font-src 'self' data:; " +
          "img-src 'self' data: blob:; " +
          "media-src 'self' blob: mediastream:; " +
          "object-src 'none'; " +
          "base-uri 'self';"
        ]
      }
    });
  });

  // 3. Deny unauthorized navigation away from the application origin
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

  // 4. Prevent creation of auxiliary child windows or untrusted browser tabs
  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.warn(`[Security Policy] Blocked window.open attempt for: ${details.url}`);
    return { action: 'deny' };
  });

  // 5. Grant webcam media and screen capture permissions for candidate proctoring; deny everything else
  const allowedPermissions = new Set(['media', 'display-capture', 'camera', 'microphone', 'screen']);

  currentSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (allowedPermissions.has(permission)) {
      console.log(`[Security Policy] Diagnostic: Camera/Media permission granted for '${permission}'`);
      callback(true);
    } else {
      console.warn(`[Security Policy] Diagnostic: Denied device permission request '${permission}'`);
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
        console.log('[Security Policy] setDisplayMediaRequestHandler: Acquiring entire screen sources...');
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        if (sources && sources.length > 0) {
          console.log('[Security Policy] setDisplayMediaRequestHandler: Selected screen:', sources[0].id, sources[0].name);
          callback({ video: sources[0] });
        } else {
          console.warn('[Security Policy] setDisplayMediaRequestHandler: No screen sources found');
          callback({});
        }
      } catch (err) {
        console.error('[Security Policy] setDisplayMediaRequestHandler failed:', err);
        callback({});
      }
    });
  }
}
