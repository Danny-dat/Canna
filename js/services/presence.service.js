// services/presence.service.js
import { db, FieldValue } from "./firebase-config.js";

// serverTimestamp() (kompatibel) oder Fallback auf Date
const TS = () => (FieldValue?.serverTimestamp?.() ?? new Date());

// ===== Interner Zustand =====
let _uid = null;
let _docRef = null;

let _heartbeatTimer = null;     // setInterval für regelmäßige Beats
let _flushTimer = null;         // Debounce-Timer für Sammel-Flush
let _everyMs = 60000;           // Standard: 60s statt 10s
let _jitterPct = 0.1;           // ±10% Jitter gegen Thundering Herd

// Pending-Patch, der zusammengefasst geschrieben wird
let _pending = {};              // zuletzt angefragte Änderungen (noch nicht gesendet)
let _lastSent = {};             // zuletzt gesendeter Zustand (zum Diffen)
let _lastHeartbeatAt = 0;       // letzte Heartbeat-Schreibzeit (clientseitig)
let _pauseWhenHidden = true;    // Heartbeats pausieren, wenn Tab hidden

// ===== Utils =====
function _clearIntervalSafe(timerRefName) {
  if (timerRefName && typeof timerRefName === "string") {
    if (globalThis[timerRefName]) {
      clearInterval(globalThis[timerRefName]);
      globalThis[timerRefName] = null;
    }
  }
}

function _clearTimer(t) {
  if (t) {
    clearTimeout(t);
  }
  return null;
}

function _withJitter(baseMs) {
  const jitter = 1 + (Math.random() * 2 - 1) * _jitterPct; // 0.9 .. 1.1
  return Math.max(500, Math.floor(baseMs * jitter));
}

// Merged Patch in Queue legen und Flush timen
function _queuePresenceUpdate(patch, flushDelayMs = 1500) {
  if (!_uid || !_docRef) return;

  // Patch zusammenführen
  _pending = { ..._pending, ...patch };

  // Debounce-Flush
  _flushTimer = _clearTimer(_flushTimer);
  _flushTimer = setTimeout(_flushNow, flushDelayMs);
}

// Tatsächlicher Schreibvorgang: diff _pending vs. _lastSent
async function _flushNow() {
  if (!_uid || !_docRef) return;
  const toSend = {};
  const keys = Object.keys(_pending);

  // Nur Felder senden, die sich geändert haben
  for (const k of keys) {
    const newVal = _pending[k];
    const oldVal = _lastSent[k];

    // serverTimestamp() ist eine Sende-Absicht – immer senden
    const isServerTs =
      typeof newVal === "object" &&
      newVal &&
      typeof newVal.toString === "function" &&
      String(newVal).includes("FieldValue.serverTimestamp");

    if (isServerTs) {
      toSend[k] = newVal;
      continue;
    }

    // Primitive Gleichheit checken (für Objekte könnte man tief vergleichen;
    // hier reichen Primitive/kleine Felder)
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      toSend[k] = newVal;
    }
  }

  // Nichts zu senden?
  if (Object.keys(toSend).length === 0) {
    return;
  }

  try {
    await _docRef.set(toSend, { merge: true });
    // Erfolgreich → lastSent aktualisieren und pending leeren (nur gesendete Felder)
    _lastSent = { ..._lastSent, ...toSend };
    // Aus _pending die gesendeten Felder entfernen (falls parallel weitere Änderungen kamen)
    for (const k of Object.keys(toSend)) {
      delete _pending[k];
    }
  } catch (e) {
    console.warn("[presence] flush failed:", e);
    // Bei Fehler: pending stehen lassen – nächster Flush versucht es erneut
  }
}

// Sichtbarkeit (Tab aktiv/inaktiv) → Heartbeat pausieren/fortsetzen
function _onVisibilityChange() {
  if (!_uid) return;
  if (document.hidden && _pauseWhenHidden) {
    // pausieren
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  } else {
    // wieder aktiv → sofortiger Beat + Intervall neu starten
    _enqueueHeartbeat(true);
    _ensureHeartbeatInterval();
  }
}

