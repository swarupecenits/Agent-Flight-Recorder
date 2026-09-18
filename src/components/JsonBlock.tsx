import { formatJson } from '../lib/format';

interface JsonBlockProps {
  title?: string;
  value: unknown;
  emptyLabel?: string;
}

export function JsonBlock({ title, value, emptyLabel = 'No recorded value.' }: JsonBlockProps) {
  return (
    <section className="inspector-block">
      {title ? <h4>{title}</h4> : null}
      {value === undefined ? <p className="muted-text">{emptyLabel}</p> : <pre className="json-block">{formatJson(value)}</pre>}
    </section>
  );
}
