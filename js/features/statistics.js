import { loadConsumptionStats, renderChart } from '../services/statistics.service.js';

export async function refreshStatsFor(uid, currentChartRef){
if (!uid) return currentChartRef;
const stats = await loadConsumptionStats(uid);
return renderChart('consumptionChart', stats, currentChartRef);
}