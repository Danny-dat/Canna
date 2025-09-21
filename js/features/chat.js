import {
  chatIdFor,
  ensureChatExists,
  listenChatMessages,
  sendChatMessage,
} from "../services/chat.service.js";
import {
  setActiveChat,
  startPresenceHeartbeat,
  stopPresenceHeartbeat,
} from "../services/presence.service.js";

export function createChatFeature(state, vue) {
  let unsubscribe = null;

  async function openChat(partner) {
    if (!partner?.id) return;
    unsubscribe?.();
    const cid = chatIdFor(state.user.uid, partner.id);
    await ensureChatExists(state.user.uid, partner.id);
    state.activeChat.chatId = cid;
    state.activeChat.partner = partner;
    state.activeChat.messages = [];
    setActiveChat(state.user.uid, cid).catch(() => {});
    startPresenceHeartbeat(state.user.uid);
    unsubscribe = listenChatMessages(cid, (msgs) => {
      state.activeChat.messages = msgs;
      vue.$nextTick(() => {
        const box = document.querySelector("#chatMessages");
        if (box) box.scrollTop = box.scrollHeight;
        vue.$refs.chatInput?.focus();
      });
    });
  }

  async function sendMessage() {
    const txt = (state.chatMessageInput || "").trim();
    if (!txt || !state.activeChat?.partner?.id) return;
    await sendChatMessage({
      fromUid: state.user.uid,
      toUid: state.activeChat.partner.id,
      text: txt,
    });
    state.chatMessageInput = "";
  }

  function closeChat() {
    unsubscribe?.();
    state.activeChat = {
      chatId: null,
      partner: null,
      messages: [],
      unsubscribe: null,
    };
    setActiveChat(state.user.uid, null);
    stopPresenceHeartbeat();
  }

  return {
    openChat,
    sendMessage,
    closeChat,
    unsubscribe: () => unsubscribe && unsubscribe(),
  };
}
