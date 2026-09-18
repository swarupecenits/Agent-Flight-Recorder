import type { PropsWithChildren } from 'react';

type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

interface StatusChipProps extends PropsWithChildren {
  tone?: ChipTone;
}

export function StatusChip({ tone = 'neutral', children }: StatusChipProps) {
  return <span className={`status-chip tone-${tone}`}>{children}</span>;
}
