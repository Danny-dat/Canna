// js/services/map.service.js
// Leaflet expected globally
import { db } from './firebase-config.js';

let map;
let friendMarkers = [];
let eventMarkers = [];

export async function init() {
  map = L.map('map').setView([52.52, 13.405], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  return map;
}

export function updateFriendMarkers(friends) {
  friendMarkers.forEach(m => m.remove());
  friendMarkers = (friends || []).map(f => {
    // placeholder coords; replace with your friend location data
    const marker = L.marker([52.52, 13.405]).addTo(map).bindPopup(`Friend: ${f}`);
    return marker;
  });
}

export function updateEventMarkers(events, uid) {
  eventMarkers.forEach(m => m.remove());
  eventMarkers = (events || []).map(e => {
    const { lat = 52.52, lng = 13.405, name = 'Event' } = e;
    return L.marker([lat, lng]).addTo(map).bindPopup(`${name}`);
  });
}

export function listenConsumption(uid, listenersArr) {
  // Example: subscribe to a collection of markers per user
  const unsub = db.collection('consumption').where('uid', '==', uid)
    .onSnapshot(() => {/* update markers if needed */});
  listenersArr.push(unsub);
  return unsub;
}

export function toggleFriendMarkers(show) {
  friendMarkers.forEach(m => show ? m.addTo(map) : m.remove());
}
