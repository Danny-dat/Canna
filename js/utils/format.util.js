export function formatTimestamp(ts) {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
