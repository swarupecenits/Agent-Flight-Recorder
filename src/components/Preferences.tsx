import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { SlidersHorizontal, Search, ArrowUpRight } from 'lucide-react';
import { Dialog } from './Dialog';

const schema = z.object({
  theme: z.enum(['paper', 'graphite', 'system']),
  accent: z.enum(['ember', 'teal', 'cobalt']),
  density: z.enum(['comfortable', 'compact']),
  textSize: z.enum(['standard', 'large']),
  detail: z.enum(['essential', 'expanded']),
  motion: z.enum(['system', 'reduced']),
}).strict();
type Preferences = z.infer<typeof schema>;
const defaults: Preferences = { theme: 'paper', accent: 'ember', density: 'comfortable', textSize: 'standard', detail: 'essential', motion: 'system' };
const storageKey = 'afr.display.v1';
const Context = createContext<{ preferences: Preferences; update: (value: Partial<Preferences>) => void; notice: string | null } | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return { preferences: saved ? schema.parse(JSON.parse(saved)) : defaults, notice: null as string | null };
    } catch { return { preferences: defaults, notice: 'Display preferences could not be read. Defaults are in use; your recordings are unaffected.' }; }
  });
  const [preferences, setPreferences] = useState(initial.preferences);
  const [notice, setNotice] = useState(initial.notice);
  const update = (value: Partial<Preferences>) => {
    const next = schema.parse({ ...preferences, ...value });
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setNotice(null); }
    catch { setNotice('This browser cannot save display preferences. Changes apply only to this session.'); }
  };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preferences.theme === 'system' ? media.matches ? 'graphite' : 'paper' : preferences.theme;
      Object.assign(document.documentElement.dataset, { theme, accent: preferences.accent, density: preferences.density,
        textSize: preferences.textSize, detail: preferences.detail, motion: preferences.motion });
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'graphite' ? '#171d1f' : '#f3f1ea');
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences]);
  return <Context.Provider value={{ preferences, update, notice }}>{children}</Context.Provider>;
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('Display controls require PreferencesProvider.');
  return value;
}
export function AppearanceButton() {
  const [open, setOpen] = useState(false);
  const { preferences, update, notice } = usePreferences();
  return <>
    <button className="toolbar-button" type="button" onClick={() => setOpen(true)} aria-label="Customize appearance">
      <SlidersHorizontal size={16} aria-hidden="true" /><span>Make it yours</span>
    </button>
    <Dialog title="Your workbench, your way" open={open} onClose={() => setOpen(false)}>
      <p className="muted-text">Change the feel, not the evidence. These preferences stay in this browser.</p>
      <fieldset className="appearance-options"><legend>Theme</legend>
        {(['paper', 'graphite', 'system'] as const).map(theme => <label key={theme} className={`theme-swatch theme-${theme}`}>
          <input type="radio" name="theme" value={theme} checked={preferences.theme === theme} onChange={() => update({ theme })} />
          <span>{theme === 'paper' ? 'Paper' : theme === 'graphite' ? 'Graphite' : 'Match device'}</span>
        </label>)}
      </fieldset>
      <fieldset className="appearance-options"><legend>Accent</legend>
        {(['ember', 'teal', 'cobalt'] as const).map(accent => <label key={accent} className="accent-option">
          <input type="radio" name="accent" checked={preferences.accent === accent} onChange={() => update({ accent })} />
          <i aria-hidden="true" className={`accent-dot accent-${accent}`} />{accent[0].toUpperCase() + accent.slice(1)}
        </label>)}
      </fieldset>
      <div className="settings-grid">
        <label className="field"><span>Spacing</span><select name="density" value={preferences.density} onChange={event => update({ density: schema.shape.density.parse(event.target.value) })}>
          <option value="comfortable">Room to breathe</option><option value="compact">More on screen</option>
        </select></label>
        <label className="field"><span>Text size</span><select name="textSize" value={preferences.textSize} onChange={event => update({ textSize: schema.shape.textSize.parse(event.target.value) })}>
          <option value="standard">Standard</option><option value="large">Larger</option>
        </select></label>
        <label className="field"><span>Technical detail</span><select name="detail" value={preferences.detail} onChange={event => update({ detail: schema.shape.detail.parse(event.target.value) })}>
          <option value="essential">Essentials first</option><option value="expanded">Show recorded data</option>
        </select></label>
        <label className="field"><span>Motion</span><select name="motion" value={preferences.motion} onChange={event => update({ motion: schema.shape.motion.parse(event.target.value) })}>
          <option value="system">Respect device preference</option><option value="reduced">Keep it still</option>
        </select></label>
      </div>
      {notice ? <p role="status" className="inline-note tone-warning">{notice}</p> : null}
      <div className="dialog-footer"><button className="secondary-button" type="button" onClick={() => update(defaults)}>Reset appearance</button>
        <button className="primary-button" type="button" onClick={() => setOpen(false)}>Done</button></div>
    </Dialog>
  </>;
}
const destinations = [
  { title: 'Recordings', hint: 'Follow a run, step by step', href: '#/' },
  { title: 'Evidence Lens', hint: 'See whether the proof still holds', href: '#/evidence' },
  { title: 'Insights', hint: 'Find errors and things to revisit', href: '#/insights' },
  { title: 'Policies', hint: 'Understand the sandbox rules', href: '#/policies' },
  { title: 'Connect', hint: 'Bring your own agent', href: '#/connect' },
];
export function WorkspaceBar({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); setQuery(''); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return <div className="workspace-bar">
    <div className="workspace-breadcrumb"><span className="workspace-symbol" aria-hidden="true">/</span><span>Local workspace</span><span aria-hidden="true">/</span><strong>{page}</strong></div>
    <div className="workspace-tools">
      <button className="toolbar-button" type="button" onClick={() => { setOpen(true); setQuery(''); }} aria-label="Jump to a page">
        <Search size={16} aria-hidden="true" /><span>Jump to</span><kbd>Ctrl K</kbd>
      </button>
      <AppearanceButton />
    </div>
    <Dialog title="Where next?" open={open} onClose={() => setOpen(false)}>
      <label className="field"><span>Find a page</span><input type="search" name="pageSearch" autoComplete="off" spellCheck={false}
        value={query} onChange={event => setQuery(event.target.value)} placeholder="Try evidence or connect…" /></label>
      <nav className="command-list" aria-label="Quick navigation">
        {destinations.filter(item => `${item.title} ${item.hint}`.toLowerCase().includes(query.toLowerCase())).map(item =>
          <a key={item.href} href={item.href} onClick={() => setOpen(false)}><div><strong>{item.title}</strong><span>{item.hint}</span></div><ArrowUpRight size={18} aria-hidden="true" /></a>)}
        {!destinations.some(item => `${item.title} ${item.hint}`.toLowerCase().includes(query.toLowerCase())) ? <p className="muted-text">No matching page. Try a shorter search.</p> : null}
      </nav>
      <p className="muted-text">Tab to move. Enter to open. Escape to return.</p>
    </Dialog>
  </div>;
}
