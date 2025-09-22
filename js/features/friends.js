// features/friends.js
import {
  listenForIncomingRequests,
  listenForFriends,
  sendFriendRequest,
  fetchFriendRequests,
  acceptRequest as acceptFriendRequest,
  declineRequest as declineFriendRequest,
  removeFriend,
  blockFriend,
  // optional: Entblocken freischalten
  // unblockFriend,
} from "../services/friends.service.js";

export function initFriendsFeature(state, { onFriends }) {
  const stopReq = listenForIncomingRequests(
    state.user.uid,
    (reqs) => (state.friendRequests = reqs)
  );

  // 👇 hier reichern wir jeden Friend um `_action: ''` an,
  // damit dein <select v-model="friend._action"> nicht leer startet.
  const stopFriends = listenForFriends(state.user.uid, (friends) => {
    const withUiState = friends.map(f => ({ ...f, _action: '' }));
    onFriends(withUiState);
  });

  return () => {
    stopReq && stopReq();
    stopFriends && stopFriends();
  };
}

export const friendsActions = (state) => ({
  send: (toUid) =>
    sendFriendRequest({
      fromUid: state.user.uid,
      fromEmail: state.user.email,
      fromDisplayName: state.userData.displayName || state.user.email,
      toUid,
    }),
  fetchRequests: () => fetchFriendRequests(state.user.uid),
  accept: (req) => acceptFriendRequest(state.user.uid, req),
  decline: (reqOrId) => declineFriendRequest(state.user.uid, reqOrId),

  remove: (friend) => removeFriend(state.user.uid, friend.id),
  block:  (friend) => blockFriend(state.user.uid, friend.id),

  // optional, wenn du Entblocken anbieten willst:
  // unblock: (friend) => unblockFriend(state.user.uid, friend.id),
});
