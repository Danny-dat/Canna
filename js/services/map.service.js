// services/map.service.js
import { db } from "./firebase-config.js";

/* -------------------------- Helpers -------------------------- */

// akzeptiert {lat,lng}, {latitude,longitude}, [lat,lng] oder ein Event-Objekt mit e.lat/e.lng
function toLatLng(locOrEvent) {
  if (!locOrEvent) return null;

  // Array [lat, lng]
  if (Array.isArray(locOrEvent) && locOrEvent.length === 2) {
    const [lat, lng] = locOrEvent;
    return (isFinite(lat) && isFinite(lng)) ? [lat, lng] : null;
  }

  // eigenes Objekt {lat, lng}
  if (typeof locOrEvent.lat === "number" && typeof locOrEvent.lng === "number") {
    return [locOrEvent.lat, locOrEvent.lng];
  }

  // Firestore GeoPoint {latitude, longitude}
  if (
    typeof locOrEvent.latitude === "number" &&
    typeof locOrEvent.longitude === "number"
  ) {
    return [locOrEvent.latitude, locOrEvent.longitude];
  }

  // Event-Fallback (alte Struktur)
  if (typeof locOrEvent.lat === "number" && typeof locOrEvent.lng === "number") {
    return [locOrEvent.lat, locOrEvent.lng];
  }

  return null;
}

function addSafeMarker(map, latLng, opts) {
  if (!map || !latLng) return null;
  try {
    return L.marker(latLng, opts).addTo(map);
  } catch {
    return null;
  }
}

/* -------------------------- Public API -------------------------- */

export function initMap(containerId, center = [51.61, 7.33], zoom = 13) {
  const el = document.getElementById(containerId);
  if (!el) {
    console.warn(`[map] Container #${containerId} nicht gefunden.`);
    return null;
  }

  const map = L.map(containerId, {
    zoomControl: true,
    attributionControl: true,
  }).setView(center, zoom);

  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  });

  tiles.on("load", () => {
    // nach dem ersten Frame Größe neu berechnen (fix für versteckte Tabs/Container)
    requestAnimationFrame(() => map.invalidateSize());
  });

  tiles.addTo(map);
  return map;
}

export function createMarkerIcon(color, iconClass = "") {
  const html = iconClass
    ? `<div style="background:${color}" class="custom-marker-icon"><i class="fas ${iconClass}"></i></div>`
    : `<div style="background:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 5px rgba(0,0,0,.5)"></div>`;
  return L.divIcon({
    html,
    className: "custom-map-icon-container",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Lauscht auf eigene Konsum-Logs und setzt Marker.
 * Contract wie vorher: ruft setMarkers(markers) mit den NEUEN Markern auf.
 * (Der Caller entfernt vorherige Marker selbst.)
 */
export function listenForConsumptionMarkers(map, uid, setMarkers) {
  if (!map || !uid) return () => {};
  return db
    .collection("consumptions")
    .where("userId", "==", uid)
    .orderBy("timestamp", "asc")
    .limit(200)
    .onSnapshot((snap) => {
      const markers = [];
      snap.forEach((doc) => {
        const d = doc.data();
        const latLng = toLatLng(d.location);
        if (!latLng) return; // <— kein Standort gespeichert: Marker überspringen
        const m = addSafeMarker(map, latLng, { icon: createMarkerIcon("green") });
        if (m) markers.push(m);
      });
      setMarkers(markers);
    });
}

/**
 * Holt pro Freund den letzten Konsum und gibt Marker (NOCH NICHT hinzugefügt) zurück.
 * Der Caller entscheidet später via setMarkerVisibility(), ob die Marker angezeigt werden.
 */
export async function buildFriendMarkers(map, friends = []) {
  const markers = [];
  for (const friend of friends) {
    try {
      const q = await db
        .collection("consumptions")
        .where("userId", "==", friend.id)
        .orderBy("timestamp", "asc")
        .limit(1)
        .get();

      if (q.empty) continue;

      const last = q.docs[0].data();
      const latLng = toLatLng(last.location);
      if (!latLng) continue;

      const m = L.marker(latLng, { icon: createMarkerIcon("blue") });
      m.bindPopup(friend.displayName || friend.email || "Freund");
      // NICHT addTo(map) – Sichtbarkeit wird später entschieden
      markers.push(m);
    } catch (e) {
      console.warn("[map] buildFriendMarkers Fehler:", e);
    }
  }
  return markers;
}

/**
 * Schaltet Marker sichtbar/unsichtbar.
 */
export function setMarkerVisibility(map, markers = [], visible) {
  markers.forEach((m) => (visible ? m.addTo(map) : m.remove()));
}

/**
 * Setzt Event-Marker neu. Events können entweder {location:{lat,lng}} /
 * GeoPoint oder alte Felder {lat,lng} tragen.
 */
export function updateEventMarkers(map, uid, events = [], current = []) {
  current.forEach((m) => m.remove());
  const fresh = [];

  for (const ev of events) {
    // Beispiel-Bedingung: nur Events, die ich upgevotet habe
    if (Array.isArray(ev.upvotes) && !ev.upvotes.includes(uid)) continue;

    const latLng =
      toLatLng(ev.location) ||
      toLatLng({ lat: ev.lat, lng: ev.lng }); // Fallback für alte Struktur

    if (!latLng) continue;

    const m = addSafeMarker(map, latLng, {
      icon: createMarkerIcon("purple", "fa-star"),
    });
    if (m) {
      m.bindPopup(`<b>${ev.name ?? "Event"}</b><br>${ev.address ?? ""}`);
      fresh.push(m);
    }
  }

  return fresh;
}