function _ensureHeartbeatInterval() {
  if (!_uid || _heartbeatTimer) return;
  const delay = _withJitter(_everyMs);
  _heartbeatTimer = setInterval(() => _enqueueHeartbeat(false), delay);
}

// Heartbeat anfordern (throttled)
function _enqueueHeartbeat(forceImmediate) {
  const now = Date.now();
  const minGap = Math.max(2000, _everyMs * 0.5); // innerhalb des Intervalls nicht „spammen“

  if (!forceImmediate && now - _lastHeartbeatAt < minGap) {
    return; // zu früh → skip
  }
  _lastHeartbeatAt = now;

  _queuePresenceUpdate({ heartbeatAt: TS() }, forceImmediate ? 0 : 500);
}

// ===== Öffentliches API =====

/**
 * Optionales Rich-Presence-Feld: Wer ist gerade in welchem Chat aktiv?
 * → keine direkten DB-Writes; wird koalesziert geflusht
 */
export function setActiveChat(uid, chatIdOrNull) {
  if (!uid || uid !== _uid || !_docRef) return;
  _queuePresenceUpdate({
    activeChatId: chatIdOrNull || null,
    // lastSeenAt nur bei „echter“ Aktivität aktualisieren
    lastSeenAt: TS(),
  }, 400);
}

/**
 * zeigt an, ob der Nutzer gerade im Global-Chat ist (koalesziert)
 */
export function setGlobalChatActive(uid, isActive) {
  if (!uid || uid !== _uid || !_docRef) return;
  _queuePresenceUpdate({
    activeGlobalChat: !!isActive,
    lastSeenAt: TS(),
  }, 400);
}

/**
 * Startet den Heartbeat.
 * - schreibt NICHT mehr sofort hart mehrfach, sondern:
 *   1) setzt initialen Beat (ein Write, koalesziert)
 *   2) danach Intervalle mit Throttling + Jitter
 *   3) pausiert im Hintergrund-Tab, resumed bei Sichtbarkeit
 *
 * @param {string} uid
 * @param {number} everyMs  Intervall (Default 60000)
 * @param {object} opts     { pauseWhenHidden?: boolean, jitterPct?: number }
 */
export function startPresenceHeartbeat(uid, everyMs = 60000, opts = {}) {
  stopPresenceHeartbeat(); // Safety
  if (!uid) return;

  _uid = uid;
  _docRef = db.collection("presence").doc(uid);

  _everyMs = Math.max(1000, Number(everyMs) || 60000);
  _pauseWhenHidden = opts.pauseWhenHidden ?? true;
  _jitterPct = Math.min(0.5, Math.max(0, Number(opts.jitterPct ?? _jitterPct)));

  // Sichtbarkeitslistener
  document.removeEventListener("visibilitychange", _onVisibilityChange);
  document.addEventListener("visibilitychange", _onVisibilityChange);

  // Initial sichtbar machen → ein koaleszierter Write
  _queuePresenceUpdate({
    heartbeatAt: TS(),
    lastSeenAt: TS(),
  }, 0);

  // Intervall aktivieren
  _ensureHeartbeatInterval();

  // Sofortiger zusätzlicher Beat ist nicht nötig – Queue flushen reicht
}

/**
 * Stoppt den Heartbeat und macht den User „sofort“ offline.
 * Versucht das Dokument zu löschen; bei Fehlern fällt es auf „stale“ zurück.
 */
export async function stopPresenceHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  document.removeEventListener("visibilitychange", _onVisibilityChange);

  // Ausstehende Flushes abbrechen (wir löschen/markieren gleich direkt)
  _flushTimer = _clearTimer(_flushTimer);
  _pending = {};

  if (!_uid || !_docRef) {
    _uid = null;
    _docRef = null;
    _lastSent = {};
    return;
  }

  try {
    await _docRef.delete(); // sofort offline
  } catch (e) {
    console.warn("[presence] delete failed, fallback to stale:", e);
    try {
      await _docRef.set(
        { heartbeatAt: new Date(0), lastSeenAt: TS() },
        { merge: true }
      );
    } catch (e2) {
      console.warn("[presence] stale fallback failed:", e2);
    }
  } finally {
    _uid = null;
    _docRef = null;
    _lastSent = {};
  }
}
