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

import { shareMyFriendCode } from "./services/friends.service.js";

import { initFriendsFeature } from "./features/friends.js";
import { initEventsFeature, voteEvent } from "./features/events.js";
import {
  listenForNotifications,
  markNotificationAsRead as markNotif,
} from "./features/notifications.js";
import { createMapFeature } from "./features/map.js";
import { refreshStatsFor } from "./features/statistics.js";
import { logConsumption } from "./features/consumption.js";

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
        this.user = { loggedIn: true, uid: user.uid, email: user.email };
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
      this.currentView = view;
      this.showMenu = false;

      if (view === "dashboard") {
        this.$nextTick(() => this.mapFx?.mountIfNeeded());
        this.refreshStats();
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

      // Stats
      await this.refreshStats();
    },

    cleanupListeners() {
      try {
        this._unsubs?.forEach((u) => u && u());
      } catch {}
      this._unsubs = [];
      this.mapFx?.teardown();
      if (this.bannerInterval) clearInterval(this.bannerInterval);

      try {
        document.removeEventListener("click", this._onDocClick);
      } catch {}
      try {
        document.removeEventListener("keydown", this._onKey);
      } catch {}
      this._onDocClick = this._onKey = null;
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

    // ---------------- Notifications ----------------
    async handleNotificationClick(n) {
      if (!n.read) {
        try {
          await markNotif(n.id);
        } catch {}
      }
      if (n.type !== "chat_message") return;

      const partnerId = n.senderId;
      let friend = this.friends.find((f) => f.id === partnerId);
      if (!friend) {
        try {
          const snap = await db
            .collection("profiles_public")
            .doc(partnerId)
            .get();
          const d = snap.exists ? snap.data() : {};
          friend = { id: partnerId, displayName: d?.displayName || partnerId };
        } catch {
          friend = { id: partnerId };
        }
      }

      this.showNotifications = false;
      if (this.currentView !== "dashboard") this.setView("dashboard");
      // hier könntest du createChatFeature anbinden und openChat(friend) aufrufen, wenn du das Feature dranhängst
    },
    async markNotificationAsRead(n) {
      if (!n.read) await markNotif(n.id);
    },

    // ---------------- Friends / Share ----------------
    async shareProfile() {
      try {
        const res = await shareMyFriendCode(this.user?.uid);
        if (res?.method === "clipboard" || res?.method === "execCommand") {
          this.alertMessage = "Freundschaftscode kopiert!";
          this.showAlert = true;
        }
        // Bei navigator.share gibt's kein Alert, da das OS den Share-Sheet zeigt.
      } catch (e) {
        this.alertMessage = e?.message || "Teilen fehlgeschlagen.";
        this.showAlert = true;
      }
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
