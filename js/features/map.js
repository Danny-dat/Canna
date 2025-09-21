import { initMap, listenForConsumptionMarkers, buildFriendMarkers, setMarkerVisibility, updateEventMarkers } from '../services/map.service.js';
import { waitForSizedElement } from '../utils/async.util.js';

export function createMapFeature(state){
let map = null, mapUnsubs = [], userMarkers=[], friendMarkers=[], eventMarkers=[];

const teardown = () => {
try { mapUnsubs.forEach(u=>u&&u()); } catch{}; mapUnsubs = [];
try { userMarkers.forEach(m=>m.remove()); } catch{}; userMarkers = [];
try { friendMarkers.forEach(m=>m.remove()); } catch{}; friendMarkers = [];
try { eventMarkers.forEach(m=>m.remove()); } catch{}; eventMarkers = [];
if (map?.remove) map.remove(); map = null;
};

const mountIfNeeded = async () => {
if (state.currentView !== 'dashboard') return;
const el = document.getElementById('map');
if (!map || !el || map._container !== el) {
teardown();
try { await waitForSizedElement('#map'); } catch { return; }
map = initMap('map');

const unsubConsumptions = listenForConsumptionMarkers(map, state.user.uid, (markers) => {
if (!map) return;
userMarkers.forEach(m=>m.remove());
userMarkers = markers;
});
mapUnsubs.push(unsubConsumptions);

eventMarkers = updateEventMarkers(map, state.user.uid, state.events, eventMarkers);

requestAnimationFrame(()=> map && map.invalidateSize());
const onResize = () => map && map.invalidateSize();
window.addEventListener('resize', onResize);
mapUnsubs.push(()=> window.removeEventListener('resize', onResize));
} else {
map.invalidateSize();
}
};

const toggleFriendMarkers = () => {
if (!map) return; setMarkerVisibility(map, friendMarkers, state.showFriendsOnMap);
};

const rebuildFriendMarkers = async (friends) => {
if (!map) return;
friendMarkers.forEach(m=>m.remove());
friendMarkers = await buildFriendMarkers(map, friends);
toggleFriendMarkers();
};

const updateEventPins = () => {
if (!map) return;
eventMarkers = updateEventMarkers(map, state.user.uid, state.events, eventMarkers);
}

return { mountIfNeeded, teardown, rebuildFriendMarkers, toggleFriendMarkers, updateEventPins, get map(){ return map; } };
}