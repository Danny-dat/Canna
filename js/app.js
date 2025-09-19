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
  acceptRequest,
  declineRequest,
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
    // --- Navigation ---
    toggleMenu() {
      this.showMenu = !this.showMenu;
    },
    setView(view) {
      this.currentView = view;
      this.showMenu = false;
      if (view === "dashboard")
        this.$nextTick(() => {
          if (!this.map) this.initMap();
        });
      if (view === "dashboard" || view === "statistics") this.refreshStats();
    },

    // --- Init ---
    async initAppFeatures() {
      this.listenForNotifications(); // unverändert unten
      this.unsubscribeEvents = listenForEvents((events) => {
        this.events = events;
        this.eventMarkers = updateEventMarkers(
          this.map,
          this.user.uid,
          this.events,
          this.eventMarkers
        );
      });
      this.unsubscribeFriends = listenForFriends(
        this.user.uid,
        async (friends) => {
          this.friends = friends;
          this.friendMarkers.forEach((m) => m.remove());
          this.friendMarkers = await buildFriendMarkers(this.map, friends);
          this.toggleFriendMarkers();
        }
      );
      this.settings = await loadUserSettings(this.user.uid);
      const data = await loadUserData(this.user.uid);
      this.userData.displayName = data.displayName;
      this.userData.phoneNumber = data.phoneNumber;
      this.userData.theme = data.theme;
      applyTheme(data.theme);
      this.refreshStats();
      this.initMap();
    },
    cleanupListeners() {
      this.firestoreListeners.forEach((u) => u && u());
      this.firestoreListeners = [];
      if (this.unsubscribeEvents) this.unsubscribeEvents();
      if (this.unsubscribeFriends) this.unsubscribeFriends();
      if (this.activeChat.unsubscribe) this.activeChat.unsubscribe();
      if (this.bannerInterval) clearInterval(this.bannerInterval);
    },

    // --- Auth UI ---
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

    // --- User Data ---
    async saveUserData() {
      await saveUserData(this.user.uid, {
        displayName: this.userData.displayName,
        phoneNumber: this.userData.phoneNumber,
        theme: this.userData.theme,
      });
      alert("Daten gespeichert!");
      applyTheme(this.userData.theme);
      this.setView("dashboard");
    },
    async saveUserSettings() {
      await saveUserSettings(this.user.uid, this.settings);
      this.showSettings = false;
    },

    // --- Konsum + Benachrichtigung ---
    async logConsumption() {
      if (!this.selection.product || !this.selection.device) {
        this.alertMessage = "Bitte wähle ein Produkt und ein Gerät aus.";
        this.showAlert = true;
        return;
      }
      // Tageslimit prüfen
      const today = new Date();
      const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const q = await db
        .collection("consumptions")
        .where("userId", "==", this.user.uid)
        .where("timestamp", ">=", start)
        .get();
      if (q.docs.length >= this.settings.consumptionThreshold) {
        this.alertMessage = `Du hast dein Tageslimit von ${this.settings.consumptionThreshold} Einheiten erreicht!`;
        this.showAlert = true;
        playSoundAndVibrate();
        return;
      }

      // Standort + Log
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await db.collection("consumptions").add({
            userId: this.user.uid,
            product: this.selection.product,
            device: this.selection.device,
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            timestamp: new Date(),
          });
          this.selection = { product: null, device: null };
          await notifyFriendsIfReachedLimit(
            this.user.uid,
            this.userData.displayName || this.user.email,
            this.settings.consumptionThreshold
          );
          this.refreshStats();
        },
        () => {
          this.alertMessage =
            "Standort konnte nicht abgerufen werden. Bitte erlaube den Zugriff.";
          this.showAlert = true;
        },
        { enableHighAccuracy: true }
      );
    },

    // --- Statistik ---
    async refreshStats() {
      if (!this.user.uid) return;
      const stats = await loadConsumptionStats(this.user.uid);
      this.consumptionChart = renderChart(
        "consumptionChart",
        stats,
        this.consumptionChart
      );
    },

    // --- Map ---
    initMap() {
      if (this.map) this.map.remove();
      this.map = initMap("map");
      const unsub = listenForConsumptionMarkers(
        this.map,
        this.user.uid,
        (markers) => {
          this.userMarkers.forEach((m) => m.remove());
          this.userMarkers = markers;
        }
      );
      this.firestoreListeners.push(unsub);
      this.eventMarkers = updateEventMarkers(
        this.map,
        this.user.uid,
        this.events,
        this.eventMarkers
      );
    },
    toggleFriendMarkers() {
      setMarkerVisibility(this.map, this.friendMarkers, this.showFriendsOnMap);
    },

    // --- Events ---
    voteEventUp(id) {
      return voteEvent(id, this.user.uid, "up");
    },
    voteEventDown(id) {
      return voteEvent(id, this.user.uid, "down");
    },

    // --- Freunde ---
    async actionSendFriendRequest() {
      const id = this.friendIdInput.trim();
      if (!id || id === this.user.uid) return alert("Ungültige User-ID.");
      await sendFriendRequest({
        fromUid: this.user.uid,
        fromEmail: this.user.email,
        fromDisplayName: this.userData.displayName || this.user.email,
        toUid: id,
      });
      alert("Freundschaftsanfrage gesendet!");
      this.friendIdInput = "";
    },
    async actionFetchFriendRequests() {
      this.friendRequests = await fetchFriendRequests(this.user.uid);
      if (!this.friendRequests.length)
        alert("Keine neuen Freundschaftsanfragen gefunden.");
    },
    acceptRequest(req) {
      return acceptRequest(this.user.uid, req);
    },
    declineRequest(id) {
      return declineRequest(id);
    },

    // --- THC Rechner ---
    calculateThcAbbau() {
      const r = calculateThc(this.thcCalc);
      if (r.error) return alert(r.error);
      this.thcCalc.result = r;
    },

    // --- Notifications (bestehend) ---
    listenForNotifications() {
      const unsub = db
        .collection("notifications")
        .where("recipientId", "==", this.user.uid)
        .orderBy("timestamp", "desc")
        .limit(10)
        .onSnapshot((snap) => {
          this.notifications = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
        });
      this.firestoreListeners.push(unsub);
    },
    async markNotificationAsRead(n) {
      if (!n.read)
        await db.collection("notifications").doc(n.id).update({ read: true });
    },
    formatTimestamp,

    // --- UI Helfer ---
    toggleSettings() {
      this.showSettings = !this.showSettings;
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
