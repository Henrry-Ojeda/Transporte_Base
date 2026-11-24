if (typeof window !== 'undefined' && window.location.hostname === 'campoverde-omega.vercel.app') {
  window.location.replace('https://lacteos-campoverde.vercel.app' + window.location.pathname + window.location.search + window.location.hash);
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/stores/themeStore';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

