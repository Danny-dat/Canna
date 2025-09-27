// services/admin-aggregates.service.js
import { db } from './firebase-config.js';

export async function loadGlobalAggregates(){
  const root = db.collection('aggregates').doc('consumption');
  const [pSnap, dSnap, pdSnap, rootSnap] = await Promise.all([
    root.collection('by_product').get(),
    root.collection('by_device').get(),
    root.collection('by_product_device').get(),
    root.get()
  ]);
  return {
    total: rootSnap.exists ? (rootSnap.data().total || 0) : 0,
    byProduct: pSnap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })),
    byDevice:  dSnap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })),
    byPair:    pdSnap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })),
  };
}

/**
 * Exportiert die aggregierten Daten als eine saubere, lesbare CSV-Zusammenfassung.
 * Die Listen sind nach Beliebtheit absteigend sortiert.
 * @param {object} aggr Das Aggregat-Objekt aus dem Admin-Panel.
 */
export function exportAggregatesAsCsv(aggr) {
  const lines = [];
  const safe = s => `"${String(s ?? '').replace(/"/g, '""')}"`; // Macht Text für CSV sicher

  lines.push(`"Statistik-Zusammenfassung CannaTrack"`);
  lines.push(`"Gesamte Konsum-Einheiten",${aggr.total ?? 0}`);
  lines.push(''); // Leere Zeile als Trenner

  // --- Top Produkte ---
  lines.push('"Top Produkte","Anzahl"');
  const sortedProducts = [...(aggr.byProduct || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  sortedProducts.forEach(p => {
    lines.push(`${safe(p.id)},${p.count ?? 0}`);
  });
  lines.push(''); // Leere Zeile als Trenner

  // --- Top Geräte ---
  lines.push('"Top Geräte","Anzahl"');
  const sortedDevices = [...(aggr.byDevice || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  sortedDevices.forEach(d => {
    lines.push(`${safe(d.id)},${d.count ?? 0}`);
  });
  lines.push(''); // Leere Zeile als Trenner

  // --- Top Kombinationen ---
  lines.push('"Top Kombinationen (Produkt + Gerät)","Anzahl"');
  const sortedPairs = [...(aggr.byPair || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  sortedPairs.forEach(pair => {
    lines.push(`${safe(pair.id)},${pair.count ?? 0}`);
  });

  // Dateiname mit Datum erstellen
  const fileName = `CannaTrack_Statistik_${new Date().toISOString().slice(0, 10)}.csv`;

  // CSV erstellen und Download auslösen
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * NEUE FUNKTION:
 * Lädt ALLE Konsum-Einträge aller Nutzer und exportiert sie ANONYM als CSV.
 * Die CSV enthält nur Produkt, Gerät und den Zeitstempel des Konsums.
 */
export async function exportAnonymousConsumptionsAsCsv() {
  try {
    // 1. Alle Konsum-Einträge abrufen
    console.log("Starte anonymen Export: Lade alle Konsum-Einträge...");
    const consumptionsSnap = await db.collection('consumptions').orderBy('timestamp', 'desc').get();
    const consumptions = consumptionsSnap.docs.map(doc => doc.data());

    if (consumptions.length === 0) {
      alert('Keine Konsumdaten zum Exportieren vorhanden.');
      return;
    }
    console.log(`${consumptions.length} Einträge gefunden.`);

    // 2. Anonymen CSV-Inhalt erstellen
    console.log("Erstelle anonyme CSV-Inhalte...");
    const safe = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const header = ['Produkt', 'Gerät', 'Zeitstempel (UTC)'].join(',');
    const lines = [header];

    consumptions.forEach(c => {
      const timestamp = c.timestamp?.toDate ? c.timestamp.toDate().toISOString() : 'N/A';
      const row = [c.product, c.device, timestamp].map(safe).join(',');
      lines.push(row);
    });

    // 3. CSV-Datei erstellen und Download auslösen
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CannaTrack_Export_Anonym_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Anonymer Export abgeschlossen.");

  } catch (error) {
    console.error('Fehler beim anonymen CSV-Export:', error);
    alert('Der anonyme CSV-Export ist fehlgeschlagen. Siehe Konsole für Details.');
  }
}