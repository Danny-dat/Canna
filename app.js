const app = Vue.createApp({
    data() {
        return {
            // ----- STATE MANAGEMENT -----
            isLogin: true,
            user: { loggedIn: false, uid: null, email: null },
            currentView: 'dashboard',
            showMenu: false,
            showNotifications: false,
            showSettings: false,
            showAlert: false,
            alertMessage: '',

            // ----- FORM INPUTS -----
            form: { email: '', password: '', phoneNumber: '', displayName: '' },
            friendIdInput: '',
            chatMessageInput: '',

            // ----- USER DATA & PERSONALIZATION -----
            userData: {
                displayName: '',
                phoneNumber: '',
                theme: 'light'
            },

            // ----- THC CALCULATOR -----
            thcCalc: {
                gender: 'male',
                age: 48,
                weight: 120,
                bodyFat: 30,
                frequency: 'often',
                amount: 1.0,
                thcPercentage: 25,
                lastConsumption: new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
                result: {
                    value: null,
                    status: null,
                    waitTime: null
                }
            },

            // ----- BANNER-LOGIK -----
            landingBannerIndex: 0,
            landingBanners: [
                { img: 'https://placehold.co/400x100/4CAF50/FFFFFF?text=Deine+Werbung+hier', alt: 'Werbung 1' },
                { img: 'https://placehold.co/400x100/388E3C/FFFFFF?text=CannaTrack+werben', alt: 'Werbung 2' }
            ],
            dashboardBannerIndex: 0,
            dashboardBanners: [
                { img: 'https://placehold.co/400x150/FFC107/333333?text=Angebot+des+Tages', alt: 'Angebot 1' },
                { img: 'https://placehold.co/400x150/f4f4f9/333333?text=Neuer+Vaporizer', alt: 'Angebot 2' }
            ],
            bannerInterval: null,

            // ----- APP DATA -----
            products: [
                { name: 'Hash', img: 'images/hash.png' },
                { name: 'Blüte', img: 'images/flower.png' },
                { name: 'Harz', img: 'images/resin.png' }
            ],
            devices: ['Joint', 'Bong', 'Vaporizer', 'Pfeife'],
            selection: { product: null, device: null },

            friends: [],
            friendRequests: [],
            notifications: [],
            events: [],
            activeChat: { chatId: null, partner: null, messages: [], unsubscribe: null },

            map: null,
            consumptionChart: null,
            settings: { consumptionThreshold: 3 },
            showFriendsOnMap: false,
            userMarkers: [],
            friendMarkers: [],
            eventMarkers: [],

            firestoreListeners: []
        };
    },

    computed: {
        unreadNotificationsCount() {
            return this.notifications.filter(n => !n.read).length;
        }
    },

    watch: {
        events: {
            handler() {
                this.updateEventMarkers();
            },
            deep: true
        }
    },

    mounted() {
        const firebaseConfig = {
            apiKey: "AIzaSyCWLDRA3lOLWzf8unvKKOmhDZ1THyrGyTQ",
            authDomain: "cannatrack-2486f.firebaseapp.com",
            projectId: "cannatrack-2486f",
            storageBucket: "cannatrack-2486f.appspot.com",
            messagingSenderId: "873798957273",
            appId: "1:873798957273:web:fe161382aa2d1b24d226c8"
        };
        firebase.initializeApp(firebaseConfig);

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                this.user = { loggedIn: true, uid: user.uid, email: user.email };
                this.$nextTick(() => this.initAppFeatures());
            } else {
                this.user = { loggedIn: false, uid: null, email: null };
                this.firestoreListeners.forEach(unsubscribe => unsubscribe());
                this.firestoreListeners = [];
                if (this.activeChat.unsubscribe) this.activeChat.unsubscribe();
                if (this.bannerInterval) clearInterval(this.bannerInterval);
                this.applyTheme('light');
            }
        });

        this.startBannerRotation();
    },

    methods: {
        // ----- NAVIGATION & VIEW MANAGEMENT -----
        toggleMenu() { this.showMenu = !this.showMenu; },
        setView(view) {
            this.currentView = view;
            this.showMenu = false;
            if (view === 'dashboard' || view === 'statistics') {
                this.$nextTick(() => this.refreshStats());
            }
            if (view === 'dashboard') {
                this.$nextTick(() => this.initMap());
            }
        },

        // ----- BANNER ROTATION -----
        startBannerRotation() {
            this.bannerInterval = setInterval(() => {
                this.landingBannerIndex = (this.landingBannerIndex + 1) % this.landingBanners.length;
                this.dashboardBannerIndex = (this.dashboardBannerIndex + 1) % this.dashboardBanners.length;
            }, 5000);
        },

        // ----- AUTHENTICATION -----
        async register() {
            const phoneRegex = /^(015|016|017)\d{8,9}$/;
            const cleanedPhoneNumber = this.form.phoneNumber.replace(/[\s\/-]/g, '');

            if (!this.form.displayName.trim()) return alert('Bitte gib einen Anzeigenamen ein.');
            if (!phoneRegex.test(cleanedPhoneNumber)) return alert('Bitte gib eine gültige deutsche Handynummer ein (z.B. 017612345678).');

            try {
                const cred = await firebase.auth().createUserWithEmailAndPassword(this.form.email, this.form.password);
                await firebase.firestore().collection('users').doc(cred.user.uid).set({
                    email: cred.user.email,
                    displayName: this.form.displayName,
                    phoneNumber: cleanedPhoneNumber,
                    friends: [],
                    settings: { consumptionThreshold: 3 },
                    personalization: { theme: 'light' }
                });
            } catch (error) { alert(error.message); }
        },
        login() {
            firebase.auth().signInWithEmailAndPassword(this.form.email, this.form.password)
                .catch(error => alert(error.message));
        },
        logout() {
            firebase.auth().signOut();
            this.showMenu = false;
        },

// ----- INITIALIZATION -----
initAppFeatures() {
    // listenForFriendRequests() WIRD HIER BEWUSST ENTFERNT, UM DEN FEHLER ZU STOPPEN.
    this.listenForFriends();
    this.listenForNotifications();
    this.listenForEvents();
    this.loadUserSettings();
    this.loadUserData();
    this.refreshStats();
    this.initMap();
},
// ----- FRIENDS -----
async fetchFriendRequests() {
    if (!this.user.uid) return;
    try {
        const snapshot = await firebase.firestore().collection('friend_requests')
            .where('participants', 'array-contains', this.user.uid)
            .get();
        
        this.friendRequests = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(req => req.to === this.user.uid && req.status === 'pending');
            
        if (this.friendRequests.length === 0) {
            alert("Keine neuen Freundschaftsanfragen gefunden.");
        }
    } catch (error) {
        console.error("FEHLER BEIM ABRUFEN DER ANFRAGEN:", error);
        alert("Ein Fehler ist aufgetreten. Überprüfe die Browser-Konsole für Details.");
    }
},
        // ----- PERSONALIZATION -----
        async loadUserData() {
            const doc = await firebase.firestore().collection('users').doc(this.user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                this.userData.displayName = data.displayName || '';
                this.userData.phoneNumber = data.phoneNumber || '';
                this.userData.theme = data.personalization?.theme || 'light';
                this.applyTheme(this.userData.theme);
            }
        },
        async saveUserData() {
            await firebase.firestore().collection('users').doc(this.user.uid).set({
                displayName: this.userData.displayName,
                phoneNumber: this.userData.phoneNumber,
                personalization: { theme: this.userData.theme }
            }, { merge: true });
            alert('Daten gespeichert!');
            this.applyTheme(this.userData.theme);
            this.setView('dashboard');
        },
        applyTheme(theme) {
            document.body.className = document.body.className.replace(/theme-\w+/g, '');
            document.body.classList.add(`theme-${theme}`);
        },

        // ----- CONSUMPTION & ALERTS -----
        async logConsumption() {
            if (!this.selection.product || !this.selection.device) {
                this.alertMessage = "Bitte wähle ein Produkt und ein Gerät aus.";
                this.showAlert = true;
                return;
            }
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const query = await firebase.firestore().collection('consumptions')
                .where('userId', '==', this.user.uid)
                .where('timestamp', '>=', startOfDay)
                .get();

            if (query.docs.length >= this.settings.consumptionThreshold) {
                this.alertMessage = `Du hast dein Tageslimit von ${this.settings.consumptionThreshold} Einheiten erreicht!`;
                this.showAlert = true;
                this.playSoundAndVibrate();
                return;
            }

            navigator.geolocation.getCurrentPosition(position => {
                firebase.firestore().collection('consumptions').add({
                    userId: this.user.uid,
                    product: this.selection.product,
                    device: this.selection.device,
                    location: {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    },
                    timestamp: new Date()
                }).then(() => {
                    this.selection = { product: null, device: null };
                    this.checkConsumptionAndNotify();
                    this.refreshStats();
                });
            }, () => {
                this.alertMessage = "Standort konnte nicht abgerufen werden. Bitte erlaube den Zugriff.";
                this.showAlert = true;
            }, { enableHighAccuracy: true });
        },
        closeAlert() { this.showAlert = false; },
        async checkConsumptionAndNotify() {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const query = await firebase.firestore().collection('consumptions')
                .where('userId', '==', this.user.uid)
                .where('timestamp', '>=', startOfDay)
                .get();

            if (query.docs.length === this.settings.consumptionThreshold) {
                const userDoc = await firebase.firestore().collection('users').doc(this.user.uid).get();
                if (!userDoc.exists || !userDoc.data().friends) return;
                const friends = userDoc.data().friends;
                const msg = `${this.userData.displayName || this.user.email} hat heute die Konsumgrenze erreicht.`;
                friends.forEach(friendId => {
                    firebase.firestore().collection('notifications').add({
                        recipientId: friendId,
                        senderId: this.user.uid,
                        message: msg,
                        timestamp: new Date(),
                        read: false
                    });
                });
            }
        },
        playSoundAndVibrate() {
            try {
                if (Tone.context.state !== 'running') Tone.start();
                const synth = new Tone.Synth().toDestination();
                synth.triggerAttackRelease("C4", "8n");
            } catch (e) { console.warn("Tone.js konnte nicht initialisiert werden."); }
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        },

        // ----- USER SETTINGS -----
        toggleSettings() { this.showSettings = !this.showSettings; },
        async loadUserSettings() {
            const doc = await firebase.firestore().collection('users').doc(this.user.uid).get();
            if (doc.exists && doc.data().settings) {
                this.settings = { ...this.settings, ...doc.data().settings };
            }
        },
        async saveUserSettings() {
            await firebase.firestore().collection('users').doc(this.user.uid).set({ settings: this.settings }, { merge: true });
            this.showSettings = false;
        },

        // ----- STATS & CHART -----
        refreshStats() { this.loadConsumptionStats(); },
        async loadConsumptionStats() {
            const ctx = document.getElementById('consumptionChart');
            if (!ctx) return;

            const today = new Date();
            const last7Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);

            const q = await firebase.firestore().collection('consumptions')
                .where('userId', '==', this.user.uid)
                .where('timestamp', '>=', last7Days)
                .get();

            const stats = {};
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                stats[d.toLocaleDateString('de-DE')] = 0;
            }
            q.docs.forEach(doc => {
                const key = doc.data().timestamp.toDate().toLocaleDateString('de-DE');
                if (stats.hasOwnProperty(key)) stats[key]++;
            });
            this.renderChart(stats);
        },
        renderChart(stats) {
            const ctx = document.getElementById('consumptionChart');
            if (!ctx) return;
            if (this.consumptionChart) this.consumptionChart.destroy();
            this.consumptionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(stats),
                    datasets: [{
                        label: 'Anzahl Konsumeinheiten',
                        data: Object.values(stats),
                        backgroundColor: 'rgba(76, 175, 80, 0.5)',
                        borderColor: 'rgba(76, 175, 80, 1)',
                        borderWidth: 1
                    }]
                },
                options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });
        },

        // ----- MAP -----
        initMap() {
            if (this.map) this.map.remove();
            this.map = L.map('map').setView([51.61, 7.33], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(this.map);
            this.listenForConsumptionMarkers();
            this.updateEventMarkers();
        },
        listenForConsumptionMarkers() {
            const unsub = firebase.firestore().collection('consumptions')
                .where('userId', '==', this.user.uid)
                .onSnapshot(snapshot => {
                    this.userMarkers.forEach(marker => marker.remove());
                    this.userMarkers = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const marker = L.marker([data.location.lat, data.location.lng], { icon: this.createMarkerIcon('green') }).addTo(this.map);
                        this.userMarkers.push(marker);
                    });
                });
            this.firestoreListeners.push(unsub);
        },
        async updateFriendMarkers() {
            this.friendMarkers.forEach(marker => marker.remove());
            this.friendMarkers = [];
            for (const friend of this.friends) {
                const query = await firebase.firestore().collection('consumptions')
                    .where('userId', '==', friend.id)
                    .orderBy('timestamp', 'desc').limit(1).get();
                if (!query.empty) {
                    const lastLog = query.docs[0].data();
                    const marker = L.marker([lastLog.location.lat, lastLog.location.lng], { icon: this.createMarkerIcon('blue') });
                    marker.bindPopup(friend.displayName || friend.email);
                    this.friendMarkers.push(marker);
                }
            }
            this.toggleFriendMarkers();
        },
        toggleFriendMarkers() {
            this.friendMarkers.forEach(marker => {
                if (this.showFriendsOnMap) marker.addTo(this.map);
                else marker.remove();
            });
        },
        updateEventMarkers() {
            if (!this.map) return;
            this.eventMarkers.forEach(marker => marker.remove());
            this.eventMarkers = [];
            this.events.forEach(event => {
                if (event.upvotes?.includes(this.user.uid)) {
                    const marker = L.marker([event.lat, event.lng], { icon: this.createMarkerIcon('purple', 'fa-star') });
                    marker.bindPopup(`<b>${event.name}</b><br>${event.address}`).addTo(this.map);
                    this.eventMarkers.push(marker);
                }
            });
        },
        createMarkerIcon(color, iconClass = '') {
            const iconHtml = iconClass ? `<div style="background-color: ${color};" class="custom-marker-icon"><i class="fas ${iconClass}"></i></div>` : `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`;
            return L.divIcon({ html: iconHtml, className: 'custom-map-icon-container', iconSize: [28, 28], iconAnchor: [14, 14] });
        },

        // ----- FRIENDS -----
        async sendFriendRequest() {
            if (!this.friendIdInput.trim() || this.friendIdInput.trim() === this.user.uid) {
                return alert("Ungültige User-ID.");
            }
            const recipientId = this.friendIdInput.trim();
            const request = {
                from: this.user.uid,
                fromEmail: this.user.email,
                fromDisplayName: this.userData.displayName || this.user.email,
                to: recipientId,
                status: 'pending',
                createdAt: new Date(),
                participants: [this.user.uid, recipientId]
            };
            await firebase.firestore().collection('friend_requests').add(request);
            alert('Freundschaftsanfrage gesendet!');
            this.friendIdInput = '';
        },
        listenForFriendRequests() {
            if (!this.user.uid) return;
            const unsub = firebase.firestore().collection('friend_requests')
                .where('participants', 'array-contains', this.user.uid)
                .onSnapshot(snapshot => {
                    this.friendRequests = snapshot.docs
                        .map(doc => ({ id: doc.id, ...doc.data() }))
                        .filter(req => req.to === this.user.uid && req.status === 'pending');
                }, error => {
                    console.error("Fehler beim Abrufen der Freundschaftsanfragen:", error);
                });
            this.firestoreListeners.push(unsub);
        },
        async acceptRequest(request) {
            const db = firebase.firestore();
            const batch = db.batch();
            batch.update(db.collection('friend_requests').doc(request.id), { status: 'accepted' });
            batch.update(db.collection('users').doc(this.user.uid), { friends: firebase.firestore.FieldValue.arrayUnion(request.from) });
            await batch.commit();
        },
        async declineRequest(requestId) {
            await firebase.firestore().collection('friend_requests').doc(requestId).update({ status: 'declined' });
        },
        listenForFriends() {
            const unsub = firebase.firestore().collection('users').doc(this.user.uid)
                .onSnapshot(async (doc) => {
                    if (doc.exists && doc.data().friends?.length > 0) {
                        const friendDocs = await Promise.all(doc.data().friends.map(id => firebase.firestore().collection('users').doc(id).get()));
                        this.friends = friendDocs.filter(fDoc => fDoc.exists).map(fDoc => ({ id: fDoc.id, ...fDoc.data() }));
                    } else {
                        this.friends = [];
                    }
                    this.updateFriendMarkers();
                });
            this.firestoreListeners.push(unsub);
        },

        // ----- EVENTS -----
        listenForEvents() {
            const unsub = firebase.firestore().collection('events').orderBy('name')
                .onSnapshot(snapshot => {
                    this.events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                });
            this.firestoreListeners.push(unsub);
        },
        async voteEvent(eventId, voteType) {
            const eventRef = firebase.firestore().collection('events').doc(eventId);
            const uid = this.user.uid;
            return firebase.firestore().runTransaction(async (transaction) => {
                const doc = await transaction.get(eventRef);
                if (!doc.exists) throw "Event does not exist!";
                const upvotes = doc.data().upvotes || [];
                const downvotes = doc.data().downvotes || [];
                const hasUpvoted = upvotes.includes(uid);
                const hasDownvoted = downvotes.includes(uid);

                if (voteType === 'up') {
                    if (hasUpvoted) {
                        transaction.update(eventRef, { upvotes: firebase.firestore.FieldValue.arrayRemove(uid) });
                    } else {
                        transaction.update(eventRef, {
                            upvotes: firebase.firestore.FieldValue.arrayUnion(uid),
                            downvotes: firebase.firestore.FieldValue.arrayRemove(uid)
                        });
                    }
                } else if (voteType === 'down') {
                    if (hasDownvoted) {
                        transaction.update(eventRef, { downvotes: firebase.firestore.FieldValue.arrayRemove(uid) });
                    } else {
                        transaction.update(eventRef, {
                            downvotes: firebase.firestore.FieldValue.arrayUnion(uid),
                            upvotes: firebase.firestore.FieldValue.arrayRemove(uid)
                        });
                    }
                }
            });
        },

        // ----- THC CALCULATOR -----
        calculateThcAbbau() {
            const { gender, age, weight, bodyFat, frequency, amount, thcPercentage, lastConsumption } = this.thcCalc;
            if (!lastConsumption || !age || !weight || !bodyFat || !amount || !thcPercentage) {
                return alert("Bitte alle Felder korrekt ausfüllen.");
            }
            const now = new Date();
            const consumptionDate = new Date(lastConsumption);
            const hoursPassed = (now - consumptionDate) / (1000 * 60 * 60);
            if (hoursPassed < 0) {
                return alert("Der Zeitpunkt des Konsums kann nicht in der Zukunft liegen.");
            }
            const totalThcMg = amount * 1000 * (thcPercentage / 100);
            const bioavailability = 0.25;
            const absorbedThcMg = totalThcMg * bioavailability;
            const leanBodyMass = weight * (1 - (bodyFat / 100));
            const cPeakEffective = (absorbedThcMg / leanBodyMass) * 3;
            let baseHalfLife;
            switch (frequency) {
                case 'once': baseHalfLife = 20; break;
                case 'often': baseHalfLife = 40; break;
                case 'daily': baseHalfLife = 70; break;
                default: baseHalfLife = 20;
            }
            const halfLife = baseHalfLife * (1 + (bodyFat - 20) / 100);
            const k = 0.693 / halfLife;
            const currentConcentration = cPeakEffective * Math.exp(-k * hoursPassed);
            const finalValue = currentConcentration.toFixed(2);
            this.thcCalc.result.value = finalValue;
            if (finalValue > 3.5) {
                this.thcCalc.result.status = 'red';
                const hoursToWait = Math.log(currentConcentration / 3.5) / k;
                if (hoursToWait > 0) {
                    const h = Math.floor(hoursToWait);
                    const m = Math.round((hoursToWait - h) * 60);
                    this.thcCalc.result.waitTime = `${h} Stunden und ${m} Minuten`;
                } else {
                    this.thcCalc.result.waitTime = "0 Minuten";
                }
            } else if (finalValue >= 2.0) {
                this.thcCalc.result.status = 'orange';
                this.thcCalc.result.waitTime = null;
            } else {
                this.thcCalc.result.status = 'green';
                this.thcCalc.result.waitTime = null;
            }
        },

        // ----- CHAT -----
        openChat(friend) {
            if (this.activeChat.unsubscribe) this.activeChat.unsubscribe();
            const chatId = [this.user.uid, friend.id].sort().join('_');
            this.activeChat = { chatId: chatId, partner: friend, messages: [] };
            const unsub = firebase.firestore().collection('chats').doc(chatId)
                .collection('messages').orderBy('timestamp')
                .onSnapshot(snapshot => {
                    this.activeChat.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    this.scrollToBottom();
                });
            this.activeChat.unsubscribe = unsub;
        },
        closeChat() {
            if (this.activeChat.unsubscribe) this.activeChat.unsubscribe();
            this.activeChat = { chatId: null, partner: null, messages: [], unsubscribe: null };
        },
        async sendMessage() {
            if (!this.chatMessageInput.trim() || !this.activeChat.chatId) return;
            await firebase.firestore().collection('chats').doc(this.activeChat.chatId).collection('messages').add({
                senderId: this.user.uid,
                text: this.chatMessageInput,
                timestamp: new Date()
            });
            this.chatMessageInput = '';
        },
        scrollToBottom() {
            this.$nextTick(() => {
                const container = document.querySelector('.chat-messages');
                if (container) container.scrollTop = container.scrollHeight;
            });
        },

        // ----- NOTIFICATIONS -----
        toggleNotifications() { this.showNotifications = !this.showNotifications; },
        listenForNotifications() {
            const unsub = firebase.firestore().collection('notifications')
                .where('recipientId', '==', this.user.uid).orderBy('timestamp', 'desc').limit(10)
                .onSnapshot(snapshot => {
                    this.notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                });
            this.firestoreListeners.push(unsub);
        },
        async markNotificationAsRead(notification) {
            if (!notification.read) {
                await firebase.firestore().collection('notifications').doc(notification.id).update({ read: true });
            }
        },

        // ----- UTILITIES -----
        async shareProfile() {
            const shareData = {
                title: 'CannaTrack Freundeseinladung',
                text: `Füge mich bei CannaTrack hinzu! Meine User-ID ist: ${this.user.uid}`,
            };
            try {
                if (navigator.share) await navigator.share(shareData);
                else {
                    navigator.clipboard.writeText(this.user.uid);
                    alert("User-ID in die Zwischenablage kopiert!");
                }
            } catch (err) { console.error("Fehler beim Teilen:", err); }
        },
        formatTimestamp(firebaseTimestamp) {
            if (!firebaseTimestamp) return '';
            return firebaseTimestamp.toDate().toLocaleDateString('de-DE', { hour: '2-digit', minute: '2-digit' });
        }
    }
});
app.mount('#app');