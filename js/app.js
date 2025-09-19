// js/app.js
import { auth } from './services/firebase-config.js';
import * as Auth from './services/auth.service.js';
import * as User from './services/user-data.service.js';
import * as Friends from './services/friends.service.js';
import * as Events from './services/events.service.js';
import * as MapSvc from './services/map.service.js';
import * as Stats from './services/statistics.service.js';
import { calculate as calcThc } from './utils/thc-calculator.js';
import { applyTheme } from './utils/theme.js';

new Vue({
  el: '#app',
  data() {
    return {
      form: { email:'', password:'' },
      user: { loggedIn:false, uid:null, email:null },
      events: [], friends: [], friendRequests: [],
      userData: {}, settings: {}, thcCalc: { initialMg:10, hours:24, halfLife:24, result:null },
      map: null, firestoreListeners: [], bannerInterval: null,
      view: 'login', showFriendsOnMap: true
    };
  },
  mounted() {
    auth.onAuthStateChanged(u => {
      this.cleanup();
      if (u) {
        this.user = { loggedIn:true, uid:u.uid, email:u.email };
        this.initAfterLogin();
      } else {
        this.user = { loggedIn:false, uid:null, email:null };
        applyTheme('light');
        this.view = 'login';
      }
    });
  },
  methods: {
    async initAfterLogin() {
      this.firestoreListeners.push(
        Events.listen(evts => { this.events = evts; MapSvc.updateEventMarkers(evts, this.user.uid); })
      );
      this.firestoreListeners.push(
        Friends.listenRequests(this.user.uid, reqs => this.friendRequests = reqs)
      );
      this.firestoreListeners.push(
        Friends.listenFriends(this.user.uid, f => { this.friends = f; MapSvc.updateFriendMarkers(f); })
      );
      this.map = await MapSvc.init();
      MapSvc.listenConsumption(this.user.uid, this.firestoreListeners);
      this.settings = await User.loadUserSettings(this.user.uid);
      this.userData = await User.loadUserData(this.user.uid);
      applyTheme(this.userData.theme || 'dark');
      await this.refreshStats();
      this.view = 'dashboard';
    },
    cleanup() {
      this.firestoreListeners.forEach(unsub => typeof unsub === 'function' && unsub());
      this.firestoreListeners = [];
      if (this.bannerInterval) clearInterval(this.bannerInterval);
    },

    // Auth
    register() { return Auth.register(this.form); },
    login() { return Auth.login(this.form); },
    logout() { return Auth.logout(); },

    // Data
    async saveUserData() {
      await User.saveUserData(this.user.uid, this.userData);
      applyTheme(this.userData.theme || 'dark');
    },
    saveUserSettings() { return User.saveUserSettings(this.user.uid, this.settings); },

    // Social
    acceptRequest(r) { return Friends.accept(r); },
    declineRequest(id) { return Friends.decline(id); },
    sendFriendRequest() { return Friends.sendRequest(this.user, this.userData, this.friendIdInput); },
    voteEvent(id, type) { return Events.vote(id, this.user.uid, type); },

    // Stats/Map/THC
    async refreshStats() {
      const data = await Stats.load(this.user.uid);
      Stats.render(data);
    },
    calculateThcAbbau() {
      const res = calcThc(this.thcCalc);
      if (res) this.thcCalc.result = res;
    },
    toggleFriendMarkers() { MapSvc.toggleFriendMarkers(this.showFriendsOnMap); }
  }
});
