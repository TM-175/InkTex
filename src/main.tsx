import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element is missing from index.html');
}

// The webview has no browser chrome, so the default context menu is only
// confusing. Inputs and the editor keep theirs (Monaco supplies its own).
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  const editable =
    target?.closest('input, textarea, [contenteditable="true"], .monaco-editor') !== null;

  if (!editable) event.preventDefault();
});

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
