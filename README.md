🌿 CannaTrack

CannaTrack ist eine private Web-App zum Konsum-Tracking, Freundeverwaltung und Chatten.
Sie wurde mit Firebase (Auth + Firestore) und Vue.js entwickelt und bietet eine saubere, responsive Oberfläche.

🚀 Features
🗺️ Dashboard

Interaktive Map mit Konsum-Markern

Live-Freundesmarker

Automatische Aktualisierung

🌿 Konsum-Tracking

Konsum-Einträge mit Datum, Uhrzeit und optionalem Standort

Tageslimit-Warnung + Benachrichtigung

Freunde werden benachrichtigt, wenn das Limit erreicht wird

👥 Freunde

Freundschaftsanfragen senden, annehmen und ablehnen

Freunde entfernen oder blockieren

Live-Updates der Freundesliste

💬 Chat

1:1-Chat mit Live-Nachrichten

Auto-Scroll & schicke Eingabeleiste

Präsenz-Anzeige (wer gerade aktiv ist)

Benachrichtigungen bei neuen Nachrichten (per Klick direkt in den Chat)

Gelesen-Markierung vorbereitet

🔔 Benachrichtigungen

Für Chat- und Freundesereignisse

Unterdrückung von Chat-Notis, wenn man bereits in diesem Chat aktiv ist

📊 Statistik

Darstellung der eigenen Konsum-Statistiken

🧮 THC-Rechner

Berechnet geschätzten THC-Abbau und Wartezeit

👤 Meine Daten

Anzeigename, Telefonnummer und Theme einstellbar

Öffentliches Profil wird automatisch mit gepflegt

🏠 Startseite

Zeigt den Nutzernamen an

Schnell-Logout-Button

🛠️ Installation & Start
1️⃣ Voraussetzungen

VS Code

Extension Live Server (von Ritwick Dey)

Firebase-Projekt (Firestore + Auth aktiviert)

2️⃣ Installation
# Repository klonen
git clone https://github.com/dein-user/cannatrack.git
cd cannatrack


Es sind keine weiteren Build-Schritte notwendig – das Projekt ist komplett in Plain HTML/JS/CSS lauffähig.

3️⃣ Firebase einrichten

In der Firebase Console ein Projekt anlegen

Firestore & Authentication aktivieren

firebaseConfig in services/firebase-config.js mit den Projekt-Daten füllen

Firestore-Sicherheitsregeln aus firestore.rules übernehmen

4️⃣ Starten mit VS Code

Projekt in VS Code öffnen

Rechtsklick auf index.html → "Open with Live Server"

App läuft nun z. B. unter http://127.0.0.1:5500 oder http://localhost:5500

🏗️ Technologien

Frontend: Vue 3 (CDN-Version, ohne Build-Step)

Backend: Firebase (Firestore, Auth)

Styling: CSS Custom Properties (Dark-/Light-Theme)

Realtime: Firestore Subscriptions + Presence-Heartbeat

📌 Offene Punkte

Events-Bereich fertigstellen (Liste, Up-/Downvotes, Map-Integration)

Unread-Zähler im Chat umsetzen

Noti-Throttle noch feiner abstimmen

💡 Hinweis

Die App ist aktuell privat gedacht und nicht öffentlich zugänglich.
Bei einem Deployment auf Hosting-Diensten bitte Firestore-Regeln prüfen und ggf. restriktiver gestalten.