// features/admin.mixin.js
import { db, auth } from "../services/firebase-config.js";
import {
  loadGlobalAggregates,
  exportAggregatesAsCsv,
  exportAnonymousConsumptionsAsCsv,
} from "../services/admin-aggregates.service.js";

export const adminMixin = {
  data() {
    return {
      isAdmin: false,
      admin: {
        tab: "users", // 'events' | 'users' | 'banners' | 'stats'
        events: [],
        users: [],
        banners: [],
        aggregates: { total: 0, byProduct: [], byDevice: [], byPair: [] },
        usersPageActive: 1,
        usersPageBanned: 1,
        usersStatusFilter: "active",

        // Users-Tab
        usersQuery: "",
        usersSort: "displayName", // 'displayName' | 'createdAt' | 'lastActiveAt'
        usersAsc: true,
        usersPageSize: 20,
      },
      adminEventForm: { name: "", address: "", lat: null, lng: null },
      bannerForm: { slot: "landing", imageUrl: "", alt: "", order: 0 },
    };
  },

  computed: {
    adminUsersFiltered() {
      let list = [...this.admin.users];

      // Filter (case-insensitive auf Name/Username/ID)
      const q = (this.admin.usersQuery || "").toLowerCase().trim();
      if (q) {
        list = list.filter((u) => {
          const a = (u.displayName || u.username || "").toLowerCase();
          return a.includes(q) || (u.id || "").toLowerCase().includes(q);
        });
      }

      // Sort
      const key = this.admin.usersSort;
      list.sort((a, b) => {
        const av =
          key === "createdAt" || key === "lastActiveAt"
            ? a[key]?.toDate?.() ?? a[key] ?? 0
            : a[key] ?? "";
        const bv =
          key === "createdAt" || key === "lastActiveAt"
            ? b[key]?.toDate?.() ?? b[key] ?? 0
            : b[key] ?? "";
        if (av < bv) return this.admin.usersAsc ? -1 : 1;
        if (av > bv) return this.admin.usersAsc ? 1 : -1;
        return 0;
      });

      return list;
    },

    adminUsersPageItems() {
      const start = (this.admin.usersPage - 1) * this.admin.usersPageSize;
      return this.adminUsersFiltered.slice(
        start,
        start + this.admin.usersPageSize
      );
    },

    adminUsersTotalPages() {
      return Math.max(
        1,
        Math.ceil(this.adminUsersFiltered.length / this.admin.usersPageSize)
      );
    },

      // Aufteilen in aktiv/gesperrt (nach deiner Suche/Sortierung!)
  adminActiveUsers() {
    return this.adminUsersFiltered.filter(u => !u._banned);
  },
  adminBannedUsers() {
    return this.adminUsersFiltered.filter(u => !!u._banned);
  },

  // Zähler
  adminActiveUsersCount() { return this.adminActiveUsers.length; },
  adminBannedUsersCount() { return this.adminBannedUsers.length; },

  // Total Pages
  adminActiveUsersTotalPages() {
    return Math.max(1, Math.ceil(this.adminActiveUsers.length / this.admin.usersPageSize));
  },
  adminBannedUsersTotalPages() {
    return Math.max(1, Math.ceil(this.adminBannedUsers.length / this.admin.usersPageSize));
  },

  // Page Items
  adminActiveUsersPageItems() {
    const p = Math.min(this.admin.usersPageActive, this.adminActiveUsersTotalPages);
    const start = (p - 1) * this.admin.usersPageSize;
    return this.adminActiveUsers.slice(start, start + this.admin.usersPageSize);
  },
  adminBannedUsersPageItems() {
    const p = Math.min(this.admin.usersPageBanned, this.adminBannedUsersTotalPages);
    const start = (p - 1) * this.admin.usersPageSize;
    return this.adminBannedUsers.slice(start, start + this.admin.usersPageSize);
  },

    usersListForUi() {
    return this.admin.usersStatusFilter === "active"
      ? this.adminActiveUsersPageItems
      : this.adminBannedUsersPageItems;
  },
  usersTotalPagesForUi() {
    return this.admin.usersStatusFilter === "active"
      ? this.adminActiveUsersTotalPages
      : this.adminBannedUsersTotalPages;
  },
  usersPageForUi: {
    get() {
      return this.admin.usersStatusFilter === "active"
        ? this.admin.usersPageActive
        : this.admin.usersPageBanned;
    },
    set(v) {
      if (this.admin.usersStatusFilter === "active") this.admin.usersPageActive = v;
      else this.admin.usersPageBanned = v;
    }
  },

  },

  methods: {
    /* --- Entry Point: beim Login aufrufen --- */
    async initAdminFeature(user) {
      this.isAdmin = !!user && user.uid === "ZAz0Bnde5zYIS8qCDT86aOvEDX52";
      console.log("[admin] isAdmin:", this.isAdmin);
      if (this.isAdmin) await this.initAdminData();
    },

    async initAdminData() {
      try {
        await Promise.all([
          this.adminReloadUsers(),
          this.adminReloadEvents(),
          this.adminReloadBanners(),
          this.adminRefreshAggregates(),
        ]);
      } catch (e) {
        console.warn("[admin:init]", e);
      }
    },

    /* ====================== Users ====================== */

    // Lädt profiles_public + users (für E-Mail) + banlist (Flag)
    async adminReloadUsers() {
      const [pubSnap, privSnap, banSnap] = await Promise.all([
        db.collection("profiles_public").limit(500).get(),
        db.collection("users").limit(500).get(),
        db
          .collection("banlist")
          .get()
          .catch(() => ({ docs: [] })),
      ]);

      const emailByUid = new Map(
        privSnap.docs.map((d) => [d.id, (d.data() || {}).email || null])
      );
      const banned = new Set(banSnap.docs.map((d) => d.id));

      this.admin.users = pubSnap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...data,
          _email: emailByUid.get(d.id) || null,
          _banned: banned.has(d.id),
          _action: "",
        };
      });

      // Reset beider Paginierungen
      this.admin.usersPage = 1; // falls du es noch anderweitig nutzt
      this.admin.usersPageActive = 1;
      this.admin.usersPageBanned = 1;
    },

    adminChangeSort(key) {
      if (this.admin.usersSort === key) {
        this.admin.usersAsc = !this.admin.usersAsc;
      } else {
        this.admin.usersSort = key;
        this.admin.usersAsc = true;
      }
    },
    adminNextPage() {
      if (this.admin.usersPage < this.adminUsersTotalPages)
        this.admin.usersPage++;
    },
    adminPrevPage() {
      if (this.admin.usersPage > 1) this.admin.usersPage--;
    },

    // Anzeigename ändern (public)
    async adminSaveUser(u) {
      try {
        const displayName = (u.displayName || "").trim();
        await db.collection("profiles_public").doc(u.id).set(
          {
            displayName,
            updatedAt: new Date(),
          },
          { merge: true }
        );
        alert("Gespeichert.");
      } catch (e) {
        alert(e?.message || "Speichern fehlgeschlagen");
      }
    },

    // Passwort-Reset-Mail senden (Auth – benötigt E-Mail)
    async adminSendPasswordReset(email) {
      try {
        const e = (email || "").trim();
        if (!e) return alert("Keine E-Mail hinterlegt.");
        await auth.sendPasswordResetEmail(e);
        alert("Passwort-Reset-E-Mail gesendet.");
      } catch (err) {
        alert(err?.message || "Konnte Reset-Mail nicht senden.");
      }
    },

    // Nutzer sperren (banlist + users.isBanned)
    async adminBanUser(uid, reason = "") {
      if (!uid) return;
      if (!confirm(`Nutzer ${uid} wirklich sperren?`)) return;

      // 1) Autoritative Sperrliste
      await db
        .collection("banlist")
        .doc(uid)
        .set(
          {
            reason: reason || null,
            bannedAt: new Date(),
          },
          { merge: false }
        );

      // 2) Spiegel im users/{uid} (nur Admin darf setzen)
      await db
        .collection("users")
        .doc(uid)
        .set({ isBanned: true, bannedAt: new Date() }, { merge: true });

      const u = this.admin.users.find((x) => x.id === uid);
      if (u) u._banned = true;
      alert("Gesperrt.");
    },

    // Aktion aus Dropdown ausführen
    handleUserAction(u) {
      const act = u._action;
      // Auswahl zurücksetzen, damit das Dropdown wieder "Aktion wählen…" zeigt
      u._action = "";
      if (!act) return;

      switch (act) {
        case "save":
          return this.adminSaveUser(u);
        case "reset":
          if (!u._email)
            return alert("Für diesen Nutzer ist keine E-Mail hinterlegt.");
          return this.adminSendPasswordReset(u._email);
        case "ban":
          return this.adminBanUser(u.id);
        case "unban":
          return this.adminUnbanUser(u.id);
        case "wipe":
          return this.adminWipeUserData(u.id);
        default:
          return;
      }
    },

    // Nutzer sperren (banlist + users.isBanned)
    async adminBanUser(uid, reason = "") {
      try {
        if (!uid) return;
        if (!confirm(`Nutzer ${uid} wirklich sperren?`)) return;

        await db
          .collection("banlist")
          .doc(uid)
          .set(
            {
              reason: reason || null,
              bannedAt: new Date(),
            },
            { merge: false }
          );

        await db.collection("users").doc(uid).set(
          {
            isBanned: true,
            bannedAt: new Date(),
          },
          { merge: true }
        );

        const u = this.admin.users.find((x) => x.id === uid);
        if (u) u._banned = true;
        alert("Gesperrt.");
      } catch (e) {
        console.error("[adminBanUser]", e);
        alert(e?.message || "Sperren fehlgeschlagen (Rules?)");
      }
    },

    // Sperre aufheben (banlist + users.isBanned)
    async adminUnbanUser(uid) {
      try {
        if (!uid) return;
        if (!confirm(`Sperre für ${uid} aufheben?`)) return;

        await db.collection("banlist").doc(uid).delete();
        await db
          .collection("users")
          .doc(uid)
          .set({ isBanned: false }, { merge: true });

        const u = this.admin.users.find((x) => x.id === uid);
        if (u) u._banned = false;
        alert("Entsperrt.");
      } catch (e) {
        console.error("[adminUnbanUser]", e);
        alert(e?.message || "Entsperren fehlgeschlagen");
      }
    },

    // App-Daten löschen/anon (kein Auth-Delete!)
    async adminWipeUserData(uid) {
      if (!uid) return;
      if (
        !confirm(
          `Alle App-Daten von ${uid} löschen/anon? Das kann nicht rückgängig gemacht werden.`
        )
      )
        return;

      // 1) Öffentliches Profil entfernen
      try {
        await db.collection("profiles_public").doc(uid).delete();
      } catch {}

      // 2) Privates Profil anonymisieren (nicht komplett löschen)
      try {
        await db
          .collection("users")
          .doc(uid)
          .set(
            {
              displayName: null,
              phoneNumber: null,
              personalization: { theme: "light" },
              settings: { consumptionThreshold: 3 },
              anonymizedAt: new Date(),
            },
            { merge: true }
          );
      } catch {}

      // 3) Konsum-Einträge löschen (Batchweise)
      try {
        const batchSize = 300;
        let lastDoc = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = db
            .collection("consumptions")
            .where("userId", "==", uid)
            .orderBy("timestamp", "asc")
            .limit(batchSize);
          if (lastDoc) q = q.startAfter(lastDoc);
          const snap = await q.get();
          if (snap.empty) break;
          const batch = db.batch();
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          lastDoc = snap.docs[snap.docs.length - 1];
          if (snap.size < batchSize) break;
        }
      } catch {}

      // 4) Friend-Requests soft cleanup (-> 'removed')
      try {
        const fr = await db
          .collection("friend_requests")
          .where("participants", "array-contains", uid)
          .get();
        const batch = db.batch();
        fr.docs.forEach((d) => {
          const cur = d.data();
          batch.set(
            d.ref,
            {
              fromUid: cur.fromUid,
              toUid: cur.toUid,
              participants: cur.participants,
              createdAt: cur.createdAt ?? new Date(),
              respondedAt: new Date(),
              status: "removed",
            },
            { merge: false }
          );
        });
        await batch.commit();
      } catch {}

      // UI aktualisieren
      this.admin.users = this.admin.users.filter((u) => u.id !== uid);

      alert("App-Daten bereinigt/anonymisiert. (Auth-Account besteht weiter)");
    },

    /* ====================== Events ====================== */
    async adminReloadEvents() {
      const es = await db.collection("events").orderBy("name").get();
      this.admin.events = es.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async adminCreateEvent() {
      try {
        const f = this.adminEventForm;
        if (!f.name || !Number.isFinite(f.lat) || !Number.isFinite(f.lng))
          return alert("Name/Lat/Lng fehlen");
        const ref = await db.collection("events").add({
          name: f.name,
          address: f.address || "",
          location: { lat: f.lat, lng: f.lng },
          upvotes: [],
          downvotes: [],
        });
        this.admin.events.unshift({
          id: ref.id,
          name: f.name,
          address: f.address || "",
          location: { lat: f.lat, lng: f.lng },
          upvotes: [],
          downvotes: [],
        });
        this.adminEventForm = { name: "", address: "", lat: null, lng: null };
      } catch (e) {
        alert(e?.message || "Event anlegen fehlgeschlagen");
      }
    },

    async adminDeleteEvent(ev) {
      if (!confirm(`Event "${ev.name}" löschen?`)) return;
      try {
        await db.collection("events").doc(ev.id).delete();
        this.admin.events = this.admin.events.filter((x) => x.id !== ev.id);
      } catch (e) {
        alert(e?.message || "Löschen fehlgeschlagen");
      }
    },

    /* ====================== Banners ====================== */
    async adminReloadBanners() {
      const bs = await db
        .collection("banners")
        .orderBy("order")
        .get()
        .catch(() => ({ docs: [] }));
      this.admin.banners = bs.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async adminCreateBanner() {
      try {
        const b = this.bannerForm;
        if (!b.slot || !b.imageUrl)
          return alert("slot & imageUrl erforderlich");
        const ref = await db.collection("banners").add({
          slot: b.slot,
          imageUrl: b.imageUrl,
          alt: b.alt || "",
          order: Number(b.order) || 0,
          active: true,
          createdAt: new Date(),
        });
        this.admin.banners.push({ id: ref.id, ...b, active: true });
        this.bannerForm = { slot: "landing", imageUrl: "", alt: "", order: 0 };
      } catch (e) {
        alert(e?.message || "Banner anlegen fehlgeschlagen");
      }
    },

    async adminDeleteBanner(b) {
      if (!confirm("Banner löschen?")) return;
      try {
        await db.collection("banners").doc(b.id).delete();
        this.admin.banners = this.admin.banners.filter((x) => x.id !== b.id);
      } catch (e) {
        alert(e?.message || "Löschen fehlgeschlagen");
      }
    },

    /* ====================== Aggregates ====================== */
    async adminRefreshAggregates() {
      try {
        this.admin.aggregates = await loadGlobalAggregates();
      } catch (e) {
        alert(e?.message || "Konnte Aggregates nicht laden");
      }
    },
    adminExportAggregatesCsv() {
      try {
        exportAggregatesAsCsv(this.admin.aggregates);
      } catch (e) {
        alert(e?.message || "Export fehlgeschlagen");
      }
    },

    adminExportAnonymousCsv() {
      alert(
        "Der anonyme Export wird vorbereitet. Dies kann einen Moment dauern..."
      );
      exportAnonymousConsumptionsAsCsv().catch((e) => {
        alert(e?.message || "Der anonyme Export ist fehlgeschlagen.");
      });
    },

     // Pagination (aktive)
  adminPrevPageActive() {
    this.admin.usersPageActive = Math.max(1, this.admin.usersPageActive - 1);
  },
  adminNextPageActive() {
    this.admin.usersPageActive = Math.min(this.adminActiveUsersTotalPages, this.admin.usersPageActive + 1);
  },

  // Pagination (gesperrte)
  adminPrevPageBanned() {
    this.admin.usersPageBanned = Math.max(1, this.admin.usersPageBanned - 1);
  },
  adminNextPageBanned() {
    this.admin.usersPageBanned = Math.min(this.adminBannedUsersTotalPages, this.admin.usersPageBanned + 1);
  },

  // Dropdown-Aktionen (leicht ergänzt um Page-Clamps)
  handleUserAction(u) {
    const act = u._action; u._action = "";
    if (!act) return;
    if (act === "ban") {
      return this.adminBanUser(u.id).finally(() => {
        this.admin.usersPageActive = Math.min(this.admin.usersPageActive, this.adminActiveUsersTotalPages);
        this.admin.usersPageBanned = Math.min(this.admin.usersPageBanned, this.adminBannedUsersTotalPages);
        this.admin.usersStatusFilter = "banned"; // optional: direkt zu "Gesperrt" springen
      });
    }
    if (act === "unban") {
      return this.adminUnbanUser(u.id).finally(() => {
        this.admin.usersPageActive = Math.min(this.admin.usersPageActive, this.adminActiveUsersTotalPages);
        this.admin.usersPageBanned = Math.min(this.admin.usersPageBanned, this.adminBannedUsersTotalPages);
        this.admin.usersStatusFilter = "active";
      });
    }

    switch (act) {
      case "save":
        return this.adminSaveUser(u);
      case "reset":
        if (!u._email) return alert("Für diesen Nutzer ist keine E-Mail hinterlegt.");
        return this.adminSendPasswordReset(u._email);
      case "ban":
        return this.adminBanUser(u.id).finally(() => {
          // Nutzer wandert nach „gesperrt“
          this.admin.usersPageActive = Math.min(this.admin.usersPageActive, this.adminActiveUsersTotalPages);
          this.admin.usersPageBanned = Math.min(this.admin.usersPageBanned, this.adminBannedUsersTotalPages);
        });
      case "unban":
        return this.adminUnbanUser(u.id).finally(() => {
          // Nutzer wandert nach „aktiv“
          this.admin.usersPageActive = Math.min(this.admin.usersPageActive, this.adminActiveUsersTotalPages);
          this.admin.usersPageBanned = Math.min(this.admin.usersPageBanned, this.adminBannedUsersTotalPages);
        });
      case "wipe":
        return this.adminWipeUserData(u.id);
      default:
        return;
    }
  },

   usersPrevPageForUi() { this.usersPageForUi = Math.max(1, this.usersPageForUi - 1); },
  usersNextPageForUi() { this.usersPageForUi = Math.min(this.usersTotalPagesForUi, this.usersPageForUi + 1); },

  
  },
};
