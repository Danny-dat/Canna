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
    byDevice:  dSnap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })),
    byPair:    pdSnap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })),
  };
}

export function exportAggregatesAsCsv(aggr){
  const safe = s => String(s ?? '').replaceAll(',', '');
  const lines = ['SECTION,KEY,COUNT'];
  lines.push('TOTAL,ALL,' + (aggr.total ?? 0));
  (aggr.byProduct||[]).forEach(p => lines.push(`BY_PRODUCT,${safe(p.id)},${p.count ?? 0}`));
  (aggr.byDevice ||[]).forEach(d => lines.push(`BY_DEVICE,${safe(d.id)},${d.count ?? 0}`));
  (aggr.byPair   ||[]).forEach(x => lines.push(`BY_PRODUCT_DEVICE,${safe(x.id)},${x.count ?? 0}`));
  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, download:'consumption_aggregates.csv' });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
