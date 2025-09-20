import { onAuth, register, login, logout } from "./services/auth.service.js";
import {
  loadUserData,
  saveUserData,
  loadUserSettings,
  saveUserSettings,
} from "./services/user-data.service.js";
import {
  sendFriendRequest,
  fetchFriendRequests,
  listenForFriends,
  acceptRequest as acceptFriendRequest,
  declineRequest as declineFriendRequest,
  listenForIncomingRequests,
  removeFriend,
  blockFriend,
  unblockFriend,
  syncFriendshipsOnLogin,
} from "./services/friends.service.js";
import { listenForEvents, voteEvent } from "./services/events.service.js";
import {
  initMap,
  listenForConsumptionMarkers,
  buildFriendMarkers,
  setMarkerVisibility,
  updateEventMarkers,
} from "./services/map.service.js";
import {
  loadConsumptionStats,
  renderChart,
} from "./services/statistics.service.js";
import { calculateThc } from "./services/thc-calculator.service.js";

import { applyTheme } from "./utils/dom.util.js";
import {
  playSoundAndVibrate,
  notifyFriendsIfReachedLimit,
} from "./utils/notify.util.js";
import { formatTimestamp } from "./utils/format.util.js";
import { db } from "./services/firebase-config.js";

const app = Vue.createApp({
  data() {
    return {
      isLogin: true,
      _isLogging: false,
      user: { loggedIn: false, uid: null, email: null },
      currentView: "dashboard",
      showMenu: false,
      showNotifications: false,
      showSettings: false,
      showAlert: false,
      alertMessage: "",
      form: { email: "", password: "", phoneNumber: "", displayName: "" },
      friendIdInput: "",
      chatMessageInput: "",
      userData: { displayName: "", phoneNumber: "", theme: "light" },
      thcCalc: {
        gender: "male",
        age: 48,
        weight: 120,
        bodyFat: 30,
        frequency: "often",
        amount: 1.0,
        thcPercentage: 25,
        lastConsumption: new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        result: { value: null, status: null, waitTime: null },
      },
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
      bannerInterval: null,

      products: [
        { name: "Hash", img: "images/hash.png" },
        { name: "Blüte", img: "images/flower.png" },
        { name: "Harz", img: "images/resin.png" },
      ],
      devices: ["Joint", "Bong", "Vaporizer", "Pfeife"],
      selection: { product: null, device: null },

      friends: [],
      friendRequests: [],
      notifications: [],
      events: [],
      activeChat: {
        chatId: null,
        partner: null,
        messages: [],
        unsubscribe: null,
      },

      map: null,
      consumptionChart: null,
      settings: { consumptionThreshold: 3 },
      showFriendsOnMap: false,
      userMarkers: [],
      friendMarkers: [],
      eventMarkers: [],
      mapUnsubs: [],
      firestoreListeners: [],
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
        this.user = { loggedIn: true, uid: user.uid, email: user.email };
        await this.initAppFeatures();
      } else {
        this.user = { loggedIn: false, uid: null, email: null };
        this.cleanupListeners();
        applyTheme("light");
      }
    });
    this.startBannerRotation();
  },

  methods: {
    // ---------- Helpers ----------
    async _waitForSizedElement(selector, { tries = 40, delay = 50 } = {}) {
      for (let i = 0; i < tries; i++) {
        const el = document.querySelector(selector);
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
        await new Promise((r) => setTimeout(r, delay));
      }
      throw new Error(`Element ${selector} nicht sichtbar/sized`);
    },
    _round(n, decimals = 3) {
      const f = Math.pow(10, decimals);
      return Math.round(n * f) / f;
    },

    // Map vollständig abbauen (Listener + Marker + Map)
    teardownMap() {
      try {
        this.mapUnsubs?.forEach((u) => {
          try {
            u && u();
          } catch {}
        });
      } catch {}
      this.mapUnsubs = [];

      try {
        this.userMarkers.forEach((m) => m.remove());
      } catch {}
      try {
        this.friendMarkers.forEach((m) => m.remove());
      } catch {}
      try {
        this.eventMarkers.forEach((m) => m.remove());
      } catch {}
      this.userMarkers = [];
      this.friendMarkers = [];
      this.eventMarkers = [];

      if (this.map?.remove) this.map.remove();
      this.map = null;
    },

    async _mountMapIfNeeded() {
      if (this.currentView !== "dashboard") return;

      const el = document.getElementById("map");
      if (!this.map || !el || this.map._container !== el) {
        this.teardownMap();
        try {
          await this._waitForSizedElement("#map");
        } catch (e) {
          console.warn("Map init TIMEOUT:", e);
          return;
        }

        this.map = initMap("map");

        // Eigene Konsum-Pins
        const unsubConsumptions = listenForConsumptionMarkers(
          this.map,
          this.user.uid,
          (markers) => {
            if (!this.map) return; // Guard
            this.userMarkers.forEach((m) => m.remove());
            this.userMarkers = markers;
          }
        );
        this.mapUnsubs.push(unsubConsumptions);

        // Event-Marker initial
        this.eventMarkers = updateEventMarkers(
          this.map,
          this.user.uid,
          this.events,
          this.eventMarkers
        );

        // Layout/Resize
        requestAnimationFrame(() => this.map && this.map.invalidateSize());
        const onResize = () => this.map && this.map.invalidateSize();
        window.addEventListener("resize", onResize);
        this.mapUnsubs.push(() =>
          window.removeEventListener("resize", onResize)
        );
      } else {
        this.map.invalidateSize();
      }
    },

    // ---------- Navigation ----------
    toggleMenu() {
      this.showMenu = !this.showMenu;
      this.$nextTick(() => this.map && this.map.invalidateSize());
    },

    setView(view) {
      // Dashboard verlassen → Map sauber entsorgen
      if (this.currentView === "dashboard" && view !== "dashboard")
        this.teardownMap();

      this.currentView = view;
      this.showMenu = false;

      if (view === "dashboard") {
        this.$nextTick(() => this._mountMapIfNeeded());
        this.refreshStats();
      } else if (view === "statistics") {
        this.refreshStats();
      }
    },

    toggleNotifications() {
      this.showNotifications = !this.showNotifications;
    },

    // ---------- Init ----------
    async initAppFeatures() {
      // Live: Benachrichtigungen
      this.listenForNotifications();

      // Live: eingehende Friend Requests (pending)
      const unsubIncoming = listenForIncomingRequests(this.user.uid, (reqs) => {
        this.friendRequests = reqs;
      });
      this.firestoreListeners.push(unsubIncoming);

      // Live: Freunde (aus accepted-Requests -> Profile aus profiles_public)
      this.unsubscribeFriends = listenForFriends(
        this.user.uid,
        async (friends) => {
          this.friends = friends;

          // Map-Freundesmarker neu aufbauen (buildFriendMarkers sollte profiles_public.lastLocation lesen!)
          if (!this.map) return;
          this.friendMarkers.forEach((m) => m.remove());
          this.friendMarkers = await buildFriendMarkers(this.map, friends);
          this.toggleFriendMarkers();
        }
      );

      // Live: Events
      this.unsubscribeEvents = listenForEvents((events) => {
        this.events = events;
        if (this.map) {
          this.eventMarkers = updateEventMarkers(
            this.map,
            this.user.uid,
            this.events,
            this.eventMarkers
          );
        }
      });

      // Settings + Userdaten
      this.settings = await loadUserSettings(this.user.uid);
      const data = await loadUserData(this.user.uid);
      this.userData.displayName = data.displayName;
      this.userData.phoneNumber = data.phoneNumber;
      this.userData.theme = data.theme;
      applyTheme(data.theme);

      this.refreshStats();
      this.$nextTick(() => this._mountMapIfNeeded());
    },

    cleanupListeners() {
      // ALLES aufräumen
      this.teardownMap();
      try {
        this.firestoreListeners.forEach((u) => u && u());
      } catch {}
      this.firestoreListeners = [];
      this.unsubscribeEvents?.();
      this.unsubscribeFriends?.();
      this.activeChat.unsubscribe?.();
      if (this.bannerInterval) clearInterval(this.bannerInterval);
    },

    // ---------- Auth ----------
    async doRegister() {
      const phoneRegex = /^(015|016|017)\d{8,9}$/;
      const pn = this.form.phoneNumber.replace(/[\s\/-]/g, "");
      if (!this.form.displayName.trim())
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

    // ---------- User Data ----------
    async saveUserData() {
      await saveUserData(this.user.uid, {
        displayName: this.userData.displayName,
        phoneNumber: this.userData.phoneNumber,
        theme: this.userData.theme,
      });

      // öffentliches Profil (lesbar für Freunde)
      await db
        .collection("profiles_public")
        .doc(this.user.uid)
        .set(
          {
            displayName: this.userData.displayName || this.user.email,
            photoURL: null,
            updatedAt: new Date(),
          },
          { merge: true }
        );

      alert("Daten gespeichert!");
      applyTheme(this.userData.theme);
      this.setView("dashboard");
    },
    async saveUserSettings() {
      await saveUserSettings(this.user.uid, this.settings);
      this.showSettings = false;
    },

    // ---------- Konsum + Notify ----------
    async logConsumption() {
      try {
        if (this._isLogging) return;
        this._isLogging = true;

        if (!this.selection.product || !this.selection.device) {
          this.alertMessage = "Bitte wähle ein Produkt und ein Gerät aus.";
          this.showAlert = true;
          return;
        }
        if (!this.user?.uid) {
          this.alertMessage = "Nicht eingeloggt – bitte erneut anmelden.";
          this.showAlert = true;
          return;
        }

        // Tageslimit (Composite-Index: userId ASC, timestamp ASC)
        const today = new Date();
        const start = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        let q;
        try {
          q = await db
            .collection("consumptions")
            .where("userId", "==", this.user.uid)
            .where("timestamp", ">=", start)
            .orderBy("timestamp", "asc")
            .limit(this.settings.consumptionThreshold)
            .get();
        } catch (e) {
          console.error("Firestore-Query-Fehler:", e);
          this.alertMessage =
            e.code === "failed-precondition"
              ? "Der benötigte Firestore-Index wird (noch) erstellt. Bitte gleich nochmal versuchen."
              : "Fehler beim Laden der Daten.";
          this.showAlert = true;
          return;
        }

        if (q.docs.length >= this.settings.consumptionThreshold) {
          this.alertMessage = `Du hast dein Tageslimit von ${this.settings.consumptionThreshold} Einheiten erreicht!`;
          this.showAlert = true;
          playSoundAndVibrate();
          return;
        }

        // Geolocation (soft-fail)
        const pos = await new Promise((resolve) => {
          if (!("geolocation" in navigator)) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });

        // Speichern (consumption)
        try {
          await db.collection("consumptions").add({
            userId: this.user.uid,
            product: this.selection.product,
            device: this.selection.device,
            location:
              pos && pos.coords
                ? { lat: pos.coords.latitude, lng: pos.coords.longitude }
                : null,
            timestamp: new Date(),
          });
        } catch (e) {
          console.error("Firestore-Write-Fehler:", e);
          this.alertMessage =
            "Speichern fehlgeschlagen. Details in der Konsole.";
          this.showAlert = true;
          return;
        }

        // Öffentlich: letzte (grobe) Position für Freunde aktualisieren
        try {
          if (pos && pos.coords) {
            await db
              .collection("profiles_public")
              .doc(this.user.uid)
              .set(
                {
                  lastLocation: {
                    lat: this._round(pos.coords.latitude, 3), // ~110 m
                    lng: this._round(pos.coords.longitude, 3),
                  },
                  lastActiveAt: new Date(),
                },
                { merge: true }
              );
          } else {
            await db.collection("profiles_public").doc(this.user.uid).set(
              {
                lastActiveAt: new Date(),
              },
              { merge: true }
            );
          }
        } catch (e) {
          console.warn(
            "profiles_public lastLocation Update fehlgeschlagen:",
            e
          );
        }

        // UI reset + Benachrichtigen + Stats
        this.selection = { product: null, device: null };

        try {
          await notifyFriendsIfReachedLimit(
            this.user.uid,
            this.userData.displayName || this.user.email,
            this.settings.consumptionThreshold
          );
        } catch (e) {
          console.warn("notifyFriendsIfReachedLimit Fehler:", e);
        }

        await this.refreshStats();
        this.alertMessage = "Eintrag gespeichert.";
        this.showAlert = true;
      } finally {
        this._isLogging = false;
      }
    },

    // ---------- Statistik ----------
    async refreshStats() {
      if (!this.user.uid) return;
      const stats = await loadConsumptionStats(this.user.uid);
      this.consumptionChart = renderChart(
        "consumptionChart",
        stats,
        this.consumptionChart
      );
    },

    // ---------- Map ----------
    toggleFriendMarkers() {
      if (!this.map) return; // Guard
      setMarkerVisibility(this.map, this.friendMarkers, this.showFriendsOnMap);
    },

    // ---------- Events ----------
    voteEvent(id, dir) {
      return voteEvent(id, this.user.uid, dir);
    },
    voteEventUp(id) {
      return this.voteEvent(id, "up");
    },
    voteEventDown(id) {
      return this.voteEvent(id, "down");
    },

    // ---------- Freunde ----------
    async actionSendFriendRequest() {
      const id = this.friendIdInput.trim();
      if (!id || id === this.user.uid) return alert("Ungültige User-ID.");
      try {
        await sendFriendRequest({
          fromUid: this.user.uid,
          fromEmail: this.user.email,
          fromDisplayName: this.userData.displayName || this.user.email,
          toUid: id,
        });
        alert("Freundschaftsanfrage gesendet!");
        this.friendIdInput = "";
      } catch (e) {
        alert(e.message || "Konnte Anfrage nicht senden.");
      }
    },

    async actionFetchFriendRequests() {
      this.friendRequests = await fetchFriendRequests(this.user.uid);
      if (!this.friendRequests.length)
        alert("Keine neuen Freundschaftsanfragen.");
    },

    async removeFriendB(friend) {
      const friendUid = friend?.id;
      if (!friendUid) return;

      const name =
        friend.username || friend.displayName || friend.label || friendUid;
      if (!confirm(`Freundschaft mit "${name}" beenden?`)) return;

      try {
        await removeFriend(this.user.uid, friendUid);
        alert("Freundschaft beendet.");
      } catch (e) {
        console.error(e);
        alert(e.message || "Konnte Freundschaft nicht beenden.");
      }
    },

    // optional
    async blockFriendB(friend) {
      const friendUid = friend?.id;
      if (!friendUid) return;
      if (
        !confirm(
          `"${friend.username || friend.displayName || friend.id}" blockieren?`
        )
      )
        return;
      try {
        await blockFriend(this.user.uid, friendUid);
        alert("Benutzer blockiert.");
      } catch (e) {
        alert(e.message || "Blockieren fehlgeschlagen.");
      }
    },

    // neue, eindeutig benannte Wrapper:
    acceptRequest(req) {
      return acceptFriendRequest(this.user.uid, req);
    },
    declineRequest(req) {
      return declineFriendRequest(this.user.uid, req);
    },

    // ---------- Chat ----------
    shareProfile() {
      const text = `Mein Freundschaftscode: ${this.user.uid}`;
      if (navigator.share) return navigator.share({ text }).catch(() => {});
      navigator.clipboard?.writeText(this.user.uid);
      alert("Freundschaftscode kopiert!");
    },
    openChat(friend) {
      this.activeChat.partner = friend;
      this.activeChat.chatId = friend.id || friend.uid || `chat-${Date.now()}`;
      this.activeChat.messages = [];
    },
    closeChat() {
      this.activeChat.unsubscribe?.();
      this.activeChat = {
        chatId: null,
        partner: null,
        messages: [],
        unsubscribe: null,
      };
    },
    sendMessage() {
      const txt = this.chatMessageInput?.trim();
      if (!txt) return;
      this.activeChat.messages.push({
        id: Date.now(),
        senderId: this.user.uid,
        text: txt,
      });
      this.chatMessageInput = "";
    },

    // ---------- THC Rechner ----------
    calculateThcAbbau() {
      const r = calculateThc(this.thcCalc);
      if (r.error) return alert(r.error);
      this.thcCalc.result = r;
    },

    // ---------- Notifications ----------
    listenForNotifications() {
      const unsub = db
        .collection("notifications")
        .where("recipientId", "==", this.user.uid)
        // .orderBy("timestamp", "desc") // optional, falls Index vorhanden
        .onSnapshot((snap) => {
          let addedUnread = false;

          snap.docChanges().forEach((ch) => {
            if (ch.type === "added") {
              const d = ch.doc.data();
              if (!d.read) addedUnread = true;
            }
          });

          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          all.sort(
            (a, b) =>
              (b.timestamp?.toDate?.() ?? b.timestamp) -
              (a.timestamp?.toDate?.() ?? a.timestamp)
          );
          this.notifications = all.slice(0, 10);

          if (addedUnread) {
            try {
              playSoundAndVibrate();
            } catch {}
          }
        });
      this.firestoreListeners.push(unsub);
    },
    async markNotificationAsRead(n) {
      if (!n.read)
        await db.collection("notifications").doc(n.id).update({ read: true });
    },
    formatTimestamp,

    // ---------- UI ----------
    toggleSettings() {
      this.showSettings = !this.showSettings;
      this.$nextTick(() => this.map && this.map.invalidateSize());
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
  },
});
app.mount("#app");
