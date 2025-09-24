import { listenForEvents, voteEvent as voteSvc } from '../services/events.service.js';

export function initEventsFeature(state, { onEvents }){
return listenForEvents((events)=> onEvents(events));
}

export const voteEvent = (state, id, dir) => voteSvc(id, state.user.uid, dir);