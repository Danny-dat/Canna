// services/map.service.js
import { db } from "./firebase-config.js";

/* -------------------------- Helpers -------------------------- */

// akzeptiert {lat,lng}, {latitude,longitude}, [lat,lng]
function toLatLng(loc) {
  if (!loc) return null;

  // Array [lat, lng]
  if (Array.isArray(loc) && loc.length === 2) {
    const [lat, lng] = loc;
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? [lat, lng] : null;
  }

  // Objekt {lat, lng}
  if (typeof loc === "object") {
    if (Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return [loc.lat, loc.lng];
    }
    // Firestore GeoPoint (oder plain object mit latitude/longitude)
    if (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
      return [loc.latitude, loc.longitude];
    }
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

  // nach dem ersten Frame Größe neu berechnen (fix für versteckte Tabs/Container)
  tiles.on("load", () => requestAnimationFrame(() => map.invalidateSize()));

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
 * Eigene Konsum-Logs live hören und Marker setzen.
 * -> nutzt ASC + limit (nutzt deinen bestehenden Index userId ASC, timestamp ASC)
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
        if (!latLng) return; // kein Standort gespeichert → überspringen
        const m = addSafeMarker(map, latLng, { icon: createMarkerIcon("green") });
        if (m) markers.push(m);
      });
      setMarkers(markers);
    });
}

/**
 * Freunde-Marker bauen:
 * 1) bevorzugt aus profiles_public/{friendId}.lastLocation (kein Index, schnelle Reads)
 * 2) Fallback: letzter Konsum per ASC + limitToLast(1) (nutzt bestehenden ASC-Index)
 * Marker werden NICHT direkt zur Map hinzugefügt – Sichtbarkeit steuert setMarkerVisibility().
 */
export async function buildFriendMarkers(map, friends = []) {
  const markers = [];
  for (const friend of friends) {
    try {
      if (!friend?.id) continue;

      // 1) öffentliche Profil-Position
      const prof = await db.collection("profiles_public").doc(friend.id).get();
      let latLng = null;
      if (prof.exists) {
        latLng = toLatLng((prof.data() || {}).lastLocation);
      }

      // 2) Fallback: letzter Konsum
      if (!latLng) {
        const q = await db
          .collection("consumptions")
          .where("userId", "==", friend.id)
          .orderBy("timestamp", "asc")   // ASC + limitToLast vermeidet extra DESC-Index
          .limitToLast(1)
          .get();

        if (!q.empty) {
          const last = q.docs[0].data();
          latLng = toLatLng(last.location);
        }
      }

      if (!latLng) continue;

      const m = L.marker(latLng, { icon: createMarkerIcon("blue") });
      m.bindPopup(friend.displayName || friend.email || "Freund");
      // NICHT addTo(map) – Sichtbarkeit via setMarkerVisibility()
      markers.push(m);
    } catch (e) {
      console.warn("[map] buildFriendMarkers Fehler:", e);
    }
  }
  return markers;
}

/**
 * Marker sichtbar/unsichtbar schalten.
 */
export function setMarkerVisibility(map, markers = [], visible) {
  if (!markers || !markers.length) return;
  markers.forEach((m) => (visible ? m.addTo(map) : m.remove()));
}

/**
 * Event-Marker neu setzen.
 * Events: ev.location {lat,lng} / GeoPoint ODER legacy ev.lat/ev.lng
 * Beispiel: nur Events, die ich upgevotet habe.
 */
export function updateEventMarkers(map, uid, events = [], current = []) {
  if (current?.length) current.forEach((m) => m.remove());
  const fresh = [];

  for (const ev of events) {
    if (Array.isArray(ev.upvotes) && !ev.upvotes.includes(uid)) continue;

    const latLng =
      toLatLng(ev.location) ||
      toLatLng({ lat: ev?.lat, lng: ev?.lng }); // legacy fallback

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
