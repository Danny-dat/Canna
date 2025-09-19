// js/services/statistics.service.js
// Chart.js expected globally
import { db } from './firebase-config.js';

export async function load(uid) {
  const snap = await db.collection('consumption')
    .where('uid','==',uid).get();
  return snap.docs.map(d => d.data());
}

let chart;
export function render(data) {
  const ctx = document.getElementById('statsChart');
  if (!ctx) return;
  if (chart) { chart.destroy(); }
  const labels = data.map((d,i) => d.date || i+1);
  const values = data.map(d => d.amount || 0);
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Consumption', data: values }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}
