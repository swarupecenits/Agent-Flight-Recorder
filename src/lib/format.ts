import type { Json, TraceEvent } from '../../shared/contracts.ts';

export function formatDateTime(value: string | null): string {
  if (!value) return 'Still running';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 1000) return `${value.toFixed(0)} ms`;
  return `${(value / 1000).toFixed(Math.abs(value) < 10_000 ? 2 : 1)} s`;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatEventType(type: TraceEvent['type']): string {
  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(
    value,
    (_key, current) => {
      if (current instanceof Date) return current.toISOString();
      return current;
    },
    2,
  );
}

export function isJsonEmpty(value: Json | Record<string, Json> | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function originLabel(origin: 'demo' | 'sdk' | 'import'): string {
  switch (origin) {
    case 'demo':
      return 'Scripted demo';
    case 'sdk':
      return 'SDK capture';
    case 'import':
      return 'Imported snapshot';
    default:
      return origin;
  }
}

export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
