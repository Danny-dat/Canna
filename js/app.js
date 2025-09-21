// ---- Vue ----
const { createApp } = Vue;

// ---- Imports (lokale Module) ----
import { applyTheme } from "./utils/dom.util.js";
import { formatTimestamp } from "./utils/format.util.js";
import { calculateThc } from "./services/thc-calculator.service.js";

import {
  onAuth,
  register,
  login,
  logout,
  resetPassword,
} from "./services/auth.service.js";
import {
  loadUserData,
  saveUserData,
  loadUserSettings,
  saveUserSettings,
} from "./services/user-data.service.js";
import {
  ensurePublicProfileOnLogin,
  updatePublicProfile,
} from "./services/profile.service.js";

import {
  shareMyFriendCode,
  copyToClipboard,
} from "./services/friends.service.js";

import { initFriendsFeature, friendsActions } from "./features/friends.js";
import { initEventsFeature, voteEvent } from "./features/events.js";
import {
  listenForNotifications,
  markNotificationAsRead as markNotif,
} from "./features/notifications.js";
import { createMapFeature } from "./features/map.js";
import { refreshStatsFor } from "./features/statistics.js";
import { logConsumption } from "./features/consumption.js";
import { createChatFeature } from "./features/chat.js";
import { createGlobalChatFeature } from "./features/global-chat.js";

import { db } from "./services/firebase-config.js"; // für handleNotificationClick

