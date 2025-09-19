// CannaTrack/map.js
import { db } from './firebase-config.js';

let map = null;
let userMarkers = [];
let friendMarkers = [];
let eventMarkers = [];

function createMarkerIcon(color, iconClass = '') {
    const iconHtml = iconClass 
        ? `<div style="background-color: ${color};" class="custom-marker-icon"><i class="fas ${iconClass}"></i></div>` 
        : `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`;
    return L.divIcon({ html: iconHtml, className: 'custom-map-icon-container', iconSize: [28, 28], iconAnchor: [14, 14] });
}

export default {
    initMap() {
        if (map) {
            map.remove();
            map = null;
        }
        map = L.map('map').setView([51.61, 7.33], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);
        return map;
    },

    listenForConsumptionMarkers(uid) {
        return db.collection('consumptions')
            .where('userId', '==', uid)
            .onSnapshot(snapshot => {
                userMarkers.forEach(marker => marker.remove());
                userMarkers = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const marker = L.marker([data.location.lat, data.location.lng], { icon: createMarkerIcon('green') }).addTo(map);
                    userMarkers.push(marker);
                });
            });
    },

    async updateFriendMarkers(friends) {
        friendMarkers.forEach(marker => marker.remove());
        friendMarkers = [];
        for (const friend of friends) {
            const query = await db.collection('consumptions')
                .where('userId', '==', friend.id)
                .orderBy('timestamp', 'desc').limit(1).get();
            if (!query.empty) {
                const lastLog = query.docs[0].data();
                const marker = L.marker([lastLog.location.lat, lastLog.location.lng], { icon: createMarkerIcon('blue') });
                marker.bindPopup(friend.displayName || friend.email);
                friendMarkers.push(marker);
            }
        }
    },

    toggleFriendMarkers(show) {
        friendMarkers.forEach(marker => {
            if (show) marker.addTo(map);
            else marker.remove();
        });
    },

    updateEventMarkers(events, uid) {
        if (!map) return;
        eventMarkers.forEach(marker => marker.remove());
        eventMarkers = [];
        events.forEach(event => {
            if (event.upvotes?.includes(uid)) {
                const marker = L.marker([event.lat, event.lng], { icon: createMarkerIcon('purple', 'fa-star') });
                marker.bindPopup(`<b>${event.name}</b><br>${event.address}`).addTo(map);
                eventMarkers.push(marker);
            }
        });
    }
};