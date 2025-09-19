import { db } from './firebase-config.js';

export async function loadConsumptionStats(uid) {
  const today = new Date();
  const last7 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);

  const q = await db.collection('consumptions')
    .where('userId', '==', uid)
    .where('timestamp', '>=', last7)
    .get();

  const stats = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    stats[d.toLocaleDateString('de-DE')] = 0;
  }
  q.docs.forEach(doc => {
    const key = doc.data().timestamp.toDate().toLocaleDateString('de-DE');
    if (key in stats) stats[key]++;
  });
  return stats;
}

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
