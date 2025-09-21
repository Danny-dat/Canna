import { listenForIncomingRequests, listenForFriends, sendFriendRequest, fetchFriendRequests, acceptRequest as acceptFriendRequest, declineRequest as declineFriendRequest, removeFriend, blockFriend } from '../services/friends.service.js';

export function initFriendsFeature(state, { onFriends }){
const stopReq = listenForIncomingRequests(state.user.uid, (reqs)=> state.friendRequests = reqs);
const stopFriends = listenForFriends(state.user.uid, onFriends);
return () => { stopReq && stopReq(); stopFriends && stopFriends(); };
}

export const friendsActions = (state) => ({
send: (toUid) => sendFriendRequest({ fromUid: state.user.uid, fromEmail: state.user.email, fromDisplayName: state.userData.displayName || state.user.email, toUid }),
fetchRequests: () => fetchFriendRequests(state.user.uid),
accept: (req) => acceptFriendRequest(state.user.uid, req),
decline: (reqOrId) => declineFriendRequest(state.user.uid, reqOrId),
remove: (friend) => removeFriend(state.user.uid, friend.id),
block: (friend) => blockFriend(state.user.uid, friend.id),
});