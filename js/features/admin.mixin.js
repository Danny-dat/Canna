// features/admin.mixin.js
import { db } from '../services/firebase-config.js';
import { loadGlobalAggregates, exportAggregatesAsCsv } from '../services/admin-aggregates.service.js';

export const adminMixin = {
  data() {
    return {
      isAdmin: false,
      admin: {
        tab: 'users',               // 'events' | 'users' | 'banners' | 'stats'
        events: [],
        users: [],
        banners: [],
        aggregates: { total:0, byProduct:[], byDevice:[], byPair:[] },

        // Users-Tab
        usersQuery: '',
        usersSort: 'displayName',
        usersAsc: true,
        usersPage: 1,
        usersPageSize: 20,
      },
      adminEventForm: { name:'', address:'', lat:null, lng:null },
      bannerForm: { slot:'landing', imageUrl:'', alt:'', order:0 },
    };
  },

  computed: {
    adminUsersFiltered() {
      let list = [...this.admin.users];
      const q = (this.admin.usersQuery || '').toLowerCase().trim();
      if (q) {
        list = list.filter(u => {
          const a = (u.displayName || u.username || '').toLowerCase();
          return a.includes(q) || (u.id || '').toLowerCase().includes(q);
        });
      }
      const key = this.admin.usersSort;
      list.sort((a,b) => {
        const av = key === 'createdAt' || key === 'lastActiveAt'
          ? (a[key]?.toDate?.() ?? a[key] ?? 0)
          : (a[key] ?? '');
        const bv = key === 'createdAt' || key === 'lastActiveAt'
          ? (b[key]?.toDate?.() ?? b[key] ?? 0)
          : (b[key] ?? '');
        if (av < bv) return this.admin.usersAsc ? -1 : 1;
        if (av > bv) return this.admin.usersAsc ? 1 : -1;
        return 0;
      });
      return list;
    },
    adminUsersPageItems() {
      const start = (this.admin.usersPage - 1) * this.admin.usersPageSize;
      return this.adminUsersFiltered.slice(start, start + this.admin.usersPageSize);
    },
    adminUsersTotalPages() {
      return Math.max(1, Math.ceil(this.adminUsersFiltered.length / this.admin.usersPageSize));
    },
  },

  methods: {
    /* --- Entry Point: beim Login aufrufen --- */
    async initAdminFeature(user) {
      this.isAdmin = !!user && (user.uid === "ZAz0Bnde5zYIS8qCDT86aOvEDX52");
      console.log("[admin] isAdmin:", this.isAdmin);
      if (this.isAdmin) await this.initAdminData();
    },

    async initAdminData(){
      try {
        // Events
        const es = await db.collection('events').orderBy('name').get();
        this.admin.events = es.docs.map(d=>({ id:d.id, ...d.data() }));

        // Nutzer (öffentlich)
        const us = await db.collection('profiles_public').limit(500).get();
        this.admin.users = us.docs.map(d=>({ id:d.id, ...d.data() }));
        this.admin.usersPage = 1;

        // Banner
        const bs = await db.collection('banners').orderBy('order').get().catch(()=>({docs:[]}));
        this.admin.banners = bs.docs.map(d=>({ id:d.id, ...d.data() }));

        // Aggregates (nur Admin darf lesen)
        this.admin.aggregates = await loadGlobalAggregates();
      } catch(e){
        console.warn("[admin:init]", e);
      }
    },

    /* -------- Users -------- */
    async adminReloadUsers(){
      const snap = await db.collection('profiles_public').limit(500).get();
      this.admin.users = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      this.admin.usersPage = 1;
    },
    adminChangeSort(key){
      if (this.admin.usersSort === key) {
        this.admin.usersAsc = !this.admin.usersAsc;
      } else {
        this.admin.usersSort = key;
        this.admin.usersAsc = true;
      }
    },
    adminNextPage(){ if (this.admin.usersPage < this.adminUsersTotalPages) this.admin.usersPage++; },
    adminPrevPage(){ if (this.admin.usersPage > 1) this.admin.usersPage--; },
    async adminSaveUser(u){
      try{
        const displayName = (u.displayName || '').trim();
        await db.collection('profiles_public').doc(u.id).set({
          displayName,
          updatedAt: new Date(),
        }, { merge:true });
        alert('Gespeichert.');
      }catch(e){
        alert(e?.message || 'Speichern fehlgeschlagen');
      }
    },

    /* -------- Events -------- */
    async adminCreateEvent(){
      try{
        const f = this.adminEventForm;
        if(!f.name || !Number.isFinite(f.lat) || !Number.isFinite(f.lng))
          return alert("Name/Lat/Lng fehlen");
        const ref = await db.collection('events').add({
          name: f.name, address: f.address||'',
          location: { lat: f.lat, lng: f.lng },
          upvotes: [], downvotes: []
        });
        this.admin.events.unshift({ id: ref.id, name:f.name, address:f.address||'', location:{lat:f.lat,lng:f.lng}, upvotes:[], downvotes:[] });
        this.adminEventForm = { name:'', address:'', lat:null, lng:null };
      }catch(e){ alert(e?.message || "Event anlegen fehlgeschlagen"); }
    },
    async adminDeleteEvent(ev){
      if(!confirm(`Event "${ev.name}" löschen?`)) return;
      try{
        await db.collection('events').doc(ev.id).delete();
        this.admin.events = this.admin.events.filter(x=>x.id!==ev.id);
      }catch(e){ alert(e?.message || "Löschen fehlgeschlagen"); }
    },

    /* -------- Banners -------- */
    async adminCreateBanner(){
      try{
        const b = this.bannerForm;
        if(!b.slot || !b.imageUrl) return alert("slot & imageUrl erforderlich");
        const ref = await db.collection('banners').add({
          slot: b.slot, imageUrl: b.imageUrl, alt: b.alt||'',
          order: Number(b.order)||0, active: true, createdAt: new Date(),
        });
        this.admin.banners.push({ id: ref.id, ...b, active:true });
        this.bannerForm = { slot:'landing', imageUrl:'', alt:'', order:0 };
      }catch(e){ alert(e?.message || "Banner anlegen fehlgeschlagen"); }
    },
    async adminDeleteBanner(b){
      if(!confirm("Banner löschen?")) return;
      try{
        await db.collection('banners').doc(b.id).delete();
        this.admin.banners = this.admin.banners.filter(x=>x.id!==b.id);
      }catch(e){ alert(e?.message || "Löschen fehlgeschlagen"); }
    },

    /* -------- Aggregates -------- */
    async adminRefreshAggregates(){
      try{ this.admin.aggregates = await loadGlobalAggregates(); }
      catch(e){ alert(e?.message || "Konnte Aggregates nicht laden"); }
    },
    adminExportAggregatesCsv(){
      try{ exportAggregatesAsCsv(this.admin.aggregates); }
      catch(e){ alert(e?.message || "Export fehlgeschlagen"); }
    },
  },
};
