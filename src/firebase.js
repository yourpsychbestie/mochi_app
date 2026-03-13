import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, serverTimestamp, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBkKnVX0kStBOrujGMFA_mUCmQmt2P245g",
  authDomain: "mochi-9e33a.firebaseapp.com",
  projectId: "mochi-9e33a",
  storageBucket: "mochi-9e33a.firebasestorage.app",
  messagingSenderId: "1019141628721",
  appId: "1:1019141628721:web:0c7d4b73b0f993e7390610"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── AUTH ───────────────────────────────────────────────
export const fbRegister = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);
export const fbLogin = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);
export const fbLogout = () => signOut(auth);
export const fbOnAuthChange = (cb) => onAuthStateChanged(auth, cb);

// ─── USER PROFILE ──────────────────────────────────────
export const fbSaveUser = (uid, data) =>
  setDoc(doc(db, "users", uid), data, { merge: true });
export const fbGetUser = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
};

// ─── COUPLE CODES ──────────────────────────────────────
export const fbSaveCode = (code, data) =>
  setDoc(doc(db, "codes", code), data, { merge: true });
export const fbGetCode = async (code) => {
  const snap = await getDoc(doc(db, "codes", code));
  return snap.exists() ? snap.data() : null;
};

// ─── PROGRESS ──────────────────────────────────────────
export const fbSaveProgress = (uid, data) =>
  setDoc(doc(db, "progress", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
export const fbGetProgress = async (uid) => {
  const snap = await getDoc(doc(db, "progress", uid));
  return snap.exists() ? snap.data() : null;
};

// ─── MESSAGES ──────────────────────────────────────────
export const fbSendMessage = (coupleCode, msg) =>
  addDoc(collection(db, "messages"), { ...msg, coupleCode, createdAt: serverTimestamp() });

export const fbListenMessages = (coupleCode, cb) => {
  const q = query(collection(db, "messages"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    msgs.sort((a, b) => new Date(b.time) - new Date(a.time));
    cb(msgs);
  }, (error) => {
    console.error("Messages listener error:", error);
    cb([]);
  });
};

// ─── RELATIONSHIP TEST ─────────────────────────────────
export const fbSaveTestAnswers = (coupleCode, who, scores) =>
  setDoc(doc(db, "tests", coupleCode), { [who]: scores, [`${who}Done`]: true, updatedAt: serverTimestamp() }, { merge: true });
export const fbListenTest = (coupleCode, cb) => {
  return onSnapshot(doc(db, "tests", coupleCode), snap => {
    cb(snap.exists() ? snap.data() : null);
  }, (error) => {
    console.error("Test listener error:", error);
    cb(null);
  });
};
export const fbResetTest = (coupleCode) =>
  setDoc(doc(db, "tests", coupleCode), { ownerDone: false, partnerDone: false }, { merge: true });

// ─── EXERCISE SESSIONS ─────────────────────────────────
export const fbListenExSession = (coupleCode, exId, cb) => {
  return onSnapshot(doc(db, "exSessions", `${coupleCode}_${exId}`), snap => {
    cb(snap.exists() ? snap.data() : null);
  }, (error) => {
    console.error("ExSession listener error:", error);
    cb(null);
  });
};
export const fbSendExMessage = (coupleCode, exId, msgData) =>
  setDoc(doc(db, "exSessions", `${coupleCode}_${exId}`), {
    messages: msgData.messages || [],
    step: msgData.step,
    updatedAt: serverTimestamp()
  }, { merge: true });
export const fbStartExSession = (coupleCode, exId, totalSteps) =>
  setDoc(doc(db, "exSessions", `${coupleCode}_${exId}`), {
    messages: [], step: 0, totalSteps, done: false, startedAt: serverTimestamp()
  });
export const fbCompleteExSession = (coupleCode, exId) =>
  setDoc(doc(db, "exSessions", `${coupleCode}_${exId}`), { done: true }, { merge: true });

// ─── SHARED BAMBOO (couple bank) ──────────────────────
export const fbListenBamboo = (coupleCode, cb) => {
  return onSnapshot(doc(db, "bamboo", coupleCode), snap => {
    cb(snap.exists() ? (snap.data().total || 0) : null);
  }, () => cb(null));
};
export const fbAddBamboo = (coupleCode, amount) =>
  setDoc(doc(db, "bamboo", coupleCode), {
    total: amount, updatedAt: serverTimestamp()
  }, { merge: false });
export const fbGetBamboo = async (coupleCode) => {
  const snap = await getDoc(doc(db, "bamboo", coupleCode));
  return snap.exists() ? (snap.data().total || 0) : 0;
};
// Increment bamboo atomically using a read-then-write
export const fbIncrementBamboo = async (coupleCode, delta) => {
  const snap = await getDoc(doc(db, "bamboo", coupleCode));
  const current = snap.exists() ? (snap.data().total || 0) : 0;
  const newTotal = Math.max(0, current + delta);
  await setDoc(doc(db, "bamboo", coupleCode), { total: newTotal, updatedAt: serverTimestamp() });
  return newTotal;
};

// ─── GRATITUD (synced entries) ─────────────────────────
export const fbAddGratitud = (coupleCode, entry) =>
  addDoc(collection(db, "gratitud"), { ...entry, coupleCode, createdAt: serverTimestamp() });
export const fbListenGratitud = (coupleCode, cb) => {
  const q = query(collection(db, "gratitud"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    cb(items);
  }, () => cb([]));
};

// ─── MOMENTOS (synced entries) ─────────────────────────
export const fbAddMomento = (coupleCode, entry) =>
  addDoc(collection(db, "momentos"), { ...entry, coupleCode, createdAt: serverTimestamp() });
export const fbListenMomentos = (coupleCode, cb) => {
  const q = query(collection(db, "momentos"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    cb(items);
  }, () => cb([]));
};

// ─── CONOCETE (synced Q&A) ─────────────────────────────
export const fbSaveConoce = (coupleCode, key, data) =>
  setDoc(doc(db, "conoce", `${coupleCode}_${key}`), { ...data, coupleCode, key, updatedAt: serverTimestamp() }, { merge: true });
export const fbListenConoce = (coupleCode, cb) => {
  const q = query(collection(db, "conoce"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const map = {};
    snap.docs.forEach(d => { map[d.data().key] = d.data(); });
    cb(map);
  }, () => cb({}));
};

// ─── LESSONS (both must read) ─────────────────────────
export const fbSaveLessonRead = (coupleCode, lessonId, who) =>
  setDoc(doc(db, "lessons", `${coupleCode}_${lessonId}`), {
    coupleCode, lessonId, [who]: true, updatedAt: serverTimestamp()
  }, { merge: true });
export const fbListenLessons = (coupleCode, cb) => {
  const q = query(collection(db, "lessons"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const map = {};
    snap.docs.forEach(d => { map[d.data().lessonId] = d.data(); });
    cb(map);
  }, () => cb({}));
};

// ─── NOTIFICATIONS ─────────────────────────────────────
export const fbSendNotif = (coupleCode, notif) =>
  addDoc(collection(db, "notifs"), { ...notif, coupleCode, createdAt: serverTimestamp(), read: false });
export const fbListenNotifs = (coupleCode, cb) => {
  const q = query(collection(db, "notifs"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    cb(items);
  }, () => cb([]));
};
export const fbMarkNotifRead = (notifId) =>
  setDoc(doc(db, "notifs", notifId), { read: true }, { merge: true });
