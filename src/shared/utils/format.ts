export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCompactDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

export function formatDateOnly(
  timestamp: number,
  options?: {
    locale?: string;
    unit?: 'seconds' | 'milliseconds';
  }
): string {
  if (!isFinite(timestamp) || isNaN(timestamp) || timestamp <= 0) return '';
  const locale = options?.locale ?? 'ja-JP';
  const unit = options?.unit ?? 'seconds';
  const date = new Date(unit === 'milliseconds' ? timestamp : timestamp * 1000);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function truncateString(str: string, maxLength: number): string {
  return str.length > maxLength ? `${str.slice(0, maxLength - 1)}\u2026` : str;
}
