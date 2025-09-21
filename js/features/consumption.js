import { db } from '../services/firebase-config.js';
import { notifyFriendsIfReachedLimit } from '../utils/notify.util.js';
import { roundTo } from '../utils/number.util.js';


export async function logConsumption(state){
if (!state.selection.product || !state.selection.device) throw new Error('Bitte Produkt & Gerät wählen.');
if (!state.user?.uid) throw new Error('Nicht eingeloggt.');


// Tageslimit prüfen
const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const q = await db.collection('consumptions')
.where('userId','==',state.user.uid)
.where('timestamp','>=',start)
.orderBy('timestamp','asc')
.limit(state.settings.consumptionThreshold)
.get();
if (q.docs.length >= state.settings.consumptionThreshold){
return { limited: true };
}


// Geolocation (soft)
const pos = await new Promise(resolve => {
if (!('geolocation' in navigator)) return resolve(null);
navigator.geolocation.getCurrentPosition(p=>resolve(p),()=>resolve(null),{ enableHighAccuracy:true, timeout:8000, maximumAge:0 });
});


// Write consumption
await db.collection('consumptions').add({
userId: state.user.uid,
product: state.selection.product,
device: state.selection.device,
location: pos?.coords ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null,
timestamp: new Date(),
});


// public lastLocation
try {
if (pos?.coords) {
await db.collection('profiles_public').doc(state.user.uid).set({
lastLocation: { lat: roundTo(pos.coords.latitude,3), lng: roundTo(pos.coords.longitude,3) },
lastActiveAt: new Date(),
},{ merge:true });
} else {
await db.collection('profiles_public').doc(state.user.uid).set({ lastActiveAt:new Date() }, { merge:true });
}
} catch {}


// Notify friends bei Grenzerreichung – nach dem Write prüfen
try { await notifyFriendsIfReachedLimit(state.user.uid, state.userData.displayName || state.user.email, state.settings.consumptionThreshold); } catch {}


return { limited:false };
}