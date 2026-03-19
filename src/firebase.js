import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, serverTimestamp, orderBy, runTransaction, getDocs, writeBatch, deleteDoc, limit } from "firebase/firestore";

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

// Keep users signed in across app restarts until they explicitly log out.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence setup warning:", err?.message || err);
});

// ─── AUTH ───────────────────────────────────────────────
export const fbRegister = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);
export const fbLogin = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);
export const fbLogout = () => signOut(auth);
export const fbOnAuthChange = (cb) => onAuthStateChanged(auth, cb);
export const fbDeleteCurrentUser = () =>
  auth.currentUser ? deleteUser(auth.currentUser) : Promise.resolve();

const deleteByCoupleCode = async (collectionName, coupleCode) => {
  while (true) {
    const q = query(
      collection(db, collectionName),
      where("coupleCode", "==", coupleCode),
      limit(200)
    );
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    if (snap.size < 200) break;
  }
};

// Cleanup Firestore data before deleting the authenticated account.
// - Owner: removes couple-scoped documents and the code document.
// - Partner: only unlinks partner slot from code to avoid deleting the owner's data.
export const fbCleanupBeforeAccountDelete = async ({ uid, code, isOwner }) => {
  if (!uid) return;

  await Promise.allSettled([
    deleteDoc(doc(db, "users", uid)),
    deleteDoc(doc(db, "progress", uid)),
  ]);

  if (!code) return;

  if (isOwner) {
    await Promise.allSettled([
      deleteDoc(doc(db, "bamboo", code)),
      deleteDoc(doc(db, "garden", code)),
      deleteDoc(doc(db, "tests", code)),
      deleteDoc(doc(db, "streaks", code)),
      deleteDoc(doc(db, "codes", code)),
    ]);

    const coupleCollections = [
      "messages",
      "gratitud",
      "momentos",
      "conoce",
      "lessons",
      "burbuja",
      "notifs",
      "streakInteractions",
    ];

    for (const name of coupleCollections) {
      await deleteByCoupleCode(name, code);
    }
    return;
  }

  const codeRef = doc(db, "codes", code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(codeRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    if (data.partnerUid && data.partnerUid !== uid) return;

    const ownerName = String(data.names || "Nosotros").split(" & ")[0].trim() || "Nosotros";
    tx.set(codeRef, {
      partnerUid: null,
      partnerEmail: null,
      names: `${ownerName} & ?`,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
};

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
export const fbListenCode = (code, cb) => {
  if (!code) return () => {};
  return onSnapshot(doc(db, "codes", code), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  }, () => cb(null));
};

export const fbFindCodeByUid = async (uid) => {
  if (!uid) return null;

  const ownerQ = query(collection(db, "codes"), where("ownerUid", "==", uid), limit(1));
  const ownerSnap = await getDocs(ownerQ);
  if (!ownerSnap.empty) {
    const d = ownerSnap.docs[0];
    return { code: d.id, ...(d.data() || {}) };
  }

  const partnerQ = query(collection(db, "codes"), where("partnerUid", "==", uid), limit(1));
  const partnerSnap = await getDocs(partnerQ);
  if (!partnerSnap.empty) {
    const d = partnerSnap.docs[0];
    return { code: d.id, ...(d.data() || {}) };
  }

  return null;
};

// Create an owner code only when it does not already exist.
export const fbCreateCodeOwner = async (code, data) => {
  const ref = doc(db, "codes", code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error("CODE_TAKEN");
    tx.set(ref, { ...data, updatedAt: serverTimestamp() }, { merge: false });
    return { code, ...data };
  });
};

// Claim partner slot atomically, preventing accidental overwrite by a third account.
export const fbClaimPartnerCode = async (code, partner) => {
  const ref = doc(db, "codes", code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("CODE_NOT_FOUND");

    const data = snap.data() || {};
    if (data.partnerUid && data.partnerUid !== partner.partnerUid) {
      throw new Error("CODE_ALREADY_LINKED");
    }

    const ownerName = String(data.names || "?").split(" & ")[0].trim() || "?";
    const partnerName = String(partner.partnerName || "?").trim() || "?";
    const names = `${ownerName} & ${partnerName}`;

    tx.set(ref, {
      names,
      partnerEmail: partner.partnerEmail,
      partnerUid: partner.partnerUid,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      ...data,
      names,
      ownerUid: data.ownerUid || null,
      since: data.since || "Juntos desde hoy",
    };
  });
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
    msgs.sort((a, b) => {
      const aTime = a?.time ? new Date(a.time).getTime() : 0;
      const bTime = b?.time ? new Date(b.time).getTime() : 0;
      return bTime - aTime;
    });
    cb(msgs);
  }, (error) => {
    console.error("Messages listener error:", error);
    cb(null);
  });
};

// ─── RELATIONSHIP TEST ─────────────────────────────────
export const fbSaveTestAnswers = (coupleCode, who, scores) =>
  setDoc(doc(db, "tests", coupleCode), { [who]: scores, [`${who}Done`]: true, updatedAt: serverTimestamp() }, { merge: true });