// ---- App ----
const app = createApp({
  data() {
    return {
      // UI Shell
      isLogin: true,
      _isLogging: false,
      currentView: "dashboard",
      showMenu: false,
      showNotifications: false,
      showSettings: false,
      showAlert: false,
      alertMessage: "",
      bannerInterval: null,
      shareMenuOpen: false,
      _friends: null,
      chatFx: null,
      globalChatFx: null,
      globalChat: { messages: [] },
      globalChatInput: "",

      // Auth + Profile
      user: { loggedIn: false, uid: null, email: null },
      form: { email: "", password: "", phoneNumber: "", displayName: "" },
      userData: { displayName: "", phoneNumber: "", theme: "light" },
      settings: { consumptionThreshold: 3 },
      showReset: false,
      resetEmail: "",

      // Dashboard UI
      landingBannerIndex: 0,
      landingBanners: [
        {
          img: "https://placehold.co/400x100/4CAF50/FFFFFF?text=Deine+Werbung+hier",
          alt: "Werbung 1",
        },
        {
          img: "https://placehold.co/400x100/388E3C/FFFFFF?text=CannaTrack+werben",
          alt: "Werbung 2",
        },
      ],
      dashboardBannerIndex: 0,
      dashboardBanners: [
        {
          img: "https://placehold.co/400x150/FFC107/333333?text=Angebot+des+Tages",
          alt: "Angebot 1",
        },
        {
          img: "https://placehold.co/400x150/f4f4f9/333333?text=Neuer+Vaporizer",
          alt: "Angebot 2",
        },
      ],

      // Domain-State
      friends: [],
      friendRequests: [],
      friendIdInput: "",
      notifications: [],
      events: [],

      // Chat (Platzhalter – Feature bindest du später)
      activeChat: {
        chatId: null,
        partner: null,
        messages: [],
        unsubscribe: null,
      },
      chatMessageInput: "",

      // Auswahl + THC
      products: [
        { name: "Hash", img: "images/hash.png" },
        { name: "Blüte", img: "images/flower.png" },
        { name: "Harz", img: "images/resin.png" },
      ],
      devices: ["Joint", "Bong", "Vaporizer", "Pfeife"],
      selection: { product: null, device: null },
      thcCalc: {
        gender: "male",
        age: 48,
        weight: 120,
        bodyFat: 30,
        frequency: "often",
        amount: 1.0,
        thcPercentage: 25,
        lastConsumption: new Date(Date.now() - 86400000)
          .toISOString()
          .slice(0, 16),
        result: { value: null, status: null, waitTime: null },
      },

      // Map/Stats
      mapFx: null,
      showFriendsOnMap: false,
      consumptionChart: null,

      // interne Unsubscriber
      _unsubs: [],
    };
  },

  computed: {
    unreadNotificationsCount() {
      return this.notifications.filter((n) => !n.read).length;
    },
  },

  mounted() {
    onAuth(async (user) => {
      if (user) {
        const token = await user.getIdTokenResult(true);
        this.user = { loggedIn: true, uid: user.uid, email: user.email, token, isAdmin: !!token.claims?.admin, };
        await ensurePublicProfileOnLogin(user);
        await this.initAppFeatures();
      } else {
        this.user = { loggedIn: false, uid: null, email: null };
        this.cleanupListeners();
        applyTheme("light");
      }
    });

    this.startBannerRotation();

    this._onDocClick = (e) => {
      if (!this.showNotifications) return;
      const bellWrap = this.$refs?.bellWrap;
      if (!bellWrap) return;
      if (!bellWrap.contains(e.target)) {
        this.showNotifications = false;
      }
    };
    this._onKeyDown = (e) => {
      if (e.key === "Escape") this.showNotifications = false;
    };

    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);

    this._onShareOutside = (e) => {
      if (!this.shareMenuOpen) return;
      const btn = document.querySelector(".btn-share-wrap");
      if (btn && !btn.contains(e.target)) this.shareMenuOpen = false;
    };
    document.addEventListener("click", this._onShareOutside);
  },

  methods: {
    // ---------------- UI / Navigation ----------------
    formatTimestamp,

    toggleMenu() {
      this.showMenu = !this.showMenu;
      this.$nextTick(() => this.mapFx?.map && this.mapFx.map.invalidateSize());
    },

    toggleSettings() {
      this.showSettings = !this.showSettings;
      this.$nextTick(() => this.mapFx?.map && this.mapFx.map.invalidateSize());
    },

    toggleNotifications() {
      this.showNotifications = !this.showNotifications;
    },

    setView(view) {
      if (this.currentView === "dashboard" && view !== "dashboard") {
        this.mapFx?.teardown();
      }
      if (this.currentView === "globalChat" && view !== "globalChat") {
        this.globalChatFx?.teardown();
      }

      this.currentView = view;
      this.showMenu = false;

      if (view === "dashboard") {
        this.$nextTick(() => this.mapFx?.mountIfNeeded());
        this.refreshStats();
      } else if (view === "globalChat") {
        if (!this.globalChatFx)
          this.globalChatFx = createGlobalChatFeature(this, this);
        this.globalChatFx.mount();
        this.$nextTick(() => this.$refs?.globalChatInput?.focus?.());
      } else if (view === "statistics") {
        this.refreshStats();
      }
    },

    closeAlert() {
      this.showAlert = false;
    },

    startBannerRotation() {
      this.bannerInterval = setInterval(() => {
        this.landingBannerIndex =
          (this.landingBannerIndex + 1) % this.landingBanners.length;
        this.dashboardBannerIndex =
          (this.dashboardBannerIndex + 1) % this.dashboardBanners.length;
      }, 5000);
    },

    // ------ Friends Actions (UI-Buttons) ------
    async actionSendFriendRequest() {
      const toUid = (this.friendIdInput || "").trim();
      if (!toUid) return alert("Bitte Freundschaftscode eingeben.");
      if (!this.user?.uid) return alert("Nicht eingeloggt.");
      if (toUid === this.user.uid)
        return alert("Du kannst dich nicht selbst hinzufügen.");

      try {
        await this._friends.send(toUid);
        this.friendIdInput = "";
        this.alertMessage =
          "Anfrage gesendet (falls noch keine offene vorhanden ist).";
        this.showAlert = true;
      } catch (e) {
        alert(e?.message || "Konnte Anfrage nicht senden.");
      }
    },

    async actionFetchFriendRequests() {
      try {
        const list = await this._friends.fetchRequests();
        this.friendRequests = list;
      } catch (e) {
        alert(e?.message || "Konnte Anfragen nicht laden.");
      }
    },

    async acceptRequest(req) {
      try {
        await this._friends.accept(req);
        this.alertMessage = "Anfrage angenommen.";
        this.showAlert = true;
      } catch (e) {
        alert(e?.message || "Konnte Anfrage nicht annehmen.");
      }
    },

    async declineRequest(reqId) {
      try {
        await this._friends.decline(reqId);
        this.alertMessage = "Anfrage abgelehnt.";
        this.showAlert = true;
      } catch (e) {
        alert(e?.message || "Konnte Anfrage nicht ablehnen.");
      }
    },

    async removeFriendB(friend) {
      if (!friend?.id) return;
      if (!confirm("Freund entfernen?")) return;
      try {
        await this._friends.remove(friend);
        this.alertMessage = "Freund entfernt.";
        this.showAlert = true;
      } catch (e) {
        alert(e?.message || "Konnte Freund nicht entfernen.");
      }
    },

    async blockFriendB(friend) {
      if (!friend?.id) return;
      if (!confirm("Freund blockieren?")) return;
      try {
        await this._friends.block(friend);
        this.alertMessage = "Freund blockiert.";
        this.showAlert = true;
      } catch (e) {
        alert(e?.message || "Konnte Freund nicht blockieren.");
      }
    },

    // ---------------- Bootstrap Features ----------------
    async initAppFeatures() {
      // Settings + UserData
      this.settings = await loadUserSettings(this.user.uid);
      const data = await loadUserData(this.user.uid);
      this.userData = { ...this.userData, ...data };
      applyTheme(this.userData.theme);

      // Notifications (live)
      const stopNoti = listenForNotifications(this.user, {
        onUpdate: (list) => {
          this.notifications = list;
        },
        isChatOpenWith: (senderId) => this.activeChat?.partner?.id === senderId,
      });
      this._unsubs.push(stopNoti);

      // Friends (live)
      const stopFriends = initFriendsFeature(this, {
        onFriends: async (friends) => {
          this.friends = friends;
          await this.mapFx?.rebuildFriendMarkers(friends);
        },
      });
      this._unsubs.push(stopFriends);
      this._friends = friendsActions(this);

      // Events (live)
      const stopEvents = initEventsFeature(this, {
        onEvents: (events) => {
          this.events = events;
          this.mapFx?.updateEventPins();
        },
      });
      this._unsubs.push(stopEvents);

      // Map
      this.mapFx = createMapFeature(this);
      this.$nextTick(() => this.mapFx.mountIfNeeded());

      // Chat (live)
      this.chatFx = createChatFeature(this, this);

      // Stats
      await this.refreshStats();
    },

    cleanupListeners() {
      // 1) alle dynamischen Firestore-/Feature-Listener beenden
      try {
        this._unsubs?.forEach((u) => u && u());
      } catch {}
      this._unsubs = [];

      // 2) Feature-spezifisch aufräumen
      try {
        this.mapFx?.teardown();
      } catch {}
      try {
        this.chatFx?.unsubscribe?.();
        this.chatFx = null;
      } catch {}

      // 3) Intervall stoppen
      if (this.bannerInterval) {
        clearInterval(this.bannerInterval);
        this.bannerInterval = null;
      }

      // 4) DOM-Event-Listener sauber entfernen
      try {
        document.removeEventListener("click", this._onDocClick);
      } catch {}
      try {
        document.removeEventListener("click", this._onShareOutside);
      } catch {}
      try {
        document.removeEventListener("keydown", this._onKeyDown);
      } catch {}

      // 5) Referenzen nullen
      this._onDocClick = null;
      this._onShareOutside = null;
      this._onKeyDown = null;
    },

    // ---------------- Auth ----------------
    async doRegister() {
      const phoneRegex = /^(015|016|017)\d{8,9}$/;
      const pn = (this.form.phoneNumber || "").replace(/[\s\/-]/g, "");
      if (!this.form.displayName?.trim())
        return alert("Bitte gib einen Anzeigenamen ein.");
      if (!phoneRegex.test(pn))
        return alert("Bitte gib eine gültige deutsche Handynummer ein.");
      await register({
        email: this.form.email,
        password: this.form.password,
        displayName: this.form.displayName,
        phoneNumber: pn,
      });
    },
    doLogin() {
      return login(this.form.email, this.form.password).catch((e) =>
        alert(e.message)
      );
    },
    doLogout() {
      logout();
      this.showMenu = false;
    },

    resetPasswordFlow() {
      this.resetEmail = this.form?.email || "";
      this.showReset = true;
    },
    async doPasswordReset() {
      try {
        await resetPassword(this.resetEmail || this.form.email);
        this.showReset = false;
        this.resetEmail = "";
        alert("Wenn die E-Mail existiert, wurde ein Reset-Link gesendet.");
      } catch (e) {
        alert(e?.message || "Konnte Reset-Link nicht senden.");
      }
    },

    // ---------------- User Data / Settings ----------------
    async saveUserData() {
      await saveUserData(this.user.uid, {
        displayName: this.userData.displayName,
        phoneNumber: this.userData.phoneNumber,
        theme: this.userData.theme,
      });
      await updatePublicProfile(this.user.uid, {
        displayName: this.userData.displayName || this.user.email,
        photoURL: null,
      });
      alert("Daten gespeichert!");
      applyTheme(this.userData.theme);
      this.setView("dashboard");
    },
    async saveUserSettings() {
      await saveUserSettings(this.user.uid, this.settings);
      this.showSettings = false;
    },

    // ---------------- Consumption ----------------
    async logConsumption() {
      try {
        if (this._isLogging) return;
        this._isLogging = true;

        const res = await logConsumption(this);
        if (res.limited) {
          this.alertMessage = `Du hast dein Tageslimit von ${this.settings.consumptionThreshold} Einheiten erreicht!`;
          this.showAlert = true;
          return;
        }
        this.selection = { product: null, device: null };
        await this.refreshStats();
        this.alertMessage = "Eintrag gespeichert.";
        this.showAlert = true;
      } catch (e) {
        this.alertMessage = e?.message || "Speichern fehlgeschlagen.";
        this.showAlert = true;
      } finally {
        this._isLogging = false;
      }
    },

    // ---------------- Statistics ----------------
    async refreshStats() {
      this.consumptionChart = await refreshStatsFor(
        this.user.uid,
        this.consumptionChart
      );
    },

    // ---------------- Map ----------------
    toggleFriendMarkers() {
      this.mapFx?.toggleFriendMarkers();
    },

    // ---------------- Events ----------------
    voteEvent(id, dir) {
      return voteEvent(this, id, dir);
    },
    voteEventUp(id) {
      return this.voteEvent(id, "up");
    },
    voteEventDown(id) {
      return this.voteEvent(id, "down");
    },

    // ---------------- Global Chat ----------------
    openGlobalChat() {
      if (this.currentView !== "globalChat") this.setView("globalChat");
    },

    sendGlobalMessage() {
      this.globalChatFx?.send();
    },

    // ---------------- Chat ----------------
    openChat(friend) {
      this.chatFx?.openChat(friend);
    },
    sendMessage() {
      this.chatFx?.sendMessage();
    },
    closeChat() {
      this.chatFx?.closeChat();
    },

    // ---------------- Notifications ----------------
    async handleNotificationClick(n) {
      // 1) als gelesen markieren (falls nötig)
      if (!n.read) {
        try {
          await markNotif(n.id);
        } catch {}
      }

      // 2) Nur Chat-Notis öffnen
      if (n.type !== "chat_message") return;

      // 3) Partner ermitteln (senderId bevorzugt; Fallback aus chatId "a_b")
      let partnerId = n.senderId;
      if (!partnerId && n.chatId && typeof n.chatId === "string") {
        const ids = n.chatId.split("_");
        partnerId = ids.find((id) => id !== this.user.uid) || ids[0];
      }
      if (!partnerId) return;

      // 4) Freund aus Liste oder Profil nachladen
      let friend = this.friends.find((f) => f.id === partnerId);
      if (!friend) {
        try {
          const snap = await db
            .collection("profiles_public")
            .doc(partnerId)
            .get();
          const d = snap.exists ? snap.data() || {} : {};
          friend = { id: partnerId, displayName: d.displayName || partnerId };
        } catch {
          friend = { id: partnerId };
        }
      }

      // 5) Dropdown schließen, zum Dashboard, Chat öffnen & fokussieren
      this.showNotifications = false;
      if (this.currentView !== "dashboard") this.setView("dashboard");
      await this.$nextTick();
      this.openChat(friend);
      this.$nextTick(() => this.$refs?.chatInput?.focus?.());
    },

    async markNotificationAsRead(n) {
      if (!n.read) await markNotif(n.id);
    },

    // ---------------- Friends / Share ----------------
    openShareMenu() {
      this.shareMenuOpen = !this.shareMenuOpen;
    },
    closeShareMenu() {
      this.shareMenuOpen = false;
    },

    async shareCopy() {
      const code = this.user?.uid || "";
      if (!code) return alert("Kein Nutzer angemeldet.");
      const ok = await copyToClipboard(code);
      if (ok) {
        this.alertMessage = "Freundschaftscode kopiert!";
        this.showAlert = true;
      }
      this.closeShareMenu();
    },
    async shareNative() {
      try {
        await shareMyFriendCode(this.user?.uid);
      } catch (e) {
        this.alertMessage = e?.message || "Teilen fehlgeschlagen.";
        this.showAlert = true;
      }
      this.closeShareMenu();
    },
    // optional QR (falls du magst)
    async shareQR() {
      try {
        const code = this.user?.uid || "";
        const div = document.createElement("div");
        await QRCode.toCanvas(
          code,
          { width: 180, margin: 0 },
          (err, canvas) => {
            if (!err) div.appendChild(canvas);
          }
        );
        // sehr simpel: altes Alert-Fenster wiederverwenden
        this.alertMessage = "Dein QR-Code (Freundschaftscode):";
        this.showAlert = true;
        // kleines Timeout: Canvas nach dem Öffnen in den Alert einsetzen
        setTimeout(() => {
          document.querySelector(".alert-content")?.appendChild(div);
        }, 0);
      } catch {}
      this.closeShareMenu();
    },

    // ---------------- THC ----------------
    calculateThcAbbau() {
      const r = calculateThc(this.thcCalc);
      if (r.error) return alert(r.error);
      this.thcCalc.result = r;
    },
  },
});

app.mount("#app");
