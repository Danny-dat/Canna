// CannaTrack/statistics.js
import { db } from './firebase-config.js';

let consumptionChart = null;

export default {
    async loadConsumptionStats(uid) {
        const today = new Date();
        const last7Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);

        const q = await db.collection('consumptions')
            .where('userId', '==', uid)
            .where('timestamp', '>=', last7Days)
            .get();

        const stats = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            stats[d.toLocaleDateString('de-DE')] = 0;
        }
        q.docs.forEach(doc => {
            const key = doc.data().timestamp.toDate().toLocaleDateString('de-DE');
            if (stats.hasOwnProperty(key)) stats[key]++;
        });
        return stats;
    },

    renderChart(stats) {
        const ctx = document.getElementById('consumptionChart');
        if (!ctx) return;
        if (consumptionChart) consumptionChart.destroy();
        
        consumptionChart = new Chart(ctx, {
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
};