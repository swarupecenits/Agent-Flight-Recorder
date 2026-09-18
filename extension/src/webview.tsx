import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EvidenceWorkbench, PrivacyDialog } from '../../src/components/EvidenceWorkbench';
import { PreferencesProvider } from '../../src/components/Preferences';
import { defaultSettings } from '../../lens/catalog';
import type { WorkbenchAction, WorkbenchState } from '../../lens/types';
import '../../src/styles.css';

declare function acquireVsCodeApi(): { postMessage: (message: WorkbenchAction) => void };
const vscode = acquireVsCodeApi();
const initial: WorkbenchState = { settings: defaultSettings, recordings: [], selected: null, assessment: null,
  comparison: null, plan: null, health: [], error: null, notice: null, busy: false };
function App() {
  const [state, setState] = useState(initial);
  const [privacy, setPrivacy] = useState(false);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'state') setState(event.data.state as WorkbenchState);
      if (event.data?.type === 'privacy') setPrivacy(true);
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
  const dispatch = (action: WorkbenchAction) => {
    if (action.type === 'privacy') { setPrivacy(true); return; }
    vscode.postMessage(action);
  };
  return <PreferencesProvider>
    <a className="skip-link" href="#evidence-main">Skip to evidence</a>
    <main id="evidence-main" tabIndex={-1}><EvidenceWorkbench state={state} dispatch={dispatch} host="vscode" /></main>
    <PrivacyDialog open={privacy} settings={state.settings} onClose={() => setPrivacy(false)} onSave={settings => {
      setPrivacy(false); dispatch({ type: 'updatePrivacy', settings });
    }} />
  </PreferencesProvider>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Evidence Lens webview root is unavailable.');
createRoot(root).render(<App />);
