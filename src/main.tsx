import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { PreferencesProvider } from './components/Preferences';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PreferencesProvider><App /></PreferencesProvider>
  </React.StrictMode>,
);
