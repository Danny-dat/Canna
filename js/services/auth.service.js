// js/services/auth.service.js
import { auth } from './firebase-config.js';

export function register({ email, password }) {
  return auth.createUserWithEmailAndPassword(email, password);
}

export function login({ email, password }) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function logout() {
  return auth.signOut();
}
