import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <App />
  // </StrictMode>,
);

// Register PWA Service Worker for standalone installability
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Console interceptor for in-app mobile logging
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const maxLogs = 500;
const capturedLogs: { type: 'info' | 'error' | 'warn'; message: string; timestamp: string }[] = [];
let onLogAdded: (() => void) | null = null;

(window as any).__captured_logs = capturedLogs;
(window as any).__register_log_listener = (callback: () => void) => {
  onLogAdded = callback;
  return () => {
    if (onLogAdded === callback) {
      onLogAdded = null;
    }
  };
};

function addLog(type: 'info' | 'error' | 'warn', args: any[]) {
  const timestamp = new Date().toLocaleTimeString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  capturedLogs.push({ type, message, timestamp });
  if (capturedLogs.length > maxLogs) {
    capturedLogs.shift();
  }
  if (onLogAdded) {
    onLogAdded();
  }
}

console.log = (...args: any[]) => {
  originalLog(...args);
  addLog('info', args);
};
console.error = (...args: any[]) => {
  originalError(...args);
  addLog('error', args);
};
console.warn = (...args: any[]) => {
  originalWarn(...args);
  addLog('warn', args);
};

