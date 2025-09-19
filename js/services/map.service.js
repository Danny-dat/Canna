import { db } from './firebase-config.js';

export function initMap(containerId) {
  const map = L.map(containerId).setView([51.61, 7.33], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  return map;
}

export function createMarkerIcon(color, iconClass = '') {
  const html = iconClass
    ? `<div style="background:${color}" class="custom-marker-icon"><i class="fas ${iconClass}"></i></div>`
    : `<div style="background:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 5px rgba(0,0,0,.5)"></div>`;
  return L.divIcon({ html, className: 'custom-map-icon-container', iconSize: [28,28], iconAnchor: [14,14] });
}

export function listenForConsumptionMarkers(map, uid, setMarkers) {
  return db.collection('consumptions').where('userId','==',uid)
    .onSnapshot(snap => {
      const markers = [];
      snap.forEach(doc => {
        const d = doc.data();
        const m = L.marker([d.location.lat, d.location.lng], { icon: createMarkerIcon('green') })
          .addTo(map);
        markers.push(m);
      });
      setMarkers(markers);
    });
}

export async function buildFriendMarkers(map, friends) {
  const markers = [];
  for (const friend of friends) {
    const q = await db.collection('consumptions')
      .where('userId','==',friend.id)
      .orderBy('timestamp','desc').limit(1).get();
    if (!q.empty) {
      const last = q.docs[0].data();
      const m = L.marker([last.location.lat, last.location.lng], { icon: createMarkerIcon('blue') });
      m.bindPopup(friend.displayName || friend.email);
      markers.push(m);
    }
  }
  return markers;
}

export function setMarkerVisibility(map, markers, visible) {
  markers.forEach(m => visible ? m.addTo(map) : m.remove());
}

export function updateEventMarkers(map, uid, events, current) {
  current?.forEach(m => m.remove());
  const markers = [];
  events.forEach(e => {
    if (e.upvotes?.includes(uid)) {
      const m = L.marker([e.lat, e.lng], { icon: createMarkerIcon('purple', 'fa-star') });
      m.bindPopup(`<b>${e.name}</b><br>${e.address}`).addTo(map);
      markers.push(m);
    }
  });
  return markers;
}
