import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // <--- Importante na nandito ito!

// A deployed SPA can briefly keep an older entry chunk after a new Vercel
// deployment. If that entry requests a removed hashed chunk, fetch the new
// entry once instead of leaving the app stuck on a failed lazy import.
const CHUNK_RELOAD_KEY = 'sg:chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const now = Date.now();
  const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (now - lastReload < 30000) {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    return;
  }
  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
)
