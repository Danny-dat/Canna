// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const inc   = admin.firestore.FieldValue.increment(1);
const stamp = admin.firestore.FieldValue.serverTimestamp();

const safeId = (s) => (s || "unknown").toString().replace(/[\/#?%\s]+/g, "_").slice(0, 100);

exports.onConsumptionCreate = functions.firestore
  .document("consumptions/{id}")
  .onCreate(async (snap) => {
    const { product, device } = snap.data() || {};
    if (!product || !device) return null;

    const db   = admin.firestore();
    const root = db.collection("aggregates").doc("consumption");

    const pId = safeId(product);
    const dId = safeId(device);
    const pdKey = `${pId}__${dId}`;

    const batch = db.batch();

    // Gesamtzähler
    batch.set(root, { total: inc, updatedAt: stamp }, { merge: true });

    // nach Produkt
    batch.set(root.collection("by_product").doc(pId), {
      product, count: inc, updatedAt: stamp,
    }, { merge: true });

    // nach Gerät
    batch.set(root.collection("by_device").doc(dId), {
      device, count: inc, updatedAt: stamp,
    }, { merge: true });

    // Kombination Produkt × Gerät
    batch.set(root.collection("by_product_device").doc(pdKey), {
      product, device, count: inc, updatedAt: stamp,
    }, { merge: true });

    await batch.commit();
    return null;
  });
