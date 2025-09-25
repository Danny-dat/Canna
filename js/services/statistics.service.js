import { db } from './firebase-config.js';

/**
 * Lädt Konsum-Statistiken für einen bestimmten Zeitraum (Woche, Monat, Jahr)
 * und erstellt Ranglisten für Produkte, Geräte und Kombinationen.
 * @param {string} uid - Die User-ID.
 * @param {string} range - Der Zeitraum ('week', 'month', 'year').
 * @returns {object} - Ein Objekt mit den Chart-Daten und den Ranglisten.
 */
export async function loadAdvancedConsumptionStats(uid, range = 'week') {
  const today = new Date();
  let startDate;

  // Startdatum basierend auf dem gewählten Zeitraum setzen
  if (range === 'month') {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  } else if (range === 'year') {
    startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  } else { // 'week' ist der Standard
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  }

  // Daten aus Firestore abrufen
  const q = await db.collection('consumptions')
    .where('userId', '==', uid)
    .where('timestamp', '>=', startDate)
    .get();

  // Objekte zum Zählen der Vorkommen
  const chartStats = {};
  const productCounts = {};
  const deviceCounts = {};
  const pairCounts = {};

  // Vorbelegen der Chart-Daten mit 0
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      chartStats[d.toLocaleDateString('de-DE')] = 0;
    }
  }

  // Alle Einträge durchgehen
  q.docs.forEach(doc => {
    const data = doc.data();
    const timestamp = data.timestamp.toDate();

    // Chart-Daten füllen
    let key;
    if (range === 'week') {
      key = timestamp.toLocaleDateString('de-DE');
    } else if (range === 'month') {
      key = `${timestamp.getDate()}.${timestamp.getMonth() + 1}.`;
    } else { // year
      key = timestamp.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
    }
    if (!chartStats[key]) chartStats[key] = 0;
    chartStats[key]++;

    // Ranglisten-Daten zählen
    if (data.product) {
      if (!productCounts[data.product]) productCounts[data.product] = 0;
      productCounts[data.product]++;
    }
    if (data.device) {
      if (!deviceCounts[data.device]) deviceCounts[data.device] = 0;
      deviceCounts[data.device]++;
    }
    if (data.product && data.device) {
      const pairKey = `${data.product} + ${data.device}`;
      if (!pairCounts[pairKey]) pairCounts[pairKey] = 0;
      pairCounts[pairKey]++;
    }
  });

  // Funktion zum Sortieren der Ranglisten
  const sortRankings = (counts) => {
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    chartStats,
    rankings: {
      byProduct: sortRankings(productCounts),
      byDevice: sortRankings(deviceCounts),
      byPair: sortRankings(pairCounts),
    }
  };
}


// Die renderChart Funktion bleibt unverändert
export function renderChart(canvasId, stats, prev) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return prev;
  if (prev) prev.destroy();
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(stats),
      datasets: [{
        label: 'Anzahl Konsumeinheiten',
        data: Object.values(stats),
        backgroundColor: 'rgba(76, 175, 80, 0.5)',
        borderColor: 'rgba(76, 175, 80, 1)',
        borderWidth: 1
      }]
    },
    options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}