export const fbGetTest = async (coupleCode) => {
  const snap = await getDoc(doc(db, "tests", coupleCode));
  return snap.exists() ? snap.data() : null;
};
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
    coupleCode,
    messages: msgData.messages || [],
    step: msgData.step,
    starterRole: msgData.starterRole,
    updatedAt: serverTimestamp()
  }, { merge: true });
export const fbStartExSession = (coupleCode, exId, totalSteps, starterRole) =>
  setDoc(doc(db, "exSessions", `${coupleCode}_${exId}`), {
    coupleCode,
    messages: [], step: 0, totalSteps, done: false, starterRole, startedAt: serverTimestamp()
  });
export const fbCompleteExSession = (coupleCode, exId) =>
  setDoc(doc(db, "exSessions", `${coupleCode}_${exId}`), { coupleCode, done: true }, { merge: true });

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
// Increment bamboo with a Firestore transaction to avoid lost updates.
export const fbIncrementBamboo = async (coupleCode, delta) => {
  const ref = doc(db, "bamboo", coupleCode);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().total || 0) : 0;
    const newTotal = Math.max(0, current + delta);
    tx.set(ref, { total: newTotal, updatedAt: serverTimestamp() }, { merge: true });
    return newTotal;
  });
};

// Spend bamboo atomically; throws "INSUFFICIENT_BAMBOO" when funds are not enough.
export const fbSpendBamboo = async (coupleCode, amount) => {
  const ref = doc(db, "bamboo", coupleCode);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().total || 0) : 0;
    if (current < amount) throw new Error("INSUFFICIENT_BAMBOO");
    const newTotal = current - amount;
    tx.set(ref, { total: newTotal, updatedAt: serverTimestamp() }, { merge: true });
    return newTotal;
  });
};

// ─── SHARED GARDEN STATE ──────────────────────────────
export const fbSaveGardenState = (coupleCode, data) =>
  setDoc(doc(db, "garden", coupleCode), {
    ...data,
    coupleCode,
    updatedAt: serverTimestamp()
  }, { merge: true });

export const fbListenGardenState = (coupleCode, cb) =>
  onSnapshot(doc(db, "garden", coupleCode), snap => {
    cb(snap.exists() ? snap.data() : null);
  }, () => cb(null));

export const fbPurchaseGardenUpdate = async (coupleCode, amount, data) => {
  const bambooRef = doc(db, "bamboo", coupleCode);
  const gardenRef = doc(db, "garden", coupleCode);
  return runTransaction(db, async (tx) => {
    const bambooSnap = await tx.get(bambooRef);
    const current = bambooSnap.exists() ? (bambooSnap.data().total || 0) : 0;
    if (current < amount) throw new Error("INSUFFICIENT_BAMBOO");
    const newTotal = current - amount;
    tx.set(bambooRef, { total: newTotal, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(gardenRef, {
      ...data,
      coupleCode,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return newTotal;
  });
};

// ─── GRATITUD (synced entries) ─────────────────────────
export const fbAddGratitud = (coupleCode, entry) =>
  addDoc(collection(db, "gratitud"), { ...entry, coupleCode, createdAt: serverTimestamp() });
export const fbSaveGratitudEntry = (entryId, coupleCode, data) =>
  setDoc(doc(db, "gratitud", entryId), { ...data, coupleCode, updatedAt: serverTimestamp() }, { merge: true });
export const fbListenGratitud = (coupleCode, cb) => {
  const q = query(collection(db, "gratitud"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
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
    items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
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

// ─── BURBUJA (synced agreements workflow) ─────────────
export const fbSaveBurbuja = (coupleCode, key, data) =>
  setDoc(doc(db, "burbuja", `${coupleCode}_${key}`), {
    ...data,
    coupleCode,
    key,
    updatedAt: serverTimestamp()
  }, { merge: true });

export const fbListenBurbuja = (coupleCode, cb) => {
  const q = query(collection(db, "burbuja"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const map = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (data?.key) map[data.key] = data;
    });
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

// ─── STREAKS (daily interactions + summary profile) ───────────────
export const fbSaveStreakInteraction = (coupleCode, date, type, completed = true, extra = {}) =>
  setDoc(doc(db, "streakInteractions", `${coupleCode}_${date}_${type}`), {
    coupleCode,
    date,
    type,
    completed,
    ...extra,
    updatedAt: serverTimestamp()
  }, { merge: true });

export const fbListenStreakInteractions = (coupleCode, cb) => {
  const q = query(collection(db, "streakInteractions"), where("coupleCode", "==", coupleCode));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(items);
  }, () => cb([]));
};

export const fbSaveStreakProfile = (coupleCode, data) =>
  setDoc(doc(db, "streaks", coupleCode), {
    ...data,
    coupleCode,
    updatedAt: serverTimestamp()
  }, { merge: true });

export const fbListenStreakProfile = (coupleCode, cb) =>
  onSnapshot(doc(db, "streaks", coupleCode), snap => {
    cb(snap.exists() ? snap.data() : null);
  }, () => cb(null));
