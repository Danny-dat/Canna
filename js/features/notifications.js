import { db } from '../services/firebase-config.js';
import { playSoundAndVibrate } from '../utils/notify.util.js';

export function listenForNotifications(user, { onUpdate, isChatOpenWith }){
if (!user?.uid) return () => {};
return db.collection('notifications')
.where('recipientId','==',user.uid)
.onSnapshot((snap) => {
let addedUnread = false;
const all = snap.docs.map(d => ({ id:d.id, ...d.data() }))
.filter(n => !(n.type === 'chat_message' && isChatOpenWith?.(n.senderId)));

all.sort((a,b)=>(b.timestamp?.toDate?.() ?? b.timestamp) - (a.timestamp?.toDate?.() ?? a.timestamp));
onUpdate(all.slice(0,10));

snap.docChanges().forEach(ch => {
if (ch.type === 'added') {
const d = ch.doc.data();
if (!d.read && !(d.type==='chat_message' && isChatOpenWith?.(d.senderId))) addedUnread = true;
}
});
if (addedUnread) playSoundAndVibrate().catch(()=>{});
});
}

export const markNotificationAsRead = (id)=> db.collection('notifications').doc(id).set({ read:true }, { merge:true });