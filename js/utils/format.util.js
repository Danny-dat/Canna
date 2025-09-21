// utils/format.util.js
export function formatTimestamp(ts, opts = {}) {
  if (!ts) return "";

  let d = null;

  // Firestore Timestamp
  if (ts && typeof ts.toDate === "function") {
    d = ts.toDate();
  }
  // JS Date
  else if (ts instanceof Date) {
    d = ts;
  }
  // Zahl (ms oder Sekunden)
  else if (typeof ts === "number") {
    d = new Date(ts < 1e12 ? ts * 1000 : ts);
  }
  // ISO-String
  else if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) d = new Date(parsed);
    else return ts; // unparsebar: roh anzeigen
  }

  if (!d || isNaN(d.getTime())) return "";

  const locale = "de-DE";
  // Varianten nach Bedarf
  if (opts.onlyTime) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  if (opts.short) {
    return d.toLocaleString(locale, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }
  return d.toLocaleString(locale, {
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

