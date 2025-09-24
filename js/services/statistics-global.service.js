// Global statistics service (for admin dashboard)
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
    byProduct: pSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    byDevice:  dSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    byPair:    pdSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}