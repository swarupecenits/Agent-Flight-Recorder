import { formatJson } from '../lib/format';
import { usePreferences } from './Preferences';

interface JsonBlockProps {
  title?: string;
  value: unknown;
  emptyLabel?: string;
}

export function JsonBlock({ title, value, emptyLabel = 'No recorded value.' }: JsonBlockProps) {
  const { preferences } = usePreferences();
  return (
    <section className="inspector-block">
      {title ? <h4>{title}</h4> : null}
      {value === undefined ? <p className="muted-text">{emptyLabel}</p> : <details className="data-disclosure" open={preferences.detail === 'expanded'}>
        <summary>Inspect {title?.toLowerCase() ?? 'recorded data'}</summary><pre className="json-block">{formatJson(value)}</pre>
      </details>}
    </section>
  );
}
