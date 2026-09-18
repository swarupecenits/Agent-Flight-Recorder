const sensitiveKey = /^(authorization|proxy-authorization|api[-_]?key|password|passwd|secret|client[-_]?secret|access[-_]?token|refresh[-_]?token|write[-_]?token|cookie|set-cookie|private[-_]?key)$/i;

export function redact(value) {
  const paths = [];
  const seen = new WeakSet();
  function visit(item, path, depth) {
    if (depth > 24) throw new TypeError('Recorded JSON exceeds 24 levels of nesting.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Recorded numbers must be finite.');
      return item;
    }
    if (typeof item === 'string') {
      const result = item
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
        .replace(/([?&](?:sig|api_key|api-key|access_token)=)[^&#\s]+/gi, '$1[REDACTED]')
        .replace(/\b(api[-_]?key|password|client[-_]?secret)\s*[:=]\s*["']?[^"',;\s]+/gi, '$1=[REDACTED]');
      if (result !== item) paths.push(path);
      return result;
    }
    if (typeof item !== 'object' || item === undefined) throw new TypeError('Record only JSON values; convert dates, errors, buffers, and undefined explicitly.');
    if (seen.has(item)) throw new TypeError('Recorded JSON must not contain circular references.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new TypeError('Record plain JSON objects, not class instances.');
    }
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map((entry, index) => visit(entry, `${path}[${index}]`, depth + 1))
      : Object.fromEntries(Object.entries(item).map(([key, entry]) => {
        const childPath = `${path}.${key}`;
        if (sensitiveKey.test(key)) {
          paths.push(childPath);
          return [key, '[REDACTED]'];
        }
        return [key, visit(entry, childPath, depth + 1)];
      }));
    seen.delete(item);
    return result;
  }
  return { value: visit(value, '$', 0), paths };
}
