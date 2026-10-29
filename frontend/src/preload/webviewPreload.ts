/**
 * Sandboxed Preload Script for Managed Browsing <webview>
 * Strictly isolates external web pages while capturing permitted search & AI prompt telemetry.
 *
 * Core Principle: "Observe and explain, not block."
 * Rule: NEVER invent or hallucinate query text. If extraction fails, emit "query_capture_unavailable".
 */

import { ipcRenderer } from 'electron';

const TARGET_AI_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'perplexity.ai'
];

function getDomain(): string {
  try {
    return window.location.hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

function sendTelemetry(type: string, data: Record<string, any> = {}): void {
  try {
    ipcRenderer.sendToHost('webview-telemetry', {
      type,
      domain: getDomain(),
      url: window.location.href,
      ts: new Date().toISOString(),
      ...data
    });
  } catch (err) {
    console.warn('[WebviewPreload] Failed to send telemetry:', err);
  }
}

// 1. Emit domain_opened on page initialization
window.addEventListener('DOMContentLoaded', () => {
  const domain = getDomain();
  sendTelemetry('domain_opened', {
    domain,
    url: window.location.href
  });
});

// Helper to extract text from common AI / search DOM structures
function extractSubmittedQuery(target: EventTarget | null): string | null {
  const domain = getDomain();

  // A. Google Search query inputs
  if (domain.includes('google.')) {
    const googleInput = document.querySelector('textarea[name="q"], input[name="q"]') as HTMLInputElement | HTMLTextAreaElement | null;
    if (googleInput && googleInput.value && googleInput.value.trim()) {
      return googleInput.value.trim();
    }
  }

  // B. ChatGPT prompt inputs
  if (domain.includes('chatgpt.com') || domain.includes('openai.com')) {
    const gptTextarea = document.querySelector('#prompt-textarea, textarea[data-id="root"]') as HTMLTextAreaElement | null;
    if (gptTextarea && gptTextarea.value && gptTextarea.value.trim()) {
      return gptTextarea.value.trim();
    }
    // Contenteditable fallback for newer ChatGPT UI versions
    const gptEditable = document.querySelector('#prompt-textarea[contenteditable="true"], div[contenteditable="true"]') as HTMLElement | null;
    if (gptEditable && gptEditable.innerText && gptEditable.innerText.trim()) {
      return gptEditable.innerText.trim();
    }
  }

  // C. Claude AI prompt inputs
  if (domain.includes('claude.ai')) {
    const claudeEditor = document.querySelector('div.ProseMirror, div[contenteditable="true"]') as HTMLElement | null;
    if (claudeEditor && claudeEditor.innerText && claudeEditor.innerText.trim()) {
      return claudeEditor.innerText.trim();
    }
  }

  // D. Gemini prompt inputs
  if (domain.includes('gemini.google.com')) {
    const geminiEditor = document.querySelector('rich-textarea div[contenteditable="true"], div[contenteditable="true"]') as HTMLElement | null;
    if (geminiEditor && geminiEditor.innerText && geminiEditor.innerText.trim()) {
      return geminiEditor.innerText.trim();
    }
  }

  // E. Generic Target / Active Element Fallback
  if (target && target instanceof HTMLElement) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (target.value && target.value.trim()) {
        return target.value.trim();
      }
    }
    if (target.isContentEditable && target.innerText && target.innerText.trim()) {
      return target.innerText.trim();
    }
  }

  // F. Currently focused active element fallback
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body) {
    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
      if (activeEl.value && activeEl.value.trim()) {
        return activeEl.value.trim();
      }
    }
    if ((activeEl as HTMLElement).isContentEditable && (activeEl as HTMLElement).innerText) {
      const text = (activeEl as HTMLElement).innerText.trim();
      if (text) return text;
    }
  }

  return null;
}

// 2. Intercept Enter keypress submissions
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    const query = extractSubmittedQuery(event.target);
    if (query && query.length > 0) {
      sendTelemetry('query_submitted', { query });
    } else {
      // If user hit Enter inside an input or form but text couldn't be resolved,
      // emit deterministic unavailable status instead of fabricating text
      const target = event.target as HTMLElement | null;
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isInput) {
        sendTelemetry('query_capture_unavailable', {
          reason: 'Input target located but text value unreadable'
        });
      }
    }
  }
}, true);

// 3. Intercept Form Submission
window.addEventListener('submit', (event: SubmitEvent) => {
  const query = extractSubmittedQuery(event.target);
  if (query && query.length > 0) {
    sendTelemetry('query_submitted', { query });
  } else {
    sendTelemetry('query_capture_unavailable', {
      reason: 'Form submitted but query node unresolvable'
    });
  }
}, true);

// 4. Intercept clicks on common send / search buttons
document.addEventListener('click', (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const button = target.closest('button, [role="button"]') as HTMLElement | null;
  if (!button) return;

  const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
  const testId = (button.getAttribute('data-testid') || '').toLowerCase();
  const textContent = (button.textContent || '').toLowerCase();

  const isSendButton =
    testId.includes('send') ||
    ariaLabel.includes('send') ||
    ariaLabel.includes('search') ||
    textContent.includes('search') ||
    button.querySelector('svg') !== null;

  if (isSendButton) {
    // Delay slightly to let input state settle if needed
    setTimeout(() => {
      const query = extractSubmittedQuery(null);
      if (query && query.length > 0) {
        sendTelemetry('query_submitted', { query });
      }
    }, 50);
  }
}, true);
