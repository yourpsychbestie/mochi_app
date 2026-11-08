import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fbRegister, fbLogin, fbLogout, fbOnAuthChange,
  fbDeleteCurrentUser,
  fbCleanupBeforeAccountDelete,
  fbSaveUser, fbGetUser,
  fbGetCode, fbListenCode, fbCreateCodeOwner, fbClaimPartnerCode, fbFindCodeByUid,
  fbSaveProgress, fbGetProgress,
  fbSendMessage, fbListenMessages,
  fbSaveTestAnswers, fbListenTest, fbResetTest,
  fbListenExSession, fbSendExMessage, fbStartExSession, fbCompleteExSession,
  fbListenBamboo, fbIncrementBamboo, fbSpendBamboo, fbGetBamboo,
  fbSaveGardenState, fbListenGardenState, fbPurchaseGardenUpdate,
  fbAddGratitud, fbListenGratitud,
  fbAddMomento, fbListenMomentos,
  fbSaveConoce, fbListenConoce,
  fbSaveLessonRead, fbListenLessons,
  fbSaveBurbuja, fbListenBurbuja,
  fbSendNotif, fbListenNotifs, fbMarkNotifRead,
  fbSaveStreakInteraction, fbListenStreakInteractions,
  fbSaveStreakProfile, fbListenStreakProfile,
  fbSaveDailyAnswer,
} from "./firebase";
import Cuestionarios, { QUIZZES } from "./Cuestionarios";
import DailySeedModal, { useDailySeed } from "./DailySeedModal";
import { DAILY_SEED_BAMBOO_REWARD, getDateKeyLocal } from "./dailySeed";
import LessonCardWizard from "./components/LessonCardWizard";

// Prevents the fbOnAuthChange listener from calling afterLogin while doReg/doJoin
// is actively handling a fresh registration (avoids race conditions on new sign-ups).
let _pendingLocalAuth = false;

// Lightweight toast helper usable outside the main component (e.g. copy-code buttons).
// The main component overrides this with its own state-driven toast when mounted.
let _showToast = (msg) => {
  if (typeof window !== "undefined" && window.Capacitor?.Plugins?.Toast) {
    window.Capacitor.Plugins.Toast.show({ text: msg, duration: "short" });
    return;
  }
  if (typeof window !== "undefined") {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(58,42,82,0.92);color:#faf7fc;padding:10px 16px;border-radius:999px;fontSize:0.85rem;z-index:9999;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.2);";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }
};

export const setGlobalToast = (fn) => { _showToast = fn; };
const showToast = (msg) => { if (msg) _showToast(msg); };

const C = {
  cream:"#ded0f2", cream2:"#f8f3fc", dark:"#3f2f5a",
  olive:"#8b6fc9", oliveL:"#b8a0e8", gold:"#d9a441",
  salmon:"#e8608c", sky:"#8b9fe0", sand:"#ddc9f0", sandL:"#f3ecfb",
  white:"#faf7fc", ink:"#3a2a52", inkM:"#6b5a87", inkL:"#9c8cb5",
  border:"rgba(58,42,82,0.16)", line:"rgba(58,42,82,0.09)",
  pink:"#e8c4f0", rose:"#c77fc2",
  mint:"#c8e8c0", teal:"#4f8a6e",
};

const ls = {
  get:(k)=>{ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} },
  set:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};

const MAX_MESSAGE_LENGTH = 220;
const BUBBLE_PREVIEW_LENGTH = 38;

const toJsDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d?.getTime?.()) ? null : d;
  }
  if (typeof value?.seconds === "number") {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const getWeekStartUtc = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as week start
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
};

const getWeeklyStreak = (dates) => {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const activeWeekSet = new Set(
    dates
      .map(toJsDate)
      .filter(Boolean)
      .map(d => getWeekStartUtc(d).getTime())
  );
  if (!activeWeekSet.size) return 0;

  let streak = 0;
  let cursor = getWeekStartUtc(new Date()).getTime();

  if (!activeWeekSet.has(cursor)) {
    const sortedWeeks = [...activeWeekSet].sort((a, b) => b - a);
    cursor = sortedWeeks[0];
  }

  while (activeWeekSet.has(cursor)) {
    streak += 1;
    cursor -= weekMs;
  }

  return streak;
};

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
const STREAK_TYPES = {
  message: "Mensaje de amor",
  exercise: "Ejercicio o leccion",
  gratitude: "Gratitud",
  moment: "Momento especial",
  conoce: "Conózcanse",
  agreement: "Acuerdo en Burbuja",
  dailySeed: "Semilla del dia",
};

const STREAK_RESOURCES = [
  { type: "Articulo", title: "Escucha activa en pareja (5 minutos)", url: "https://www.gottman.com/blog/active-listening/" },
  { type: "Video", title: "Reparar conflictos con calidez", url: "https://www.youtube.com/watch?v=AKTyPgwfPgg" },
  { type: "Articulo", title: "Micro-habitos de conexion emocional", url: "https://positivepsychology.com/emotional-intimacy/" },
];

const addDaysToKey = (key, delta) => {
  const [y, m, d] = String(key).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  return getDateKeyLocal(dt);
};

const computeDailyStreakData = (interactions, prevLongest = 0) => {
  const cutoffKey = addDaysToKey(getDateKeyLocal(), -180);
  const sorted = (interactions || [])
    .filter(i => i?.completed && i?.date && String(i.date) >= cutoffKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const byDate = {};
  sorted.forEach(i => {
    if (!byDate[i.date]) byDate[i.date] = [];
    byDate[i.date].push(i);
  });

  const dates = Object.keys(byDate).sort();
  const todayKey = getDateKeyLocal();
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const anchor = byDate[todayKey] ? todayKey : (byDate[yesterdayKey] ? yesterdayKey : null);

  let currentStreak = 0;
  if (anchor) {
    let cursor = anchor;
    while (byDate[cursor]) {
      currentStreak += 1;
      cursor = addDaysToKey(cursor, -1);
    }
  }

  let longestStreak = Math.max(0, prevLongest);
  if (dates.length) {
    let run = 1;
    longestStreak = Math.max(longestStreak, 1);
    for (let i = 1; i < dates.length; i += 1) {
      run = dates[i] === addDaysToKey(dates[i - 1], 1) ? run + 1 : 1;
      if (run > longestStreak) longestStreak = run;
    }
  }

  const unlockedMilestones = STREAK_MILESTONES.filter(m => currentStreak >= m);
  const nextMilestone = STREAK_MILESTONES.find(m => m > currentStreak) || null;
  const previousMilestone = [...STREAK_MILESTONES].reverse().find(m => m <= currentStreak) || 0;
  const denom = nextMilestone ? Math.max(1, nextMilestone - previousMilestone) : 1;
  const numer = nextMilestone ? currentStreak - previousMilestone : 1;
  const progressPct = nextMilestone ? Math.max(0, Math.min(100, Math.round((numer / denom) * 100))) : 100;

  return {
    byDate,
    todayKey,
    todayDone: !!byDate[todayKey],
    currentStreak,
    longestStreak,
    unlockedMilestones,
    nextMilestone,
    progressPct,
  };
};

const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

const computeStreakAnalytics = (interactions) => {
  const byDate = {};
  (interactions || []).forEach(i => {
    if (!i?.completed || !i?.date) return;
    byDate[i.date] = (byDate[i.date] || 0) + 1;
  });

  const getWindowKeys = (days, offset = 0) => {
    const keys = [];
    for (let i = days - 1 + offset; i >= offset; i -= 1) {
      keys.push(addDaysToKey(getDateKeyLocal(), -i));
    }
    return keys;
  };

  const last7 = getWindowKeys(7, 0);
  const prev7 = getWindowKeys(7, 7);
  const last30 = getWindowKeys(30, 0);

  const active7 = last7.filter(k => !!byDate[k]).length;
  const activePrev7 = prev7.filter(k => !!byDate[k]).length;
  const active30 = last30.filter(k => !!byDate[k]).length;

  const retention7 = Math.round((active7 / 7) * 100);
  const retention30 = Math.round((active30 / 30) * 100);
  const trendDeltaDays = active7 - activePrev7;

  const weekdayCounts = Array(7).fill(0);
  last30.forEach(k => {
    if (!byDate[k]) return;
    const [y, m, d] = k.split("-").map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    weekdayCounts[wd] += 1;
  });

  const weekdaySeries = WEEKDAY_NAMES.map((name, idx) => ({ name, value: weekdayCounts[idx] }));
  const minVal = Math.min(...weekdayCounts);
  const weakest = weekdaySeries.find(w => w.value === minVal) || { name: "-", value: 0 };

  return {
    retention7,
    retention30,
    trendDeltaDays,
    active7,
    active30,
    weekdaySeries,
    weakestWeekday: weakest,
  };
};

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("Section render error:", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

const getMyName = (user, fallback = "Yo") => {
  const parts = String(user?.names || "")
    .split("&")
    .map(s => s.trim())
    .filter(Boolean);
  if (user?.isOwner === false) return parts[1] || parts[0] || fallback;
  return parts[0] || parts[1] || fallback;
};

const getCoupleNames = (user) => {
  const raw = String(user?.names || "").trim();
  // Generic fallback names should not collapse to "Nosotros" for both partners
  const isGeneric = !raw || raw.toLowerCase() === "nosotros" || raw.toLowerCase() === "tu & yo";
  const parts = isGeneric
    ? ["Persona A", "Persona B"]
    : raw
      .split("&")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    nameA: parts[0] || "Persona A",
    nameB: parts[1] || parts[0] || "Persona B",
  };
};

// ═══════════════════════════════════════════════
// EXERCISE GAMIFICATION HELPERS
// ═══════════════════════════════════════════════
function computeSkillLevels(exDone) {
  const xp = {};
  Object.keys(EXERCISE_SKILLS).forEach(k => xp[k] = 0);
  EXERCISES.forEach(ex => {
    const count = exDone?.[ex.id] || 0;
    xp[ex.skill] += count * SKILL_XP_PER_EX;
  });
  const levels = {};
  Object.keys(xp).forEach(skill => {
    const v = xp[skill];
    let lvl = 0;
    while (lvl < SKILL_LEVELS.length - 1 && v >= SKILL_LEVELS[lvl + 1]) lvl++;
    const next = SKILL_LEVELS[lvl + 1] ?? Math.max(v, 1);
    const prev = SKILL_LEVELS[lvl] ?? 0;
    levels[skill] = {
      xp: v,
      level: lvl,
      nextXp: next,
      prevXp: prev,
      pct: next === prev ? 100 : Math.min(100, ((v - prev) / (next - prev)) * 100),
    };
  });
  return levels;
}

function getPathProgress(exDone) {
  const completed = EXERCISES.filter(ex => (exDone?.[ex.id] || 0) >= 1).length;
  const total = EXERCISES.length;
  return { completed, total, pct: total ? (completed / total) * 100 : 0 };
}

function getExercisesCompletedByBoth(exDone) {
  return EXERCISES.filter(ex => (exDone?.[ex.id] || 0) >= 1).length;
}

function getChestState(exDone, exChestState = {}) {
  const bothCount = getExercisesCompletedByBoth(exDone);
  const opened = exChestState?.opened || 0;
  const available = Math.max(0, Math.floor(bothCount / CHEST_INTERVAL) - opened);
  const nextAt = (opened + 1) * CHEST_INTERVAL;
  const progress = bothCount - opened * CHEST_INTERVAL;
  return { bothCount, opened, available, nextAt, progress, canOpen: available > 0 };
}

function getNextChestReward(openedCount) {
  return CHEST_REWARDS[openedCount % CHEST_REWARDS.length];
}

function getExerciseStreak(exStreak = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const last = exStreak?.lastDate;
  let count = exStreak?.count || 0;
  if (last && last !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (last !== yesterday.toISOString().slice(0, 10)) count = 0;
  }
  return { count, lastDate: last, today, active: last === today };
}

function getUnlockedZones(exDone) {
  const unlocked = [];
  for (let i = 0; i < EXERCISE_ZONES_ORDER.length; i++) {
    const zoneId = EXERCISE_ZONES_ORDER[i];
    unlocked.push(zoneId);
    const exercises = EXERCISES.filter(e => e.zone === zoneId);
    const allCompleted = exercises.length > 0 && exercises.every(e => (exDone?.[e.id] || 0) >= 1);
    if (!allCompleted) break;
  }
  return unlocked;
}

function getMyExRole(user) {
  return user?.isOwner !== false ? "owner" : "partner";
}

// ═══════════════════════════════════════════════
// GARDEN ITEMS — multiple quantities, koi/lotus aesthetic
// ═══════════════════════════════════════════════
const GARDEN_ITEMS = [
  // Plantas
  {id:"bamboo1",  cat:"plantas", name:"Bambú",        cost:20,  desc:"Trae serenidad"},
  {id:"bamboo2",  cat:"plantas", name:"Bambusal",      cost:35,  desc:"Bosquecito de bambú"},
  {id:"lotus1",   cat:"plantas", name:"Loto Rosa",     cost:25,  desc:"Flor del amor puro"},
  {id:"lotus2",   cat:"plantas", name:"Loto Blanco",   cost:30,  desc:"Pureza y paz"},
  {id:"willow",   cat:"plantas", name:"Sauce Llorón",  cost:45,  desc:"Elegancia serena"},
  {id:"peony",    cat:"plantas", name:"Peonía",        cost:15,  desc:"Flores de primavera"},
  {id:"cherry",   cat:"plantas", name:"Cerezo",        cost:80,  desc:"Belleza efímera"},
  {id:"lily",     cat:"plantas", name:"Lirio Azul",    cost:20,  desc:"Calma y claridad"},
  // Agua
  {id:"pond",     cat:"agua",    name:"Estanque",      cost:60,  desc:"Espejo del cielo"},
  {id:"koi1",     cat:"agua",    name:"Pez Koi Rojo",  cost:40,  desc:"Buena fortuna"},
  {id:"koi2",     cat:"agua",    name:"Pez Koi Dorado",cost:55,  desc:"Prosperidad"},
  {id:"lotus_pad",cat:"agua",    name:"Hoja de Loto",  cost:20,  desc:"Reposa en el agua"},
  // Cielo
  {id:"sun",      cat:"cielo",   name:"Sol",           cost:30,  desc:"Calienta el jardín"},
  {id:"rainbow",  cat:"cielo",   name:"Arcoíris",      cost:100, desc:"Magia después de la lluvia"},
  {id:"swallow1", cat:"cielo",   name:"Golondrina",    cost:35,  desc:"Mensajera del amor"},
  {id:"swallow2", cat:"cielo",   name:"Par de Golondrinas",cost:55,desc:"Vuelo juntos"},
  {id:"clouds",   cat:"cielo",   name:"Nubes",         cost:25,  desc:"Sueños flotantes"},
  // Decoración
  {id:"lantern",  cat:"deco",    name:"Farolito",      cost:25,  desc:"Luz cálida"},
  {id:"lantern2", cat:"deco",    name:"Farolitos",     cost:40,  desc:"Noche romántica"},
  {id:"heart",    cat:"deco",    name:"Corazón",       cost:50,  desc:"Amor visible"},
  {id:"bridge",   cat:"deco",    name:"Puente",        cost:70,  desc:"Un camino juntos"},
  {id:"pagoda",   cat:"deco",    name:"Pagoda",        cost:90,  desc:"Refugio sagrado"},
  // Especiales
  {id:"firefly",  cat:"especial",name:"Luciérnagas",   cost:65,  desc:"Magia nocturna"},
  {id:"moongate", cat:"especial",name:"Luna Llena",    cost:120, desc:"Romance bajo la luna"},
];

// Regar sigue siendo acción especial
const WATER_ACTION = {id:"water", name:"Regar", cost:5};

// ═══════════════════════════════════════════════
// PANDA ACCESSORIES
// ═══════════════════════════════════════════════
const PANDA_ACCESSORIES = [
  {id:"hat_flower", cat:"sombrero", name:"Corona de Flores", cost:40,  emoji:"🌸", desc:"Romanticísima"},
  {id:"hat_crown",  cat:"sombrero", name:"Corona Real",      cost:70,  emoji:"👑", desc:"Son reyes"},
  {id:"hat_straw",  cat:"sombrero", name:"Sombrero de Paja", cost:25,  emoji:"🎋", desc:"Para el jardín"},
  {id:"hat_beret",  cat:"sombrero", name:"Boina Chic",       cost:32,  emoji:"🧢", desc:"Tierna y elegante"},
  {id:"hat_beanie", cat:"sombrero", name:"Gorrito Nube",     cost:36,  emoji:"🧶", desc:"Suave y acogedor"},
  {id:"hat_frog",   cat:"sombrero", name:"Sombrero Ranita",  cost:45,  emoji:"🐸", desc:"Demasiado tierno"},
  {id:"glasses_heart", cat:"lentes", name:"Lentes Corazón", cost:30,  emoji:"💝", desc:"Ver con amor"},
  {id:"glasses_sun",   cat:"lentes", name:"Lentes de Sol",  cost:25,  emoji:"😎", desc:"Fresquísimos"},
  {id:"glasses_round", cat:"lentes", name:"Lentes Redondos", cost:28,  emoji:"🕶️", desc:"Estilo clásico"},
  {id:"glasses_clear", cat:"lentes", name:"Lentes Cristal",  cost:24,  emoji:"🤓", desc:"Suavecitos"},
  {id:"glasses_star",  cat:"lentes", name:"Lentes Estrella", cost:42,  emoji:"⭐", desc:"Brillo total"},
  {id:"acc_bow",    cat:"accesorio", name:"Moño Rosa",       cost:20,  emoji:"🎀", desc:"Muy tierno"},
  {id:"acc_scarf",  cat:"accesorio", name:"Bufanda",         cost:25,  emoji:"🧣", desc:"Para el frío"},
  {id:"outfit_kimono",  cat:"traje", name:"Kimono",          cost:60,  emoji:"👘", desc:"Elegancia japonesa"},
  {id:"outfit_sailor",  cat:"traje", name:"Marinero",         cost:55,  emoji:"⚓", desc:"Aventureros del mar"},
  {id:"outfit_witch",   cat:"traje", name:"Brujita",          cost:65,  emoji:"🧙", desc:"Magia y misterio"},
  {id:"outfit_angel",   cat:"traje", name:"Angelitos",        cost:80,  emoji:"👼", desc:"Purísimos"},
];


const EXERCISE_SKILLS = {
  comunicacion: { emoji: "🗣️", label: "Comunicación", color: "#5ab8c8", desc: "Hablar, escuchar y validar" },
  confianza:    { emoji: "🛡️", label: "Confianza",    color: "#7a9ad9", desc: "Vulnerabilidad y seguridad" },
  pasion:       { emoji: "🔥", label: "Pasión",       color: "#e8907a", desc: "Aprecio, deseo y juego" },
  calma:        { emoji: "🧘", label: "Calma",        color: "#8ac89a", desc: "Presencia y regulación" },
};

const EXERCISE_ZONES_ORDER = ["pradera","bosque","cueva","cumbre"];
const EXERCISE_ZONES = {
  pradera: { emoji: "🌱", label: "Pradera", color: "#d8f0c8", desc: "Ejercicios suaves para empezar" },
  bosque:  { emoji: "🌿", label: "Bosque del Diálogo", color: "#c8e8d8", desc: "Aprendan a hablar y escuchar" },
  cueva:   { emoji: "🕯️", label: "Cueva del Corazón",  color: "#f0e0d0", desc: "Más profundo, más íntimo" },
  cumbre:  { emoji: "🏔️", label: "Cumbre del Perdón",  color: "#d8e0f0", desc: "Sanar y cerrar heridas" },
};

const DIFFICULTY_EMOJI = { 1: "🌱", 2: "🌿", 3: "🌸" };
const DIFFICULTY_LABEL = { 1: "Semilla", 2: "Brote", 3: "Flor" };

// XP needed per skill level (cumulative thresholds)
const SKILL_XP_PER_EX = 25;
const SKILL_LEVELS = [0, 50, 120, 220, 350, 500];

// Chest configuration
const CHEST_INTERVAL = 3; // every N exercises completed by both
const CHEST_REWARDS = [
  { type: "bamboo", amount: 80, label: "80 bambú", emoji: "🌿" },
  { type: "bamboo", amount: 120, label: "120 bambú", emoji: "🌿" },
  { type: "garden", itemId: "love_stone", label: "Piedra del Amor", emoji: "💎" },
  { type: "accessory", itemId: "hat_love", label: "Corona de Corazones", emoji: "💖" },
  { type: "bamboo", amount: 150, label: "150 bambú", emoji: "🌿" },
  { type: "garden", itemId: "wishing_tree", label: "Árbol de los Deseos", emoji: "🌳" },
  { type: "accessory", itemId: "glasses_love", label: "Lentes Enamorados", emoji: "😍" },
  { type: "garden", itemId: "heart_gate", label: "Arco del Amor", emoji: "💒" },
];

const EXERCISES = [
  {id:"validacion",emoji:"💬",title:"La Danza de la Validación",tags:"DBT · Sistémica",bamboo:40,time:"15 min",skill:"comunicacion",zone:"bosque",difficulty:2,
    desc:"Aprendan a validar las emociones del otro sin defenderse ni explicar. La validación no significa estar de acuerdo — significa decir 'tiene sentido que sientas eso'.",
    instructions:["Abran Mochi en sus celulares al mismo tiempo","Persona A escribe algo que le molestó recientemente","Persona B responde validando, sin defenderse ni explicar","Intercambien roles en el siguiente turno","Al terminar, compartan cómo se sintieron por mensaje"],
    phases:[
      {role:0,q:"Persona A: Comparte algo que te molestó esta semana (no tiene que ser sobre tu pareja).",ph:"Esta semana me sentí… cuando…",hint:"Habla desde el 'yo'. Ej: 'Me sentí ignorado/a cuando…'"},
      {role:1,q:"Persona B: Valida con 'Tiene sentido porque...'",ph:"Tiene sentido porque…",hint:"Validar no es estar de acuerdo. Solo reconocer."},
      {role:0,q:"Persona A: ¿Te sentiste comprendido/a?",ph:"Me sentí comprendido/a cuando…"},
      {role:1,q:"Persona B: Tu turno — comparte algo que hayas sentido.",ph:"Esta semana yo sentí…"},
      {role:0,q:"Persona A: Valida a tu pareja.",ph:"Tiene sentido porque…"},
      {role:1,q:"Persona B: ¿Cómo fue recibir esa validación?",ph:"Eso me hizo sentir…"},
    ]},
  {id:"ojos",emoji:"👁",title:"4 Minutos de Contacto Visual",tags:"ACT · Arthur Aron",bamboo:30,time:"5 min",skill:"pasion",zone:"pradera",difficulty:1,
    desc:"Mirarse a los ojos 4 minutos sin hablar. Estudios de Arthur Aron demuestran que esta práctica genera sentimientos de amor profundo entre extraños — imagina entre parejas.",
    instructions:["Abran Mochi al mismo tiempo en sus celulares","Este ejercicio es de presencia — sin hablar, solo escribir","Escriban lo que sienten al pensar en el otro en este momento","Lean la respuesta del otro en silencio","Compartan una palabra de cómo se sintieron al final"],
    timer:240,timerLabel:"Mírense a los ojos en silencio",
    beforeTimer:["Siéntense frente a frente, muy cerca.","Pongan el teléfono entre los dos.","Está permitido sonreír — no hablar.","Presionen INICIAR cuando estén listos."],
    afterPrompts:[{role:0,ph:"Una palabra para lo que sentí…"},{role:1,ph:"Lo que vi en tus ojos fue…"}]},
  {id:"espejo",emoji:"🪞",title:"Técnica del Espejo",tags:"Imago · Narrativa",bamboo:35,time:"20 min",skill:"comunicacion",zone:"bosque",difficulty:2,
    desc:"El espejo confirma que el mensaje fue recibido antes de responder. Basada en terapia Imago de Harville Hendrix.",
    instructions:["Persona A escribe algo importante que quiera compartir","Persona B refleja con sus palabras lo que entendió","Persona A confirma si fue bien capturado o aclara","Persona B valida la experiencia de Persona A sin dar consejos","Intercambien roles en la siguiente ronda"],
    phases:[
      {role:0,q:"Persona A: Algo que quieras que tu pareja entienda mejor.",ph:"Quiero que entiendas que…"},
      {role:1,q:"Persona B: Refleja lo que escuchaste.",ph:"Lo que escucho es… ¿Lo capté bien?",hint:"No interpretes — solo refleja. Usa sus mismas palabras."},
      {role:0,q:"Persona A: ¿Te sentiste reflejado/a?",ph:"Sí captaste… / Lo que faltó fue…"},
      {role:1,q:"Persona B: Valida.",ph:"Tiene sentido porque…"},
      {role:1,q:"Persona B: Ahora comparte tú.",ph:"Quiero que entiendas que…"},
      {role:0,q:"Persona A: Refleja.",ph:"Lo que escucho es…"},
      {role:1,q:"¿Cómo fue sentirte reflejado/a?",ph:"De este ejercicio me llevo…"},
    ]},
  {id:"apreciacion",emoji:"💝",title:"3 Apreciaciones Específicas",tags:"Gottman · TCC+",bamboo:25,time:"10 min",skill:"pasion",zone:"pradera",difficulty:1,
    desc:"La fórmula Gottman: 5 interacciones positivas por cada negativa. Las apreciaciones vagas no nutren — las específicas sí.",
    instructions:["Cada persona piensa en 3 cosas específicas que aprecia del otro","Compartan una a la vez por turno","Quien recibe, solo responde gracias y cómo le hizo sentir","No minimicen ni desvíen los halagos","Dejen que el amor entre ✨"],
    phases:[
      {role:0,q:"Persona A: Una apreciación MUY específica.",ph:"Aprecio cuando hiciste…",hint:"Específico: 'me preparaste café el martes', no 'eres atento/a'"},
      {role:1,q:"Persona B: Recibe. Di 'Gracias' y cómo te hizo sentir.",ph:"Gracias. Eso me hizo sentir…"},
      {role:1,q:"Persona B: Tu apreciación específica.",ph:"Aprecio cuando tú…"},
      {role:0,q:"Persona A: Recibe.",ph:"Gracias. Eso me hizo sentir…"},
      {role:0,q:"Persona A: Algo que admiras profundamente.",ph:"Lo que más admiro de cómo enfrentas la vida es…"},
      {role:1,q:"¿Cómo se sienten después?",ph:"Hacer esto juntos me hace sentir que nuestra relación…"},
    ]},
  {id:"respiracion",emoji:"🌬",title:"Respiración Sincronizada",tags:"ACT · Mindfulness",bamboo:20,time:"8 min",skill:"calma",zone:"pradera",difficulty:1,
    desc:"Respirar juntos activa el nervio vago — el nervio de la seguridad. Sincronizar la respiración reduce cortisol y genera co-regulación emocional.",
    instructions:["Búsquense un lugar tranquilo en sus respectivos espacios","Escriban cómo se sienten en este momento (sin filtro)","El otro responde con presencia, sin consejos","Compartan una cosa que necesitan del otro hoy","Terminen enviando un emoji que represente cómo se sienten"],
    timer:300,timerLabel:"4 seg inhalar · 2 sostener · 6 exhalar",
    beforeTimer:["Siéntense uno detrás del otro.","El de atrás coloca su mano en la espalda.","Sigan el ritmo 4-2-6 juntos.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Después de respirar juntos, siento…"},{role:1,ph:"Lo que noté al sincronizarme fue…"}]},
  {id:"carta",emoji:"✉️",title:"Carta a mi Herida",tags:"Narrativa · TCC",bamboo:60,time:"30 min",skill:"confianza",zone:"cueva",difficulty:3,
    desc:"Identificar las creencias de infancia que gobiernan cómo amamos. Cada uno escribe individualmente y luego comparte lo que quiera.",
    instructions:["Cada uno escribe su carta por separado (tómense 10-15 min)","Compartan lo que se sientan cómodos compartiendo aquí","El otro solo lee y responde con presencia, sin consejo","No hay respuesta correcta — solo estar presente","Terminen con un mensaje de cierre cálido"],
    isEscritura:true,
    instruccion:"Escribe una carta a tu herida de infancia. Comienza: 'Querida [soledad / miedo al abandono…], sé que estás ahí porque...'",
    prompts:["¿Cómo y cuándo apareciste en mi vida?","¿Qué creencias sobre el amor me enseñaste?","¿Cómo apareces en mi relación hoy?","¿Qué quiero decirte desde mi yo adulto?"],
    afterPrompts:[{role:0,ph:"Compartir esto me hizo sentir…"},{role:1,ph:"Después de escucharte, entiendo mejor que…"}]},
  {id:"suenos",emoji:"🌙",title:"Mapa de Sueños",tags:"Narrativa · Positiva",bamboo:35,time:"15 min",skill:"confianza",zone:"cueva",difficulty:2,
    desc:"Las parejas que conocen los sueños del otro tienen 3x más probabilidades de navegar conflictos. Este ejercicio crea un mapa compartido del futuro.",
    instructions:["Cada persona piensa en 3 sueños personales","Compartan sin juzgar ni 'aterrizar' los sueños","Busquen los sueños que se superponen","Identifiquen uno que puedan perseguir juntos","Celébrense por soñar en voz alta"],
    phases:[
      {role:0,q:"Persona A: Un sueño que tienes para tu vida.",ph:"Algo que sueño es…",hint:"Sin filtros. No importa si parece imposible."},
      {role:1,q:"Persona B: ¿Qué admiras de ese sueño?",ph:"Lo que admiro de ese sueño es…"},
      {role:1,q:"Persona B: Tu sueño.",ph:"Algo que yo sueño es…"},
      {role:0,q:"Persona A: ¿Qué admiras de ese sueño?",ph:"Lo que me inspira de eso es…"},
      {role:0,q:"¿Hay un sueño que quieran perseguir juntos?",ph:"Un sueño que podríamos tener juntos…"},
      {role:1,q:"¿Cuál sería el primer paso?",ph:"El primer paso podría ser…"},
    ]},
  {id:"perdida",emoji:"🕊",title:"El Perdón Activo",tags:"Gottman · EFT",bamboo:55,time:"25 min",skill:"comunicacion",zone:"cumbre",difficulty:3,
    desc:"El perdón no es olvidar — es soltar la carga. Basado en el modelo de Gottman: reconocer, asumir responsabilidad, reparar.",
    instructions:["Elijan algo específico que quieran sanar juntos","No es para reabrir heridas — es para cerrarlas","Quien pide perdón escribe desde el corazón, sin justificarse","Quien perdona responde con apertura, sin condiciones","Terminen con un mensaje de cierre y un compromiso"],
    phases:[
      {role:0,q:"Persona A: Algo que quieras sanar entre ustedes.",ph:"Algo que quisiera soltar es…",hint:"Sin acusaciones. Desde el 'yo'."},
      {role:1,q:"Persona B: Reconoce sin defenderte.",ph:"Entiendo que te afectó cuando…"},
      {role:1,q:"Persona B: Asume tu parte.",ph:"Mi parte en esto fue…"},
      {role:0,q:"Persona A: ¿Qué necesitas para soltar esto?",ph:"Para poder soltar esto necesito sentir…"},
      {role:1,q:"Persona B: ¿Puedes ofrecerlo?",ph:"Lo que puedo ofrecerte es…"},
      {role:0,q:"¿Cómo se sienten ahora?",ph:"Después de este ejercicio, me siento…"},
    ]},
  {id:"amor_idiomas",emoji:"💞",title:"Idiomas del Amor",tags:"Chapman · ACT",bamboo:30,time:"12 min",skill:"pasion",zone:"bosque",difficulty:1,
    desc:"Gary Chapman identificó 5 idiomas del amor. Conocer el idioma de tu pareja evita que el amor se pierda en traducción.",
    instructions:["Lean los 5 idiomas juntos","Cada quien elige su TOP 2","Compartan sin juzgar","Hablen de cómo pueden 'hablar' el idioma del otro","Hagan un pequeño compromiso"],
    phases:[
      {role:0,q:"De estos 5, ¿cuál es tu idioma principal? (Palabras de afirmación / Tiempo de calidad / Regalos / Actos de servicio / Contacto físico)",ph:"Mi idioma del amor principal es…",hint:"El que más te hace sentir amado/a cuando lo recibes."},
      {role:1,q:"Persona B: ¿Cuál es tu idioma?",ph:"Mi idioma del amor es…"},
      {role:0,q:"¿Cómo podrías hablar mejor el idioma de tu pareja?",ph:"Podría hablar tu idioma cuando…"},
      {role:1,q:"Persona B: ¿Cómo podrías hablar el idioma de tu pareja?",ph:"Podría hablar tu idioma cuando…"},
      {role:0,q:"Un pequeño compromiso para esta semana.",ph:"Esta semana voy a…"},
      {role:1,q:"¿Cómo se sienten con este compromiso?",ph:"Este compromiso me hace sentir…"},
    ]},
  {id:"conflicto",emoji:"⚡",title:"Mapa del Conflicto",tags:"EFT · Sistémica",bamboo:45,time:"20 min",skill:"calma",zone:"cueva",difficulty:3,
    desc:"Bajo cada pelea hay una necesidad no expresada. Este ejercicio les ayuda a ir de la superficie al corazón del conflicto.",
    instructions:["Elijan un conflicto reciente (no el más grande)","No busquen quién tiene razón","Busquen qué necesidad hay detrás","El objetivo es entenderse, no ganar","Hablen despacio y hagan pausas"],
    phases:[
      {role:0,q:"Persona A: Describe el conflicto desde tu perspectiva.",ph:"Cuando discutimos por… yo sentí…",hint:"Sin acusaciones. 'Yo sentí…' no 'Tú hiciste…'"},
      {role:1,q:"Persona B: ¿Qué sentiste tú?",ph:"Desde mi lugar, yo sentí…"},
      {role:0,q:"Persona A: ¿Qué necesidad tuya no estaba siendo vista?",ph:"Detrás de mi reacción, lo que necesitaba era…"},
      {role:1,q:"Persona B: ¿Qué necesidad tuya no estaba siendo vista?",ph:"Lo que yo necesitaba era…"},
      {role:0,q:"¿Pueden ver el ciclo? ¿Cómo se activan mutuamente?",ph:"Creo que cuando tú… yo reacciono con… y eso te hace…"},
      {role:1,q:"¿Qué podrían hacer diferente la próxima vez?",ph:"La próxima vez podríamos…"},
    ]},
  {id:"presencia",emoji:"🌿",title:"Presencia Plena",tags:"Mindfulness · ACT",bamboo:25,time:"10 min",skill:"calma",zone:"pradera",difficulty:1,
    desc:"En un mundo de distracciones, dar presencia plena es el regalo más raro. 10 minutos sin teléfonos, sin listas mentales — solo ustedes.",
    instructions:["Silencien notificaciones — solo Mochi abierto","No hay agenda — solo estar presentes el uno para el otro","Escriban lo primero que piensan al ver el nombre del otro","No hay respuesta correcta ni incorrecta","Al terminar, compartan una observación del ejercicio"],
    timer:600,timerLabel:"Presencia plena — sin distracciones",
    beforeTimer:["Apaguen o silencien los teléfonos.","Siéntense cómodos, cerca.","No hay tema — solo estén presentes.","Hablen de lo que surja naturalmente.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Lo que noté en ti hoy fue…"},{role:1,ph:"Estar presente contigo me hizo sentir…"}]},
];

// Special garden items that can only be unlocked via chests
const CHEST_GARDEN_ITEMS = [
  {id:"love_stone",   cat:"especial", name:"Piedra del Amor",    cost:0, desc:"Solo por cofre", emoji:"💎"},
  {id:"wishing_tree", cat:"especial", name:"Árbol de los Deseos",cost:0, desc:"Solo por cofre", emoji:"🌳"},
  {id:"heart_gate",   cat:"especial", name:"Arco del Amor",      cost:0, desc:"Solo por cofre", emoji:"💒"},
];
const CHEST_ACCESSORIES = [
  {id:"hat_love",     cat:"sombrero", name:"Corona de Corazones",cost:0, emoji:"💖", desc:"Solo por cofre"},
  {id:"glasses_love", cat:"lentes",   name:"Lentes Enamorados",  cost:0, emoji:"😍", desc:"Solo por cofre"},
];

// Merge into main catalog for rendering/shop (cost 0 = not buyable, but ownable)
GARDEN_ITEMS.push(...CHEST_GARDEN_ITEMS);
PANDA_ACCESSORIES.push(...CHEST_ACCESSORIES);

const CONOCE_LEVELS = {
  1: { emoji: "🌱", label: "Semilla", sub: "Lo fácil y divertido", color: "#e4f0e0", ring: "#8bc48a" },
  2: { emoji: "🌿", label: "Brote", sub: "Lo emocional", color: "#eee2ff", ring: "#9a7fd9" },
  3: { emoji: "🌸", label: "Flor", sub: "Lo más íntimo", color: "#fce4f4", ring: "#c77fc2" },
};

const CONOCE_CATS = {
  infancia: {
    emoji: "🧸",
    label: "Infancia",
    bg: "#f5edda",
    descripcion: "Conocer de dónde venimos nos ayuda a entender cómo amamos hoy. Avancemos poco a poco: desde lo sensorial hasta lo más emocional.",
    levels: [2, 1, 2, 3, 1, 3],
    preguntas: [
      "¿Cuál es tu recuerdo más feliz de cuando eras niño/a?",
      "¿Qué comida te recuerda a tu casa?",
      "¿Qué tradición familiar te gustaría tener con nosotros?",
      "¿Qué gesto de cariño de tu infancia te gustaría tener con nosotros?",
      "¿Qué hacías para divertirte cuando eras pequeño/a?",
      "¿Qué cosa de tu infancia te gustaría recuperar?"
    ]
  },
  cosasFavoritas: {
    emoji: "⭐",
    label: "Cosas Favoritas",
    bg: "#fff4e0",
    descripcion: "Las cosas que nos gustan dicen mucho de quiénes somos. Empecemos por lo simple y terminemos con lo que realmente nos conmueve.",
    levels: [1, 1, 2, 2, 3, 3],
    preguntas: [
      "¿Cuál es tu comida favorita?",
      "¿Qué película podrías ver mil veces?",
      "¿Qué música te pone de buen humor?",
      "¿Cuál es tu lugar favorito del mundo?",
      "¿Qué harías si tuvieras un día libre sin compromisos?",
      "¿Qué regalo te ha hecho más ilusión?"
    ]
  },
  sueños: {
    emoji: "🌙",
    label: "Sueños",
    bg: "#f2ecd8",
    descripcion: "Compartir lo que soñamos nos acerca. Desde deseos personales hasta lo que queremos construir juntos.",
    levels: [1, 2, 3, 1, 3, 2],
    preguntas: [
      "¿Qué te gustaría aprender a hacer este año?",
      "¿A dónde te gustaría viajar conmigo?",
      "¿Qué te gustaría que hiciéramos más juntos?",
      "¿Qué trabajo harías si el dinero no importara?",
      "¿Qué te gustaría lograr en los próximos 5 años?",
      "¿Qué aventura te gustaría vivir?"
    ]
  },
  miedos: {
    emoji: "🫂",
    label: "Apoyo & Cuidado",
    bg: "#e4f0e0",
    descripcion: "Descubrir cómo cuidarnos mutuamente fortalece la confianza. Estas preguntas van desde lo cotidiano hasta lo más íntimo, siempre enfocadas en lo que nos hace sentir bien.",
    levels: [1, 1, 2, 3, 2, 3],
    preguntas: [
      "¿Qué actividad te ayuda a relajarte cuando el día estuvo pesado?",
      "¿Cómo puedo darte ánimos cuando estás bajito/a?",
      "¿Qué necesitas cuando tienes un día difícil?",
      "¿Qué necesitas de mí para sentirte seguro/a pidiendo apoyo?",
      "¿Qué te hace sentir más querido/a?",
      "¿Qué pequeña acción me dice 'estoy aquí contigo' para ti?"
    ]
  },
};

// ═══════════════════════════════════════════════
// CONÓCETE JOURNEY — todas las preguntas agrupadas por nivel (Semilla → Brote → Flor)
// ═══════════════════════════════════════════════
const CONOCE_JOURNEY = [1, 2, 3].map(level => {
  const questions = [];
  Object.entries(CONOCE_CATS).forEach(([catKey, catData]) => {
    catData.preguntas.forEach((text, idx) => {
      if (catData.levels[idx] === level) {
        questions.push({
          cat: catKey,
          idx,
          level,
          text,
          emoji: catData.emoji,
          catLabel: catData.label,
        });
      }
    });
  });
  return {
    level,
    ...CONOCE_LEVELS[level],
    questions,
    rewardBamboo: level === 1 ? 60 : level === 2 ? 100 : 150,
  };
});

function isJourneyLevelCompletedByBoth(level, conoce, myRole, partnerRole) {
  const questions = CONOCE_JOURNEY.find(l => l.level === level)?.questions || [];
  return questions.every(q => !!conoce[`${q.cat}-${q.idx}`]?.[myRole] && !!conoce[`${q.cat}-${q.idx}`]?.[partnerRole]);
}

function isJourneyLevelUnlocked(level, conoce, myRole, partnerRole) {
  if (level === 1) return true;
  return isJourneyLevelCompletedByBoth(level - 1, conoce, myRole, partnerRole);
}

function getJourneyOverallProgress(conoce, myRole, partnerRole) {
  const total = CONOCE_JOURNEY.reduce((acc, l) => acc + l.questions.length, 0);
  const answered = CONOCE_JOURNEY.reduce((acc, l) => {
    return acc + l.questions.filter(q => !!conoce[`${q.cat}-${q.idx}`]?.[myRole] && !!conoce[`${q.cat}-${q.idx}`]?.[partnerRole]).length;
  }, 0);
  return { total, answered, pct: total ? (answered / total) * 100 : 0 };
}

// ═══════════════════════════════════════════════
// CONÓCETE CAMINO — mapa ilustrado (coordenadas en un lienzo de 1000 de ancho)
// ═══════════════════════════════════════════════
const CONOCE_MAP_TOP_H = 1778;  // /conoce/paisaje.webp (1080×1920, con pandas)
const CONOCE_MAP_TILE_H = 750;  // /conoce/paisaje-tile.webp (1080×810, se repite hacia abajo)
const CONOCE_LEVEL_QUIZ = { 1: "bigfive", 2: "lovestyles", 3: "attachment" };

// Alterna categorías para que el camino no tenga dos preguntas seguidas del mismo tema
function interleaveByCat(questions) {
  const lists = Object.values(questions.reduce((acc, q) => ((acc[q.cat] = acc[q.cat] || []).push(q), acc), {}));
  const out = [];
  for (let i = 0; out.length < questions.length; i++) lists.forEach(l => l[i] && out.push(l[i]));
  return out;
}

const CONOCE_MAP = (() => {
  const nodes = [];
  const labels = [];
  let y = 380;
  CONOCE_JOURNEY.forEach((lvl, li) => {
    if (li > 0) { labels.push({ level: lvl.level, y: y + 70 }); y += 280; }
    const steps = [
      ...interleaveByCat(lvl.questions).map(q => ({ type: "q", q })),
      { type: "quiz", quizId: CONOCE_LEVEL_QUIZ[lvl.level] },
      { type: "chest" },
    ];
    steps.forEach(step => {
      const i = nodes.length;
      nodes.push({ ...step, level: lvl.level, x: i === 0 ? 500 : i % 2 ? 650 : 350, y });
      y += 200;
    });
  });
  const height = y + 40;
  const path = nodes.reduce((d, n, i) => {
    if (i === 0) return `M ${n.x} ${n.y}`;
    const p = nodes[i - 1];
    const dy = (n.y - p.y) / 2;
    return `${d} C ${p.x} ${p.y + dy} ${n.x} ${n.y - dy} ${n.x} ${n.y}`;
  }, "");
  const tiles = [];
  for (let t = CONOCE_MAP_TOP_H; t < height; t += CONOCE_MAP_TILE_H) tiles.push(t);
  return { nodes, labels, height, path, tiles };
})();

// Íconos de línea del camino (sin emojis): mismo trazo y paleta que la app
const CONOCE_CAT_ICON = { infancia: "bear", cosasFavoritas: "star", sueños: "moon", miedos: "umbrella" };
const CONOCE_QUIZ_ICON = { bigfive: "flower", lovestyles: "letter", attachment: "rings" };
const CONOCE_LEVEL_ICON = { 1: "seed", 2: "sprout", 3: "tulip" };
const CONOCE_ICON_PATHS = {
  bear: <><path d="M5.4 9.4A2.8 2.8 0 1 1 9.2 5.7" /><path d="M14.8 5.7a2.8 2.8 0 1 1 3.8 3.7" /><circle cx="12" cy="13" r="7" /><circle cx="9.5" cy="12" r="0.9" fill="currentColor" stroke="none" /><circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" /><path d="M10.5 15.4c.9.7 2.1.7 3 0" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  moon: <><path d="M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z" /><path d="M17 4v3M15.5 5.5h3" /></>,
  umbrella: <><path d="M3.5 12.5a8.5 8.5 0 0 1 17 0z" /><path d="M12 12.5v5.8a2 2 0 0 1-4 0" /><path d="M12 4V2.8" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  flower: <><circle cx="12" cy="6.8" r="2.7" /><circle cx="16.9" cy="10.4" r="2.7" /><circle cx="15" cy="16.1" r="2.7" /><circle cx="9" cy="16.1" r="2.7" /><circle cx="7.1" cy="10.4" r="2.7" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  letter: <><rect x="3.5" y="6" width="17" height="12.5" rx="2.5" /><path d="M4 7.5l8 6 8-6" /></>,
  rings: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></>,
  gift: <><rect x="4.5" y="10.5" width="15" height="9.5" rx="2" /><rect x="3.5" y="7.5" width="17" height="3.5" rx="1.5" /><path d="M12 7.5V20" /><path d="M12 7.5C10.8 4.5 7 4.3 7.3 6.5c.2 1.2 2.6 1 4.7 1zM12 7.5c1.2-3 5-3.2 4.7-1-.2 1.2-2.6 1-4.7 1z" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.5a2.6 2.6 0 0 0 2.8 3.8M16 5.5h2.5a2.6 2.6 0 0 1-2.8 3.8" /><path d="M12 13v3.5M9 20h6M9.8 20l.4-3.5h3.6l.4 3.5" /></>,
  check: <path d="M6 12.5l4 4 8-9" />,
  hourglass: <><path d="M8 3.5h8M8 20.5h8" /><path d="M8.7 3.5c0 5 6.6 4 6.6 8.5s-6.6 3.5-6.6 8.5M15.3 3.5c0 5-6.6 4-6.6 8.5s6.6 3.5 6.6 8.5" /></>,
  seed: <><path d="M12 20.5v-7" /><path d="M12 13.5c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" /></>,
  sprout: <><path d="M12 20.5v-8" /><path d="M12 12.5c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 15.5c0-3.4-2.5-5.5-6.5-5.5 0 3.4 2.5 5.5 6.5 5.5z" /></>,
  tulip: <><path d="M8 4.5l2 2.5L12 3.8 14 7l2-2.5V9a4 4 0 0 1-8 0z" /><path d="M12 13v7.5" /><path d="M12 18c-2.4 0-4-1.4-4.5-3.5 2.4 0 4 1.2 4.5 3.5z" /></>,
  lock: <><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" /></>,
  flame: <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4 2.2 1.4 3 3.4 3 5 .9-.6 1.6-1.8 1.8-3 1.8 1.6 3.8 3.8 3.8 6.4 0 3.2-2.4 5.6-6 5.6z" />,
  leaf: <><path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z" /><path d="M5 19l7.5-7.5" /></>,
};

function ConoceIcon({ name, size = 24, color = "currentColor", stroke = 2, fill = "none", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, color, ...style }}>
      {CONOCE_ICON_PATHS[name]}
    </svg>
  );
}

const ConoceLock = () => (
  <svg width="22" height="24" viewBox="0 0 22 24">
    <path d="M6 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#8c7bb8" strokeWidth="3" strokeLinecap="round" />
    <rect x="2" y="10" width="18" height="13" rx="4" fill="#8c7bb8" />
    <circle cx="11" cy="15.5" r="2" fill="#efe9f8" />
    <rect x="10" y="16" width="2" height="4" rx="1" fill="#efe9f8" />
  </svg>
);

const BURBUJA_SECTIONS = [
  // Ordenado de lo más leve a lo más fuerte: este orden es el camino de la Burbuja
  {id:"quiero",level:1,icon:"✨",title:"Lo que quiero del otro",sub:"Cómo recibimos amor",itemBg:"#fce4f4",
    items:[
      {id:"quiero2",q:"¿Cómo prefieres recibir amor?",phA:"Me siento amado/a cuando...",phB:"Me siento amado/a cuando..."},
      {id:"quiero3",q:"¿Qué es algo pequeño que el otro podría hacer y te haría muy feliz?",phA:"Algo pequeño que me haría feliz...",phB:"Algo pequeño que me haría feliz..."},
    ]},
  {id:"contacto",level:1,icon:"💬",title:"Cómo estamos en contacto",sub:"Mensajes, tiempo y planes favoritos",itemBg:"#e4f0e0",
    items:[
      {id:"cont2",q:"¿Qué plan les gustaría repetir seguido?",phA:"Me encantaría que repitiéramos...",phB:"Me encantaría que repitiéramos..."},
      {id:"cont1",q:"¿Cuánto contacto les gusta tener cuando no están juntos?",phA:"Me gusta que...",phB:"Me gusta que..."},
    ]},
  {id:"espacio",level:1,icon:"🧘",title:"Espacio & Tiempo",sub:"Tiempo propio, amigos y familia",itemBg:"#fce4d0",
    items:[
      {id:"tipo2",q:"¿Cuánto espacio personal necesita cada uno?",phA:"Necesito...",phB:"Necesito..."},
      {id:"tipo3",q:"¿Cómo manejan el tiempo con amigos y familia por separado?",phA:"Para mí es importante...",phB:"Para mí es importante..."},
    ]},
  {id:"discusion",level:1,icon:"⚡",title:"Reglas para discutir",sub:"Cómo manejar conflictos juntos",itemBg:"#f5e8d4",
    items:[
      {id:"disc1",q:"Señal de 'necesito pausa' — ¿cuál es la tuya?",phA:"Cuando me desborda...",phB:"Cuando me desborda..."},
      {id:"disc4",q:"¿Cuánto tiempo de pausa está bien antes de retomar una conversación?",phA:"Necesito al menos...",phB:"Necesito al menos..."},
      {id:"disc3",q:"¿Cómo se reconcilian después de una pelea?",phA:"Para reconciliarme necesito...",phB:"Para reconciliarme necesito..."},
      {id:"disc2",q:"¿Qué está PROHIBIDO en una discusión entre ustedes?",phA:"Ej: gritar, traer el pasado...",phB:"Ej: insultar, silencio de días..."},
    ]},
  {id:"planes",level:2,icon:"🌱",title:"Planes juntos",sub:"Gastos compartidos, mascotas y futuro",itemBg:"#e4f4e8",
    items:[
      {id:"fam6",q:"¿Tienen mascotas o quieren tenerlas?",phA:"Sobre las mascotas...",phB:"Sobre las mascotas..."},
      {id:"fut1",q:"¿Dónde se imaginan viviendo en 5 años?",phA:"Me imagino que...",phB:"Me imagino que..."},
      {id:"plan1",q:"¿Cómo quieren dividir los gastos de salidas y viajes?",phA:"Para mí lo justo es...",phB:"Para mí lo justo es..."},
    ]},
  {id:"tipo",level:2,icon:"💑",title:"Nuestra relación",sub:"Qué somos y qué necesitamos",itemBg:"#fce4d0",
    items:[
      {id:"tipo1",q:"¿Qué tipo de relación tienen? ¿Cómo la definirían?",phA:"Para mí nuestra relación es...",phB:"Para mí nuestra relación es..."},
      {id:"quiero1",q:"¿Qué MÁS necesitas de tu pareja que no has pedido?",phA:"Lo que más necesito es...",phB:"Lo que más necesito es..."},
    ]},
  {id:"familias",level:2,icon:"👪",title:"Nuestras familias",sub:"Familias de origen y límites",itemBg:"#ffe8f0",
    items:[
      {id:"fam1",q:"¿Cuánto espacio tiene la familia de origen en su relación?",phA:"Para mí, mi familia...",phB:"Para mí, mi familia..."},
      {id:"fam2",q:"¿Cómo manejan las opiniones o críticas de sus familias sobre la relación?",phA:"Cuando mi familia opina...",phB:"Cuando mi familia opina..."},
    ]},
  {id:"fidelidad",level:2,icon:"🤝",title:"Fidelidad & Límites",sub:"Qué es infidelidad para nosotros",itemBg:"#fce4e4",
    items:[
      {id:"fidel2",q:"¿Qué le pides al otro para sentirte seguro/a?",phA:"Para sentirme seguro/a necesito...",phB:"Para sentirme seguro/a necesito..."},
      {id:"fidel3",q:"¿Cómo manejan la privacidad (teléfonos, contraseñas)?",phA:"Para mí la privacidad significa...",phB:"Para mí la privacidad significa..."},
      {id:"fidel1",q:"¿Qué consideras tú que es infidelidad?",phA:"Para mí la infidelidad es...",phB:"Para mí la infidelidad es...",note:"Más allá de lo físico: mensajes, emocional, coqueteo. Sin respuestas incorrectas."},
    ]},
  {id:"hogar",level:3,icon:"🏠",title:"Nuestro hogar",sub:"Hogar ideal y tareas de la casa",itemBg:"#ffe8f0",
    items:[
      {id:"fut3",q:"¿Cómo se imaginan su hogar ideal?",phA:"Mi hogar ideal es...",phB:"Mi hogar ideal es..."},
      {id:"fam5",q:"¿Cómo dividen responsabilidades del hogar?",phA:"Yo me siento cómodo/a haciendo...",phB:"Yo me siento cómodo/a haciendo..."},
    ]},
  {id:"economia",level:3,icon:"💰",title:"Economía & Dinero",sub:"Finanzas, gastos y metas económicas",itemBg:"#fef8e0",
    items:[
      {id:"eco3",q:"¿Qué metas económicas tienen juntos?",phA:"Una meta que quiero es...",phB:"Una meta que quiero es..."},
      {id:"eco5",q:"¿Ahorran juntos? ¿Para qué?",phA:"Me gustaría que ahorráramos para...",phB:"Me gustaría que ahorráramos para..."},
      {id:"eco1",q:"¿Cómo van a manejar el dinero? ¿Juntos, separados o mixto?",phA:"Para mí lo ideal es...",phB:"Para mí lo ideal es..."},
      {id:"eco2",q:"¿Cuánto es 'gasto grande' que requiere consultarse?",phA:"Para mí, más de...",phB:"Para mí, más de..."},
      {id:"eco4",q:"¿Cómo manejan las deudas o situaciones económicas difíciles?",phA:"En esos momentos yo...",phB:"En esos momentos yo..."},
    ]},
  {id:"crianza",level:3,icon:"👶",title:"Hijos & Crianza",sub:"Si quieren hijos y cómo criarlos",itemBg:"#fce4f4",
    items:[
      {id:"fam3",q:"¿Quieren tener hijos? ¿Cuántos y cuándo?",phA:"Sobre los hijos yo pienso...",phB:"Sobre los hijos yo pienso..."},
      {id:"fut2",q:"¿Quieren tener o no tener hijos? ¿Cuándo?",phA:"Sobre los hijos, yo siento...",phB:"Sobre los hijos, yo siento...",legacy:true},
      {id:"fam4",q:"¿Cómo quieren criar a sus hijos? ¿Qué valores son innegociables?",phA:"Para mí es esencial enseñar...",phB:"Para mí es esencial enseñar..."},
    ]},
];

const BURBUJA_ITEM_MAP = BURBUJA_SECTIONS.reduce((acc, sec) => {
  sec.items.forEach(item => {
    acc[item.id] = { question: item.q, section: sec.title };
  });
  return acc;
}, {});

const BURBUJA_LEVELS = {
  1: { ...CONOCE_LEVELS[1], sub: "Cómo nos tratamos" },
  2: { ...CONOCE_LEVELS[2], sub: "Hacia dónde vamos" },
  3: { ...CONOCE_LEVELS[3], sub: "Construir una vida juntos" },
};

const burbujaHasActivity = (e) => !!(e?.owner || e?.partner || e?.proposalText || e?.history?.length || e?.status === "approved");
// Preguntas retiradas (legacy) solo siguen visibles si la pareja ya las usó
const burbujaItemVisible = (item, burbuja) => !item.legacy || burbujaHasActivity(burbuja[item.id]);

const LOVE_PROMPTS = [
  { icon:"🌸", idea:"Hoy noté algo lindo en ti: " },
  { icon:"💜", idea:"Gracias por... me hizo sentir " },
  { icon:"🌍", idea:"Cuando estoy contigo pienso en " },
  { icon:"🐼", idea:"Te extraño porque " },
  { icon:"✨", idea:"Eres especial para mí porque " },
  { icon:"🌿", idea:"Hoy me sonreí al recordar cuando " },
  { icon:"🫶", idea:"Llevo todo el día pensando en decirte que " },
  { icon:"💫", idea:"Cuando estás cerca siento " },
];

const hashSeed = (txt = "") => String(txt).split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
const getDayNumberLocal = (date = new Date()) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
};

const CONSEJOS_DIARIOS = [
  {
    id: 1,
    texto: "Escucha de verdad antes de pensar en tu respuesta.",
    explicacion: "Muchas veces, cuando tu amor te habla, ya estás pensando en qué vas a responder. Así es difícil conectar de verdad.",
    practica: "Cuando tu pareja te cuente algo, haz una pausa y repite con tus palabras lo que escuchaste antes de dar tu opinión. Así sabe que de verdad te importa lo que dice.",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Psicólogos que llevan décadas estudiando parejas. Encontraron que las parejas que duran se sienten escuchadas, aunque discutan."
  },
  {
    id: 2,
    texto: "Agradece hoy algo específico.",
    explicacion: "Un agradecimiento con detalles se queda en la memoria de tu amor: \"gracias por traerme café esta mañana, me salvaste el día\".",
    practica: "Dile a tu pareja qué hizo, cuándo lo hizo y cómo te hizo sentir. Por ejemplo: \"Gracias por mandarme ese mensaje antes de mi junta, me dio mucha calma\".",
    autor: "Sara Algoe",
    quienEs: "Psicóloga de la Universidad de Carolina del Norte. Estudia la gratitud en pareja y encontró que agradecer ayuda a notar a la otra persona, recordar por qué la elegiste y sentirte más unido/a."
  },
  {
    id: 3,
    texto: "Pide lo que necesitas con palabras claras.",
    explicacion: "Una queja como \"nunca me escuchas\" hace que tu pareja se defienda. Una petición concreta, como \"necesito 10 minutos de tu atención sin celular cuando llegue a casa\", le dice cómo puede ayudarte.",
    practica: "Usa esta fórmula: \"Cuando [pasa algo], yo siento [emoción], porque necesito [necesidad]. ¿Podrías [petición concreta]?\"",
    autor: "Marshall Rosenberg",
    quienEs: "Creador de la Comunicación No Violenta, una forma de hablar sin herir. Sus técnicas se usan en todo el mundo para resolver conflictos."
  },
  {
    id: 4,
    texto: "Cuando te equivocas, pide perdón rápido y de corazón.",
    explicacion: "Las parejas que duran también pelean, y saben reparar pronto. Un \"me equivoqué, lo siento\" sincero en las primeras horas ayuda mucho a sanar.",
    practica: "Si hubo un malentendido, no esperes a que se enfríe. Di: \"Me equivoqué, lo siento. ¿Cómo puedo hacerlo mejor?\" Sin excusas y sin \"pero tú también...\".",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Psicólogos que han observado a miles de parejas en su laboratorio. Encontraron que las parejas estables saben reparar después de una pelea."
  },
  {
    id: 5,
    texto: "Nombra tu emoción antes de reaccionar.",
    explicacion: "Cuando estás enojado/a o ansioso/a, tu cerebro entra en modo \"supervivencia\" y dices cosas que no quieres. Ponerle nombre a lo que sientes ayuda a bajar la intensidad.",
    practica: "Antes de responder en caliente, di (o piensa): \"Ahora mismo me siento [frustrado/a, asustado/a, triste...]\". Te da un momento para elegir qué decir.",
    autor: "Dan Siegel",
    quienEs: "Psiquiatra que creó la frase \"nombrarlo para domarlo\". Estudios de imagen cerebral muestran que poner en palabras una emoción reduce la activación de la amígdala, la zona del miedo."
  },
  {
    id: 6,
    texto: "Cuida los pequeños momentos de cada día.",
    explicacion: "Un \"buenos días\" diario, o preguntar \"¿cómo estuvo tu día?\" con atención real, construye cercanía poco a poco.",
    practica: "Crea un ritual de 2 minutos: un beso de despedida, un mensaje de buenas noches o preguntar qué fue lo mejor del día.",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Lo llaman la \"cuenta bancaria emocional\": cada gesto de cariño es un pequeño depósito que te protege cuando llegan las crisis."
  },
  {
    id: 7,
    texto: "Puedes entender a tu pareja sin estar de acuerdo.",
    explicacion: "Validar quiere decir reconocer que lo que siente tiene sentido, aunque tú lo veas distinto. Cuando tu amor se siente comprendido, baja la guardia.",
    practica: "Cuando tu pareja te cuente algo difícil, responde: \"Tiene sentido que te sientas así por lo que pasó\". Espera un poco antes de dar tu opinión.",
    autor: "Sue Johnson",
    quienEs: "Creadora de la Terapia Focalizada en las Emociones (EFT), una de las terapias de pareja con más investigación. Explica que lo que más nos asusta en pareja es sentir que no le importamos al otro."
  },
  {
    id: 8,
    texto: "Celebra los logros de tu pareja como si fueran tuyos.",
    explicacion: "Cuando tu amor te cuenta algo bueno, tu reacción importa mucho. Responder con entusiasmo fortalece mucho la relación.",
    practica: "Cuando tu pareja te dé una buena noticia, pregúntale detalles, celebra con ella y dile por qué te enorgullece. Evita minimizarla (\"eso es fácil\") o cambiar de tema.",
    autor: "Shelly Gable",
    quienEs: "Psicóloga que encontró que la forma en que respondes a las buenas noticias de tu pareja predice qué tan satisfechos están con su relación."
  },
  {
    id: 9,
    texto: "Respeta cuando tu pareja dice \"no tengo energía ahora\".",
    explicacion: "A veces tu amor necesita espacio porque está saturado/a, aunque te quiera mucho. Con el cuerpo en modo \"supervivencia\" es muy difícil conectar.",
    practica: "Si notas a tu pareja agotada, pregunta: \"¿Tienes energía para hablar de esto ahora o lo dejamos para después?\". Si eligen después, acuerden cuándo lo retoman.",
    autor: "Stephen Porges",
    quienEs: "Científico que propuso la teoría polivagal, que busca explicar por qué a veces el cuerpo necesita calmarse antes de poder conectar con otros."
  },
  {
    id: 10,
    texto: "Cambia el \"pero\" por \"y\".",
    explicacion: "La palabra \"pero\" borra lo que dijiste antes. \"Te amo, pero...\" se escucha como si no lo dijeras en serio. Con \"y\" caben las dos cosas: \"Entiendo que estás cansado/a y necesito hablar contigo\".",
    practica: "Pon atención a tus conversaciones. Cuando vayas a decir \"pero\", cámbialo por \"y\" y fíjate cómo cambia la plática.",
    autor: "Marsha Linehan",
    quienEs: "Psicóloga creadora de la Terapia Dialéctica Conductual (DBT), que enseña a sostener dos verdades al mismo tiempo."
  },
  {
    id: 11,
    texto: "Pregunta antes de asumir lo que piensa tu pareja.",
    explicacion: "Tu mente inventa historias sobre lo que el otro quiso decir, y casi siempre son muy negativas. \"Seguro ya no le importo\" puede ser solo \"está distraído/a con el trabajo\".",
    practica: "Cuando notes que estás asumiendo algo negativo, pregunta: \"¿Qué quisiste decir cuando...?\" o \"¿Cómo te sientes?\".",
    autor: "Aaron Beck",
    quienEs: "Padre de la Terapia Cognitiva. Identificó la \"lectura de mente\" como uno de los pensamientos que más daño hacen a las relaciones."
  },
  {
    id: 12,
    texto: "La confianza se construye con pequeñas promesas cumplidas.",
    explicacion: "Sentirte seguro/a con alguien nace de ver que cumple lo que dice: \"Te llamo después\", y llama. \"Llego temprano\", y llega temprano.",
    practica: "Haz una promesa pequeña y cúmplela.",
    autor: "John Bowlby",
    quienEs: "Psiquiatra que estudió cómo los niños se apegan a sus cuidadores. Años después, otros investigadores mostraron que el apego seguro funciona de forma parecida en las parejas adultas."
  },
  {
    id: 13,
    texto: "Algunos problemas de pareja van a estar siempre.",
    explicacion: "El 69% de los conflictos de pareja vienen de diferencias de personalidad o de valores que no van a desaparecer. Las parejas que duran aprenden a \"bailar\" con esas diferencias.",
    practica: "Cuando salga su tema de siempre, dile a tu pareja con cariño: \"Ah, este es nuestro tema de siempre\". Reconocerlo ayuda a no tomarlo personal y a buscar acuerdos juntos.",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Llaman a estos \"problemas perpetuos\". Su objetivo es mantener la conexión a pesar de ellos."
  },
  {
    id: 14,
    texto: "Tu cuerpo te avisa cuando necesitas una pausa.",
    explicacion: "Cuando el corazón late rápido, los músculos se tensan y la mente se nubla, tu cuerpo está saturado. En ese estado es muy difícil platicar bien.",
    practica: "Proponle a tu pareja una \"palabra de pausa\" (por ejemplo: \"necesito un break\"). Cuando alguien la diga, se toman 20 a 30 minutos para calmarse, y quien la pidió se compromete a regresar a la plática.",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Llaman a esto \"inundación emocional\" y recomiendan pausas de al menos 20 minutos para que el cuerpo se regule."
  },
  {
    id: 15,
    texto: "El amor también se demuestra con lo que haces.",
    explicacion: "La pasión sube y baja en toda relación larga. La intimidad y el compromiso se eligen todos los días: mandar ese mensaje, hacer esa pregunta, dar ese abrazo.",
    practica: "Elige un acto de amor hoy, aunque no sientas \"mariposas\". Muchas veces el sentimiento regresa después de la acción.",
    autor: "Robert Sternberg",
    quienEs: "Propuso que el amor tiene 3 partes: intimidad, pasión y compromiso. Las parejas que duran cuidan las tres, sobre todo cuando la pasión baja."
  },
  {
    id: 16,
    texto: "Cuando tu pareja te busque, voltea hacia ella.",
    explicacion: "Todos los días tu amor te busca en cosas pequeñas: \"mira esto\", un suspiro, un comentario sobre el clima. Cada vez que respondes, se siente un poquito más querido/a.",
    practica: "Fíjate en las veces que tu pareja te comparte algo pequeño. Deja el celular un momento y responde con interés, aunque sea un \"¿a ver?\".",
    autor: "Dr. y Dra. Gottman",
    quienEs: "En su estudio con recién casados, las parejas que seguían juntas años después respondían a estos intentos cerca del 86% de las veces. Las que se separaron, alrededor del 33%."
  },
  {
    id: 17,
    texto: "Pregunta: \"¿Quieres que te escuche o que te ayude a resolverlo?\"",
    explicacion: "A veces das consejos cuando tu amor solo quería desahogarse, o solo escuchas cuando necesitaba ideas. Dar el apoyo que necesita le hace sentir comprendido/a.",
    practica: "La próxima vez que tu pareja te cuente un problema, hazle esta pregunta antes de responder y sigue lo que te diga.",
    autor: "Harry Reis",
    quienEs: "Psicólogo de la Universidad de Rochester. Su investigación muestra que lo que más une a una pareja es sentirse comprendido, valorado y cuidado."
  },
  {
    id: 18,
    texto: "Hagan algo nuevo juntos.",
    explicacion: "La rutina da seguridad y también apaga la chispa. Vivir algo nuevo en pareja trae de vuelta la emoción de los primeros meses.",
    practica: "Propón algo que nunca hayan hecho: una receta, una ruta distinta, un lugar cerca de casa que no conocen. Puede ser algo gratis, lo importante es que sea nuevo para los dos.",
    autor: "Arthur Aron",
    quienEs: "Psicólogo que encontró que las parejas que hacen actividades nuevas y retadoras juntas se sienten más satisfechas con su relación."
  },
  {
    id: 19,
    texto: "Hay cosas de tu pareja que te toca aceptar.",
    explicacion: "Pasar años intentando cambiar al otro cansa a los dos. Cuando dejas de pelear contra ciertas formas de ser, muchas veces tu pareja se relaja y empieza a cambiar por su cuenta.",
    practica: "Piensa en algo de tu pareja que te molesta y que probablemente es parte de quién es. Intenta verlo como la otra cara de algo que te encanta: el desorden y su espontaneidad, la terquedad y su firmeza.",
    autor: "Andrew Christensen y Neil Jacobson",
    quienEs: "Creadores de la Terapia Integral de Pareja (IBCT), que combina trabajar en el cambio con aprender a aceptar."
  },
  {
    id: 20,
    texto: "Actúa como la pareja que quieres ser, aunque estés molesto/a.",
    explicacion: "Las emociones difíciles van a llegar, y tú decides qué hacer con ellas. Tener claro qué tipo de pareja quieres ser te ayuda a decidir cómo actuar en los momentos tensos.",
    practica: "Escribe tres palabras que describan a la pareja que quieres ser (por ejemplo: paciente, honesta, juguetona). En la próxima tensión, pregúntate: \"¿Qué haría esa persona ahora?\".",
    autor: "Russ Harris",
    quienEs: "Médico y terapeuta, autor de ACT con amor. Lleva la Terapia de Aceptación y Compromiso a la vida en pareja."
  },
  {
    id: 21,
    texto: "Toma su mano cuando la cosa se ponga difícil.",
    explicacion: "El contacto de alguien que quieres le dice a tu cuerpo que no estás solo/a frente al problema. El estrés se siente más ligero.",
    practica: "Si tu amor está pasando por algo estresante, ofrécele tu mano o un abrazo largo antes de decir cualquier cosa.",
    autor: "James Coan",
    quienEs: "Neurocientífico de la Universidad de Virginia. En su estudio, tomar la mano de la pareja redujo la respuesta del cerebro ante una amenaza, sobre todo en las relaciones más felices."
  },
  {
    id: 22,
    texto: "Trátate con la paciencia que le tendrías a tu pareja.",
    explicacion: "Cuando eres muy duro/a contigo, esa dureza termina saliendo hacia los demás. Hablarte con cariño te deja más paciencia para tu amor.",
    practica: "La próxima vez que te equivoques, nota cómo te hablas. Cambia el \"qué tonto/a soy\" por lo que le dirías a alguien que quieres: \"Fue un día pesado, mañana lo intento otra vez\".",
    autor: "Kristin Neff",
    quienEs: "Pionera en el estudio de la autocompasión. Encontró que las personas que se tratan con compasión son descritas por sus parejas como más cariñosas y menos controladoras."
  },
  {
    id: 23,
    texto: "Di lo que te molesta mientras todavía es pequeño.",
    explicacion: "Las molestias que callas se van juntando y luego salen todas de golpe en una pelea que parece exagerada. Hablar a tiempo evita el resentimiento.",
    practica: "Si hay algo chiquito que te incomodó esta semana, dilo hoy con calma y desde ti: \"Me sentí un poco ignorado/a cuando...\".",
    autor: "Harriet Lerner",
    quienEs: "Psicóloga y autora de La danza de la ira. Ve el enojo como una señal útil que conviene escuchar a tiempo."
  },
  {
    id: 24,
    texto: "Cuida tu propio mundo.",
    explicacion: "Cuando la relación se vuelve pura rutina y pendientes, el deseo se apaga. Ver a tu pareja en lo suyo, haciendo algo que le apasiona, despierta de nuevo la atracción.",
    practica: "Dedica un rato a algo que sea solo tuyo: un hobby, tus amistades, un proyecto. Y si puedes, observa a tu amor cuando está en lo suyo.",
    autor: "Esther Perel",
    quienEs: "Psicoterapeuta y autora de Inteligencia erótica. Explica que el amor busca cercanía y el deseo necesita un poco de distancia."
  },
  {
    id: 25,
    texto: "Cuando hablen de un problema, usa \"nosotros\".",
    explicacion: "\"Tú siempre llegas tarde\" pone a cada quien en un bando. \"¿Cómo le hacemos con los horarios?\" pone el problema enfrente y a los dos del mismo lado.",
    practica: "En la próxima conversación difícil, empieza con \"nosotros\": \"¿Qué podemos hacer para...?\".",
    autor: "Robert Levenson",
    quienEs: "Psicólogo de UC Berkeley. Encontró que las parejas de muchos años que dicen más \"nosotros\" al discutir se tratan mejor y se tensan menos."
  },
  {
    id: 26,
    texto: "Puedes acompañar a tu pareja sin cargar su estrés.",
    explicacion: "Si cada vez que tu amor se angustia tú también te angustias, los dos se hunden. Mantener tu calma mientras sigues presente le da un lugar seguro donde apoyarse.",
    practica: "Cuando tu pareja esté nerviosa, respira profundo antes de responder y recuérdate: \"Puedo acompañarle sin hacer mía su emoción\".",
    autor: "Murray Bowen",
    quienEs: "Psiquiatra que estudió a las familias como sistemas. Llamó \"diferenciación\" a la capacidad de seguir cerca de los demás sin perder tu centro."
  },
  {
    id: 27,
    texto: "Repartan también las tareas que no se ven.",
    explicacion: "Acordarte del cumpleaños de la suegra, saber qué falta en el refri, sacar cita con el dentista: todo eso cansa aunque nadie lo vea. Cuando una sola persona lo carga, se va juntando el resentimiento.",
    practica: "Hagan juntos una lista de las tareas \"invisibles\" de la casa y pregunta: \"¿Hay algo de aquí que yo pueda tomar completo, desde acordarme hasta hacerlo?\".",
    autor: "Arlie Hochschild",
    quienEs: "Socióloga de UC Berkeley, autora de La doble jornada. Documentó cómo el trabajo de casa mal repartido afecta a las parejas."
  },
  {
    id: 28,
    texto: "Perdona a tu ritmo.",
    explicacion: "Guardar rencor te mantiene amarrado/a a lo que pasó. Perdonar te ayuda a soltar ese peso, a tu ritmo y con los límites que necesites.",
    practica: "Si cargas algo que tu pareja hizo, intenta imaginar qué estaba viviendo en ese momento. Entender su contexto suele ser el primer paso para soltar.",
    autor: "Everett Worthington",
    quienEs: "Psicólogo de Virginia Commonwealth University. Creó el modelo REACH, un camino de cinco pasos para perdonar que se ha probado en muchos estudios."
  },
  {
    id: 29,
    texto: "Si dormiste mal, deja la plática difícil para otro día.",
    explicacion: "Con poco sueño estás más irritable y te cuesta leer lo que siente el otro. Una mala noche puede convertir una plática normal en una pelea.",
    practica: "Si dormiste mal, avísale en la mañana: \"Hoy dormí fatal, ten paciencia conmigo\". Y si sale un tema delicado, propón retomarlo cuando estén descansados.",
    autor: "Amie Gordon",
    quienEs: "Psicóloga que estudió en UC Berkeley cómo el sueño afecta a las parejas. Encontró más peleas y menos empatía después de una mala noche."
  },
  {
    id: 30,
    texto: "Evita el sarcasmo y la burla con tu pareja.",
    explicacion: "Rodar los ojos, burlarte o hablar desde arriba le dice a tu amor \"te veo menos que yo\". Es de lo que más daña a una relación, aunque sea en broma.",
    practica: "Si notas que te sale el sarcasmo, detente y busca qué necesitas en realidad. Y para equilibrar, dile hoy a tu pareja algo que admiras de ella.",
    autor: "Dr. y Dra. Gottman",
    quienEs: "Encontraron que el desprecio es la señal que mejor predice una separación. Su antídoto es llenar la relación de aprecio y admiración."
  }
];

function CouplePandaSVG({ happy = false, size = 160 }) {
  const s = size;
  // Vectorized to match the reference character sheet exactly: light warm
  // gray patches (not charcoal), no eye-white/shine (pupil sits directly on
  // the patch), pill-shaped nose, peach-orange cheeks, warm brown outline.
  // Head pivots (76,88)/(176,88) and rotation angles are load-bearing:
  // PandaAccessoryLayer positions hats/glasses/scarves/outfits relative to
  // these exact same anchors — keep them unchanged.
  const INK = "#3d2b1f", WHITE = "#fefdfb", GRAY = "#6c6c76", PUPIL = "#33201a", CHEEK = "#f5a878";
  return (
    <svg viewBox="0 0 260 220" width={s} height={s * 0.846} style={{ display: "block" }}>
      <ellipse cx="82" cy="208" rx="42" ry="7" fill={INK} opacity="0.1"/>
      {/* Shoulder yoke — connects into the arms to read as one continuous cape, no seam */}
      <path d="M44 140 C48 130 62 124 76 124 C90 124 104 130 108 140 L108 160 L44 160Z" fill={GRAY} stroke="none"/>
      <path d="M52 205 C35 205 28 185 30 165 C32 145 42 132 62 128 C72 126 82 126 92 128 C112 132 122 145 122 165 C124 185 117 205 100 205 Z" fill={WHITE} stroke={INK} strokeWidth="4"/>
      <ellipse cx="134" cy="150" rx="19" ry="12" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(-15 134 150)"/>
      <ellipse cx="30" cy="173" rx="11" ry="17" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(12 30 173)"/>
      <ellipse cx="57" cy="198" rx="21" ry="13" fill={INK}/>
      <ellipse cx="57" cy="197" rx="18" ry="11" fill={GRAY}/>
      <line x1="50" y1="203" x2="49" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="57" y1="204" x2="57" y2="208" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="64" y1="203" x2="65" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <ellipse cx="98" cy="198" rx="21" ry="13" fill={INK}/>
      <ellipse cx="98" cy="197" rx="18" ry="11" fill={GRAY}/>
      <line x1="91" y1="203" x2="90" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="98" y1="204" x2="98" y2="208" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="105" y1="203" x2="106" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>

      <g transform="rotate(6, 76, 95)">
        {/* Ears drawn BEHIND the head — only the top peeks out above the head outline */}
        <ellipse cx="44" cy="57" rx="17" ry="16" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
        <ellipse cx="108" cy="57" rx="17" ry="16" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
        <ellipse cx="76" cy="88" rx="44" ry="42" fill={WHITE} stroke={INK} strokeWidth="4"/>
        <ellipse cx="57" cy="84" rx="13" ry="12" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(-8 57 84)"/>
        <ellipse cx="95" cy="84" rx="13" ry="12" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(8 95 84)"/>
        {happy ? <><path d="M48 86 Q57 93 66 86" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"/><path d="M86 86 Q95 93 104 86" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"/></> : <><ellipse cx="59" cy="85" rx="6" ry="5.5" fill={PUPIL}/><ellipse cx="93" cy="85" rx="6" ry="5.5" fill={PUPIL}/><circle cx="61" cy="82.8" r="1.3" fill="white" opacity="0.8"/><circle cx="95" cy="82.8" r="1.3" fill="white" opacity="0.8"/></>}
        <rect x="71" y="95" width="10" height="6" rx="3" fill={INK}/>
        {happy ? <path d="M68 105 Q72 110 76 106 Q80 110 84 105" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M68 104 Q72 109 76 105 Q80 109 84 104" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}
        <ellipse cx="40" cy="99" rx="11" ry="7" fill={CHEEK} opacity={happy ? "0.95" : "0.85"}/>
        <ellipse cx="112" cy="99" rx="11" ry="7" fill={CHEEK} opacity={happy ? "0.95" : "0.85"}/>
      </g>

      <ellipse cx="182" cy="208" rx="44" ry="7" fill={INK} opacity="0.1"/>
      <path d="M144 140 C148 130 162 124 176 124 C190 124 204 130 208 140 L208 160 L144 160Z" fill={GRAY} stroke="none"/>
      <path d="M148 205 C131 205 124 185 126 165 C128 144 138 131 160 128 C170 126 182 126 194 128 C214 131 224 145 224 165 C226 185 219 205 202 205 Z" fill={WHITE} stroke={INK} strokeWidth="4"/>
      <ellipse cx="122" cy="148" rx="19" ry="12" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(15 122 148)"/>
      <ellipse cx="225" cy="173" rx="11" ry="17" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(-12 225 173)"/>
      <ellipse cx="157" cy="198" rx="22" ry="13" fill={INK}/>
      <ellipse cx="157" cy="197" rx="19" ry="11" fill={GRAY}/>
      <line x1="150" y1="203" x2="149" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="157" y1="204" x2="157" y2="208" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="164" y1="203" x2="165" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <ellipse cx="198" cy="198" rx="22" ry="13" fill={INK}/>
      <ellipse cx="198" cy="197" rx="19" ry="11" fill={GRAY}/>
      <line x1="191" y1="203" x2="190" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="198" y1="204" x2="198" y2="208" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="205" y1="203" x2="206" y2="207" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>

      <g transform="rotate(-4, 176, 90)">
        <ellipse cx="140" cy="57" rx="18" ry="17" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
        <ellipse cx="212" cy="57" rx="18" ry="17" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
        <ellipse cx="176" cy="88" rx="46" ry="44" fill={WHITE} stroke={INK} strokeWidth="4"/>
        <ellipse cx="158" cy="83" rx="11" ry="13" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(-14 158 83)"/>
        <ellipse cx="193" cy="85" rx="14" ry="12" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(6 193 85)"/>
        {happy ? <><path d="M151 85 Q158 92 165 85" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"/><path d="M186 86 Q193 93 200 86" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round"/></> : <><ellipse cx="159" cy="84" rx="5.5" ry="5" fill={PUPIL}/><ellipse cx="195" cy="85" rx="5.5" ry="5" fill={PUPIL}/><circle cx="161" cy="81.8" r="1.2" fill="white" opacity="0.8"/><circle cx="197" cy="82.8" r="1.3" fill="white" opacity="0.8"/></>}
        <rect x="171" y="97" width="10" height="6" rx="3" fill={INK}/>
        <path d="M167 106 Q170 109 173 106.5 Q176 109.5 179 106.5 Q182 109 185 106" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        <ellipse cx="140" cy="101" rx="11" ry="7" fill={CHEEK} opacity={happy ? "0.9" : "0.8"}/>
        <ellipse cx="214" cy="103" rx="11" ry="7" fill={CHEEK} opacity={happy ? "0.9" : "0.8"}/>
      </g>

      {happy && (
        <>
          <path d="M122 100 C122 95 126 93 130 97 C134 93 138 95 138 100 C138 106 130 115 130 115 C130 115 122 106 122 100Z" fill="#e8604c" stroke={INK} strokeWidth="1.5" opacity="0.95"/>
          <path d="M106 78 C106 75 108 74 110 76 C112 74 114 75 114 78 C114 81 110 85 110 85 C110 85 106 81 106 78Z" fill={CHEEK} opacity="0.85"/>
          <path d="M144 72 C144 70 145.5 69 147 71 C148.5 69 150 70 150 72 C150 74.5 147 78 147 78 C147 78 144 74.5 144 72Z" fill={CHEEK} opacity="0.75"/>
        </>
      )}
    </svg>
  );
}

function SinglePandaSVG({ size = 100 }) {
  const INK = "#3d2b1f", WHITE = "#fefdfb", GRAY = "#6c6c76", PUPIL = "#33201a", CHEEK = "#f5a878";
  return (
    <svg viewBox="0 0 160 200" width={size} height={size * 1.25} style={{ display: "block" }}>
      <ellipse cx="80" cy="196" rx="38" ry="6" fill={INK} opacity="0.12"/>
      <path d="M40 128 C44 118 58 112 80 112 C102 112 116 118 120 128 L120 148 L40 148Z" fill={GRAY} stroke="none"/>
      <path d="M42 195 C28 195 22 175 24 155 C26 138 38 126 58 122 C66 120 80 120 94 122 C114 126 126 138 128 155 C130 175 124 195 110 195Z" fill={WHITE} stroke={INK} strokeWidth="4"/>
      <ellipse cx="57" cy="190" rx="19" ry="11" fill={INK}/>
      <ellipse cx="57" cy="189" rx="16" ry="9" fill={GRAY}/>
      <ellipse cx="97" cy="190" rx="19" ry="11" fill={INK}/>
      <ellipse cx="97" cy="189" rx="16" ry="9" fill={GRAY}/>
      <ellipse cx="26" cy="165" rx="10" ry="16" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(12 26 165)"/>
      <ellipse cx="126" cy="165" rx="10" ry="16" fill={GRAY} stroke={INK} strokeWidth="3" transform="rotate(-12 126 165)"/>
      <ellipse cx="46" cy="42" rx="19" ry="18" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
      <ellipse cx="114" cy="42" rx="19" ry="18" fill={GRAY} stroke={INK} strokeWidth="3.5"/>
      <circle cx="80" cy="76" r="50" fill={WHITE} stroke={INK} strokeWidth="4"/>
      <ellipse cx="59" cy="76" rx="15" ry="14" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(-8 59 76)"/>
      <ellipse cx="101" cy="76" rx="15" ry="14" fill={GRAY} stroke={INK} strokeWidth="2.5" transform="rotate(8 101 76)"/>
      <circle cx="62" cy="77" r="6.5" fill={PUPIL}/>
      <circle cx="104" cy="77" r="6.5" fill={PUPIL}/>
      <circle cx="64.5" cy="74.5" r="1.6" fill="white" opacity="0.8"/>
      <circle cx="106.5" cy="74.5" r="1.6" fill="white" opacity="0.8"/>
      <rect x="75" y="92" width="10" height="6" rx="3" fill={INK}/>
      <path d="M72 103 Q80 112 88 103" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round"/>
      <ellipse cx="38" cy="92" rx="14" ry="8.5" fill={CHEEK} opacity="0.85"/>
      <ellipse cx="122" cy="92" rx="14" ry="8.5" fill={CHEEK} opacity="0.85"/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════

function Btn({ children, onClick, disabled, variant = "dark", style = {} }) {
  const V = {
    dark: { bg: C.dark, fg: C.cream2 },
    olive: { bg: C.olive, fg: C.cream2 },
    cream: { bg: C.cream, fg: C.ink },
    sand: { bg: C.sand, fg: C.ink },
    salmon: { bg: C.salmon, fg: C.white },
    rose: { bg: C.rose, fg: C.white },
    ghost: { bg: "transparent", fg: C.inkM, border: `2px solid ${C.border}` }
  };
  const v = V[variant] || V.dark;
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ fontFamily: "'Baloo 2',sans-serif", letterSpacing: "0.4px", background: v.bg, color: v.fg, border: v.border || "none", borderRadius: 12, padding: "12px 24px", fontSize: "0.98rem", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, boxShadow: disabled ? "none" : "0 3px 0 rgba(0,0,0,0.18)", transition: "transform 0.12s", ...style }}
      onMouseDown={e => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.boxShadow = "0 1px 0 rgba(0,0,0,0.18)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 3px 0 rgba(0,0,0,0.18)"; }}>
      {children}
    </button>
  );
}

function TA({ value, onChange, placeholder, rows = 2, style = {} }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px 13px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", resize: "none", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", lineHeight: 1.5, ...style }} />;
}

function Inp({ value, onChange, placeholder, type = "text", autoFocus = false, style = {} }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", ...style }} />;
}

function Tag({ children, bg = C.sand, color = C.inkM }) {
  return <span style={{ background: bg, color, borderRadius: 6, padding: "3px 9px", fontSize: "0.7rem", fontWeight: 800, display: "inline-block", letterSpacing: "0.4px" }}>{children}</span>;
}

function ProgBar({ value, max = 100, color = C.olive, height = 6, style = {} }) {
  return <div style={{ height, background: C.sand, borderRadius: 50, overflow: "hidden", ...style }}><div style={{ height: "100%", width: `${Math.min(100, (value / max) * 100)}%`, background: color, borderRadius: 50, transition: "width 0.5s" }} /></div>;
}

function PBadge({ who = "A", name }) {
  const label = name || (who === "A" ? "Persona A" : "Persona B");
  return <div style={{ display: "inline-block", background: who === "A" ? C.cream : "#d4e8c4", color: C.ink, borderRadius: 7, padding: "2px 11px", fontSize: "0.72rem", fontWeight: 800, marginBottom: 6, letterSpacing: "0.4px" }}>{label}</div>;
}

function ScreenTop({ title, sub, bg }) {
  return <div style={{ background: bg || C.dark, padding: "48px 20px 24px", textAlign: "center" }}>
    <h1 style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.9rem", color: C.cream2, margin: 0, letterSpacing: "0.5px" }}>{title}</h1>
    {sub && <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>{sub}</p>}
  </div>;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: C.dark, color: C.cream2, padding: "11px 22px", borderRadius: 12, fontFamily: "'Nunito',sans-serif", fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", zIndex: 9999, boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>{msg}</div>;
}

// ═══════════════════════════════════════════════════════
// GARDEN ITEMS
// ═══════════════════════════════════════════════════════

function ItemIcon({ id, size = 38 }) {
  const s = size;
  const icons = {
    bamboo: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="17" y="2" width="7" height="44" rx="3.5" fill="#4a6e30" /><rect x="14" y="12" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="14" y="26" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="14" y="38" width="13" height="5" rx="2.5" fill="#3a5824" /><ellipse cx="10" cy="10" rx="12" ry="5" fill="#5a7e3c" transform="rotate(-30 10 10)" /><ellipse cx="30" cy="6" rx="10" ry="4" fill="#6a8a48" transform="rotate(20 30 6)" /></svg>),
    bamboo2: (<svg viewBox="0 0 48 48" width={s} height={s}><rect x="10" y="2" width="7" height="44" rx="3.5" fill="#4a6e30" /><rect x="7" y="14" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="7" y="30" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="26" y="6" width="7" height="40" rx="3.5" fill="#5a8035" /><rect x="23" y="18" width="13" height="5" rx="2.5" fill="#3a6020" /><rect x="23" y="32" width="13" height="5" rx="2.5" fill="#3a6020" /></svg>),
    flowers: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="24" width="5" height="22" rx="2.5" fill="#5a7e3c" /><circle cx="20" cy="20" r="8" fill="#f4b8c8" /><circle cx="11" cy="17" r="6" fill="#f4b8c8" /><circle cx="29" cy="17" r="6" fill="#f4b8c8" /><circle cx="20" cy="20" r="5" fill="#f8e0a0" /></svg>),
    peony: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="26" width="5" height="20" rx="2.5" fill="#5a7e3c" /><ellipse cx="20" cy="14" rx="14" ry="12" fill="#d4a0d8" /><ellipse cx="20" cy="16" rx="10" ry="9" fill="#e0b8e8" /><ellipse cx="20" cy="18" rx="6" ry="6" fill="#f0d0f4" /><ellipse cx="20" cy="19" rx="3" ry="3" fill="#f8e0a0" /></svg>),
    tree: (<svg viewBox="0 0 48 48" width={s} height={s}><rect x="21" y="30" width="7" height="16" rx="3" fill="#9a7848" /><circle cx="24" cy="22" r="14" fill="#f4a8b8" opacity="0.85" /><circle cx="14" cy="26" r="10" fill="#f8b8c8" opacity="0.85" /><circle cx="34" cy="25" r="11" fill="#f0a0b0" opacity="0.85" /></svg>),
    lake: (<svg viewBox="0 0 48 28" width={s} height={s * 0.6}><ellipse cx="24" cy="16" rx="22" ry="11" fill="#88b8c8" /><ellipse cx="24" cy="14" rx="18" ry="8" fill="#a8d0e0" /><ellipse cx="16" cy="16" rx="5" ry="3.5" fill="#5a9030" opacity="0.8" /><circle cx="16" cy="14" r="1.5" fill="#e8607a" /></svg>),
    butterfly: (<svg viewBox="0 0 48 36" width={s} height={s * 0.75}><ellipse cx="14" cy="14" rx="13" ry="10" fill="#c0a0e0" transform="rotate(-15 14 14)" /><ellipse cx="34" cy="14" rx="13" ry="10" fill="#b090d0" transform="rotate(15 34 14)" /><ellipse cx="24" cy="18" rx="3" ry="10" fill="#5a3080" /></svg>),
    rainbow: (<svg viewBox="0 0 48 28" width={s} height={s * 0.6}><path d="M4 26 Q24 2 44 26" fill="none" stroke="#e87878" strokeWidth="4" strokeLinecap="round" /><path d="M8 26 Q24 7 40 26" fill="none" stroke="#e8a858" strokeWidth="4" strokeLinecap="round" /><path d="M12 26 Q24 11 36 26" fill="none" stroke="#e8d860" strokeWidth="4" strokeLinecap="round" /><path d="M16 26 Q24 15 32 26" fill="none" stroke="#8ac868" strokeWidth="4" strokeLinecap="round" /><path d="M20 26 Q24 18 28 26" fill="none" stroke="#88b8d8" strokeWidth="4" strokeLinecap="round" /></svg>),
    sun: (<svg viewBox="0 0 48 48" width={s} height={s}>{[0, 45, 90, 135, 180, 225, 270, 315].map(a => (<line key={a} x1={24 + Math.cos(a * Math.PI / 180) * 16} y1={24 + Math.sin(a * Math.PI / 180) * 16} x2={24 + Math.cos(a * Math.PI / 180) * 22} y2={24 + Math.sin(a * Math.PI / 180) * 22} stroke="#e88040" strokeWidth="3" strokeLinecap="round" />))}<circle cx="24" cy="24" r="12" fill="#e88040" /><circle cx="24" cy="24" r="8" fill="#f0a050" /></svg>),
    water: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="8" y="24" width="28" height="12" rx="4" fill="#88b8c8" /><path d="M36 28 L44 22 L44 26 L36 32Z" fill="#7aaaba" /><path d="M10 24 Q4 18 8 12 Q12 8 18 12" fill="none" stroke="#7aaaba" strokeWidth="4" strokeLinecap="round" /></svg>),
    lantern: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="2" width="5" height="6" rx="2" fill="#9a7848" /><rect x="14" y="12" width="13" height="24" rx="6" fill="#e88040" /><rect x="16" y="12" width="9" height="24" rx="4" fill="#f0a050" opacity="0.6" /><ellipse cx="20" cy="12" rx="8" ry="3" fill="#9a7848" /><ellipse cx="20" cy="36" rx="8" ry="3" fill="#9a7848" /><rect x="19" y="36" width="3" height="8" rx="1.5" fill="#9a7848" /></svg>),
    heart: (<svg viewBox="0 0 40 40" width={s} height={s}><path d="M20 34 C20 34 4 22 4 13 C4 7 9 4 14 6 C17 7 20 10 20 10 C20 10 23 7 26 6 C31 4 36 7 36 13 C36 22 20 34 20 34Z" fill="#e8607a" /><path d="M20 28 C20 28 9 20 9 15 C9 12 11 10 13 11 C15 12 20 15 20 15" fill="#f4a8c0" opacity="0.5" /></svg>),
  };
  return icons[id] || <svg viewBox="0 0 40 40" width={s} height={s}><circle cx="20" cy="20" r="16" fill={C.sand} /></svg>;
}

// ═══════════════════════════════════════════════════════
// GARDEN SCENE
// ═══════════════════════════════════════════════════════

function GardenBg({ garden }) {
  const g = garden;
  return (
    <svg viewBox="0 0 390 270" style={{ width: "100%", display: "block" }}>
      <rect width="390" height="270" fill="#f0e8d4" />
      <circle cx="330" cy="52" r={g.sun ? 38 : 26} fill={g.sun ? "#e88040" : "#d4a843"} opacity={g.sun ? 1 : 0.5} />
      {g.sun && [0, 40, 80, 120, 160, 200, 240, 280, 320].map(a => (
        <line key={a} x1={330 + Math.cos(a * Math.PI / 180) * 42} y1={52 + Math.sin(a * Math.PI / 180) * 42} x2={330 + Math.cos(a * Math.PI / 180) * 52} y2={52 + Math.sin(a * Math.PI / 180) * 52} stroke="#e88040" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
      ))}
      {g.rainbow && [["#e87878", 4], ["#e8a858", 4], ["#e8d860", 4], ["#8ac868", 4], ["#88b8d8", 4]].map(([col, w], i) => (
        <path key={i} d={`M${15 + i * 7},265 Q${130},${130 + i * 8} ${245 + i * 7},265`} fill="none" stroke={col} strokeWidth={w + 2} strokeLinecap="round" opacity="0.65" />
      ))}
      <polygon points="0,270 90,138 180,270" fill="#7ab848" />
      <polygon points="50,270 155,108 260,270" fill="#5a9030" />
      <polygon points="210,270 295,148 380,270" fill="#88b8c8" opacity="0.85" />
      <rect y="242" width="390" height="28" fill="#b8d8a0" />
      {g.bamboo && <g>
        <rect x="48" y="75" width="10" height="185" rx="5" fill="#4a6e30" />
        <rect x="46" y="105" width="14" height="8" rx="4" fill="#3a5824" />
        <rect x="46" y="140" width="14" height="8" rx="4" fill="#3a5824" />
        <ellipse cx="34" cy="90" rx="22" ry="8" fill="#5a7e3c" transform="rotate(-30 34 90)" />
      </g>}
      {g.bamboo2 && <g>
        <rect x="72" y="75" width="10" height="185" rx="5" fill="#4a6e30" />
        <rect x="70" y="115" width="14" height="8" rx="4" fill="#3a5824" />
        <rect x="70" y="155" width="14" height="8" rx="4" fill="#3a5824" />
      </g>}
      {g.flowers && <g>
        <rect x="114" y="198" width="6" height="44" rx="3" fill="#5a7e3c" />
        <circle cx="117" cy="194" r="13" fill="#f4b8c8" />
        <circle cx="107" cy="198" r="9" fill="#f4b8c8" opacity="0.8" />
        <circle cx="117" cy="194" r="7" fill="#f8e0a0" />
      </g>}
      {g.peony && <g>
        <rect x="142" y="200" width="6" height="42" rx="3" fill="#5a7e3c" />
        <ellipse cx="145" cy="194" rx="15" ry="13" fill="#d4a0d8" />
        <ellipse cx="145" cy="196" rx="10" ry="9" fill="#f0d0f4" />
        <ellipse cx="145" cy="197" rx="5" ry="5" fill="#f8e0a0" />
      </g>}
      {g.tree && <g>
        <rect x="290" y="168" width="14" height="72" rx="6" fill="#9a7848" />
        <circle cx="297" cy="150" r="34" fill="#f4a8b8" opacity="0.75" />
        <circle cx="276" cy="160" r="24" fill="#f8b8c8" opacity="0.75" />
        <circle cx="318" cy="156" r="26" fill="#f0a0b0" opacity="0.75" />
      </g>}
      {g.lake && <g>
        <ellipse cx="200" cy="258" rx="70" ry="16" fill="#88b8c8" opacity="0.65" />
        <ellipse cx="200" cy="255" rx="56" ry="10" fill="#a8d0e0" opacity="0.55" />
        <ellipse cx="184" cy="255" rx="6" ry="4" fill="#5a9030" opacity="0.7" />
        <circle cx="184" cy="252" r="2" fill="#e8607a" opacity="0.8" />
      </g>}
      {g.butterfly && <g>
        <ellipse cx="166" cy="145" rx="15" ry="9" fill="#c0a0e0" opacity="0.9" transform="rotate(-18 166 145)" />
        <ellipse cx="150" cy="147" rx="15" ry="9" fill="#b090d0" opacity="0.9" transform="rotate(18 150 147)" />
        <ellipse cx="158" cy="149" rx="2.5" ry="8" fill="#5a3080" />
      </g>}
      {g.heart && <g>
        <path d="M185 80 C185 80 174 70 174 63 C174 58 178 56 181 57 C183 58 185 60 185 60 C185 60 187 58 189 57 C192 56 196 58 196 63 C196 70 185 80 185 80Z" fill="#e8607a" opacity="0.85" />
      </g>}
      {g.lantern && <g>
        <rect x="350" y="130" width="5" height="30" rx="2" fill="#9a7848" />
        <rect x="344" y="160" width="17" height="30" rx="7" fill="#e88040" />
        <rect x="346" y="160" width="13" height="30" rx="5" fill="#f0a050" opacity="0.5" />
        <ellipse cx="352" cy="160" rx="9" ry="3.5" fill="#9a7848" />
        <ellipse cx="352" cy="190" rx="9" ry="3.5" fill="#9a7848" />
      </g>}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════
// GARDEN ITEM ICONS — koi/lotus/chinese watercolor aesthetic
// ═══════════════════════════════════════════════
function GardenItemIcon({ id, size = 38 }) {
  const s = size;
  const icons = {
    // Plantas
    bamboo1: (<svg viewBox="0 0 40 52" width={s} height={s}><rect x="18" y="2" width="7" height="48" rx="3.5" fill="#4a7a30"/><rect x="15" y="10" width="12" height="5" rx="2.5" fill="#3a6020"/><rect x="15" y="24" width="12" height="5" rx="2.5" fill="#3a6020"/><rect x="15" y="38" width="12" height="5" rx="2.5" fill="#3a6020"/><ellipse cx="8" cy="8" rx="13" ry="5" fill="#5a8a3c" transform="rotate(-35 8 8)"/><ellipse cx="32" cy="5" rx="11" ry="4" fill="#6a9a48" transform="rotate(22 32 5)"/></svg>),
    bamboo2: (<svg viewBox="0 0 52 52" width={s} height={s}><rect x="8" y="2" width="7" height="48" rx="3.5" fill="#4a7a30"/><rect x="5" y="12" width="12" height="5" rx="2.5" fill="#3a6020"/><rect x="5" y="28" width="12" height="5" rx="2.5" fill="#3a6020"/><rect x="24" y="6" width="7" height="44" rx="3.5" fill="#5a8a35"/><rect x="21" y="16" width="12" height="5" rx="2.5" fill="#3a6520"/><rect x="21" y="32" width="12" height="5" rx="2.5" fill="#3a6520"/><rect x="38" y="10" width="6" height="40" rx="3" fill="#4a7a2c"/><rect x="36" y="22" width="10" height="4" rx="2" fill="#3a6020"/></svg>),
    lotus1: (<svg viewBox="0 0 44 44" width={s} height={s}><ellipse cx="22" cy="36" rx="16" ry="6" fill="#88c8a8" opacity="0.6"/><rect x="20" y="22" width="4" height="14" rx="2" fill="#5a9060"/><ellipse cx="22" cy="22" rx="12" ry="10" fill="#f4a8b8"/><ellipse cx="22" cy="24" rx="8" ry="7" fill="#f8c0cc"/><ellipse cx="22" cy="22" rx="4" ry="5" fill="#fce8ec"/><ellipse cx="22" cy="26" rx="6" ry="4" fill="#f4a8b8" opacity="0.6"/><ellipse cx="13" cy="26" rx="7" ry="9" fill="#f4a8b8" transform="rotate(25 13 26)"/><ellipse cx="31" cy="26" rx="7" ry="9" fill="#f0a0b4" transform="rotate(-25 31 26)"/></svg>),
    lotus2: (<svg viewBox="0 0 44 44" width={s} height={s}><ellipse cx="22" cy="36" rx="16" ry="6" fill="#88c8a8" opacity="0.6"/><rect x="20" y="22" width="4" height="14" rx="2" fill="#5a9060"/><ellipse cx="22" cy="22" rx="12" ry="10" fill="#f8f8f8"/><ellipse cx="22" cy="24" rx="8" ry="7" fill="white"/><ellipse cx="22" cy="22" rx="4" ry="5" fill="#fff8e8"/><ellipse cx="13" cy="26" rx="7" ry="9" fill="#f0f0f0" transform="rotate(25 13 26)"/><ellipse cx="31" cy="26" rx="7" ry="9" fill="#eeeeee" transform="rotate(-25 31 26)"/><ellipse cx="22" cy="21" rx="3" ry="2" fill="#f8e060"/></svg>),
    willow: (<svg viewBox="0 0 48 52" width={s} height={s}><rect x="22" y="10" width="5" height="40" rx="2.5" fill="#8a7040"/>{[[-14,0],[- 9,4],[-4,2],[1,0],[6,3],[11,1],[16,-1]].map(([dx,dy],i)=><line key={i} x1={24} y1={12+i*4} x2={24+dx} y2={28+i*3+dy} stroke="#6a9040" strokeWidth="2" strokeLinecap="round" opacity="0.85"/>)}<ellipse cx="24" cy="8" rx="14" ry="8" fill="#7ab848" opacity="0.9"/></svg>),
    peony: (<svg viewBox="0 0 44 52" width={s} height={s}><rect x="20" y="28" width="5" height="22" rx="2.5" fill="#5a7e3c"/><ellipse cx="22" cy="16" rx="14" ry="12" fill="#d4a0d8"/><ellipse cx="22" cy="18" rx="10" ry="9" fill="#e0b8e8"/><ellipse cx="22" cy="20" rx="6" ry="6" fill="#f0d0f4"/><ellipse cx="22" cy="21" rx="3" ry="3" fill="#f8e0a0"/><ellipse cx="12" cy="22" rx="8" ry="10" fill="#c890cc" transform="rotate(20 12 22)" opacity="0.7"/><ellipse cx="32" cy="22" rx="8" ry="10" fill="#c890cc" transform="rotate(-20 32 22)" opacity="0.7"/></svg>),
    cherry: (<svg viewBox="0 0 52 52" width={s} height={s}><rect x="23" y="30" width="7" height="20" rx="3" fill="#9a7848"/><circle cx="26" cy="22" r="16" fill="#f4a8b8" opacity="0.8"/><circle cx="14" cy="28" r="11" fill="#f8b8c8" opacity="0.8"/><circle cx="38" cy="27" r="12" fill="#f0a0b0" opacity="0.8"/>{[16,24,32,20,28,22,30].map((x,i)=><circle key={i} cx={x} cy={15+i*2} r="2" fill="#f4d0d8" opacity="0.7"/>)}</svg>),
    lily: (<svg viewBox="0 0 40 50" width={s} height={s}><rect x="18" y="26" width="5" height="22" rx="2.5" fill="#5a7e3c"/>{[0,60,120,180,240,300].map((a,i)=><ellipse key={i} cx={20+Math.cos(a*Math.PI/180)*11} cy={18+Math.sin(a*Math.PI/180)*9} rx="7" ry="11" fill={i%2===0?"#8ab8e8":"#a8ccf0"} transform={`rotate(${a} ${20+Math.cos(a*Math.PI/180)*11} ${18+Math.sin(a*Math.PI/180)*9})`} opacity="0.85"/>)}<circle cx="20" cy="18" r="5" fill="#f8e060"/></svg>),
    // Agua
    pond: (<svg viewBox="0 0 52 32" width={s} height={s*0.62}><ellipse cx="26" cy="18" rx="24" ry="12" fill="#7ac8b8" opacity="0.7"/><ellipse cx="26" cy="16" rx="20" ry="9" fill="#a8d8e8" opacity="0.6"/><ellipse cx="18" cy="18" rx="7" ry="5" fill="#6ab830" opacity="0.8"/><circle cx="18" cy="15" r="2.5" fill="#e8607a" opacity="0.9"/><ellipse cx="35" cy="20" rx="5" ry="3.5" fill="#6ab830" opacity="0.7"/>{[14,22,30,38].map((x,i)=><ellipse key={i} cx={x} cy={22+i%2} rx="2.5" ry="1.5" fill="#88c8d8" opacity="0.5"/>)}</svg>),
    koi1: (<svg viewBox="0 0 44 28" width={s} height={s*0.64}><ellipse cx="22" cy="14" rx="16" ry="8" fill="#e86040"/><ellipse cx="18" cy="14" rx="12" ry="6" fill="#f07848"/><path d="M6 14 Q2 8 0 14 Q2 20 6 14Z" fill="#e05030"/><circle cx="30" cy="12" r="2.5" fill="white"/><circle cx="30" cy="12" r="1.2" fill="#1a1a1a"/><path d="M12 8 Q16 4 20 8" fill="none" stroke="#f8a870" strokeWidth="1.5" opacity="0.6"/><path d="M12 20 Q16 24 20 20" fill="none" stroke="#f8a870" strokeWidth="1.5" opacity="0.6"/></svg>),
    koi2: (<svg viewBox="0 0 44 28" width={s} height={s*0.64}><ellipse cx="22" cy="14" rx="16" ry="8" fill="#d4a843"/><ellipse cx="18" cy="14" rx="12" ry="6" fill="#e8c060"/><path d="M6 14 Q2 8 0 14 Q2 20 6 14Z" fill="#c89830"/><circle cx="30" cy="12" r="2.5" fill="white"/><circle cx="30" cy="12" r="1.2" fill="#1a1a1a"/><circle cx="20" cy="10" r="2" fill="#e86040" opacity="0.7"/><circle cx="24" cy="16" r="1.5" fill="#e86040" opacity="0.6"/></svg>),
    lotus_pad: (<svg viewBox="0 0 44 28" width={s} height={s*0.64}><ellipse cx="22" cy="16" rx="20" ry="11" fill="#5a9840" opacity="0.85"/><ellipse cx="22" cy="16" rx="16" ry="8" fill="#6aac48" opacity="0.8"/><path d="M22 5 L22 16" stroke="#4a8030" strokeWidth="1.5"/>{[30,60,90,120,150,210,240,270,300,330].map((a,i)=><path key={i} d={`M22 16 L${22+Math.cos(a*Math.PI/180)*18} ${16+Math.sin(a*Math.PI/180)*10}`} stroke="#4a8030" strokeWidth="1" opacity="0.5"/>)}<circle cx="28" cy="8" r="4" fill="#f4a8b8" opacity="0.9"/><circle cx="28" cy="8" r="2.5" fill="#f8c4cc"/></svg>),
    // Cielo
    sun: (<svg viewBox="0 0 48 48" width={s} height={s}>
      {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(
        <line key={a} x1={24+Math.cos(a*Math.PI/180)*15} y1={24+Math.sin(a*Math.PI/180)*15} x2={24+Math.cos(a*Math.PI/180)*22} y2={24+Math.sin(a*Math.PI/180)*22} stroke="#e8a030" strokeWidth="2.6" strokeLinecap="round" opacity="0.8"/>
      ))}
      <circle cx="24" cy="24" r="14" fill="#e8a030" opacity="0.95"/>
      <circle cx="24" cy="24" r="10" fill="#f6c85b"/>
      <ellipse cx="20" cy="19" rx="4" ry="2.5" fill="#fff0b8" opacity="0.45" transform="rotate(-25 20 19)"/>
    </svg>),
    rainbow: (<svg viewBox="0 0 56 34" width={s} height={s*0.61}>
      {[ ["#e87878",0],["#e8a858",6],["#e8d860",12],["#8ac868",18],["#5ab8c8",24] ].map(([c,o],i)=>(
        <path key={i} d={`M${4+o/2} 30 Q28 ${4+o} ${52-o/2} 30`} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
      ))}
      <ellipse cx="8" cy="28" rx="7" ry="4.5" fill="white" opacity="0.92"/>
      <ellipse cx="13" cy="26" rx="5" ry="3.5" fill="white" opacity="0.88"/>
      <ellipse cx="48" cy="28" rx="7" ry="4.5" fill="white" opacity="0.92"/>
      <ellipse cx="43" cy="26" rx="5" ry="3.5" fill="white" opacity="0.88"/>
    </svg>),
    swallow1: (<svg viewBox="0 0 46 34" width={s} height={s*0.74}>
      <g transform="translate(23 17)">
        <path d="M0 -1 C-5 -9 -15 -12 -22 -9 C-16 -6 -11 -2 -7 2 C-12 1 -17 3 -21 7 C-13 7 -7 5 -1 1" fill="#2a3448"/>
        <path d="M0 -1 C5 -9 15 -12 22 -9 C16 -6 11 -2 7 2 C12 1 17 3 21 7 C13 7 7 5 1 1" fill="#2a3448"/>
        <ellipse cx="0" cy="1" rx="4.2" ry="2.6" fill="#1f2838"/>
        <path d="M-1 2 L-6 8 L-2 7 L0 10 L2 7 L6 8 L1 2" fill="#1f2838" opacity="0.95"/>
      </g>
    </svg>),
    swallow2: (<svg viewBox="0 0 60 34" width={s} height={s*0.57}>
      <g transform="translate(18 15) scale(0.9)">
        <path d="M0 -1 C-5 -9 -15 -12 -22 -9 C-16 -6 -11 -2 -7 2 C-12 1 -17 3 -21 7 C-13 7 -7 5 -1 1" fill="#2a3448"/>
        <path d="M0 -1 C5 -9 15 -12 22 -9 C16 -6 11 -2 7 2 C12 1 17 3 21 7 C13 7 7 5 1 1" fill="#2a3448"/>
        <ellipse cx="0" cy="1" rx="4.2" ry="2.6" fill="#1f2838"/>
        <path d="M-1 2 L-6 8 L-2 7 L0 10 L2 7 L6 8 L1 2" fill="#1f2838" opacity="0.95"/>
      </g>
      <g transform="translate(42 19) scale(0.72) rotate(10)">
        <path d="M0 -1 C-5 -9 -15 -12 -22 -9 C-16 -6 -11 -2 -7 2 C-12 1 -17 3 -21 7 C-13 7 -7 5 -1 1" fill="#37435a"/>
        <path d="M0 -1 C5 -9 15 -12 22 -9 C16 -6 11 -2 7 2 C12 1 17 3 21 7 C13 7 7 5 1 1" fill="#37435a"/>
        <ellipse cx="0" cy="1" rx="4.2" ry="2.6" fill="#283246"/>
        <path d="M-1 2 L-6 8 L-2 7 L0 10 L2 7 L6 8 L1 2" fill="#283246" opacity="0.95"/>
      </g>
    </svg>),
    clouds: (<svg viewBox="0 0 54 32" width={s} height={s*0.59}>
      <ellipse cx="28" cy="19" rx="21" ry="10" fill="#dfe8ef" opacity="0.45"/>
      <ellipse cx="18" cy="20" rx="13" ry="7.5" fill="white" opacity="0.92"/>
      <ellipse cx="29" cy="13" rx="13" ry="8.5" fill="white" opacity="0.95"/>
      <ellipse cx="40" cy="18" rx="11" ry="7" fill="white" opacity="0.9"/>
      <ellipse cx="28" cy="19" rx="21" ry="9" fill="none" stroke="#d5e0e8" strokeWidth="1" opacity="0.7"/>
    </svg>),
    // Decoración
    lantern: (<svg viewBox="0 0 32 50" width={s} height={s}><rect x="14" y="2" width="4" height="7" rx="2" fill="#9a7848"/><rect x="10" y="12" width="12" height="22" rx="6" fill="#e86030"/><rect x="12" y="12" width="8" height="22" rx="4" fill="#f08050" opacity="0.7"/><ellipse cx="16" cy="12" rx="7" ry="3" fill="#9a7848"/><ellipse cx="16" cy="34" rx="7" ry="3" fill="#9a7848"/><rect x="14" y="34" width="4" height="8" rx="2" fill="#9a7848"/><circle cx="16" cy="23" r="4" fill="#f8e060" opacity="0.5"/></svg>),
    lantern2: (<svg viewBox="0 0 52 50" width={s} height={s}><line x1="8" y1="0" x2="44" y2="0" stroke="#9a7848" strokeWidth="2"/><line x1="16" y1="0" x2="12" y2="10" stroke="#9a7848" strokeWidth="1.5"/><line x1="36" y1="0" x2="40" y2="10" stroke="#9a7848" strokeWidth="1.5"/><rect x="6" y="10" width="10" height="18" rx="5" fill="#e86030"/><rect x="8" y="10" width="6" height="18" rx="3" fill="#f08050" opacity="0.7"/><ellipse cx="11" cy="10" rx="6" ry="2.5" fill="#9a7848"/><ellipse cx="11" cy="28" rx="6" ry="2.5" fill="#9a7848"/><rect x="30" y="10" width="10" height="18" rx="5" fill="#d4408a"/><rect x="32" y="10" width="6" height="18" rx="3" fill="#e060a0" opacity="0.7"/><ellipse cx="35" cy="10" rx="6" ry="2.5" fill="#9a7848"/><ellipse cx="35" cy="28" rx="6" ry="2.5" fill="#9a7848"/></svg>),
    heart: (<svg viewBox="0 0 40 36" width={s} height={s*0.9}><path d="M20 32 C20 32 3 20 3 10 C3 4 8 1 13 3.5 C16 4.5 20 8.5 20 8.5 C20 8.5 24 4.5 27 3.5 C32 1 37 4 37 10 C37 20 20 32 20 32Z" fill="#e8607a"/><path d="M20 26 C20 26 8 18 8 13 C8 10 10 8 12 9 C14 10 20 14 20 14" fill="#f4a8c0" opacity="0.5"/></svg>),
    bridge: (<svg viewBox="0 0 52 30" width={s} height={s*0.58}><path d="M2 22 Q26 4 50 22" fill="none" stroke="#9a7848" strokeWidth="4" strokeLinecap="round"/><line x1="2" y1="22" x2="2" y2="28" stroke="#8a6838" strokeWidth="3"/><line x1="50" y1="22" x2="50" y2="28" stroke="#8a6838" strokeWidth="3"/>{[10,18,26,34,42].map(x=><line key={x} x1={x} y1={16+(x-26)**2/200} x2={x} y2={28} stroke="#8a6838" strokeWidth="2"/>)}<path d="M0 28 L52 28" stroke="#8a6838" strokeWidth="3"/></svg>),
    pagoda: (<svg viewBox="0 0 44 52" width={s} height={s}><rect x="16" y="46" width="12" height="5" rx="1" fill="#c07840"/><rect x="12" y="38" width="20" height="9" rx="1" fill="#d08848"/><path d="M6 38 L22 28 L38 38Z" fill="#c07040"/><rect x="14" y="28" width="16" height="11" rx="1" fill="#d08848"/><path d="M10 28 L22 18 L34 28Z" fill="#c07040"/><rect x="16" y="18" width="12" height="11" rx="1" fill="#d08848"/><path d="M14 18 L22 8 L30 18Z" fill="#c07040"/><rect x="20" y="2" width="4" height="8" rx="1" fill="#e8a030"/></svg>),
    // Especiales
    firefly: (<svg viewBox="0 0 48 48" width={s} height={s}><circle cx="24" cy="24" r="20" fill="#1a2a1a" opacity="0.2"/>{[[12,15],[30,10],[8,30],[36,28],[20,36],[38,18],[16,22],[28,34]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2.5" fill="#f8e840" opacity="0.9"/><circle cx={x} cy={y} r="4" fill="#f8e840" opacity="0.25"/></g>)}</svg>),
    moongate: (<svg viewBox="0 0 52 52" width={s} height={s}><circle cx="26" cy="22" r="20" fill="none" stroke="#f8e0a0" strokeWidth="3"/><path d="M6 40 L6 22 A20 20 0 0 1 46 22 L46 40" fill="#f8e0a0" opacity="0.1" stroke="#f8e0a0" strokeWidth="2"/><circle cx="26" cy="22" r="16" fill="#1a2a3a" opacity="0.5"/><circle cx="26" cy="22" r="15" fill="none"/>{[5,4,3,2].map((r,i)=><circle key={i} cx={26-r} cy={18+r} r={r} fill="#f8e0a0" opacity={0.4-i*0.08}/>)}<path d="M6 42 L6 52 L46 52 L46 42" fill="#7ab848" opacity="0.8"/></svg>),
    // Chest-exclusive
    love_stone: (<svg viewBox="0 0 44 44" width={s} height={s}><path d="M22 38 L6 28 L6 14 L22 6 L38 14 L38 28 Z" fill="#7ab8d8" stroke="#5a98b8" strokeWidth="2"/><path d="M22 38 L22 24" stroke="#5a98b8" strokeWidth="1.5"/><path d="M22 24 L10 17" stroke="#5a98b8" strokeWidth="1.5"/><path d="M22 24 L34 17" stroke="#5a98b8" strokeWidth="1.5"/><path d="M22 6 L22 14" stroke="#5a98b8" strokeWidth="1.5"/><path d="M16 32 Q22 36 28 32" fill="none" stroke="#e8607a" strokeWidth="2" strokeLinecap="round"/></svg>),
    wishing_tree: (<svg viewBox="0 0 48 52" width={s} height={s}><rect x="22" y="36" width="5" height="14" rx="2" fill="#9a7848"/><ellipse cx="24" cy="28" rx="16" ry="14" fill="#7ab848"/><ellipse cx="24" cy="24" rx="10" ry="9" fill="#9ad868"/>{[[16,32],[24,36],[32,32],[20,40],[28,40]].map(([x,y],i)=><g key={i}><line x1={x} y1={y} x2={x} y2={y+5} stroke="#f8e060" strokeWidth="1"/><circle cx={x} cy={y+6} r="2" fill="#f8e060"/></g>)}</svg>),
    heart_gate: (<svg viewBox="0 0 52 52" width={s} height={s}><path d="M6 46 L6 18 Q6 6 18 6 L34 6 Q46 6 46 18 L46 46" fill="none" stroke="#e890a0" strokeWidth="4" strokeLinecap="round"/><path d="M6 46 L46 46" stroke="#e890a0" strokeWidth="3"/><path d="M26 12 C26 12 18 6 18 14 C18 20 26 26 26 26 C26 26 34 20 34 14 C34 6 26 12 26 12Z" fill="#e8607a"/></svg>),
  };
  return icons[id] || <svg viewBox="0 0 40 40" width={s} height={s}><circle cx="20" cy="20" r="16" fill={C.sand}/></svg>;
}


function PandaAccessoryLayer({ accessories, pandaSize = 160 }) {
  const owned = Object.fromEntries(
    Object.entries(accessories || {}).map(([k, v]) => [k, v === true])
  );
  // New viewBox: 260x220 matching new CouplePandaSVG
  // Left panda head center: ~76, 88 (tilted +6deg)
  // Right panda head center: ~176, 88 (tilted -4deg)
  // Left panda body center: ~76, 168
  // Right panda body center: ~176, 168
  return (
    <svg viewBox="0 0 260 220" width={pandaSize} height={pandaSize * 0.846}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      <defs>
        <radialGradient id="scarf1" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ff8fa3"/>
          <stop offset="100%" stopColor="#d4506a"/>
        </radialGradient>
        <radialGradient id="scarf2" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#7ec8e3"/>
          <stop offset="100%" stopColor="#4a9ab8"/>
        </radialGradient>
        <radialGradient id="goldGrad" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f8e878"/>
          <stop offset="100%" stopColor="#d4a020"/>
        </radialGradient>
      </defs>

      {/* ══════════ LEFT PANDA ACCESSORIES ══════════ */}

      {/* HAT: FLOWER CROWN */}
      {owned.hat_flower && (
        <g transform="rotate(6, 76, 88) translate(76, 44)">
          {/* Vine base */}
          <path d="M-36 0 C-24 -6 -10 -8 0 -8 C10 -8 24 -6 36 0" fill="none" stroke="#5a8a40" strokeWidth="3.5" strokeLinecap="round"/>
          {/* Leaves */}
          <ellipse cx="-22" cy="-4" rx="7" ry="4" fill="#6aaa50" transform="rotate(-30 -22 -4)" opacity="0.9"/>
          <ellipse cx="22" cy="-4" rx="7" ry="4" fill="#6aaa50" transform="rotate(30 22 -4)" opacity="0.9"/>
          <ellipse cx="0" cy="-8" rx="6" ry="3.5" fill="#5a9840" opacity="0.9"/>
          {/* Flowers */}
          {[[-30,-2], [-10,-9], [12,-10], [32,-2]].map(([x,y],i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              {[0,72,144,216,288].map((a,j) => (
                <ellipse key={j} cx={Math.cos(a*Math.PI/180)*5} cy={Math.sin(a*Math.PI/180)*5}
                  rx="4" ry="2.5" fill={[["#ffb8cc","#ffe0ea"],["#f4c860","#ffe898"],["#c8b8f8","#dcecc4"],["#ffb8cc","#ffe0ea"]][i][j%2]}
                  transform={`rotate(${a})`} opacity="0.95"/>
              ))}
              <circle cx="0" cy="0" r="3.5" fill="#fff8d0"/>
            </g>
          ))}
        </g>
      )}

      {/* HAT: CROWN */}
      {owned.hat_crown && (
        <g transform="rotate(6, 76, 88) translate(76, 46)">
          {/* Band */}
          <path d="M-26 6 L-28 -8 L-16 0 L0 -16 L16 0 L28 -8 L26 6 Z" fill="url(#goldGrad)"/>
          <path d="M-26 6 L26 6" fill="none" stroke="#c89020" strokeWidth="2"/>
          {/* Gems */}
          <circle cx="0" cy="-14" r="4" fill="#e8507a"/>
          <circle cx="-16" cy="-2" r="3" fill="#60c8e8"/>
          <circle cx="16" cy="-2" r="3" fill="#60c8e8"/>
          {/* Sparkles on band */}
          <circle cx="-8" cy="3" r="1.5" fill="#fff8a0"/>
          <circle cx="8" cy="3" r="1.5" fill="#fff8a0"/>
          <circle cx="0" cy="4" r="1.5" fill="#fff8a0"/>
        </g>
      )}

      {/* HAT: STRAW HAT */}
      {owned.hat_straw && (
        <g transform="rotate(6, 76, 88) translate(76, 48)">
          {/* Brim */}
          <ellipse cx="0" cy="2" rx="38" ry="9" fill="#d4a840" opacity="0.95"/>
          <ellipse cx="0" cy="2" rx="38" ry="9" fill="none" stroke="#b88820" strokeWidth="1.5"/>
          {/* Top */}
          <path d="M-18 2 C-18 -16 18 -16 18 2" fill="#e8bc50"/>
          <ellipse cx="0" cy="2" rx="18" ry="4" fill="#d4a840"/>
          {/* Ribbon */}
          <path d="M-18 2 C-10 -2 10 -2 18 2" fill="none" stroke="#e86858" strokeWidth="3.5" strokeLinecap="round"/>
          {/* Weave lines */}
          {[-10,0,10].map(x => <line key={x} x1={x} y1="-14" x2={x+2} y2="2" stroke="#b88820" strokeWidth="1" opacity="0.4"/>)}
        </g>
      )}

      {owned.hat_beret && (
        <g transform="rotate(6, 76, 88) translate(76, 46)">
          <ellipse cx="-6" cy="-4" rx="23" ry="11" fill="#c95b79"/>
          <ellipse cx="-6" cy="-4" rx="23" ry="11" fill="none" stroke="#7b3146" strokeWidth="2"/>
          <circle cx="9" cy="-12" r="3" fill="#e98aa2"/>
          <rect x="-18" y="2" width="24" height="5" rx="2.5" fill="#7b3146" opacity="0.6"/>
        </g>
      )}

      {owned.hat_beanie && (
        <g transform="rotate(6, 76, 88) translate(76, 46)">
          <path d="M-22 4 C-22 -12 -12 -20 0 -20 C12 -20 22 -12 22 4" fill="#8ac8e8"/>
          <rect x="-24" y="2" width="48" height="8" rx="4" fill="#4a90b8"/>
          <circle cx="0" cy="-23" r="5" fill="#d9f2ff"/>
        </g>
      )}

      {owned.hat_frog && (
        <g transform="rotate(6, 76, 88) translate(76, 45)">
          <ellipse cx="0" cy="0" rx="26" ry="10" fill="#78c85a"/>
          <ellipse cx="-11" cy="-8" rx="5" ry="5" fill="#8de06f" stroke="#3e8a30" strokeWidth="1.5"/>
          <ellipse cx="11" cy="-8" rx="5" ry="5" fill="#8de06f" stroke="#3e8a30" strokeWidth="1.5"/>
          <circle cx="-11" cy="-8" r="1.2" fill="#1f4120"/>
          <circle cx="11" cy="-8" r="1.2" fill="#1f4120"/>
        </g>
      )}

      {/* GLASSES: HEART */}
      {owned.glasses_heart && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <path d="M-25 -1 C-25 -5 -22 -7 -19 -4 C-16 -7 -13 -5 -13 -1 C-13 3 -19 8 -19 8 C-19 8 -25 3 -25 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <path d="M13 -1 C13 -5 16 -7 19 -4 C22 -7 25 -5 25 -1 C25 3 19 8 19 8 C19 8 13 3 13 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <line x1="-13" y1="0" x2="13" y2="0" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-25" y1="0" x2="-34" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="25" y1="0" x2="34" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
        </g>
      )}

      {/* GLASSES: SUNGLASSES */}
      {owned.glasses_sun && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <rect x="-27" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <rect x="11" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <line x1="-11" y1="-1" x2="11" y2="-1" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-27" y1="-2" x2="-35" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="-2" x2="35" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <rect x="-24" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
          <rect x="14" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
        </g>
      )}

      {owned.glasses_round && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <circle cx="-19" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <circle cx="19" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <line x1="-11.8" y1="-1" x2="11.8" y2="-1" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-26" y1="-2" x2="-34" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="26" y1="-2" x2="34" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_clear && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <rect x="-26" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <rect x="12" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-26" y1="-2" x2="-34" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="26" y1="-2" x2="34" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_star && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <path d="M-19 -8 L-17 -3 L-12 -3 L-16 -0.5 L-14.5 4.5 L-19 2 L-23.5 4.5 L-22 -0.5 L-26 -3 L-21 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <path d="M19 -8 L21 -3 L26 -3 L22 -0.5 L23.5 4.5 L19 2 L14.5 4.5 L16 -0.5 L12 -3 L17 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#c28d1f" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {/* ACC: BOW */}
      {owned.acc_bow && (
        <g transform="rotate(6, 76, 88) translate(108, 54)">
          <path d="M-12 0 C-18 -8 -24 -10 -20 -2 C-16 6 -6 4 0 0Z" fill="#ffb8d0"/>
          <path d="M12 0 C18 -8 24 -10 20 -2 C16 6 6 4 0 0Z" fill="#ff90b8"/>
          <circle cx="0" cy="0" r="5" fill="#ffcce0"/>
          <circle cx="0" cy="0" r="2.5" fill="#ff80b0"/>
        </g>
      )}

      {/* ACC: SCARF — proper wraparound scarf */}
      {owned.acc_scarf && (
        <g>
          {/* Left panda scarf */}
          <path d="M40 135 C46 128 60 124 76 124 C92 124 106 128 112 135 C114 138 112 145 108 146 C104 147 96 144 76 144 C56 144 48 147 44 146 C40 145 38 138 40 135Z"
            fill="url(#scarf1)" opacity="0.92"/>
          {/* Knot/tail */}
          <path d="M100 142 C108 148 112 158 106 164 C102 168 96 165 94 158"
            fill="none" stroke="#ff8fa3" strokeWidth="8" strokeLinecap="round"/>
          <path d="M108 140 C116 145 118 155 114 162"
            fill="none" stroke="#d4506a" strokeWidth="5" strokeLinecap="round"/>
          {/* Stripe detail */}
          <path d="M44 140 C56 138 66 137 76 137 C86 137 96 138 108 140"
            fill="none" stroke="white" strokeWidth="1.5" opacity="0.4" strokeLinecap="round"/>
          {/* Right panda scarf */}
          <path d="M140 135 C146 128 160 124 176 124 C192 124 206 128 212 135 C214 138 212 145 208 146 C204 147 196 144 176 144 C156 144 148 147 144 146 C140 145 138 138 140 135Z"
            fill="url(#scarf2)" opacity="0.92"/>
          <path d="M148 142 C140 148 136 158 142 164 C146 168 152 165 154 158"
            fill="none" stroke="#7ec8e3" strokeWidth="8" strokeLinecap="round"/>
          <path d="M142 140 C134 145 132 155 136 162"
            fill="none" stroke="#4a9ab8" strokeWidth="5" strokeLinecap="round"/>
          <path d="M144 140 C156 138 166 137 176 137 C186 137 196 138 208 140"
            fill="none" stroke="white" strokeWidth="1.5" opacity="0.4" strokeLinecap="round"/>
        </g>
      )}

      {/* OUTFIT: KIMONO */}
      {owned.outfit_kimono && (
        <g>
          {/* Left panda kimono */}
          <path d="M34 140 C29 150 27 172 30 198 C38 203 70 205 118 198 C121 172 119 150 114 140 C102 131 88 129 76 129 C64 129 50 131 34 140Z"
            fill="#d4508a" opacity="0.92"/>
          {/* Collar fold */}
          <path d="M60 130 L76 155 L92 130" fill="none" stroke="#faeaf4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          {/* Obi (belt) */}
          <rect x="40" y="160" width="72" height="14" rx="4" fill="#9a3068" opacity="0.9"/>
          {/* Obi knot */}
          <ellipse cx="76" cy="167" rx="10" ry="7" fill="#c05080"/>
          <ellipse cx="76" cy="167" rx="6" ry="4" fill="#d06090"/>
          {/* Pattern dots */}
          {[[52,148],[88,148],[60,172],[92,172],[70,142],[82,142]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="2.5" fill="#f4a0c8" opacity="0.5"/>
          ))}
          {/* Right panda kimono */}
          <path d="M134 140 C129 150 127 172 130 198 C138 203 170 205 218 198 C221 172 219 150 214 140 C202 131 188 129 176 129 C164 129 150 131 134 140Z"
            fill="#508ad4" opacity="0.92"/>
          <path d="M160 130 L176 155 L192 130" fill="none" stroke="#eaf0fa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="140" y="160" width="72" height="14" rx="4" fill="#3068a0" opacity="0.9"/>
          <ellipse cx="176" cy="167" rx="10" ry="7" fill="#4080c0"/>
          <ellipse cx="176" cy="167" rx="6" ry="4" fill="#5090d0"/>
          {[[152,148],[188,148],[160,172],[192,172],[170,142],[182,142]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="2.5" fill="#a0c8f4" opacity="0.5"/>
          ))}
        </g>
      )}

      {owned.outfit_sailor && (
        <g>
          <path d="M32 138 C28 154 28 176 32 198 C44 204 108 204 120 198 C124 176 124 154 120 138 C102 130 50 130 32 138Z" fill="#f5f8ff" opacity="0.96"/>
          <path d="M59 132 L76 152 L93 132" fill="none" stroke="#5d7bbd" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="47" y="161" width="58" height="10" rx="5" fill="#5d7bbd" opacity="0.85"/>
          <circle cx="76" cy="156" r="4" fill="#f4a8c0"/>

          <path d="M132 138 C128 154 128 176 132 198 C144 204 208 204 220 198 C224 176 224 154 220 138 C202 130 150 130 132 138Z" fill="#f5f8ff" opacity="0.96"/>
          <path d="M159 132 L176 152 L193 132" fill="none" stroke="#3f669f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="147" y="161" width="58" height="10" rx="5" fill="#3f669f" opacity="0.9"/>
          <circle cx="176" cy="156" r="4" fill="#b8d8ff"/>
        </g>
      )}

      {owned.outfit_witch && (
        <g>
          <path d="M32 139 C28 157 28 178 32 200 C44 206 108 206 120 200 C124 178 124 157 120 139 C102 131 50 131 32 139Z" fill="#7b5bb8" opacity="0.9"/>
          <path d="M52 138 C60 145 69 149 76 149 C83 149 92 145 100 138" fill="none" stroke="#d6a55a" strokeWidth="2.5"/>
          <circle cx="76" cy="168" r="6" fill="#2f1d4a" opacity="0.8"/>

          <path d="M132 139 C128 157 128 178 132 200 C144 206 208 206 220 200 C224 178 224 157 220 139 C202 131 150 131 132 139Z" fill="#5f4aa0" opacity="0.9"/>
          <path d="M152 138 C160 145 169 149 176 149 C183 149 192 145 200 138" fill="none" stroke="#d6a55a" strokeWidth="2.5"/>
          <circle cx="176" cy="168" r="6" fill="#24163b" opacity="0.85"/>
        </g>
      )}

      {owned.outfit_angel && (
        <g>
          <path d="M30 138 C27 156 27 177 30 198 C42 205 110 205 122 198 C125 177 125 156 122 138 C102 130 50 130 30 138Z" fill="#fff8f0" opacity="0.97"/>
          <ellipse cx="24" cy="153" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
          <ellipse cx="128" cy="153" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>

          <path d="M130 138 C127 156 127 177 130 198 C142 205 210 205 222 198 C225 177 225 156 222 138 C202 130 150 130 130 138Z" fill="#fff8f0" opacity="0.97"/>
          <ellipse cx="124" cy="153" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
          <ellipse cx="228" cy="153" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
        </g>
      )}

      {/* ══════════ RIGHT PANDA — same accessories mirrored ══════════ */}

      {owned.hat_flower && (
        <g transform="rotate(-4, 176, 88) translate(176, 42)">
          <path d="M-36 0 C-24 -6 -10 -8 0 -8 C10 -8 24 -6 36 0" fill="none" stroke="#5a8a40" strokeWidth="3.5" strokeLinecap="round"/>
          <ellipse cx="-22" cy="-4" rx="7" ry="4" fill="#6aaa50" transform="rotate(-30 -22 -4)" opacity="0.9"/>
          <ellipse cx="22" cy="-4" rx="7" ry="4" fill="#6aaa50" transform="rotate(30 22 -4)" opacity="0.9"/>
          <ellipse cx="0" cy="-8" rx="6" ry="3.5" fill="#5a9840" opacity="0.9"/>
          {[[-30,-2], [-10,-9], [12,-10], [32,-2]].map(([x,y],i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              {[0,72,144,216,288].map((a,j) => (
                <ellipse key={j} cx={Math.cos(a*Math.PI/180)*5} cy={Math.sin(a*Math.PI/180)*5}
                  rx="4" ry="2.5" fill={[["#b8d8ff","#d8eeff"],["#f4c860","#ffe898"],["#d8f0b8","#eaffd8"],["#b8d8ff","#d8eeff"]][i][j%2]}
                  transform={`rotate(${a})`} opacity="0.95"/>
              ))}
              <circle cx="0" cy="0" r="3.5" fill="#fff8d0"/>
            </g>
          ))}
        </g>
      )}

      {owned.hat_crown && (
        <g transform="rotate(-4, 176, 88) translate(176, 44)">
          <path d="M-26 6 L-28 -8 L-16 0 L0 -16 L16 0 L28 -8 L26 6 Z" fill="url(#goldGrad)"/>
          <path d="M-26 6 L26 6" fill="none" stroke="#c89020" strokeWidth="2"/>
          <circle cx="0" cy="-14" r="4" fill="#e8507a"/>
          <circle cx="-16" cy="-2" r="3" fill="#60c8e8"/>
          <circle cx="16" cy="-2" r="3" fill="#60c8e8"/>
          <circle cx="-8" cy="3" r="1.5" fill="#fff8a0"/>
          <circle cx="8" cy="3" r="1.5" fill="#fff8a0"/>
          <circle cx="0" cy="4" r="1.5" fill="#fff8a0"/>
        </g>
      )}

      {owned.hat_straw && (
        <g transform="rotate(-4, 176, 88) translate(176, 46)">
          <ellipse cx="0" cy="2" rx="40" ry="9" fill="#d4a840" opacity="0.95"/>
          <ellipse cx="0" cy="2" rx="40" ry="9" fill="none" stroke="#b88820" strokeWidth="1.5"/>
          <path d="M-20 2 C-20 -16 20 -16 20 2" fill="#e8bc50"/>
          <ellipse cx="0" cy="2" rx="20" ry="4" fill="#d4a840"/>
          <path d="M-20 2 C-10 -2 10 -2 20 2" fill="none" stroke="#e86858" strokeWidth="3.5" strokeLinecap="round"/>
        </g>
      )}

      {owned.hat_beret && (
        <g transform="rotate(-4, 176, 88) translate(176, 46)">
          <ellipse cx="-6" cy="-4" rx="23" ry="11" fill="#7e8fe0"/>
          <ellipse cx="-6" cy="-4" rx="23" ry="11" fill="none" stroke="#3e4f96" strokeWidth="2"/>
          <circle cx="9" cy="-12" r="3" fill="#a8b4ef"/>
          <rect x="-18" y="2" width="24" height="5" rx="2.5" fill="#3e4f96" opacity="0.6"/>
        </g>
      )}

      {owned.hat_beanie && (
        <g transform="rotate(-4, 176, 88) translate(176, 46)">
          <path d="M-22 4 C-22 -12 -12 -20 0 -20 C12 -20 22 -12 22 4" fill="#ffb8d0"/>
          <rect x="-24" y="2" width="48" height="8" rx="4" fill="#e884ac"/>
          <circle cx="0" cy="-23" r="5" fill="#ffe4ef"/>
        </g>
      )}

      {owned.hat_frog && (
        <g transform="rotate(-4, 176, 88) translate(176, 45)">
          <ellipse cx="0" cy="0" rx="26" ry="10" fill="#78c85a"/>
          <ellipse cx="-11" cy="-8" rx="5" ry="5" fill="#8de06f" stroke="#3e8a30" strokeWidth="1.5"/>
          <ellipse cx="11" cy="-8" rx="5" ry="5" fill="#8de06f" stroke="#3e8a30" strokeWidth="1.5"/>
          <circle cx="-11" cy="-8" r="1.2" fill="#1f4120"/>
          <circle cx="11" cy="-8" r="1.2" fill="#1f4120"/>
        </g>
      )}

      {owned.glasses_heart && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <path d="M-25 -1 C-25 -5 -22 -7 -19 -4 C-16 -7 -13 -5 -13 -1 C-13 3 -19 8 -19 8 C-19 8 -25 3 -25 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <path d="M13 -1 C13 -5 16 -7 19 -4 C22 -7 25 -5 25 -1 C25 3 19 8 19 8 C19 8 13 3 13 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <line x1="-13" y1="0" x2="13" y2="0" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-25" y1="0" x2="-34" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="25" y1="0" x2="34" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_sun && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <rect x="-27" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <rect x="11" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <line x1="-11" y1="-1" x2="11" y2="-1" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-27" y1="-2" x2="-35" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="-2" x2="35" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <rect x="-24" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
          <rect x="14" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
        </g>
      )}

      {owned.glasses_round && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <circle cx="-19" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <circle cx="19" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <line x1="-11.8" y1="-1" x2="11.8" y2="-1" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-26" y1="-2" x2="-34" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="26" y1="-2" x2="34" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_clear && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <rect x="-26" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <rect x="12" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-26" y1="-2" x2="-34" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="26" y1="-2" x2="34" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_star && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <path d="M-19 -8 L-17 -3 L-12 -3 L-16 -0.5 L-14.5 4.5 L-19 2 L-23.5 4.5 L-22 -0.5 L-26 -3 L-21 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <path d="M19 -8 L21 -3 L26 -3 L22 -0.5 L23.5 4.5 L19 2 L14.5 4.5 L16 -0.5 L12 -3 L17 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#c28d1f" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.acc_bow && (
        <g transform="rotate(-4, 176, 88) translate(212, 54)">
          <path d="M-12 0 C-18 -8 -24 -10 -20 -2 C-16 6 -6 4 0 0Z" fill="#a8c8f8"/>
          <path d="M12 0 C18 -8 24 -10 20 -2 C16 6 6 4 0 0Z" fill="#80aaf4"/>
          <circle cx="0" cy="0" r="5" fill="#c8dcfc"/>
          <circle cx="0" cy="0" r="2.5" fill="#80aaf4"/>
        </g>
      )}

    </svg>
  );
}



// ═══════════════════════════════════════════════
// NEW GARDEN SCENE — koi/lotus watercolor aesthetic
// ═══════════════════════════════════════════════
function GardenScene({ garden, waterLevel }) {
  const g = Object.fromEntries(
    Object.entries(garden || {}).map(([k, v]) => [k, v === true])
  );
  const w = waterLevel || 0;
  // 5 watercolor levels: 0-20 drought, 20-40 dry, 40-60 ok, 60-80 lush, 80-100 thriving
  const lvl = w < 20 ? 0 : w < 40 ? 1 : w < 60 ? 2 : w < 80 ? 3 : 4;

  const SKY = ["#e8cfa0","#dde8c8","#c8e8f0","#b0ddf8","#90d0f8"];
  const SKY2 = ["#f0e4c0","#e8f0d8","#d8f0e8","#c8eef8","#b8e4ff"];
  const GROUND1 = ["#c89848","#b8c060","#88b830","#60a828","#48a020"];
  const GROUND2 = ["#b07830","#98a840","#68980c","#488810","#308808"];
  const HILL = ["#c0b060","#a0c058","#78b848","#58a840","#40a038"];
  const MIST = ["#d0b870","#b8c870","#90c890","#78c8a8","#60c8b8"];

  // Grass blade color per level
  const grassC = ["#c8a830","#a8b840","#78a828","#509820","#388810"];
  // Crack lines on dry ground
  const showCracks = lvl === 0;
  // Flower dots on lush/thriving
  const showFlowers = lvl >= 3;
  // Water shimmer on thriving
  const showDew = lvl === 4;

  const dry = lvl === 0;
  const withering = w < 40;
  const waterCol = dry ? "#c8b870" : "#88c8c8";

  return (
    <svg viewBox="0 0 390 290" style={{ width:"100%", display:"block", borderRadius: "0 0 20px 20px" }}>
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SKY[lvl]}/>
          <stop offset="100%" stopColor={SKY2[lvl]}/>
        </linearGradient>
        <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GROUND1[lvl]}/>
          <stop offset="100%" stopColor={GROUND2[lvl]}/>
        </linearGradient>
        <linearGradient id="hillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={HILL[lvl]}/>
          <stop offset="100%" stopColor={GROUND2[lvl]}/>
        </linearGradient>
        <filter id="watercolor" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      <rect width="390" height="290" fill="url(#skyGrad)"/>

      {/* Level indicator — subtle watercolor wash */}
      {lvl >= 3 && <ellipse cx="195" cy="260" rx="195" ry="50" fill={MIST[lvl]} opacity="0.15" filter="url(#watercolor)"/>}

      {/* Clouds */}
      {g.clouds && <g>
        <ellipse cx="80" cy="45" rx="40" ry="20" fill="white" opacity="0.85"/>
        <ellipse cx="100" cy="38" rx="28" ry="18" fill="white" opacity="0.9"/>
        <ellipse cx="60" cy="42" rx="22" ry="14" fill="white" opacity="0.8"/>
        <ellipse cx="280" cy="55" rx="34" ry="16" fill="white" opacity="0.75"/>
        <ellipse cx="300" cy="48" rx="22" ry="14" fill="white" opacity="0.8"/>
      </g>}
      {!g.clouds && <g>
        <ellipse cx="90" cy="50" rx="28" ry="12" fill="white" opacity="0.5"/>
        <ellipse cx="280" cy="42" rx="20" ry="9" fill="white" opacity="0.4"/>
      </g>}

      {/* Sun / Moon */}
      {g.sun ? <>
        <circle cx="330" cy="55" r="28" fill="#f0b030" opacity="0.95"/>
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(
          <line key={a} x1={330+Math.cos(a*Math.PI/180)*32} y1={55+Math.sin(a*Math.PI/180)*32}
            x2={330+Math.cos(a*Math.PI/180)*40} y2={55+Math.sin(a*Math.PI/180)*40}
            stroke="#f0b030" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
        ))}
      </> : <circle cx="330" cy="55" r="18" fill="#e8c860" opacity="0.5"/>}

      {/* Rainbow */}
      {g.rainbow && [["#e87878",0],["#e8a858",7],["#e8d860",14],["#8ac868",21],["#5ab8c8",28]].map(([c,o],i)=>(
        <path key={i} d={`M${10+o/2} 280 Q200 ${80+o} ${380-o/2} 280`} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" opacity="0.6"/>
      ))}

      {/* Misty mountains background */}
      <ellipse cx="100" cy="200" rx="130" ry="80" fill={MIST[lvl]} opacity="0.3"/>
      <ellipse cx="290" cy="210" rx="140" ry="70" fill={HILL[lvl]} opacity="0.28"/>{/* 78b898"} opacity="0.3"/>

      {/* Ground */}
      <path d="M0 230 Q100 210 200 225 Q300 240 390 218 L390 290 L0 290Z" fill="url(#groundGrad)" filter="url(#watercolor)"/>

      {/* Watercolor ground texture overlay */}
      <path d="M0 230 Q100 210 200 225 Q300 240 390 218 L390 290 L0 290Z" fill={MIST[lvl]} opacity="0.08"/>

      {/* Crack lines — only when drought */}
      {showCracks && <g opacity="0.5">
        <path d="M60 250 L70 265 L80 258 L85 275" fill="none" stroke="#a07828" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M150 240 L158 255 L165 250 L170 268" fill="none" stroke="#a07828" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M250 245 L262 258 L268 252 L272 270" fill="none" stroke="#a07828" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M320 248 L328 262 L334 256" fill="none" stroke="#a07828" strokeWidth="1.2" strokeLinecap="round"/>
      </g>}

      {/* Grass blades — more and greener as level increases */}
      <g>
        {[12,28,44,60,76,92,108,124,140,156,172,188,204,220,236,252,268,284,300,316,332,348,364,380].map((x,i) => {
          const h = 8 + (i%3)*5 + lvl*3;
          const lean = (i%2===0?1:-1) * (2+i%3);
          const y0 = 230 - (i%4)*4 + 8;
          return <path key={x} d={`M${x} ${y0} Q${x+lean} ${y0-h*0.6} ${x+lean*1.4} ${y0-h}`}
            fill="none" stroke={grassC[lvl]} strokeWidth={1.2+lvl*0.3} strokeLinecap="round" opacity={0.6+lvl*0.1}/>;
        })}
      </g>

      {/* Tiny wildflowers when lush/thriving */}
      {showFlowers && [
        [45,228,"#f4a8b8"],[88,222,"#f8e060"],[130,232,"#c8d8f8"],[175,220,"#f4a8b8"],
        [218,228,"#f8e060"],[262,224,"#d8c8f8"],[305,230,"#f4b8a8"],[348,222,"#f8e060"],
      ].map(([x,y,c],i)=>(
        <g key={i} transform={`translate(${x},${y})`}>
          {[0,72,144,216,288].map((a,j)=>(
            <ellipse key={j} cx={Math.cos(a*Math.PI/180)*4} cy={Math.sin(a*Math.PI/180)*4}
              rx="3" ry="2" fill={c} opacity="0.85" transform={`rotate(${a})`}/>
          ))}
          <circle cx="0" cy="0" r="2.5" fill="#f8e870"/>
        </g>
      ))}

      {/* Dew sparkles — thriving only */}
      {showDew && [30,80,140,200,260,330,370].map((x,i)=>(
        <circle key={i} cx={x} cy={224+(i%3)*6} r="2" fill="white" opacity="0.6"/>
      ))}

      {/* Willow tree */}
      {g.willow && <g>
        <rect x="340" y="100" width="8" height="130" rx="4" fill="#9a8048"/>
        {[[-25,0],[-20,10],[-15,5],[-10,12],[-5,8],[0,15],[5,10],[10,14],[15,8],[20,5]].map(([dx,dy],i)=>(
          <path key={i} d={`M344 ${108+i*8} Q${344+dx} ${130+i*8+dy} ${344+dx*1.4} ${155+i*8+dy*1.5}`}
            fill="none" stroke={withering?"#c0b060":"#5a9840"} strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
        ))}
        <ellipse cx="344" cy="105" rx="20" ry="12" fill={withering?"#b0b040":"#6aaa40"} opacity="0.9"/>
      </g>}

      {/* Bamboo */}
      {g.bamboo1 && <g>
        <rect x="22" y="80" width="10" height="150" rx="5" fill={withering?"#8a9030":"#4a7a30"}/>
        {[98,122,148,172].map((y,i)=><rect key={i} x="19" y={y} width="16" height="6" rx="3" fill={withering?"#7a8028":"#3a6020"}/>)}
        <ellipse cx="10" cy="95" rx="20" ry="7" fill={withering?"#8a9830":"#5a8a3c"} transform="rotate(-32 10 95)" opacity="0.9"/>
        <ellipse cx="36" cy="86" rx="16" ry="6" fill={withering?"#909838":"#6a9a48"} transform="rotate(22 36 86)" opacity="0.9"/>
      </g>}
      {g.bamboo2 && <g>
        <rect x="50" y="85" width="9" height="145" rx="4.5" fill={withering?"#8a9030":"#4a7a30"}/>
        {[105,132,158].map((y,i)=><rect key={i} x="47" y={y} width="15" height="6" rx="3" fill={withering?"#7a8028":"#3a6020"}/>)}
        <rect x="66" y="90" width="9" height="140" rx="4.5" fill={withering?"#909838":"#5a8a35"}/>
        {[112,140,166].map((y,i)=><rect key={i} x="63" y={y} width="14" height="6" rx="3" fill={withering?"#7a8028":"#3a6520"}/>)}
      </g>}

      {/* Cherry tree */}
      {g.cherry && <g>
        <rect x="278" y="148" width="12" height="82" rx="5" fill="#9a7848"/>
        <circle cx="284" cy="135" r="32" fill={dry?"#d4b070":"#f4a8b8"} opacity={dry?0.6:0.8}/>
        <circle cx="266" cy="148" r="22" fill={dry?"#ccaa60":"#f8b8c8"} opacity={dry?0.5:0.75}/>
        <circle cx="302" cy="145" r="24" fill={dry?"#d0a868":"#f0a0b0"} opacity={dry?0.55:0.75}/>
      </g>}

      {/* Pond */}
      {g.pond && <g>
        <ellipse cx="200" cy="262" rx="90" ry="22" fill={waterCol} opacity="0.55"/>
        <ellipse cx="200" cy="259" rx="74" ry="15" fill={waterCol} opacity={dry?0.3:0.5}/>
        {/* Koi fish */}
        {g.koi1 && <g>
          <ellipse cx="185" cy="260" rx="18" ry="7" fill="#e86040" opacity="0.8"/>
          <path d="M167 260 Q163 254 160 260 Q163 266 167 260Z" fill="#e05030" opacity="0.8"/>
          <circle cx="196" cy="258" r="2" fill="white" opacity="0.9"/>
        </g>}
        {g.koi2 && <g>
          <ellipse cx="215" cy="264" rx="16" ry="6" fill="#d4a843" opacity="0.8"/>
          <path d="M231 264 Q235 258 238 264 Q235 270 231 264Z" fill="#c89030" opacity="0.8"/>
        </g>}
        {/* Lotus pads */}
        {g.lotus_pad && <g>
          <ellipse cx="175" cy="255" rx="18" ry="10" fill="#5a9840" opacity="0.8"/>
          <ellipse cx="222" cy="260" rx="14" ry="8" fill="#5a9840" opacity="0.7"/>
        </g>}
      </g>}

      {/* Lotus flowers */}
      {g.lotus1 && <g>
        <rect x="108" y="210" width="5" height="20" rx="2.5" fill="#5a9060"/>
        <ellipse cx="110" cy="208" rx="14" ry="12" fill={dry?"#d4a060":"#f4a8b8"}/>
        <ellipse cx="110" cy="210" rx="9" ry="8" fill={dry?"#e0b070":"#f8c0cc"}/>
        <ellipse cx="100" cy="215" rx="8" ry="10" fill={dry?"#cc9848":"#f4a8b8"} transform="rotate(25 100 215)" opacity="0.75"/>
        <ellipse cx="120" cy="215" rx="8" ry="10" fill={dry?"#cc9848":"#f0a0b4"} transform="rotate(-25 120 215)" opacity="0.75"/>
      </g>}
      {g.lotus2 && <g>
        <rect x="140" y="215" width="5" height="18" rx="2.5" fill="#5a9060"/>
        <ellipse cx="142" cy="213" rx="13" ry="11" fill={dry?"#d8d0b0":"#f8f8f8"}/>
        <ellipse cx="134" cy="218" rx="7" ry="9" fill={dry?"#c8c0a0":"#f0f0f0"} transform="rotate(25 134 218)" opacity="0.8"/>
        <ellipse cx="150" cy="218" rx="7" ry="9" fill={dry?"#c0b898":"#eeeeee"} transform="rotate(-25 150 218)" opacity="0.8"/>
        <ellipse cx="142" cy="212" rx="4" ry="3" fill="#f8e060"/>
      </g>}

      {/* Lily */}
      {g.lily && <g>
        <rect x="165" y="218" width="5" height="16" rx="2.5" fill="#5a7e3c"/>
        {[0,60,120,180,240,300].map((a,i)=>(
          <ellipse key={i} cx={168+Math.cos(a*Math.PI/180)*10} cy={216+Math.sin(a*Math.PI/180)*8}
            rx="6" ry="10" fill={dry?"#9898c0":i%2===0?"#8ab8e8":"#a8ccf0"}
            transform={`rotate(${a} ${168+Math.cos(a*Math.PI/180)*10} ${216+Math.sin(a*Math.PI/180)*8})`} opacity="0.85"/>
        ))}
        <circle cx="168" cy="216" r="4.5" fill="#f8e060"/>
      </g>}

      {/* Peony */}
      {g.peony && <g>
        <rect x="248" y="215" width="5" height="18" rx="2.5" fill="#5a7e3c"/>
        <ellipse cx="250" cy="208" rx="14" ry="12" fill={dry?"#c8a8a0":"#d4a0d8"}/>
        <ellipse cx="250" cy="210" rx="10" ry="9" fill={dry?"#d0b0a8":"#e0b8e8"}/>
        <ellipse cx="250" cy="212" rx="6" ry="6" fill={dry?"#d8b8b0":"#f0d0f4"}/>
        <ellipse cx="250" cy="213" rx="3" ry="3" fill="#f8e0a0"/>
        <ellipse cx="238" cy="216" rx="8" ry="10" fill={dry?"#c0a098":"#c890cc"} transform="rotate(20 238 216)" opacity="0.7"/>
        <ellipse cx="262" cy="216" rx="8" ry="10" fill={dry?"#c0a098":"#c890cc"} transform="rotate(-20 262 216)" opacity="0.7"/>
      </g>}

      {/* Swallows */}
      {g.swallow1 && <g transform="translate(164,68)">
        <path d="M0 -2 C-8 -14 -22 -18 -34 -13 C-24 -9 -16 -3 -10 3 C-18 1 -26 5 -32 11 C-20 11 -10 8 -1 2" fill="#263247" opacity="0.95"/>
        <path d="M0 -2 C8 -14 22 -18 34 -13 C24 -9 16 -3 10 3 C18 1 26 5 32 11 C20 11 10 8 1 2" fill="#263247" opacity="0.95"/>
        <ellipse cx="0" cy="2" rx="6.5" ry="3.6" fill="#1b2432"/>
        <path d="M-1 4 L-9 14 L-3 12 L0 17 L3 12 L9 14 L1 4" fill="#1b2432"/>
      </g>}
      {g.swallow2 && <g>
        <g transform="translate(130,54) scale(0.88)">
          <path d="M0 -2 C-8 -14 -22 -18 -34 -13 C-24 -9 -16 -3 -10 3 C-18 1 -26 5 -32 11 C-20 11 -10 8 -1 2" fill="#263247" opacity="0.95"/>
          <path d="M0 -2 C8 -14 22 -18 34 -13 C24 -9 16 -3 10 3 C18 1 26 5 32 11 C20 11 10 8 1 2" fill="#263247" opacity="0.95"/>
          <ellipse cx="0" cy="2" rx="6.5" ry="3.6" fill="#1b2432"/>
          <path d="M-1 4 L-9 14 L-3 12 L0 17 L3 12 L9 14 L1 4" fill="#1b2432"/>
        </g>
        <g transform="translate(226,76) scale(0.72) rotate(8)">
          <path d="M0 -2 C-8 -14 -22 -18 -34 -13 C-24 -9 -16 -3 -10 3 C-18 1 -26 5 -32 11 C-20 11 -10 8 -1 2" fill="#344158" opacity="0.92"/>
          <path d="M0 -2 C8 -14 22 -18 34 -13 C24 -9 16 -3 10 3 C18 1 26 5 32 11 C20 11 10 8 1 2" fill="#344158" opacity="0.92"/>
          <ellipse cx="0" cy="2" rx="6.5" ry="3.6" fill="#222c3c"/>
          <path d="M-1 4 L-9 14 L-3 12 L0 17 L3 12 L9 14 L1 4" fill="#222c3c"/>
        </g>
      </g>}

      {/* Heart */}
      {g.heart && <path d="M195 90 C195 90 182 78 182 69 C182 63 187 60 191 62 C194 63 195 66 195 66 C195 66 196 63 199 62 C203 60 208 63 208 69 C208 78 195 90 195 90Z" fill="#e8607a" opacity="0.9"/>}

      {/* Bridge */}
      {g.bridge && <g>
        <path d="M100 265 Q195 235 290 265" fill="none" stroke="#9a7848" strokeWidth="6" strokeLinecap="round"/>
        {[120,148,176,204,232,260].map((x,i)=>(
          <line key={i} x1={x} y1={248+(x-195)**2/1200} x2={x} y2={268} stroke="#8a6838" strokeWidth="3" opacity="0.9"/>
        ))}
        <line x1="100" y1="265" x2="290" y2="265" stroke="#8a6838" strokeWidth="4"/>
      </g>}

      {/* Pagoda */}
      {g.pagoda && <g>
        <rect x="310" y="218" width="36" height="16" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M302 218 L328 200 L354 218Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="314" y="200" width="28" height="19" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M306 200 L328 184 L350 200Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="318" y="184" width="20" height="17" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M312 184 L328 168 L344 184Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="322" y="162" width="12" height="8" rx="2" fill="#e8a030" opacity="0.9"/>
      </g>}

      {/* Lanterns */}
      {g.lantern && <g>
        <rect x="22" y="185" width="6" height="40" rx="3" fill="#9a7848"/>
        <rect x="16" y="225" width="18" height="28" rx="8" fill="#e86030"/>
        <rect x="18" y="225" width="14" height="28" rx="6" fill="#f08050" opacity="0.6"/>
        <ellipse cx="25" cy="225" rx="10" ry="4" fill="#9a7848"/>
        <ellipse cx="25" cy="253" rx="10" ry="4" fill="#9a7848"/>
        <circle cx="25" cy="239" r="6" fill="#f8e060" opacity="0.5"/>
      </g>}
      {g.lantern2 && <g>
        <line x1="20" y1="175" x2="100" y2="175" stroke="#9a7848" strokeWidth="2"/>
        {[30,55,80].map((x,i)=><g>
          <line key={i} x1={x} y1="175" x2={x} y2="188" stroke="#9a7848" strokeWidth="1.5"/>
          <rect x={x-8} y="188" width="16" height="22" rx="7" fill={["#e86030","#d4408a","#e8c030"][i]}/>
          <ellipse cx={x} cy="188" rx="9" ry="3.5" fill="#9a7848"/>
          <ellipse cx={x} cy="210" rx="9" ry="3.5" fill="#9a7848"/>
          <circle cx={x} cy="199" r="5" fill="#f8e060" opacity="0.45"/>
        </g>)}
      </g>}

      {/* Fireflies */}
      {g.firefly && <g>
        {[[45,190],[380,140],[200,185],[350,200],[80,160],[170,170],[310,185],[240,195],[130,180]].map(([x,y],i)=>(
          <g key={i}>
            <circle cx={x} cy={y} r="2.5" fill="#f8e840" opacity="0.95"/>
            <circle cx={x} cy={y} r="5" fill="#f8e840" opacity="0.2"/>
          </g>
        ))}
      </g>}

      {/* Moon gate */}
      {g.moongate && <g>
        <circle cx="195" cy="160" r="50" fill="none" stroke="#f8e0a0" strokeWidth="6" opacity="0.8"/>
        <path d="M145 195 L145 230 L245 230 L245 195" fill="#b8d8a0" opacity="0.7"/>
        <circle cx="187" cy="152" r="7" fill="#f8e0a0" opacity="0.5"/>
        <circle cx="192" cy="148" r="5" fill="#f8e0a0" opacity="0.4"/>
        <circle cx="197" cy="152" r="4" fill="#f8e0a0" opacity="0.35"/>
      </g>}

      {/* Chest-exclusive items */}
      {g.love_stone && <g transform="translate(55,225)">
        <path d="M16 28 L2 20 L2 10 L16 4 L30 10 L30 20 Z" fill="#7ab8d8" stroke="#5a98b8" strokeWidth="1.5"/>
        <path d="M16 28 L16 16" stroke="#5a98b8" strokeWidth="1"/>
        <path d="M10 24 Q16 27 22 24" fill="none" stroke="#e8607a" strokeWidth="1.5" strokeLinecap="round"/>
      </g>}
      {g.wishing_tree && <g>
        <rect x="278" y="190" width="6" height="38" rx="3" fill="#9a7848"/>
        <ellipse cx="281" cy="178" rx="18" ry="16" fill="#7ab848"/>
        <ellipse cx="281" cy="174" rx="11" ry="10" fill="#9ad868"/>
        {[[274,184],[281,188],[288,184],[277,194],[285,194]].map(([x,y],i)=><g key={i}><line x1={x} y1={y} x2={x} y2={y+4} stroke="#f8e060" strokeWidth="1"/><circle cx={x} cy={y+5} r="1.5" fill="#f8e060"/></g>)}
      </g>}
      {g.heart_gate && <g>
        <path d="M120 240 L120 200 Q120 180 140 180 L160 180 Q180 180 180 200 L180 240" fill="none" stroke="#e890a0" strokeWidth="5" strokeLinecap="round"/>
        <path d="M120 240 L180 240" stroke="#e890a0" strokeWidth="4"/>
        <path d="M150 190 C150 190 140 182 140 192 C140 200 150 210 150 210 C150 210 160 200 160 192 C160 182 150 190 150 190Z" fill="#e8607a"/>
      </g>}

      {/* Dryness crack overlay */}
      {dry && <g>
        <path d="M50 250 L60 265 L55 275" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.5"/>
        <path d="M180 255 L170 268 L178 278" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.4"/>
        <path d="M300 248 L308 260 L302 270" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.5"/>
      </g>}
    </svg>
  );
}



// ═══════════════════════════════════════════════
// JARDIN SCREEN — updated with accessories + multiple items + decay
// ═══════════════════════════════════════════════
function InvitePartnerBox({ user, compact = false }) {
  const code = user?.code || "";
  const inviteText = `¡Únete a nuestro jardín en Mochi! 🐼🌿 Usa este código al entrar en "Tengo código": ${code}`;
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => showToast("Código copiado: " + code)).catch(() => showToast("Tu código: " + code));
    else showToast("Tu código: " + code);
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: compact ? 0 : 8 }}>
      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.15rem", letterSpacing: 4, color: C.dark, background: C.cream2, borderRadius: 10, padding: "6px 10px", border: `1.5px solid ${C.border}` }}>{code || "----"}</div>
      <Btn onClick={copy} variant="sand" style={{ flex: 1, padding: "8px 10px", fontSize: "0.8rem" }}>📋 Copiar</Btn>
      <Btn onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, "_blank")} variant="sand" style={{ flex: 1, padding: "8px 10px", fontSize: "0.8rem" }}>💬 WhatsApp</Btn>
    </div>
  );
}

function Jardin({ bamboo, happiness, water, garden, accessories, mochiHappy, pandaBubble, onPet, onBuy, onWater, onBuyAccessory }) {
  const [shopTab, setShopTab] = useState("plantas");
  const [showJuegos, setShowJuegos] = useState(false);
  const cats = [{id:"plantas",label:"🌿 Plantas"},{id:"agua",label:"🐟 Agua"},{id:"cielo",label:"☁️ Cielo"},{id:"deco",label:"🏮 Deco"},{id:"especial",label:"✨ Especiales"},{id:"accesorios",label:"🐼 Pandas"}];
  const shopItems = (shopTab === "accesorios"
    ? PANDA_ACCESSORIES
    : GARDEN_ITEMS.filter(i => i.cat === shopTab)).filter(i => i && i.id && typeof i.cost === "number" && i.cost > 0);

  const dry = water < 20;
  const withering = water < 40;

  if (showJuegos) {
    return <Juegos onBack={() => setShowJuegos(false)} user={user} />;
  }

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: C.dark, padding: "44px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.55rem", color: C.cream2 }}>El Jardín</div>
            <div style={{ fontSize: "0.72rem", color: `${C.cream}88`, fontWeight: 700, letterSpacing: "0.5px" }}>
              {water < 20 ? "🏜️ JARDÍN SECO" : water < 40 ? "🌱 SEDIENTO" : water < 60 ? "🌿 SANO" : water < 80 ? "🌸 FLORECIENDO" : "🌺 RADIANTE"}
            </div>
          </div>
          <div style={{ background: C.olive, borderRadius: 10, padding: "8px 16px", fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.cream2, boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}>🌿 {bamboo}</div>
        </div>
        {/* Bars - solo AGUA */}
        {[{l:"💧 AGUA",v:water,c:dry?"#e86030":withering?"#e8a030":C.sky}].map(b => (
          <div key={b.l} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:"0.68rem", color:`${C.cream}88`, fontWeight:800, minWidth:54, letterSpacing:"0.5px" }}>{b.l}</span>
            <div style={{ flex:1, height:9, background:"rgba(255,255,255,0.14)", borderRadius:50, overflow:"hidden" }}>
              <div style={{ height:"100%", width:b.v+"%", background:b.c, borderRadius:50, transition:"width 0.8s" }}/>
            </div>
            <span style={{ fontSize:"0.68rem", color:`${C.cream}88`, fontWeight:800, minWidth:28, textAlign:"right" }}>{b.v}%</span>
          </div>
        ))}
        {dry && <div style={{ background:"#e86030", borderRadius:8, padding:"6px 12px", fontSize:"0.76rem", color:"white", fontWeight:800, textAlign:"center", marginTop:6 }}>⚠️ ¡El jardín se está secando! Riégalo pronto</div>}
        {!dry && withering && <div style={{ background:"#e8a030", borderRadius:8, padding:"6px 12px", fontSize:"0.76rem", color:"white", fontWeight:800, textAlign:"center", marginTop:6 }}>🌱 El jardín necesita agua</div>}
      </div>

      {/* Garden scene */}
      <div style={{ position:"relative" }}>
        <SectionErrorBoundary fallback={<div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:16, margin:12, padding:12, textAlign:"center", color:C.inkM, fontWeight:700 }}>No se pudo cargar esta vista del jardín. Cambia de pestaña y vuelve a intentar.</div>}>
          <GardenScene garden={garden} waterLevel={water}/>
          <div onClick={onPet} style={{ position:"absolute", bottom:-5, left:"50%", transform:"translateX(-50%)", cursor:"pointer",
            animation: mochiHappy ? "floatHappy 1.6s ease-in-out infinite" : "float 3s ease-in-out infinite" }}>
            <div style={{ position:"relative", display:"inline-block" }}>
              {/* Speech bubbles */}
              {pandaBubble?.textA && (
                <div style={{ position:"absolute", bottom:"90%", left:"-18px", maxWidth:108, background:"white",
                  border:"2px solid #4a6e30", borderRadius:"14px 14px 4px 14px", padding:"6px 10px",
                  fontSize:"0.7rem", color:"#1e2b1e", fontWeight:700, lineHeight:1.4,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.15)", zIndex:10, animation:"fadeIn 0.3s ease" }}>
                  {pandaBubble.nameA && <div style={{ fontSize:"0.6rem", color:"#4a6e30", fontWeight:800, marginBottom:2 }}>{pandaBubble.nameA}</div>}
                  {pandaBubble.textA}
                  <div style={{ position:"absolute", bottom:-8, left:10, width:0, height:0,
                    borderLeft:"8px solid transparent", borderRight:"0 solid transparent",
                    borderTop:"8px solid #4a6e30" }}/>
                </div>
              )}
              {pandaBubble?.textB && (
                <div style={{ position:"absolute", bottom:"84%", right:"-16px", maxWidth:108, background:"white",
                  border:"2px solid #e8907a", borderRadius:"14px 14px 14px 4px", padding:"6px 10px",
                  fontSize:"0.7rem", color:"#1e2b1e", fontWeight:700, lineHeight:1.4,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.15)", zIndex:10, animation:"fadeIn 0.3s ease" }}>
                  {pandaBubble.nameB && <div style={{ fontSize:"0.6rem", color:"#e8907a", fontWeight:800, marginBottom:2 }}>{pandaBubble.nameB}</div>}
                  {pandaBubble.textB}
                  <div style={{ position:"absolute", bottom:-8, right:10, width:0, height:0,
                    borderLeft:"0 solid transparent", borderRight:"8px solid transparent",
                    borderTop:"8px solid #e8907a" }}/>
                </div>
              )}
              <CouplePandaSVG happy={mochiHappy} size={140}/>
              <PandaAccessoryLayer accessories={accessories} pandaSize={140}/>
            </div>
          </div>
        </SectionErrorBoundary>
      </div>

      {/* Water button + Games button */}
      <div style={{ textAlign: "center", padding: "22px 14px 6px" }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onWater} style={{ background: dry ? "#e86030" : C.sky, color: C.white, border: "none", borderRadius: 12,
            padding: "10px 22px", fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", cursor: "pointer",
            boxShadow: "0 3px 0 rgba(0,0,0,0.18)" }}>💧 Regar el jardín</button>
          <button onClick={() => setShowJuegos(true)} style={{ background: C.olive, color: C.cream2, border: "none", borderRadius: 12,
            padding: "10px 22px", fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", cursor: "pointer",
            boxShadow: "0 3px 0 rgba(0,0,0,0.18)" }}>🎮 Juegos</button>
        </div>
      </div>

      {/* Shop */}
      <div style={{ background:C.white, borderRadius:"22px 22px 0 0", border:`1.5px solid ${C.border}`, boxShadow:`0 -3px 0 ${C.border}`, marginTop:10 }}>
        <div style={{ padding:"16px 16px 0" }}>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.1rem", color:C.dark }}>Tienda del jardín</div>
        </div>
        {/* Category tabs */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"10px 14px 6px" }}>
          {cats.map(c => (
            <div key={c.id} onClick={() => setShopTab(c.id)}
              style={{ background:shopTab===c.id?C.dark:C.sandL, color:shopTab===c.id?C.cream2:C.inkM,
                borderRadius:10, padding:"6px 12px", fontSize:"0.72rem", fontWeight:800,
                cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, border:`1.5px solid ${shopTab===c.id?C.dark:C.border}`,
                transition:"all 0.15s" }}>
              {c.label}
            </div>
          ))}
        </div>
        {/* Items grid */}
        <div style={{ display:"flex", gap:10, overflowX:"auto", padding:"8px 14px 20px" }}>
          {shopItems.map(item => {
            const owned = shopTab === "accesorios" ? accessories?.[item.id] : garden?.[item.id];
            const POND_DEPS = ["koi1", "koi2", "lotus_pad"];
            const pondReady = garden?.pond === true || garden?.pond === "owned";
            const locked = shopTab !== "accesorios" && POND_DEPS.includes(item.id) && !pondReady && !owned;
            return (
              <div key={item.id} onClick={() => {
                if (locked) return;
                shopTab === "accesorios" ? onBuyAccessory(item) : onBuy(item);
              }}
                style={{ background:owned===true?"#d4e8c4":owned==="owned"?C.cream:locked?"#f0ede8":C.sandL,
                  border:`2px solid ${owned===true?C.olive:owned==="owned"?"#c8b060":locked?C.sand:C.border}`,
                  borderRadius:16, padding:"12px 10px", textAlign:"center", cursor:locked?"default":"pointer",
                  minWidth:84, flexShrink:0, opacity:locked?0.6:1,
                  boxShadow:owned?`0 3px 0 ${C.olive}50`:`0 2px 0 ${C.border}`,
                  transition:"all 0.15s" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:4 }}>
                  {shopTab === "accesorios"
                    ? <div style={{ fontSize:"1.8rem" }}>{item.emoji}</div>
                    : <GardenItemIcon id={item.id} size={38}/>}
                </div>
                <div style={{ fontSize:"0.67rem", fontWeight:800, color:C.ink, marginBottom:2, lineHeight:1.2 }}>{item.name}</div>
                <div style={{ fontSize:"0.62rem", color:C.inkL, marginBottom:5, lineHeight:1.2 }}>{locked ? "🔒 Requiere Estanque" : item.desc}</div>
                {shopTab !== "accesorios" ? (
                  owned === true
                    ? <div style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>Quitar</div>
                    : owned === "owned"
                    ? <div style={{ background:C.dark, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>Poner</div>
                    : locked
                    ? <div style={{ background:C.sand, color:C.inkL, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>🔒</div>
                    : <div style={{ background:C.dark, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>{item.cost} 🌿</div>
                ) : (
                  owned
                    ? <div style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>✓</div>
                    : locked
                    ? <div style={{ background:C.sand, color:C.inkL, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>🔒</div>
                    : <div style={{ background:C.dark, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>{item.cost} 🌿</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [nameA, setNameA] = useState(""); const [nameB, setNameB] = useState("");
  const [guestOpen, setGuestOpen] = useState(false); const [guestA, setGuestA] = useState(""); const [guestB, setGuestB] = useState("");
  const [pCode, setPCode] = useState(""); const [pEmail, setPEmail] = useState(""); const [pPass, setPPass] = useState("");
  const [err, setErr] = useState("");
  const makeCode = () => "MO" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [code, setCode] = useState(makeCode());
  const [newUser, setNewUser] = useState(null); // set after doReg succeeds, to show the share-code step

  const [loading, setLoading] = useState(false);

  const authErrMsg = (e, fallback) => {
    const code = e?.code || "";
    if (code === "auth/invalid-email") {
      return "Correo inválido. Revisa que esté bien escrito.";
    }
    if (code === "auth/unauthorized-domain") {
      return "Dominio no autorizado en Firebase. Agrega tu dominio de Netlify en Authentication > Settings > Authorized domains.";
    }
    if (code === "auth/network-request-failed") {
      return "Error de red al conectar con Firebase. Revisa conexión, bloqueadores o HTTPS.";
    }
    if (code === "auth/operation-not-allowed") {
      return "El acceso con correo y contraseña no está habilitado en Firebase Authentication.";
    }
    if (code === "auth/too-many-requests") {
      return "Demasiados intentos, espera unos minutos.";
    }
    return fallback;
  };

  const isPermissionError = (e) => {
    const code = e?.code || "";
    const msg = e?.message || "";
    return code === "permission-denied"
      || code === "missing-or-insufficient-permissions"
      || msg.includes("Missing or insufficient permissions")
      || msg.toLowerCase().includes("permissions");
  };

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

  const ensureAuthReady = async (firebaseUser) => {
    await firebaseUser?.getIdToken(true).catch(() => {});
    await wait(350);
  };

  const retryFirestore = async (fn) => {
    let lastErr;
    for (const delay of [0, 500, 1000]) {
      if (delay) await wait(delay);
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (!isPermissionError(e)) throw e;
      }
    }
    throw lastErr;
  };

  const doLogin = async () => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !pass) { setErr("Completa correo y contraseña"); return; }
    setLoading(true); setErr("");
    try {
      const cred = await fbLogin(cleanEmail, pass);
      let userData = await fbGetUser(cred.user.uid);
      // If no Firestore data found, still let them in with basic info
      if (!userData) {
        userData = { email: cleanEmail, names: cleanEmail.split("@")[0] + " & ?", code: "", isOwner: true };
      }
      if (!userData?.code) {
        const found = await fbFindCodeByUid(cred.user.uid).catch(() => null);
        if (found?.code) {
          userData = {
            ...userData,
            code: found.code,
            names: userData?.names || found.names || (cleanEmail.split("@")[0] + " & ?"),
            since: userData?.since || found.since || "Juntos",
          };
          await fbSaveUser(cred.user.uid, {
            code: found.code,
            names: userData.names,
            since: userData.since,
          }).catch(() => {});
        }
      }
      onLogin({ uid: cred.user.uid, email: cleanEmail, ...userData, isGuest: false }, false);
    } catch(e) {
      const code = e.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setErr("Correo o contraseña incorrectos");
      } else if (code === "auth/user-not-found") {
        setErr("No existe una cuenta con ese correo");
      } else if (code === "auth/too-many-requests") {
        setErr("Demasiados intentos, espera unos minutos");
      } else {
        setErr(authErrMsg(e, "Error al entrar: " + (e.message || e.code || "desconocido")));
      }
    }
    setLoading(false);
  };

  const doReg = async () => {
    const names = nameA.trim() + " & ?";
    const cleanEmail = normalizeEmail(email);
    if (!nameA || !cleanEmail || pass.length < 6) { setErr("Completa tu nombre, correo y contraseña (mín. 6 caracteres)"); return; }
    setLoading(true); setErr("");
    _pendingLocalAuth = true;
    let createdAuthUser = false;
    try {
      const since = "Juntos desde hoy";
      const cred = await fbRegister(cleanEmail, pass);
      createdAuthUser = true;
      const uid = cred.user.uid;
      await ensureAuthReady(cred.user);
      let finalCode = code;
      let created = false;
      for (let i = 0; i < 8; i += 1) {
        try {
          await retryFirestore(() => fbCreateCodeOwner(finalCode, { ownerEmail: cleanEmail, ownerUid: uid, names, since }));
          created = true;
          break;
        } catch (e) {
          if (String(e?.message || "").includes("CODE_TAKEN")) {
            finalCode = makeCode();
            continue;
          }
          throw e;
        }
      }
      if (!created) {
        await fbDeleteCurrentUser().catch(() => {});
        setErr("No se pudo generar un código único. Intenta de nuevo.");
        _pendingLocalAuth = false;
        setLoading(false);
        return;
      }
      if (finalCode !== code) setCode(finalCode);
      await retryFirestore(() => fbSaveUser(uid, { email: cleanEmail, names, code: finalCode, since, isOwner: true }));
      // Keep _pendingLocalAuth on until the user leaves the share-code step.
      setNewUser({ uid, email: cleanEmail, names, code: finalCode, since, isOwner: true, isGuest: false });
      setLoading(false);
      return;
    } catch(e) {
      if (e.code === "auth/email-already-in-use") {
        setErr("Este correo ya tiene cuenta");
      } else if (e.code === "auth/weak-password") {
        setErr("La contraseña debe tener al menos 6 caracteres");
      } else if (isPermissionError(e)) {
        if (createdAuthUser) await fbDeleteCurrentUser().catch(() => {});
        setErr("No se pudo crear el código de pareja por permisos de Firebase. Revisa Firestore Rules de codes.");
      } else {
        if (createdAuthUser) await fbDeleteCurrentUser().catch(() => {});
        setErr(authErrMsg(e, "Error al crear cuenta"));
      }
    }
    _pendingLocalAuth = false;
    setLoading(false);
  };

  const doJoin = async () => {
    const cleanCode = pCode.trim().toUpperCase();
    const cleanPartnerEmail = normalizeEmail(pEmail);
    const cleanPartnerName = nameB.trim() || "?";
    if (!cleanPartnerName || !cleanCode || !cleanPartnerEmail || pPass.length < 6) { setErr("Completa tu nombre, código, correo y contraseña"); return; }
    setLoading(true); setErr("");
    _pendingLocalAuth = true;
    let justCreated = false;
    try {
      const cred = await fbRegister(cleanPartnerEmail, pPass);
      justCreated = true;
      const uid = cred.user.uid;
      await ensureAuthReady(cred.user);
      const claim = await retryFirestore(() => fbClaimPartnerCode(cleanCode, {
        partnerEmail: cleanPartnerEmail,
        partnerUid: uid,
        partnerName: cleanPartnerName,
      }));
      const names = claim.names || "Nosotros";
      const since = claim.since || "Juntos desde hoy";
      await retryFirestore(() => fbSaveUser(uid, { email: cleanPartnerEmail, names, code: cleanCode, since, isOwner: false }));
      // Also update owner's user record with new names
      if (claim.ownerUid) await retryFirestore(() => fbSaveUser(claim.ownerUid, { names }));
      onLogin({ uid, email: cleanPartnerEmail, names, code: cleanCode, since, isOwner: false, isGuest: false }, true);
    } catch(e) {
      if (e.code === "auth/email-already-in-use") {
        // Account exists — try logging them in instead
        try {
          const cred2 = await fbLogin(cleanPartnerEmail, pPass);
          const uid2 = cred2.user.uid;
          await ensureAuthReady(cred2.user);
          const claim2 = await retryFirestore(() => fbClaimPartnerCode(cleanCode, {
            partnerEmail: cleanPartnerEmail,
            partnerUid: uid2,
            partnerName: cleanPartnerName,
          }));
          const names2 = claim2.names || "Nosotros";
          await retryFirestore(() => fbSaveUser(uid2, { email: cleanPartnerEmail, names: names2, code: cleanCode, isOwner: false }));
          if (claim2.ownerUid) await retryFirestore(() => fbSaveUser(claim2.ownerUid, { names: names2 }));
          onLogin({ uid: uid2, email: cleanPartnerEmail, names: names2, code: cleanCode, since: claim2.since || "Juntos", isOwner: false, isGuest: false }, false);
          _pendingLocalAuth = false;
          setLoading(false); return;
        } catch(e2) {
          const code2 = e2?.code || "";
          const msg2 = String(e2?.message || "");
          if (code2 === "auth/invalid-credential" || code2 === "auth/wrong-password") {
            setErr("Ese correo ya existe. Verifica la contraseña para vincularlo.");
          } else if (msg2.includes("CODE_ALREADY_LINKED")) {
            setErr("Ese código ya está vinculado con otra cuenta de pareja.");
          } else if (msg2.includes("CODE_NOT_FOUND")) {
            setErr("Código no encontrado — revisa que esté bien escrito");
          } else if (isPermissionError(e2)) {
            setErr("No se pudo vincular la cuenta con ese código por permisos de Firebase.");
          } else {
            setErr(authErrMsg(e2, "No se pudo iniciar y vincular esta cuenta. Revisa correo, contraseña y código."));
          }
          _pendingLocalAuth = false;
          setLoading(false); return;
        }
      } else if (e.code === "auth/invalid-email") {
        setErr("Correo inválido. Revisa que esté bien escrito.");
      } else if (e.code === "auth/weak-password") {
        setErr("La contraseña debe tener al menos 6 caracteres");
      } else if (isPermissionError(e)) {
        if (justCreated) await fbDeleteCurrentUser().catch(() => {});
        setErr("Firebase bloqueó el acceso al código de pareja. Revisa Firestore Rules para la colección codes.");
      } else {
        const msg = String(e?.message || "");
        if (justCreated) await fbDeleteCurrentUser().catch(() => {});
        if (msg.includes("CODE_ALREADY_LINKED")) {
          setErr("Ese código ya está vinculado con otra cuenta de pareja.");
        } else if (msg.includes("CODE_NOT_FOUND")) {
          setErr("Código no encontrado — revisa que esté bien escrito");
        } else {
          setErr(authErrMsg(e, "Error al unirse: " + (e.message || e.code || "desconocido")));
        }
      }
    }
    _pendingLocalAuth = false;
    setLoading(false);
  };

  const LBL = { fontSize: "0.72rem", fontWeight: 800, color: C.inkM, marginBottom: 5, display: "block", letterSpacing: "0.6px", textTransform: "uppercase" };

  return (
    <div style={{ minHeight: "100vh", background: C.sandL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", fontFamily: "'Nunito',sans-serif" }}>
      <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: "3.2rem", fontWeight: 700, color: C.dark, letterSpacing: "1px" }}>mochi</div>
      <div style={{ color: C.inkL, fontWeight: 700, marginBottom: 12, fontSize: "0.85rem", letterSpacing: "0.6px" }}>TU JARDÍN DE PAREJA 🌿</div>
      <div style={{ marginBottom: 18, animation: "float 3s ease-in-out infinite" }}>
        <CouplePandaSVG size={160} happy={true} />
      </div>
      <div style={{ background: C.white, borderRadius: 24, padding: "22px 20px", width: "100%", maxWidth: 380, boxShadow: `0 4px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        {tab !== "login" && !newUser && (
          <div onClick={() => { setTab("login"); setErr(""); }} style={{ fontSize: "0.8rem", fontWeight: 800, color: C.inkL, cursor: "pointer", marginBottom: 12 }}>
            ← Volver a iniciar sesión
          </div>
        )}
        {tab === "register" && !newUser && (
          <div style={{ background: C.cream, borderRadius: 12, padding: "9px 14px", marginBottom: 10, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6 }}>
              🌱 <strong>¿Empiezas tú?</strong> Crea la cuenta y al final te daremos un código para invitar a tu pareja.
            </div>
          </div>
        )}
        {tab === "pair" && (
          <div style={{ background: C.cream, borderRadius: 12, padding: "9px 14px", marginBottom: 10, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6 }}>
              🐾 <strong>¿Tu pareja ya tiene cuenta?</strong> Pídele su código y úsalo aquí para conectarse.
            </div>
          </div>
        )}
        {err && <div style={{ background: "#ffeef8", color: "#9b356f", fontSize: "0.82rem", fontWeight: 700, padding: "9px 13px", borderRadius: 10, marginBottom: 12, textAlign: "center", border: "1px solid rgba(155,53,111,0.2)" }}>{err}</div>}
        {tab === "login" && <>
          <label style={LBL}>Correo</label><Inp value={email} onChange={setEmail} placeholder="tu@correo.com" type="email" style={{ marginBottom: 10 }} />
          <label style={LBL}>Contraseña</label><Inp value={pass} onChange={setPass} placeholder="••••••••" type="password" style={{ marginBottom: 16 }} />
          <Btn onClick={doLogin} style={{ width: "100%", marginBottom: 18 }} disabled={loading}>{loading ? "Entrando..." : "Entrar 🐼"}</Btn>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.4px" }}>¿PRIMERA VEZ EN MOCHI?</div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["register", "🌱", "Crear jardín", "Empiezo yo"], ["pair", "💌", "Tengo código", "Mi pareja me invitó"]].map(([id, icon, title, sub]) => (
              <div key={id} onClick={() => { setTab(id); setErr(""); }} style={{ flex: 1, background: C.cream, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "10px 8px", textAlign: "center", cursor: "pointer" }}>
                <div style={{ fontSize: "1.3rem" }}>{icon}</div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.92rem", color: C.dark }}>{title}</div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.inkL }}>{sub}</div>
              </div>
            ))}
          </div>
          {!guestOpen ? (
            <div onClick={() => setGuestOpen(true)} style={{ fontSize: "0.76rem", fontWeight: 700, color: C.inkL, textAlign: "center", cursor: "pointer", textDecoration: "underline" }}>Probar sin cuenta</div>
          ) : (
            <div style={{ background: C.cream, borderRadius: 14, padding: 12, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "0.76rem", color: C.inkM, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>¿Cómo se llaman?</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Inp value={guestA} onChange={setGuestA} placeholder="Tu nombre" />
                <Inp value={guestB} onChange={setGuestB} placeholder="Tu pareja" />
              </div>
              <Btn onClick={() => onLogin({ isGuest: true, names: `${guestA.trim() || "Persona A"} & ${guestB.trim() || "Persona B"}`, since: "Siempre juntos" }, true)} variant="sand" style={{ width: "100%", fontSize: "0.85rem" }}>Entrar</Btn>
              <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 700, textAlign: "center", marginTop: 6 }}>Sin cuenta, el progreso solo se guarda en este dispositivo.</div>
            </div>
          )}
        </>}
        {tab === "register" && newUser && (() => {
          const inviteText = `¡Únete a nuestro jardín en Mochi! 🐼🌿 Usa este código al entrar en "Tengo código": ${newUser.code}`;
          return <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.8rem", marginBottom: 4 }}>🎉</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", color: C.dark, fontSize: "1.2rem", marginBottom: 4 }}>¡Tu jardín está listo!</div>
            <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5, marginBottom: 14 }}>Mándale este código a tu pareja para que se una contigo.</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "2.2rem", letterSpacing: 9, color: C.dark, background: C.cream2, borderRadius: 12, padding: "10px", marginBottom: 12, border: `1.5px solid ${C.border}` }}>{newUser.code}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Btn onClick={() => {
                if (navigator.clipboard) { navigator.clipboard.writeText(newUser.code).then(() => showToast("Código copiado: " + newUser.code)).catch(() => showToast("Tu código: " + newUser.code)); }
                else showToast("Tu código: " + newUser.code);
              }} variant="sand" style={{ flex: 1, fontSize: "0.82rem" }}>📋 Copiar</Btn>
              <Btn onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, "_blank")} variant="sand" style={{ flex: 1, fontSize: "0.82rem" }}>💬 WhatsApp</Btn>
            </div>
            <Btn onClick={() => { _pendingLocalAuth = false; onLogin(newUser, true); }} style={{ width: "100%", marginBottom: 6 }}>Entrar a nuestro jardín 🌿</Btn>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>También lo encuentras después dentro de la app</div>
          </div>;
        })()}
        {tab === "register" && !newUser && <>
          <div style={{ marginBottom:10 }}>
              <label style={LBL}>🐼 Tu nombre</label>
              <Inp value={nameA} onChange={setNameA} placeholder="Johana" type="text"/>
          </div>
          {[["Correo", email, setEmail, "tu@correo.com", "email"], ["Contraseña", pass, setPass, "Mínimo 6 caracteres", "password"]].map(([l, v, fn, ph, t]) => (
            <div key={l}><label style={LBL}>{l}</label><Inp value={v} onChange={fn} placeholder={ph} type={t} style={{ marginBottom: 10 }} /></div>
          ))}
          <Btn onClick={doReg} style={{ width: "100%", marginTop: 6 }} disabled={loading}>{loading ? "Creando..." : "Crear cuenta 🌱"}</Btn>
        </>}
        {tab === "pair" && <>
          <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: "1.8rem", marginBottom: 4 }}>🔗</div><div style={{ fontFamily: "'Baloo 2',sans-serif", color: C.dark, fontSize: "1.1rem" }}>Únete al jardín de tu pareja</div></div>
          <div style={{ marginBottom:10 }}>
            <label style={LBL}>🐾 Tu nombre</label>
            <Inp value={nameB} onChange={setNameB} placeholder="Rodrigo" type="text"/>
          </div>
          <input value={pCode} onChange={e => setPCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CÓDIGO" style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Baloo 2',sans-serif", fontSize: "1.8rem", letterSpacing: 9, textAlign: "center", outline: "none", marginBottom: 12, color: C.dark, background: C.cream2, boxSizing: "border-box" }} />
          {[["Tu correo", pEmail, setPEmail, "tu@correo.com", "email"], ["Contraseña", pPass, setPPass, "Mínimo 6 caracteres", "password"]].map(([l, v, fn, ph, t]) => (
            <div key={l}><label style={LBL}>{l}</label><Inp value={v} onChange={fn} placeholder={ph} type={t} style={{ marginBottom: 10 }} /></div>
          ))}
          <Btn onClick={doJoin} style={{ width: "100%", marginTop: 4 }}>Unirme al jardín 🌿</Btn>
        </>}
      </div>
    </div>
  );
}

// GARDEN SCREEN
function ChatEx({ ex, onDone, nameA = "Persona A", nameB = "Persona B", user }) {
  const isOwner = user?.isOwner !== false;
  const myRole = isOwner ? 0 : 1; // 0 = A, 1 = B
  const isGuest = user?.isGuest || !user?.code;

  const [session, setSession] = useState(null);
  const [val, setVal] = useState("");
  const [sending, setSending] = useState(false);
  const [started, setStarted] = useState(false);
  const messagesEndRef = useRef(null);

  const messages = session?.messages || [];
  const currentStep = session?.step ?? 0;
  const isDone = session?.done === true;
  const cur = ex.phases[currentStep];
  const starterRole = session?.starterRole ?? 0;
  const scenarioNameA = starterRole === 0 ? nameA : nameB;
  const scenarioNameB = starterRole === 0 ? nameB : nameA;
  const mappedTurnRole = cur ? (cur.role === 0 ? starterRole : (starterRole === 0 ? 1 : 0)) : null;
  const isMyTurn = cur && mappedTurnRole === myRole;
  const myName = isOwner ? nameA : nameB;

  // Start or listen to session
  useEffect(() => {
    if (isGuest) {
      // Local mode for guests
      setSession({ messages: [], step: 0, totalSteps: ex.phases.length, done: false, starterRole: myRole });
      setStarted(true);
      return;
    }
    const unsub = fbListenExSession(user.code, ex.id, data => {
      if (data) { setSession(data); setStarted(true); }
    });
    return () => unsub();
  }, [user?.code, ex.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const startSession = async () => {
    if (isGuest || !user?.code) {
      // Local mode — just set session directly
      setSession({ messages: [], step: 0, totalSteps: ex.phases.length, done: false, starterRole: myRole });
      setStarted(true);
      return;
    }
    try {
      await fbStartExSession(user.code, ex.id, ex.phases.length, myRole);
      fbSendNotif(user.code, {
        type: "ejercicio",
        msg: `${myName} inició "${ex.title}" — te toca continuar 🌿`,
        forUid: user?.isOwner !== false ? "partner" : "owner",
        fromUid: user.uid,
      }).catch(() => {});
    } catch(e) {
      // Fallback to local if Firebase fails
      setSession({ messages: [], step: 0, totalSteps: ex.phases.length, done: false, starterRole: myRole });
      setStarted(true);
    }
  };

  const send = async () => {
    if (!val.trim() || sending || !isMyTurn) return;
    setSending(true);
    const newStep = currentStep + 1;
    const msg = { text: val.trim(), role: myRole, step: currentStep };
    const isDoneNow = newStep >= ex.phases.length;

    if (isGuest || !user?.code) {
      const newMsgs = [...messages, msg];
      setSession(s => ({ ...s, messages: newMsgs, step: newStep, done: isDoneNow }));
      setVal("");
      if (isDoneNow) onDone();
    } else {
      const newMessages = [...messages, msg];
      await fbSendExMessage(user.code, ex.id, { messages: newMessages, step: newStep, starterRole }).catch(() => {});
      if (isDoneNow) {
        await fbCompleteExSession(user.code, ex.id).catch(() => {});
        onDone();
      } else {
        fbSendNotif(user.code, {
          type: "ejercicio",
          msg: `${myName} respondió en "${ex.title}" — sigue tú ✍️`,
          forUid: user?.isOwner !== false ? "partner" : "owner",
          fromUid: user.uid,
        }).catch(() => {});
      }
      setVal("");
    }
    setSending(false);
  };

  if (isDone) {
    return (
      <div style={{ textAlign:"center", padding:"24px 0" }}>
        <div style={{ fontSize:"2.5rem", marginBottom:8 }}>✨</div>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.dark, fontSize:"1.1rem", marginBottom:6 }}>¡Ejercicio completado!</div>
        <div style={{ fontSize:"0.85rem", color:C.inkM }}>Bien hecho, {nameA} y {nameB} 🐼🐾</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div style={{ textAlign:"center", padding:"20px 0" }}>
        <div style={{ fontSize:"0.85rem", color:C.inkM, marginBottom:14 }}>
          Cualquiera puede empezar el ejercicio
        </div>
        <Btn onClick={startSession} style={{ width:"100%" }}>Empezar ejercicio 🌿</Btn>
        <div style={{ fontSize:"0.75rem", color:C.inkL, marginTop:8, textAlign:"center" }}>La pantalla se actualizará automáticamente ✨</div>
      </div>
    );
  }

  return (
    <div>
      <ProgBar value={currentStep} max={ex.phases.length} style={{ marginBottom: 6 }} />
      <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:800, textAlign:"right", marginBottom:12 }}>PASO {currentStep + 1} / {ex.phases.length}</div>

      {/* Message history */}
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12, maxHeight:200, overflowY:"auto" }}>
        {messages.map((h, i) => (
          <div key={i} style={{ background: h.role === 0 ? C.cream : "#d4e8c4", borderRadius:14, padding:"9px 13px", maxWidth:"88%", alignSelf: h.role === 0 ? "flex-start" : "flex-end" }}>
            <div style={{ fontSize:"0.66rem", fontWeight:800, color:C.inkM, marginBottom:2 }}>{h.role === 0 ? nameA : nameB}</div>
            <div style={{ fontSize:"0.88rem", color:C.ink, lineHeight:1.5 }}>{h.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Current prompt */}
      {cur && (
        <div style={{ background: C.sandL, borderRadius:16, padding:14, border:`1.5px solid ${C.border}` }}>
          <PBadge who={mappedTurnRole === 0 ? "A" : "B"} name={mappedTurnRole === 0 ? nameA : nameB} />
          <div style={{ fontSize:"0.9rem", color:C.ink, fontWeight:700, marginBottom:8, lineHeight:1.6 }}>
            {cur.q.replace(/^Persona [AB]:\s*/, "").replace(/Persona A/g, scenarioNameA).replace(/Persona B/g, scenarioNameB)}
          </div>
          {cur.hint && <div style={{ fontSize:"0.75rem", color:C.inkM, background:C.cream, borderRadius:8, padding:"6px 10px", marginBottom:9, border:`1px solid ${C.border}` }}>💡 {cur.hint}</div>}

          {isMyTurn ? (
            <>
              <TA value={val} onChange={setVal} placeholder={cur.ph} rows={3} style={{ marginBottom:10 }} />
              <Btn onClick={send} style={{ width:"100%" }} disabled={sending}>
                {sending ? "Enviando..." : currentStep < ex.phases.length - 1 ? "Enviar →" : "Finalizar ✓"}
              </Btn>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"14px 0", color:C.inkL }}>
              <div style={{ fontSize:"1.5rem", marginBottom:4 }}>⏳</div>
              <div style={{ fontSize:"0.82rem", fontWeight:700 }}>
                Esperando a {mappedTurnRole === 0 ? nameA : nameB}...
              </div>
              <div style={{ fontSize:"0.72rem", marginTop:4 }}>La pantalla se actualiza automáticamente ✨</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function TimerEx({ ex, onDone, nameA = "Persona A", nameB = "Persona B" }) {
  const [started, setStarted] = useState(false);
  const [secs, setSecs] = useState(ex.timer);
  const [done, setDone] = useState(false);
  const [vals, setVals] = useState(["", ""]);
  const tid = useRef(null);

  useEffect(() => () => clearInterval(tid.current), []);

  const start = () => {
    setStarted(true);
    tid.current = setInterval(() => setSecs(s => {
      if (s <= 1) { clearInterval(tid.current); setDone(true); return 0; }
      return s - 1;
    }), 1000);
  };

  if (!started) return (
    <div>
      <div style={{ background: C.sandL, borderRadius: 14, padding: 14, marginBottom: 14, border: `1.5px solid ${C.border}` }}>
        {ex.beforeTimer.map((s, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.88rem", color: C.ink, marginBottom: 9 }}>
          <div style={{ width: 24, height: 24, background: C.dark, color: C.cream2, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.72rem", flexShrink: 0 }}>{i + 1}</div>
          <div style={{ paddingTop: 2 }}>{s}</div>
        </div>)}
      </div>
      <Btn onClick={start} variant="olive" style={{ width: "100%", fontSize: "1.1rem" }}>▶ Iniciar</Btn>
    </div>
  );

  if (!done) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "4.8rem", color: C.dark, letterSpacing: 4 }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
      <div style={{ fontSize: "0.85rem", color: C.inkM, fontWeight: 700, marginTop: 8 }}>{ex.timerLabel}</div>
    </div>
  );

  return (
    <div>
      <div style={{ background: C.cream, borderRadius: 12, padding: 12, textAlign: "center", fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem", color: C.dark, marginBottom: 14, border: `1.5px solid ${C.border}` }}>¡{Math.floor(ex.timer / 60)} minutos completados! 🎉</div>
      {ex.afterPrompts.map((p, i) => <div key={i} style={{ marginBottom: 10 }}><PBadge who={i === 0 ? "A" : "B"} name={i === 0 ? nameA : nameB} /><TA value={vals[i]} onChange={v => { const n = [...vals]; n[i] = v; setVals(n); }} placeholder={p.ph} /></div>)}
      <Btn onClick={() => { if (!vals.some(v => v.length < 2)) onDone(); }} style={{ width: "100%" }}>Finalizar ✓</Btn>
    </div>
  );
}


function ExModal({ ex, onClose, onComplete, nameA, nameB, user, onGoToGarden }) {
  const [done, setDone] = useState(false);
  const [pts, setPts] = useState(0);
  const [reward, setReward] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const finish = async (p = ex.bamboo) => {
    setDone(true);
    setPts(p);
    const result = await onComplete(ex, p);
    setReward(result || {});
  };

  if (done) {
    const skillUps = reward?.skillUps || [];
    const chestsUnlocked = reward?.chestsUnlocked;
    const rewardItems = reward?.rewardItems || [];
    const streakBonus = reward?.streakBonus || 0;
    const masteryBonus = reward?.masteryBonus || 0;
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ marginBottom: 10 }}><CouplePandaSVG happy size={110} /></div>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.dark, marginBottom: 4 }}>¡Lo hicieron juntos!</div>
        <div style={{ fontSize: "0.85rem", color: C.inkM, marginBottom: 12 }}>Sus pandas están muy felices de verlos crecer</div>

        <div style={{ background: C.gold, color: C.ink, borderRadius: 12, padding: "10px 22px", fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", display: "inline-block", marginBottom: 12, boxShadow: "0 3px 0 rgba(0,0,0,0.14)" }}>
          +{pts + (streakBonus || 0) + (masteryBonus || 0)} bambú 🌿
        </div>

        {(streakBonus > 0 || masteryBonus > 0) && (
          <div style={{ fontSize: "0.75rem", color: C.inkL, marginBottom: 12 }}>
            {streakBonus > 0 && <span>🔥 Racha: +{streakBonus} · </span>}
            {masteryBonus > 0 && <span>🌟 Maestría: +{masteryBonus}</span>}
          </div>
        )}

        {skillUps.length > 0 && (
          <div style={{ background: "#e8f4e8", borderRadius: 12, padding: 10, margin: "0 0 12px", border: `1.5px solid ${C.olive}40` }}>
            {skillUps.map((s, i) => (
              <div key={i} style={{ fontSize: "0.9rem", color: C.dark, fontWeight: 700 }}>
                {EXERCISE_SKILLS[s.skill].emoji} {EXERCISE_SKILLS[s.skill].label} subió a nivel {s.level}
              </div>
            ))}
          </div>
        )}

        {chestsUnlocked && (
          <div style={{ background: "#fff8e0", borderRadius: 12, padding: 12, margin: "0 0 14px", border: `1.5px solid #e8d840` }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>🎁</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem", color: C.dark }}>¡Cofre de pareja abierto!</div>
            {rewardItems.length > 0 ? (
              <div style={{ fontSize: "0.85rem", color: C.inkM, marginTop: 4 }}>
                Ganaron: {rewardItems.map(r => `${r.emoji} ${r.label}`).join(", ")}
              </div>
            ) : (
              <div style={{ fontSize: "0.85rem", color: C.inkM, marginTop: 4 }}>Bambú extra dentro ✨</div>
            )}
          </div>
        )}

        <Btn onClick={onClose} variant="olive" style={{ width: "100%", fontSize: "1.05rem", marginBottom: 10 }}>Reclamar recompensa</Btn>
        {onGoToGarden && (
          <button onClick={() => { onClose(); onGoToGarden(); }}
            style={{ width: "100%", background: C.cream, color: C.ink, border: `2px solid ${C.border}`, borderRadius: 12, padding: 12, fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", cursor: "pointer" }}>
            🎮 Jugar partida de conexión
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 5 }}>{ex.emoji}</div>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.dark }}>{ex.title}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <Tag bg={C.cream} color={C.inkM}>{ex.tags}</Tag>
          <Tag bg={C.sandL} color={C.olive}>{ex.time}</Tag>
          <Tag bg="#fff8e0" color="#9a7020">+{ex.bamboo} 🌿</Tag>
          <Tag bg={EXERCISE_SKILLS[ex.skill].color + "40"} color={C.ink}>{DIFFICULTY_EMOJI[ex.difficulty]} {DIFFICULTY_LABEL[ex.difficulty]}</Tag>
        </div>
      </div>

      {/* ✦ INTRO CIENTÍFICA — por qué hacen esto */}
      <div style={{ background: "linear-gradient(135deg, #e8f4e8, #f0f8f0)", borderRadius: 16, padding: 16, marginBottom: 14, border: `1.5px solid ${C.olive}28` }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.olive, letterSpacing: "0.6px", marginBottom: 7 }}>🔬 ¿POR QUÉ ESTE EJERCICIO?</div>
        <div style={{ fontSize: "0.88rem", color: C.inkM, lineHeight: 1.7 }}>{ex.desc}</div>
      </div>

      {/* Instrucciones colapsables */}
      {ex.instructions && (
        <div style={{ background: C.sandL, borderRadius: 14, padding: 14, marginBottom: 14, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setShowInstructions(!showInstructions)}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", color: C.dark }}>📋 Cómo hacerlo</div>
            <div style={{ color: C.inkL, transition: "transform 0.2s", transform: showInstructions ? "rotate(180deg)" : "none", fontSize: "0.8rem" }}>▼</div>
          </div>
          {showInstructions && (
            <div style={{ marginTop: 10 }}>
              {ex.instructions.map((inst, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
                  <div style={{ width: 22, height: 22, background: C.olive, color: C.cream2, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.68rem", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: "0.84rem", color: C.inkM, lineHeight: 1.5, paddingTop: 2 }}>{inst.replace(/Persona A/g, nameA).replace(/Persona B/g, nameB)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ex.phases && <ChatEx ex={ex} onDone={finish} nameA={nameA} nameB={nameB} user={user} />}
      {ex.timer && <TimerEx ex={ex} onDone={finish} nameA={nameA} nameB={nameB} />}
    </div>
  );
}

function Ejercicios({ exDone, onComplete, user, lessonsDone, onCompleteLesson, bamboo, exChestState, exStreak, onGoToGarden }) {
  const { nameA, nameB } = getCoupleNames(user);
  const [openId, setOpenId] = useState(null);
  const [openLesson, setOpenLesson] = useState(null);
  const [ejTab, setEjTab] = useState("ejerc");
  const ex = EXERCISES.find(e => e.id === openId);

  const pathProgress = useMemo(() => getPathProgress(exDone), [exDone]);
  const chestState = useMemo(() => getChestState(exDone, exChestState), [exDone, exChestState]);
  const streak = useMemo(() => getExerciseStreak(exStreak), [exStreak]);

  const exercisesByZone = useMemo(() => {
    const unlockedZoneIds = getUnlockedZones(exDone);
    return unlockedZoneIds.map(zoneId => ({
      zoneId,
      zone: EXERCISE_ZONES[zoneId],
      exercises: EXERCISES.filter(e => e.zone === zoneId),
    }));
  }, [exDone]);

  const [expandedZones, setExpandedZones] = useState(() => {
    const ids = exercisesByZone.map(z => z.zoneId);
    return ids.length ? { [ids[ids.length - 1]]: true } : {};
  });

  useEffect(() => {
    const ids = exercisesByZone.map(z => z.zoneId);
    if (ids.length && !expandedZones[ids[ids.length - 1]]) {
      setExpandedZones(prev => ({ ...prev, [ids[ids.length - 1]]: true }));
    }
  }, [exercisesByZone]);

  const toggleZone = (zoneId) => setExpandedZones(prev => ({ ...prev, [zoneId]: !prev[zoneId] }));

  return (
    <>
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        {/* Minimal header */}
        <div style={{ background: C.dark, padding: "44px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.6rem", color: C.cream2 }}>Ejercicios</div>
            <div style={{ background: C.olive, borderRadius: 20, padding: "5px 12px", fontFamily: "'Baloo 2',sans-serif", fontSize: "0.85rem", color: C.cream2 }}>{bamboo} 🌿</div>
          </div>
        </div>

        {/* Compact stats */}
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: C.white, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.7rem", color: C.inkL, fontWeight: 800 }}>
              <span>Progreso</span>
              <span>{pathProgress.completed}/{pathProgress.total}</span>
            </div>
            <div style={{ background: C.cream, borderRadius: 50, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pathProgress.pct}%`, height: "100%", background: C.olive, borderRadius: 50, transition: "width 0.6s" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: C.inkM, fontWeight: 700 }}>
            <span>🔥 {streak.count}</span>
            <span>{chestState.canOpen ? "🎁" : "🎀"}</span>
          </div>
        </div>

        {/* Minimal tabs */}
        <div style={{ display: "flex", gap: 6, padding: "12px 14px 0" }}>
          {[["ejerc","Camino"],["lecciones","Lecciones"]].map(([id,label]) => (
            <button key={id} onClick={() => setEjTab(id)}
              style={{
                flex:1, padding:"8px 0", textAlign:"center", fontFamily:"'Baloo 2',sans-serif",
                fontSize:"0.85rem", cursor:"pointer", borderRadius:20, border:"none",
                background: ejTab===id ? C.dark : "transparent",
                color: ejTab===id ? C.cream2 : C.inkM,
                boxShadow: ejTab===id ? "0 2px 0 rgba(0,0,0,0.1)" : "inset 0 0 0 1.5px " + C.border,
                transition:"all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>

        {/* CAMINO TAB */}
        {ejTab === "ejerc" && (
          <div style={{ padding: "14px" }}>
            {exercisesByZone.map(({ zoneId, zone, exercises }) => {
              const zoneCompleted = exercises.filter(e => (exDone[e.id] || 0) >= 1).length;
              const zoneTotal = exercises.length;
              const allZoneCompleted = zoneCompleted === zoneTotal;
              const expanded = !!expandedZones[zoneId];
              const firstPending = exercises.find(e => (exDone[e.id] || 0) < 1) || exercises[0];

              const handleZoneClick = () => {
                if (!expanded) {
                  toggleZone(zoneId);
                } else if (firstPending) {
                  setOpenId(firstPending.id);
                }
              };

              return (
                <div key={zoneId} style={{ background: C.white, borderRadius: 18, marginBottom: 10, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
                  <div onClick={handleZoneClick}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: zone.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>{zone.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", color: C.dark }}>{zone.label}</div>
                      <div style={{ fontSize: "0.7rem", color: C.inkL }}>{zoneCompleted}/{zoneTotal} · {allZoneCompleted ? "Completada" : zone.desc}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 800, color: C.olive, background: C.cream, borderRadius: 10, padding: "4px 10px" }}>
                        {expanded ? "Jugar" : "Abrir"}
                      </span>
                      <div style={{ fontSize: "0.85rem", color: C.inkM, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</div>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: "0 8px 10px" }}>
                      {exercises.map(e => {
                        const count = exDone[e.id] || 0;
                        const completed = count >= 1;
                        return (
                          <div key={e.id} onClick={() => setOpenId(e.id)}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 12, cursor: "pointer", background: completed ? "#f8faf6" : "transparent", border: `1.5px solid ${completed ? C.olive + "40" : "transparent"}`, marginBottom: 4 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: completed ? C.olive : C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                              {completed ? "✓" : e.emoji}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.92rem", color: C.dark }}>{e.title}</div>
                              <div style={{ fontSize: "0.7rem", color: C.inkL }}>{completed ? (count >= 3 ? "Dominado" : "Completado") : `+${e.bamboo} 🌿`}</div>
                            </div>
                            <div style={{ fontSize: "0.8rem", color: C.inkL }}>›</div>
                            {count >= 3 && <span style={{ fontSize: "0.75rem" }}>🌟</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LECCIONES TAB */}
        {ejTab === "lecciones" && (
          <div style={{ padding: "14px" }}>
            {(() => {
              const dayOfYear = Math.floor((new Date()-new Date(new Date().getFullYear(),0,0))/86400000);
              const todayId = DAILY_LESSONS[dayOfYear % DAILY_LESSONS.length].id;
              return DAILY_LESSONS.map(lesson => {
                const doneData = lessonsDone?.[lesson.id] || {};
                const myKey = user?.isOwner !== false ? "owner" : "partner";
                const iDone = doneData[myKey] === true;
                const bothDone = doneData.owner === true && doneData.partner === true;
                const isToday = lesson.id === todayId;
                return (
                  <div key={lesson.id} onClick={() => setOpenLesson(lesson)}
                    style={{ background: isToday&&!iDone ? C.dark : C.white, borderRadius:14,
                      padding:"12px 14px", marginBottom:8, cursor:"pointer",
                      border:`1.5px solid ${isToday&&!iDone ? C.dark : bothDone ? C.olive+"50" : C.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ fontSize:"1.4rem" }}>{lesson.emoji}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.9rem", color:isToday&&!iDone?C.cream2:C.dark }}>{lesson.title}</div>
                        <div style={{ fontSize:"0.68rem", marginTop:2, color:isToday&&!iDone?`${C.cream}88`:C.inkL }}>{lesson.tag}{isToday?" · HOY":""}</div>
                      </div>
                      <div style={{ fontSize:"0.85rem", color: iDone ? C.olive : C.inkL }}>{iDone ? "✓" : "+10 🌿"}</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* LESSON MODAL */}
      {openLesson && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.65)", zIndex:5000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) setOpenLesson(null); }}>
          <div style={{ background:C.sandL, borderRadius:"22px 22px 0 0", width:"100%", height:"92%", overflow:"hidden", border:`1.5px solid ${C.border}`, display:"flex", flexDirection:"column", position:"relative" }}>
            {!openLesson.fullCardImages ? (
              <div style={{ background:C.dark, padding:"18px 18px 16px", borderRadius:"22px 22px 0 0", position:"relative", textAlign:"center" }}>
                <div style={{ width:34, height:5, background:"rgba(255,255,255,0.2)", borderRadius:50, margin:"0 auto 12px" }}/>
                <div style={{ fontSize:"2rem", marginBottom:5 }}>{openLesson.emoji}</div>
                <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.3rem", color:C.cream2, marginBottom:4 }}>{openLesson.title}</div>
                <span style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"3px 10px", fontSize:"0.68rem", fontWeight:800 }}>{openLesson.tag}</span>
              </div>
            ) : (
              <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:10, display:"flex", justifyContent:"center", padding:"10px 0 8px", pointerEvents:"none" }}>
                <div style={{ width:34, height:5, background:"rgba(255,255,255,0.35)", borderRadius:50 }}/>
              </div>
            )}
            <div style={{ flex:1, overflow:"hidden" }}>
              <LessonCardWizard
                lesson={openLesson}
                onComplete={() => { onCompleteLesson(openLesson.id); setOpenLesson(null); }}
                onClose={() => setOpenLesson(null)}
                completed={!!lessonsDone?.[openLesson.id]?.[user?.isOwner !== false ? "owner" : "partner"]}
                partnerStatus={lessonsDone?.[openLesson.id] || {}}
                nameA={nameA}
                nameB={nameB}
              />
            </div>
          </div>
        </div>
      )}

      {/* EXERCISE MODAL */}
      {openId && ex && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,15,0.65)", zIndex: 5000, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div style={{ background: C.white, borderRadius: "22px 22px 0 0", padding: "16px 18px 44px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto", border: `1.5px solid ${C.border}`, position: "relative" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ width:34, height:5, background:C.sand, borderRadius:50 }}/>
              <div onClick={()=>setOpenId(null)} style={{ width:30, height:30, borderRadius:"50%", background:C.sand, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:"1rem", color:C.inkM, fontWeight:800 }}>✕</div>
            </div>
            <ExModal ex={ex} onClose={() => setOpenId(null)} onComplete={onComplete} user={user} nameA={nameA} nameB={nameB} onGoToGarden={onGoToGarden} />
          </div>
        </div>
      )}
    </>
  );
}

// CONOCETE — niveles de profundidad (Semilla → Brote → Flor)
function getCatLevelIndices(cat, level) {
  return CONOCE_CATS[cat].preguntas
    .map((_, idx) => idx)
    .filter(idx => CONOCE_CATS[cat].levels[idx] === level);
}

function getLevelProgress(cat, level, conoce, role) {
  const indices = getCatLevelIndices(cat, level);
  const answered = indices.filter(idx => !!conoce[`${cat}-${idx}`]?.[role]).length;
  return { answered, total: indices.length };
}

function isLevelCompletedByBoth(cat, level, conoce, myRole, partnerRole) {
  const indices = getCatLevelIndices(cat, level);
  return indices.every(idx => !!conoce[`${cat}-${idx}`]?.[myRole] && !!conoce[`${cat}-${idx}`]?.[partnerRole]);
}

function isLevelUnlocked(cat, level, conoce, myRole, partnerRole) {
  if (level === 1) return true;
  return isLevelCompletedByBoth(cat, level - 1, conoce, myRole, partnerRole);
}

function ConozcanseBanner({ subtitle }) {
  return (
    <div style={{ background: C.dark, padding: "14px 16px 10px", textAlign: "center", borderRadius: "0 0 22px 22px" }}>
      <div style={{ display: "flex", justifyContent: "center", margin: "-4px 0 -2px" }}>
        <CouplePandaSVG happy size={78} />
      </div>
      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.cream2, lineHeight: 1.1 }}>Conózcanse</div>
      {subtitle && <div style={{ color: `${C.cream}88`, fontSize: "0.65rem", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Conocete({ conoce, onSave, user, streakInfo, onDailySeedAnswer }) {
  const { nameA, nameB } = getCoupleNames(user);
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const myLabel = myRole === "owner" ? nameA : nameB;
  const partnerWho = myRole === "owner" ? "B" : "A";
  const partnerLabel = myRole === "owner" ? nameB : nameA;

  const [openQ, setOpenQ] = useState(null);
  const [myAnswer, setMyAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  const [celebrateLevel, setCelebrateLevel] = useState(null);
  const [openQuizId, setOpenQuizId] = useState(null);
  const [showDailySeed, setShowDailySeed] = useState(false);

  const { dailySeed, hasAnswered: dailySeedAnswered, loading: dailySeedLoading } = useDailySeed(user);

  const overall = useMemo(() => getJourneyOverallProgress(conoce, myRole, partnerRole), [conoce, myRole, partnerRole]);

  // Estado de cada parada: dentro de un nivel avanzas a tu ritmo (respondes una → se abre la siguiente)
  const mapNodes = useMemo(() => {
    let prevMine = true;
    let prevLevel = null;
    return CONOCE_MAP.nodes.map(n => {
      if (n.level !== prevLevel) { prevMine = true; prevLevel = n.level; }
      const levelOpen = isJourneyLevelUnlocked(n.level, conoce, myRole, partnerRole);
      if (n.type === "q") {
        const ans = conoce[`${n.q.cat}-${n.q.idx}`] || {};
        const mine = !!ans[myRole], partnerDone = !!ans[partnerRole];
        const open = levelOpen && (mine || prevMine);
        prevMine = mine;
        const status = !open ? "locked" : !mine ? "current" : partnerDone ? "done" : "waiting";
        return { ...n, status, partnerDone };
      }
      if (n.type === "quiz") {
        const quiz = QUIZZES.find(z => z.id === n.quizId);
        const answered = quiz.questions.filter((_, idx) => !!conoce[`${quiz.catKey}-${idx}`]?.[myRole]).length;
        const status = answered === quiz.questions.length ? "done" : levelOpen && prevMine ? "ready" : "locked";
        return { ...n, quiz, status };
      }
      return { ...n, status: isJourneyLevelCompletedByBoth(n.level, conoce, myRole, partnerRole) ? "done" : "locked" };
    });
  }, [conoce, myRole, partnerRole]);

  const focusIdx = useMemo(() => {
    const i = mapNodes.findIndex(n => n.status === "current" || n.status === "ready");
    if (i >= 0) return i;
    for (let j = mapNodes.length - 1; j >= 0; j--) if (mapNodes[j].status !== "locked") return j;
    return 0;
  }, [mapNodes]);

  // Al volver al camino, centrar la parada que toca
  const focusRef = useRef(null);
  useEffect(() => {
    if (openQ || openQuizId) return;
    const t = setTimeout(() => focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
  }, [openQ, openQuizId]);

  // Celebrar solo cuando un nivel pasa a estar completo por ambos (no cada vez que se abre la pantalla)
  const completedLevelsRef = useRef(null);
  useEffect(() => {
    const done = CONOCE_JOURNEY.filter(lvl => isJourneyLevelCompletedByBoth(lvl.level, conoce, myRole, partnerRole)).map(lvl => lvl.level);
    const prev = completedLevelsRef.current;
    completedLevelsRef.current = done;
    const fresh = prev && done.find(l => !prev.includes(l));
    if (!fresh) return;
    setCelebrateLevel(fresh);
    const t = setTimeout(() => setCelebrateLevel(null), 2500);
    return () => clearTimeout(t);
  }, [conoce, myRole, partnerRole]);

  const openQuestion = (q) => {
    setOpenQ(q);
    setSaved(false);
    const ex = conoce[`${q.cat}-${q.idx}`] || {};
    setMyAnswer(ex[myRole] || "");
  };

  const saveQ = () => {
    const clean = myAnswer.trim();
    if (!clean || !openQ) return;
    const isNewMine = !conoce[`${openQ.cat}-${openQ.idx}`]?.[myRole];
    onSave(openQ.cat, openQ.idx, clean, openQ.level, isNewMine);
    setSaved(true);
    setOpenQ(null);
  };

  // ─── Single question view (card flip style)
  if (openQ) {
    const partnerAns = conoce[`${openQ.cat}-${openQ.idx}`]?.[partnerRole];
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <ConozcanseBanner subtitle={CONOCE_LEVELS[openQ.level].label} />
        <style>{`
          @keyframes cardIn { from { opacity:0; transform: translateY(24px) scale(0.96) rotate(-1deg); } to { opacity:1; transform: none; } }
          @keyframes floatSoft { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        `}</style>
        <div style={{ margin: 14, animation: "cardIn 0.45s cubic-bezier(0.22,1,0.36,1)" }}>
          <div style={{ background: CONOCE_LEVELS[openQ.level].color, borderRadius: 24, padding: "22px 20px", border: `2px solid ${CONOCE_LEVELS[openQ.level].ring}`, boxShadow: `0 12px 30px ${CONOCE_LEVELS[openQ.level].ring}40` }}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "center", animation: "floatSoft 2.8s ease-in-out infinite", marginBottom: 10 }}>
                <div style={{ width: 76, height: 76, borderRadius: "50%", background: "rgba(255,255,255,0.8)", border: `2.5px solid ${CONOCE_LEVELS[openQ.level].ring}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ConoceIcon name={CONOCE_CAT_ICON[openQ.cat]} size={40} color={CONOCE_LEVELS[openQ.level].ring} stroke={1.8} />
                </div>
              </div>
              <div style={{ display: "inline-flex", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 800, color: C.inkM, background: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "3px 9px" }}>{openQ.catLabel.toUpperCase()}</span>
                <span style={{ fontSize: "0.65rem", fontWeight: 800, color: C.inkM, background: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "3px 9px", display: "inline-flex", alignItems: "center", gap: 4 }}><ConoceIcon name={CONOCE_LEVEL_ICON[openQ.level]} size={12} stroke={2.4} />{CONOCE_LEVELS[openQ.level].label}</span>
              </div>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.25rem", color: C.dark, lineHeight: 1.35 }}>{openQ.text}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <TA value={myAnswer} onChange={setMyAnswer} placeholder="Escribe tu respuesta..." rows={5} />
            </div>

            {partnerAns && (
              <div style={{ marginBottom: 14, background: "rgba(255,255,255,0.75)", borderRadius: 16, padding: 14, border: `1.5px solid ${C.border}` }}>
                <PBadge who={partnerWho} name={partnerLabel} />
                <div style={{ fontSize: "0.88rem", color: C.inkM, lineHeight: 1.6, marginTop: 6 }}>{partnerAns}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={saveQ} style={{ flex: 1, fontSize: "1.05rem" }}>Guardar respuesta</Btn>
              <Btn onClick={() => setOpenQ(null)} variant="ghost" style={{ padding: "12px 16px" }}>✕</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Test de personalidad abierto desde el camino
  if (openQuizId) {
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <ConozcanseBanner subtitle="Tests de personalidad" />
        <div style={{ padding: "12px 14px 0" }}>
          <Btn onClick={() => setOpenQuizId(null)} variant="ghost" style={{ padding: "8px 12px", fontSize: "0.8rem" }}>← Volver al camino</Btn>
          <Cuestionarios conoce={conoce} onSave={onSave} user={user} initialQuiz={openQuizId} />
        </div>
      </div>
    );
  }

  // ─── Main journey view — camino ilustrado
  const H = CONOCE_MAP.height;
  const pctY = (y) => `${(y / H) * 100}%`;
  const [broteY, florY] = CONOCE_MAP.labels.map(l => l.y);

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ConozcanseBanner />
      <style>{`
        @keyframes bounceSoft { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes confetti { 0% { transform: translateY(0) rotate(0deg); opacity:1; } 100% { transform: translateY(120px) rotate(720deg); opacity:0; } }
        @keyframes nodeGlow { 0%,100% { box-shadow: 0 5px 0 #e79bbd, 0 0 0 6px rgba(255,214,232,0.55), 0 0 26px rgba(255,190,220,0.8); } 50% { box-shadow: 0 5px 0 #e79bbd, 0 0 0 12px rgba(255,214,232,0.35), 0 0 36px rgba(255,190,220,0.95); } }
        @keyframes raysBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      {/* Semilla del día */}
      <div style={{ padding: "14px 14px 14px" }}>
        <div
          onClick={() => setShowDailySeed(true)}
          style={{
            background: "linear-gradient(135deg, #fff9e8 0%, #f3ecfb 100%)",
            borderRadius: 20,
            padding: "16px 18px",
            border: "1.5px solid rgba(141,111,201,0.22)",
            boxShadow: "0 4px 0 rgba(141,111,201,0.12)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "#e8f2e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ConoceIcon name="seed" size={20} color="#6a9a5c" />
              </div>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.dark }}>Semilla del día</div>
            </div>
            {streakInfo?.currentStreak > 0 && (
              <div style={{ background: "#fdeee2", color: "#c0703a", borderRadius: 12, padding: "4px 10px", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
                <ConoceIcon name="flame" size={13} stroke={2.2} /> {streakInfo.currentStreak}
              </div>
            )}
          </div>
          <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.45, marginBottom: 10, minHeight: 20 }}>
            {dailySeedLoading ? "Cargando..." : (dailySeed?.questionText || "Pregunta de hoy")}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: dailySeedAnswered ? "#3a7a2e" : C.olive, display: "flex", alignItems: "center", gap: 5 }}>
              {dailySeedAnswered ? <><ConoceIcon name="check" size={14} stroke={2.8} /> Ya respondiste hoy</> : "Toca para responder"}
            </div>
            {!dailySeedAnswered && (
              <div style={{ background: C.olive, color: C.cream2, borderRadius: 10, padding: "6px 12px", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
                +10 <ConoceIcon name="leaf" size={13} stroke={2.2} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div style={{ position: "relative", width: "100%", aspectRatio: `1000 / ${H}`, overflow: "hidden", background: "#d2dab9" }}>
        <img src="/conoce/paisaje.webp" alt="" draggable={false}
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: pctY(CONOCE_MAP_TOP_H + 2), display: "block" }} />
        {CONOCE_MAP.tiles.map((t, k) => (
          <img key={t} src="/conoce/paisaje-tile.webp" alt="" draggable={false}
            style={{ position: "absolute", left: 0, top: pctY(t - 60), width: "100%", height: pctY(CONOCE_MAP_TILE_H + 62), display: "block", transform: k % 2 ? "scaleX(-1)" : "none",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 12%)", maskImage: "linear-gradient(to bottom, transparent 0%, #000 12%)" }} />
        ))}
        {/* Tinte por nivel: verde → lila (Brote) → rosa (Flor) */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "color",
          background: `linear-gradient(to bottom,
            rgba(255,255,255,0) 0%, rgba(255,255,255,0) ${((broteY - 260) / H) * 100}%,
            rgba(176,140,240,0.55) ${((broteY + 60) / H) * 100}%, rgba(176,140,240,0.55) ${((florY - 260) / H) * 100}%,
            rgba(245,140,195,0.5) ${((florY + 60) / H) * 100}%, rgba(245,140,195,0.5) 100%)`,
        }} />

        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <path d={CONOCE_MAP.path} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="92" strokeLinecap="round" />
          <path d={CONOCE_MAP.path} fill="none" stroke="#fbf3df" strokeWidth="66" strokeLinecap="round" />
        </svg>

        {/* Progreso juntos */}
        <div style={{ position: "absolute", left: 12, top: 12, background: "rgba(255,255,255,0.85)", borderRadius: 14, padding: "5px 11px", fontSize: "0.72rem", fontWeight: 800, color: C.inkM, boxShadow: "0 2px 0 rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 5 }}>
          <ConoceIcon name="heart" size={13} color="#e46b9c" fill="#f7c3d8" stroke={2} /> {overall.answered}/{overall.total} juntos
        </div>

        {/* Letreros de nivel */}
        {CONOCE_MAP.labels.map(l => {
          const lv = CONOCE_LEVELS[l.level];
          const open = isJourneyLevelUnlocked(l.level, conoce, myRole, partnerRole);
          return (
            <div key={l.level} style={{ position: "absolute", left: "50%", top: pctY(l.y), transform: "translate(-50%,-50%)", zIndex: 2,
              background: "rgba(255,255,255,0.92)", border: `2px solid ${lv.ring}`, borderRadius: 18, padding: "7px 14px", textAlign: "center",
              boxShadow: `0 4px 0 ${lv.ring}55`, whiteSpace: "nowrap" }}>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.98rem", color: C.dark, lineHeight: 1.1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <ConoceIcon name={CONOCE_LEVEL_ICON[l.level]} size={17} color={lv.ring} stroke={2.2} />{lv.label}
              </div>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, color: C.inkM, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {!open && <ConoceIcon name="lock" size={11} stroke={2.4} />}
                {open ? lv.sub : `Terminen ${CONOCE_LEVELS[l.level - 1].label} los dos`}
              </div>
            </div>
          );
        })}

        {/* Paradas */}
        {mapNodes.map((n, i) => {
          const isQuiz = n.type === "quiz", isChest = n.type === "chest";
          const size = isQuiz || isChest ? 62 : 56;
          const look = {
            locked:  { bg: "radial-gradient(circle at 35% 30%, #fbf8ff, #e6def4)", edge: "#c9bce3" },
            current: { bg: "radial-gradient(circle at 35% 30%, #fff, #fcd9e8)", edge: "#e79bbd" },
            waiting: { bg: "radial-gradient(circle at 35% 30%, #fff, #f1ebfb)", edge: "#c3b2e6" },
            ready:   { bg: "radial-gradient(circle at 35% 30%, #fff, #e9ddff)", edge: "#9a7fd9" },
            done:    { bg: "radial-gradient(circle at 35% 30%, #fff6d6, #f7d67a)", edge: "#d9a93a" },
          }[n.status];
          const iconColor = { locked: "#a796cc", current: "#e46b9c", waiting: "#8d6fc9", ready: "#7c5fd0", done: "#b8862a" }[n.status];
          const iconName = isChest ? (n.status === "done" ? "trophy" : "gift")
            : isQuiz ? CONOCE_QUIZ_ICON[n.quizId]
            : n.status === "current" ? "heart"
            : CONOCE_CAT_ICON[n.q.cat];
          const icon = n.status === "locked" && n.type === "q" ? <ConoceLock />
            : <ConoceIcon name={iconName} size={isQuiz || isChest ? 30 : 27} color={iconColor} stroke={2.1}
                fill={n.status === "current" ? "#f7a8c8" : "none"} />;
          const tappable = n.status !== "locked" && !isChest;
          const onTap = () => {
            if (!tappable) return;
            if (isQuiz) setOpenQuizId(n.quizId);
            else openQuestion(n.q);
          };
          return (
            <div key={i} ref={i === focusIdx ? focusRef : null}
              style={{ position: "absolute", left: `${n.x / 10}%`, top: pctY(n.y), transform: "translate(-50%,-50%)", zIndex: 3 }}>
              {n.status === "current" && (
                <>
                  <div style={{ position: "absolute", left: "50%", top: -24, transform: "translateX(-50%)", display: "flex", gap: 8, animation: "raysBlink 1.6s ease-in-out infinite" }}>
                    {[-25, 0, 25].map(r => <div key={r} style={{ width: 5, height: 13, borderRadius: 3, background: "#f5c74a", transform: `rotate(${r}deg) translateY(${r ? 4 : 0}px)` }} />)}
                  </div>
                  <div style={{ position: "absolute", left: "50%", bottom: "100%", marginBottom: 20, transform: "translateX(-50%)", background: "#fff", borderRadius: 12, padding: "3px 10px", fontSize: "0.68rem", fontWeight: 800, color: "#c2588a", whiteSpace: "nowrap", boxShadow: "0 2px 0 rgba(0,0,0,0.08)" }}>
                    {n.partnerDone ? "¡Ya respondió! Te toca" : "¡Te toca!"}
                  </div>
                </>
              )}
              <div onClick={onTap}
                style={{
                  width: size, height: size, borderRadius: "50%", background: look.bg,
                  border: "3px solid rgba(255,255,255,0.95)",
                  boxShadow: `0 5px 0 ${look.edge}, 0 8px 14px rgba(80,60,120,0.15)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: tappable ? "pointer" : "default", position: "relative",
                  animation: n.status === "current" ? "nodeGlow 2s ease-in-out infinite, bounceSoft 2.2s ease-in-out infinite"
                    : n.status === "ready" ? "bounceSoft 2.2s ease-in-out infinite" : "none",
                  filter: n.status === "locked" && n.type !== "q" ? "grayscale(0.7) opacity(0.75)" : "none",
                  WebkitTapHighlightColor: "transparent",
                }}>
                {icon}
                {n.type === "q" && n.status === "waiting" && (
                  <span style={{ position: "absolute", right: -6, bottom: -4, background: "#fff", borderRadius: 10, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}><ConoceIcon name="hourglass" size={13} color="#8d6fc9" stroke={2.2} /></span>
                )}
                {n.type === "q" && n.status === "done" && (
                  <span style={{ position: "absolute", right: -6, bottom: -4, background: "#7fbf6a", borderRadius: 10, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><ConoceIcon name="check" size={12} color="#fff" stroke={3.2} /></span>
                )}
              </div>
              {(isQuiz || isChest) && (
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 9, background: "rgba(255,255,255,0.9)", borderRadius: 10, padding: "2px 9px", fontSize: "0.64rem", fontWeight: 800, color: C.inkM, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                  {isQuiz ? `${n.quiz.title} · opcional` : <>+{CONOCE_JOURNEY[n.level - 1].rewardBamboo} <ConoceIcon name="leaf" size={11} color={C.olive} stroke={2.4} /> {n.status === "done" ? "ganados" : "juntos"}</>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {celebrateLevel && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, display: "flex", justifyContent: "center" }}>
          {[...Array(12)].map((_, idx) => (
            <div key={idx} style={{
              position: "absolute", top: "20%", left: `${10 + idx * 7}%`,
              width: idx % 3 ? 10 : 14, height: idx % 3 ? 14 : 8, borderRadius: idx % 2 ? 3 : 7,
              background: ["#f7a8c8", "#b9a2ec", "#f5c74a", "#8bc48a"][idx % 4],
              animation: `confetti 1.2s ease ${idx * 0.05}s both`
            }} />
          ))}
        </div>
      )}
      {showDailySeed && (
        <DailySeedModal
          user={user}
          streakInfo={streakInfo}
          onAnswer={({ dateKey }) => {
            setShowDailySeed(false);
            onDailySeedAnswer?.({ dateKey });
          }}
          onClose={() => setShowDailySeed(false)}
        />
      )}
    </div>
  );
}

// BURBUJA — INBOX DE NEGOCIACIÓN
// Hilo tipo chat por pregunta: propuesta → contraoferta → ... → acuerdo.
// Ambos teléfonos ven el mismo hilo en vivo vía fbListenBurbuja.
const BURBUJA_EVENT_META = {
  proposal:    { label: "envió una propuesta ✉️",     dot: C.sky,   toast: "Propuesta enviada ✉️",     notif: me => `${me} te envió una propuesta de acuerdo ✉️` },
  counter:     { label: "propuso un ajuste 🌿",       dot: C.gold,  toast: "Ajuste propuesto 🌿",       notif: me => `${me} propuso un ajuste para un acuerdo 🌿` },
  renegotiate: { label: "abrió una re-negociación ↺", dot: C.rose,  toast: "Re-negociación enviada ↺", notif: me => `${me} quiere re-negociar un acuerdo ↺` },
  approved:    { label: "aprobó el acuerdo ✅",       dot: C.olive, toast: "Acuerdo aprobado ✓",       notif: me => `${me} aprobó su acuerdo ✅` },
  pause:       { label: "pidió una pausa 🕊️",         dot: C.inkL,  toast: "Pausa de 24h activada 🕊️",  notif: me => `${me} pidió pausar la negociación 24h 🕊️` },
};

const fmtBurbujaTs = (at) => {
  const d = toJsDate(at);
  if (!d) return "";
  return d.toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const MS_24H = 24 * 60 * 60 * 1000;
const fmtTimeLeft = (ms) => {
  if (ms <= 0) return "0s";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

// Construye los hilos de Negociación: cada item con actividad (respuestas, propuesta, contraoferta o acuerdo),
// ordenados por prioridad: tu turno → listos para proponer → esperando → sin propuesta → acordados.
function buildBurbujaThreads(burbuja, myRole) {
  const threads = BURBUJA_SECTIONS.flatMap(sec =>
    sec.items
      .filter(item => {
        const e = burbuja[item.id] || {};
        const bothAnswered = !!e.owner && !!e.partner;
        return !!(e.history?.length || e.proposalText || e.status === "approved" || bothAnswered);
      })
      .map(item => {
        const entry = burbuja[item.id] || {};
        const history = (entry.history || []).slice().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
        const last = history[history.length - 1];
        const isPending = entry.status === "pending" && !!entry.proposalText;
        const bothAnswered = !!entry.owner && !!entry.partner;
        const readyToPropose = bothAnswered && !isPending && entry.status !== "approved" && history.length === 0;
        const pausedUntil = entry.pausedUntil ? new Date(entry.pausedUntil).getTime() : 0;
        const isPaused = pausedUntil > Date.now();
        return {
          item,
          section: sec,
          entry,
          history,
          lastTs: last?.at || entry.approvedAt || null,
          isApproved: entry.status === "approved",
          myTurn: isPending && entry.proposalBy !== myRole && !isPaused,
          waiting: isPending && entry.proposalBy === myRole && !isPaused,
          readyToPropose: readyToPropose && !isPaused,
          isPaused,
          pausedUntil,
        };
      })
  );
  const rank = t => (t.myTurn ? 0 : t.readyToPropose ? 1 : t.waiting ? 2 : t.isPaused ? 3 : t.isApproved ? 5 : 4);
  return threads.sort((a, b) => rank(a) - rank(b) || new Date(b.lastTs || 0) - new Date(a.lastTs || 0));
}

function BurbujaThread({ thread, myRole, myName, partnerName, isOpen, onToggle, onPropose, onApprove }) {
  const { item, section, entry, history, isApproved, myTurn, waiting, readyToPropose } = thread;
  const [draft, setDraft] = useState("");
  const [renegOpen, setRenegOpen] = useState(false);
  const agreementText = entry.approvedText || "";
  const previous = entry.previousAgreement || "";

  const status = isApproved
    ? { text: "Acordado ✅", color: C.olive, bg: `${C.olive}1a` }
    : myTurn
      ? { text: "Te propusieron algo ↔", color: C.rose, bg: `${C.rose}1a` }
      : waiting
        ? { text: `Esperando a ${partnerName}`, color: C.gold, bg: `${C.gold}1a` }
        : readyToPropose
          ? { text: "Listos para proponer ✍️", color: C.sky, bg: `${C.sky}1a` }
          : { text: "Sin propuesta", color: C.inkL, bg: C.sandL };

  const send = (mode) => {
    const clean = draft.trim();
    if (!clean) return;
    onPropose(item.id, clean, mode);
    setDraft("");
    setRenegOpen(false);
  };

  return (
    <div style={{ background: C.white, borderRadius: 16, padding: 14, marginBottom: 10, border: `1.5px solid ${myTurn ? C.rose : C.border}`, boxShadow: `0 2px 0 ${C.border}` }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: section?.itemBg || status.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", flexShrink: 0 }}>{section?.icon || "🫧"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {section?.title && <div style={{ fontSize: "0.62rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.3px", marginBottom: 1 }}>{section.title.toUpperCase()}</div>}
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.9rem", color: C.dark, lineHeight: 1.35 }}>{item.q}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 800, color: status.color }}>{status.text}</span>
            <span style={{ fontSize: "0.62rem", color: C.inkL, fontWeight: 700 }}>· {history.length} {history.length === 1 ? "mensaje" : "mensajes"}</span>
          </div>
        </div>
        <div style={{ color: C.inkL, fontSize: "0.8rem", flexShrink: 0, transition: "transform 0.25s", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</div>
      </div>

      {isApproved && agreementText && (
        <div style={{ background: `${C.mint}66`, borderRadius: 10, padding: "10px 12px", marginTop: 10, border: `1px solid ${C.olive}40` }}>
          <div style={{ fontSize: "0.64rem", fontWeight: 800, color: C.teal, marginBottom: 3, letterSpacing: "0.4px" }}>ACUERDO FINAL</div>
          <div style={{ fontSize: "0.85rem", color: C.ink, fontWeight: 700, lineHeight: 1.55 }}>{agreementText}</div>
          {entry.approvedAt && <div style={{ fontSize: "0.62rem", color: C.inkL, marginTop: 4, fontWeight: 700 }}>{fmtBurbujaTs(entry.approvedAt)}</div>}
        </div>
      )}

      {isApproved && (
        <div style={{ marginTop: 10 }}>
          {!renegOpen ? (
            <Btn onClick={() => { setRenegOpen(true); setDraft(agreementText); }} variant="sand" style={{ width: "100%", fontSize: "0.84rem", padding: "10px 14px" }}>Re-negociar este acuerdo ↺</Btn>
          ) : (
            <>
              <div style={{ fontSize: "0.72rem", color: C.inkM, fontWeight: 700, marginBottom: 6 }}>
                Al enviar, el acuerdo vuelve a negociación y {partnerName} deberá aprobar la nueva versión.
              </div>
              <TA value={draft} onChange={setDraft} placeholder="Escribe la nueva versión del acuerdo..." rows={3} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <Btn onClick={() => { setRenegOpen(false); setDraft(""); }} variant="ghost" style={{ padding: "9px 12px", fontSize: "0.82rem" }}>Cancelar</Btn>
                <Btn onClick={() => send("renegotiate")} variant="olive" style={{ padding: "9px 12px", fontSize: "0.82rem" }}>Enviar re-negociación ↺</Btn>
              </div>
            </>
          )}
        </div>
      )}

      {isOpen && (
        <div style={{ marginTop: 12 }}>
          {!isApproved && previous && (
            <div style={{ background: C.sandL, borderRadius: 10, padding: "9px 11px", marginBottom: 10, border: `1px dashed ${C.border}` }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.4px", marginBottom: 3 }}>ACUERDO ANTERIOR (EN RE-NEGOCIACIÓN)</div>
              <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5 }}>{previous}</div>
            </div>
          )}

          {history.length === 0 ? (
            <div style={{ fontSize: "0.78rem", color: C.inkL, fontWeight: 700, marginBottom: 10 }}>
              Todavía no hay propuestas en este tema. Envía la primera abajo.
            </div>
          ) : history.map((h, i) => {
            const meta = BURBUJA_EVENT_META[h.type] || BURBUJA_EVENT_META.proposal;
            const mine = h.by === myRole;
            const who = mine ? myName : partnerName;
            return (
              <div key={h.id || i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 9 }}>
                <div style={{ maxWidth: "88%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot, display: "inline-block" }} />
                    <span style={{ fontSize: "0.66rem", fontWeight: 800, color: C.inkL }}>{who} {meta.label}</span>
                  </div>
                  <div style={{ background: mine ? C.cream : C.sandL, borderRadius: 12, padding: "9px 11px", border: `1px solid ${C.border}`, borderBottomRightRadius: mine ? 4 : 12, borderBottomLeftRadius: mine ? 12 : 4 }}>
                    <div style={{ fontSize: "0.84rem", color: C.ink, fontWeight: 700, lineHeight: 1.55 }}>{h.text}</div>
                    <div style={{ fontSize: "0.6rem", color: C.inkL, marginTop: 4, fontWeight: 700, textAlign: mine ? "right" : "left" }}>{fmtBurbujaTs(h.at)}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {myTurn && (
            <div style={{ marginTop: 12 }}>
              <Btn onClick={() => onApprove(item.id)} variant="olive" style={{ width: "100%", fontSize: "0.86rem", padding: "11px 14px" }}>Aceptar acuerdo ✅</Btn>
              <div style={{ marginTop: 9 }}>
                <TA value={draft} onChange={setDraft} placeholder={`O responde a ${partnerName} con tu contraoferta...`} rows={2} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <Btn onClick={() => send("counter")} variant="sand" style={{ padding: "9px 12px", fontSize: "0.82rem" }}>Negociar de nuevo ↺</Btn>
                </div>
              </div>
            </div>
          )}

          {waiting && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: C.sandL, borderRadius: 10, padding: "9px 11px", fontSize: "0.76rem", color: C.inkM, fontWeight: 700, border: `1px solid ${C.border}` }}>
                Ya enviaste tu propuesta. Esperando que {partnerName} la acepte o te responda ↔
              </div>
              <div style={{ marginTop: 9 }}>
                <TA value={draft} onChange={setDraft} placeholder="¿Quieres ajustar tu propuesta antes de que responda?" rows={2} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <Btn onClick={() => send("proposal")} variant="ghost" style={{ padding: "9px 12px", fontSize: "0.82rem" }}>Reemplazar propuesta</Btn>
                </div>
              </div>
            </div>
          )}

          {!isApproved && !myTurn && !waiting && (
            <div style={{ marginTop: 12 }}>
              <TA value={draft} onChange={setDraft} placeholder="Propón el acuerdo final para enviarlo a tu pareja..." rows={2} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <Btn onClick={() => send("proposal")} variant="olive" style={{ padding: "9px 12px", fontSize: "0.82rem" }}>Enviar propuesta ✉️</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BurbujaInbox({ threads, myRole, myName, partnerName, onPropose, onApprove }) {
  const [openMap, setOpenMap] = useState({});
  const [filter, setFilter] = useState("todos");

  const counts = {
    todos: threads.length,
    turno: threads.filter(t => t.myTurn).length,
    listos: threads.filter(t => t.readyToPropose).length,
    esperando: threads.filter(t => t.waiting).length,
    acordados: threads.filter(t => t.isApproved).length,
  };

  const visible = threads.filter(t => {
    if (filter === "turno") return t.myTurn;
    if (filter === "listos") return t.readyToPropose;
    if (filter === "esperando") return t.waiting;
    if (filter === "acordados") return t.isApproved;
    return true;
  });

  return (
    <div style={{ margin: "0 14px 10px" }}>
      <div style={{ background: C.cream, borderRadius: 14, padding: "11px 13px", marginBottom: 10, border: `1.5px solid ${C.border}` }}>
        <div style={{ fontSize: "0.78rem", color: C.inkM, fontWeight: 700, lineHeight: 1.6 }}>
          Acá negocian hasta llegar a un acuerdo. Cada propuesta puede recibir una contraoferta. Cuando uno acepta, el acuerdo queda guardado.
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
        {[["todos", "Todos"], ["turno", "Te propusieron"], ["listos", "Listos"], ["esperando", "Esperando"], ["acordados", "Acordados"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{
              borderRadius: 999,
              padding: "7px 12px",
              whiteSpace: "nowrap",
              border: `1.5px solid ${filter === id ? C.dark : C.border}`,
              background: filter === id ? C.dark : C.white,
              color: filter === id ? C.cream2 : C.inkM,
              fontFamily: "'Nunito',sans-serif",
              fontWeight: 800,
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {label} {counts[id]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ background: C.white, borderRadius: 16, padding: 18, border: `1.5px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>🫧</div>
          <div style={{ fontWeight: 800, color: C.ink, fontSize: "0.88rem", marginBottom: 4 }}>
            {threads.length === 0 ? "Aún no hay negociaciones" : "Nada en este filtro"}
          </div>
          <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.6 }}>
            {threads.length === 0
              ? "Ve a Preguntas, responde un acuerdo y envía la propuesta. El ida y vuelta aparecerá acá."
              : "Cambia de filtro para ver los otros hilos."}
          </div>
        </div>
      ) : visible.map(thread => (
        <BurbujaThread
          key={thread.item.id}
          thread={thread}
          myRole={myRole}
          myName={myName}
          partnerName={partnerName}
          isOpen={openMap[thread.item.id] ?? thread.myTurn}
          onToggle={() => setOpenMap(p => ({ ...p, [thread.item.id]: !(p[thread.item.id] ?? thread.myTurn) }))}
          onPropose={onPropose}
          onApprove={onApprove}
        />
      ))}
    </div>
  );
}

// BURBUJA
function Burbuja({ burbuja, onSaveMine, onPropose, onApprove, user }) {
  const { nameA, nameB } = getCoupleNames(user);
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const myName = myRole === "owner" ? nameA : nameB;
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [open, setOpen] = useState({});
  const [tmp, setTmp] = useState({});
  const [editingApproved, setEditingApproved] = useState({});
  const [burbujaTab, setBurbujaTab] = useState("preguntas");
  const [showList, setShowList] = useState(false);

  const get = (id, f) => tmp[id]?.[f] ?? burbuja[id]?.[f] ?? "";
  const set_ = (id, f, v) => setTmp(p => ({ ...p, [id]: { ...p[id], [f]: v } }));
  const approvedCount = Object.values(burbuja).filter(v => v?.status === "approved").length;

  // Camino: de lo más leve a lo más fuerte, en el orden de BURBUJA_SECTIONS
  const pathItems = BURBUJA_SECTIONS.flatMap(sec =>
    sec.items.filter(item => burbujaItemVisible(item, burbuja)).map(item => ({ item, sec }))
  );
  const total = pathItems.length;
  const pendingPath = pathItems.filter(({ item }) => burbuja[item.id]?.status !== "approved");
  const current = pendingPath.find(({ item }) => !burbuja[item.id]?.[myRole]) || pendingPath[0] || null;
  const currentStep = current ? pathItems.indexOf(current) + 1 : 0;

  const approvedItems = BURBUJA_SECTIONS.flatMap(sec =>
    sec.items
      .filter(item => burbuja[item.id]?.status === "approved")
      .map(item => ({ item, entry: burbuja[item.id] || {} }))
  );

  const threads = buildBurbujaThreads(burbuja, myRole);
  const myTurnCount = threads.filter(t => t.myTurn || t.readyToPropose).length;

  const renderItem = (item) => {
    const entry = burbuja[item.id] || {};
    const myText = get(item.id, myRole);
    const partnerText = entry[partnerRole] || "";
    const proposalText = get(item.id, "proposalText");
    const bothDone = !!entry.owner && !!entry.partner;
    const isApproved = entry.status === "approved";
    const hasPending = entry.status === "pending" && !!entry.proposalText;
    const pendingByMe = hasPending && entry.proposalBy === myRole;

    return <div key={item.id} style={{ background: isApproved ? C.cream : C.sandL, borderRadius: 13, padding: 13, marginBottom: 9, borderLeft: `3px solid ${isApproved ? C.olive : C.border}` }}>
      <div style={{ fontSize: "0.88rem", fontWeight: 700, color: C.ink, marginBottom: 10 }}>{item.q}</div>
      {item.note && <div style={{ background: C.white, borderRadius: 9, padding: "9px 11px", marginBottom: 10, fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6, border: `1px solid ${C.border}` }}>{item.note}</div>}

      <div style={{ marginBottom: 8 }}>
        <PBadge who={myRole === "owner" ? "A" : "B"} name={myName} />
        <TA value={myText} onChange={v => set_(item.id, myRole, v)} placeholder={myRole === "owner" ? item.phA : item.phB} rows={2} />
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
          <Btn onClick={() => onSaveMine(item.id, myText)} variant="sand" style={{ padding:"8px 12px", fontSize:"0.8rem" }}>Guardar mi parte</Btn>
        </div>
      </div>

      {partnerText && (
        <div style={{ marginBottom: 8, background:C.white, borderRadius:10, padding:10, border:`1px solid ${C.border}` }}>
          <PBadge who={myRole === "owner" ? "B" : "A"} name={partnerName} />
          <div style={{ fontSize:"0.84rem", color:C.inkM, marginTop:6, lineHeight:1.6 }}>{partnerText}</div>
        </div>
      )}

      {!bothDone && (
        <div style={{ fontSize:"0.74rem", fontWeight:700, color:C.inkL }}>Esperando que ambos escriban su parte para abrir negociación del acuerdo final.</div>
      )}

      {bothDone && !isApproved && !hasPending && (
        <div style={{ marginTop: 8 }}>
          <TA value={proposalText} onChange={v => set_(item.id, "proposalText", v)} placeholder="Propón el acuerdo final para enviarlo a tu pareja..." rows={2} />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
            <Btn onClick={() => onPropose(item.id, proposalText, "proposal")} variant="olive" style={{ padding:"9px 12px", fontSize:"0.82rem" }}>Enviar propuesta</Btn>
          </div>
        </div>
      )}

      {bothDone && hasPending && (
        <div style={{ marginTop: 8, background:C.white, borderRadius:10, padding:10, border:`1.5px solid ${C.border}` }}>
          <div style={{ fontSize:"0.68rem", fontWeight:800, color:C.inkL, marginBottom:4, letterSpacing:"0.4px" }}>
            {pendingByMe ? "PROPUESTA ENVIADA" : "PROPUESTA RECIBIDA"}
          </div>
          <div style={{ fontSize:"0.88rem", color:C.ink, fontWeight:700, lineHeight:1.6 }}>{entry.proposalText}</div>

          {pendingByMe ? (
            <div style={{ marginTop:8, fontSize:"0.74rem", color:C.inkL, fontWeight:700 }}>Esperando respuesta de {partnerName}...</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <Btn onClick={() => onApprove(item.id)} variant="olive" style={{ flex:1, fontSize:"0.82rem", padding:"10px 12px" }}>Aceptar acuerdo ✅</Btn>
              </div>
              <div style={{ marginTop:8 }}>
                <TA value={proposalText} onChange={v => set_(item.id, "proposalText", v)} placeholder="Si no te convence, propone ajuste para negociar..." rows={2} />
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
                  <Btn onClick={() => onPropose(item.id, proposalText, "counter")} variant="sand" style={{ padding:"9px 12px", fontSize:"0.82rem" }}>Negociar de nuevo ↺</Btn>
                </div>
              </div>
              <div style={{ marginTop:8, fontSize:"0.72rem", color:C.inkL, fontWeight:700 }}>El ida y vuelta completo queda en Negociación.</div>
            </>
          )}
        </div>
      )}

    </div>;
  };

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.olive, padding: "48px 20px 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.9rem", color: C.cream2, margin: 0 }}>Acuerdos 🫧</h1>
        <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>Sus reglas, acuerdos y mundo compartido · +10 bambú c/u</p>
      </div>
      <div style={{ background: C.cream, borderRadius: 18, margin: "14px 14px 8px", padding: 16, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` }}>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.dark, marginBottom: 5 }}>🫧 ¿Qué es la Burbuja?</div>
        <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.7 }}>
          Acá construyen juntos las reglas y acuerdos de su relación, empezando por lo más ligero. En <strong>Preguntas</strong>: cada uno responde su parte del acuerdo.
          En <strong>Negociación</strong>: el ida y vuelta de propuestas y contraofertas hasta que uno acepte.
          En <strong>Acuerdos</strong>: todo lo acordado, con opción de <strong>re-negociar</strong> cuando quieran.
          Cada acuerdo aprobado da +10 bambú 🌿 a los dos.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <ProgBar value={approvedCount} max={total} color={C.olive} height={7} style={{ flex: 1 }} />
          <div style={{ fontSize: "0.76rem", fontWeight: 800, color: C.olive, whiteSpace: "nowrap" }}>{approvedCount} / {total}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "0 14px 10px" }}>
        {[ ["preguntas", "Preguntas"], ["inbox", "Negociación"], ["acuerdos", "Acuerdos"] ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setBurbujaTab(id)}
            style={{
              flex: 1,
              position: "relative",
              borderRadius: 12,
              padding: "10px 8px",
              border: `1.5px solid ${burbujaTab === id ? C.dark : C.border}`,
              background: burbujaTab === id ? C.dark : C.white,
              color: burbujaTab === id ? C.cream2 : C.ink,
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "0.78rem",
              cursor: "pointer",
              boxShadow: burbujaTab === id ? "0 2px 0 rgba(0,0,0,0.18)" : `0 2px 0 ${C.border}`,
            }}
          >
            {label}
            {id === "inbox" && myTurnCount > 0 && (
              <span style={{ position: "absolute", top: -5, right: -4, background: "#c05068", color: C.white, borderRadius: 8, minWidth: 17, height: 17, padding: "0 4px", fontSize: "0.62rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{myTurnCount}</span>
            )}
          </button>
        ))}
      </div>

      {burbujaTab === "inbox" && (
        <BurbujaInbox
          threads={threads}
          myRole={myRole}
          myName={myName}
          partnerName={partnerName}
          onPropose={onPropose}
          onApprove={onApprove}
        />
      )}

      {burbujaTab === "preguntas" && !showList && current && (
        <div style={{ background: C.white, borderRadius: 18, margin: "0 14px 10px", padding: 16, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, background: current.sec.itemBg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", flexShrink: 0 }}>{current.sec.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.dark }}>{current.sec.title}</div>
              <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 700 }}>Acuerdo {currentStep} de {total}</div>
            </div>
            <span style={{ fontSize: "0.65rem", fontWeight: 800, color: C.inkM, background: BURBUJA_LEVELS[current.sec.level].color, borderRadius: 8, padding: "3px 9px", whiteSpace: "nowrap" }}>
              {BURBUJA_LEVELS[current.sec.level].emoji} {BURBUJA_LEVELS[current.sec.level].label}
            </span>
          </div>
          {renderItem(current.item)}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <Btn onClick={() => setShowList(true)} variant="ghost" style={{ padding: "8px 14px", fontSize: "0.8rem" }}>Ver más acuerdos</Btn>
          </div>
        </div>
      )}

      {burbujaTab === "preguntas" && showList && (
        <div style={{ display: "flex", margin: "0 14px 4px" }}>
          <Btn onClick={() => setShowList(false)} variant="ghost" style={{ padding: "8px 12px", fontSize: "0.8rem" }}>← Volver al camino</Btn>
        </div>
      )}

      {burbujaTab === "preguntas" && showList && [1, 2, 3].map(level => {
        const info = BURBUJA_LEVELS[level];
        const levelSections = BURBUJA_SECTIONS.filter(sec => sec.level === level);
        if (!levelSections.some(sec => sec.items.some(item => burbujaItemVisible(item, burbuja) && burbuja[item.id]?.status !== "approved"))) return null;

        return (
        <div key={level} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 18px 8px" }}>
            <span style={{ fontSize: "1.1rem" }}>{info.emoji}</span>
            <div>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.02rem", color: C.dark, lineHeight: 1.2 }}>{info.label}</div>
              <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 700 }}>{info.sub}</div>
            </div>
          </div>

          {levelSections.map(sec => {
            const pendingItems = sec.items.filter(item => burbuja[item.id]?.status !== "approved" && burbujaItemVisible(item, burbuja));
            if (!pendingItems.length) return null;

            return (
            <div key={sec.id} style={{ background: C.white, borderRadius: 18, margin: "0 14px 10px", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
              <div onClick={() => setOpen(p => ({ ...p, [sec.id]: !p[sec.id] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, cursor: "pointer" }}>
                <div style={{ width: 44, height: 44, background: sec.itemBg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", flexShrink: 0 }}>{sec.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.dark }}>{sec.title}</div>
                  <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 700 }}>{sec.sub}</div>
                </div>
                <div style={{ color: C.inkL, transition: "transform 0.25s", transform: open[sec.id] ? "rotate(180deg)" : "none" }}>▼</div>
              </div>
              {open[sec.id] && <div style={{ padding: "0 16px 16px" }}>
                {pendingItems.map(renderItem)}
              </div>}
            </div>
          )})}
        </div>
        );
      })}

      {burbujaTab === "preguntas" && !current && (
        <div style={{ margin: "0 14px 10px", background: C.white, borderRadius: 16, padding: 14, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.82rem", color: C.inkM, fontWeight: 700, lineHeight: 1.6 }}>
            No hay preguntas pendientes. Revisa Negociación o la pestaña de Acuerdos.
          </div>
        </div>
      )}

      {burbujaTab === "acuerdos" && (
        <div style={{ margin: "0 14px 10px" }}>
          {!approvedItems.length ? (
            <div style={{ background: C.white, borderRadius: 16, padding: 14, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "0.82rem", color: C.inkM, fontWeight: 700, lineHeight: 1.6 }}>
                Aún no tienen acuerdos aprobados. Cuando aprueben uno, aparecerá aquí.
              </div>
            </div>
          ) : approvedItems.map(({ item, entry }) => {
            const proposalText = get(item.id, "proposalText");
            const approvedText = entry.approvedText || entry.proposalText || "";
            return (
              <div key={item.id} style={{ background: C.white, borderRadius: 13, padding: 13, marginBottom: 9, borderLeft: `3px solid ${C.olive}`, border: `1.5px solid ${C.border}` }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.inkL, marginBottom: 5, letterSpacing: "0.3px" }}>PROMPT</div>
                <div style={{ fontSize: "0.82rem", fontWeight: 800, color: C.rose, marginBottom: 7 }}>{item.q}</div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.olive, marginBottom: 3, letterSpacing: "0.3px" }}>ACUERDO</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.ink, lineHeight: 1.6 }}>
                  {approvedText}
                </div>

                {!editingApproved[item.id] ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <Btn
                      onClick={() => {
                        set_(item.id, "proposalText", approvedText);
                        setEditingApproved(p => ({ ...p, [item.id]: true }));
                      }}
                      variant="sand"
                      style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                    >
                      Re-negociar ↺
                    </Btn>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: "0.72rem", color: C.inkM, fontWeight: 700, marginBottom: 6 }}>
                      El acuerdo vuelve a negociación y {partnerName} deberá aprobar la nueva versión.
                    </div>
                    <TA value={proposalText} onChange={v => set_(item.id, "proposalText", v)} placeholder="Escribe la nueva versión del acuerdo..." rows={2} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                      <Btn
                        onClick={() => {
                          setEditingApproved(p => ({ ...p, [item.id]: false }));
                          set_(item.id, "proposalText", approvedText);
                        }}
                        variant="ghost"
                        style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                      >
                        Cancelar
                      </Btn>
                      <Btn
                        onClick={() => {
                          onPropose(item.id, proposalText, "renegotiate");
                          setEditingApproved(p => ({ ...p, [item.id]: false }));
                        }}
                        variant="olive"
                        style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                      >
                        Enviar re-negociación ↺
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StreakSection({ streakInfo, streakAnalytics, onUpdateSettings, user }) {
  const [openSettings, setOpenSettings] = useState(false);
  const settings = streakInfo?.settings || { reminderEnabled: true, reminderHour: "20:00", reminderTone: "suave" };
  const current = streakInfo?.currentStreak || 0;
  const longest = streakInfo?.longestStreak || 0;
  const nextMilestone = streakInfo?.nextMilestone || null;
  const todayDone = !!streakInfo?.todayDone;
  const pairName = user?.names || "su pareja";
  const toneText = {
    suave: `Hola ${pairName}, hoy una mini conexion de 3 minutos ya cuenta 💚`,
    amistoso: `Equipo ${pairName}: su Mochi diario los espera 🐼`,
    energico: `Vamos ${pairName}, mantengan viva la racha de hoy ⚡`,
  };

  const saveSetting = (patch) => {
    onUpdateSettings({
      ...settings,
      ...patch,
    });
  };

  return (
    <div style={{ margin: "0 14px 12px", background: C.white, borderRadius: 18, padding: 16, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem", color: C.dark }}>Racha de conexion diaria</div>
          <div style={{ fontSize: "0.76rem", color: C.inkL, fontWeight: 700 }}>Comuniquense con calidez cada dia para cuidar su vinculo</div>
        </div>
        <div style={{ background: todayDone ? C.mint : C.sandL, borderRadius: 999, padding: "6px 10px", fontSize: "0.68rem", fontWeight: 800, color: todayDone ? C.teal : C.inkL }}>
          {todayDone ? "Hoy completado" : "Hoy pendiente"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.cream, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 800 }}>Racha actual</div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.45rem", color: C.dark }}>{current} dias</div>
        </div>
        <div style={{ background: C.cream, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 800 }}>Mejor racha</div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.45rem", color: C.dark }}>{longest} dias</div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 800 }}>Progreso al proximo hito</div>
          <div style={{ fontSize: "0.72rem", color: C.inkM, fontWeight: 800 }}>
            {nextMilestone ? `Meta ${nextMilestone} dias` : "Todas las metas desbloqueadas"}
          </div>
        </div>
        <div style={{ width: "100%", height: 12, borderRadius: 999, background: C.sand, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <div style={{ width: `${streakInfo?.progressPct || 0}%`, height: "100%", background: "linear-gradient(90deg, #8bbe6a 0%, #4f7a5e 100%)", transition: "width 0.35s ease" }} />
        </div>
      </div>

      <div style={{ marginBottom: 10, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {STREAK_MILESTONES.map(m => {
          const done = (streakInfo?.unlockedMilestones || []).includes(m);
          return (
            <div key={m} style={{ minWidth: 108, borderRadius: 12, padding: "10px 9px", border: `1px solid ${done ? C.teal : C.border}`, background: done ? "#e8f7f1" : C.sandL, textAlign: "center", opacity: done ? 1 : 0.72 }}>
              <div style={{ fontSize: "1.1rem", marginBottom: 2 }}>🐼</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.dark }}>Mochi {m}</div>
              <div style={{ fontSize: "0.64rem", color: C.inkL, fontWeight: 700 }}>{done ? "Desbloqueado" : `${m} dias`}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: C.sandL, borderRadius: 12, padding: "10px 10px", border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 800, marginBottom: 7 }}>Analitica de participacion</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ background: C.white, borderRadius: 9, padding: "8px 9px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "0.64rem", color: C.inkL, fontWeight: 800 }}>Retencion 7 dias</div>
            <div style={{ fontSize: "1rem", color: C.dark, fontWeight: 800 }}>{streakAnalytics?.retention7 || 0}%</div>
            <div style={{ fontSize: "0.62rem", color: C.inkM, fontWeight: 700 }}>{streakAnalytics?.active7 || 0}/7 dias activos</div>
          </div>
          <div style={{ background: C.white, borderRadius: 9, padding: "8px 9px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "0.64rem", color: C.inkL, fontWeight: 800 }}>Retencion 30 dias</div>
            <div style={{ fontSize: "1rem", color: C.dark, fontWeight: 800 }}>{streakAnalytics?.retention30 || 0}%</div>
            <div style={{ fontSize: "0.62rem", color: C.inkM, fontWeight: 700 }}>{streakAnalytics?.active30 || 0}/30 dias activos</div>
          </div>
        </div>
        <div style={{ fontSize: "0.7rem", color: C.inkM, fontWeight: 700, lineHeight: 1.55 }}>
          Tendencia semanal: {streakAnalytics?.trendDeltaDays >= 0 ? `+${streakAnalytics?.trendDeltaDays || 0}` : streakAnalytics?.trendDeltaDays || 0} dias vs semana anterior.
          Dia mas flojo: {streakAnalytics?.weakestWeekday?.name || "-"}.
        </div>
      </div>

      {!!streakInfo?.celebrationText && (
        <div style={{ background: "linear-gradient(120deg, #fff1c2 0%, #ffe5b4 100%)", borderRadius: 12, padding: "9px 10px", border: "1px solid #f3d38a", marginBottom: 10, animation: "fadeIn 0.25s ease" }}>
          <div style={{ fontSize: "0.78rem", color: "#7a5a11", fontWeight: 800 }}>{streakInfo.celebrationText}</div>
        </div>
      )}

      <div style={{ background: C.cream, borderRadius: 12, padding: "9px 10px", border: `1px solid ${C.border}`, marginBottom: 8 }}>
        <div style={{ fontSize: "0.74rem", color: C.inkM, lineHeight: 1.6, fontWeight: 700 }}>
          Hoy para {pairName}: compartan una apreciacion especifica, una emocion del dia y una accion de cuidado mutuo.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpenSettings(v => !v)}>
        <div style={{ fontSize: "0.74rem", color: C.inkL, fontWeight: 800 }}>Recordatorios personalizables</div>
        <div style={{ fontSize: "0.74rem", color: C.inkM, fontWeight: 800 }}>{openSettings ? "Ocultar" : "Configurar"}</div>
      </div>

      {openSettings && (
        <div style={{ marginTop: 8, background: C.sandL, borderRadius: 12, padding: "10px 10px", border: `1px solid ${C.border}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: "0.76rem", color: C.ink, fontWeight: 700 }}>
            <input type="checkbox" checked={!!settings.reminderEnabled} onChange={(e) => saveSetting({ reminderEnabled: e.target.checked })} />
            Enviar recordatorio suave
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: "0.66rem", color: C.inkL, fontWeight: 800, marginBottom: 4 }}>Hora sugerida</div>
              <input type="time" value={settings.reminderHour || "20:00"} onChange={(e) => saveSetting({ reminderHour: e.target.value })} style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: "'Nunito',sans-serif" }} />
            </div>
            <div>
              <div style={{ fontSize: "0.66rem", color: C.inkL, fontWeight: 800, marginBottom: 4 }}>Tono</div>
              <select value={settings.reminderTone || "suave"} onChange={(e) => saveSetting({ reminderTone: e.target.value })} style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: "'Nunito',sans-serif", background: C.white }}>
                <option value="suave">Suave</option>
                <option value="amistoso">Amistoso</option>
                <option value="energico">Energetico</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: "0.72rem", color: C.inkM, fontWeight: 700, lineHeight: 1.6 }}>
            Vista previa: {toneText[settings.reminderTone || "suave"]}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, background: C.cream, borderRadius: 12, padding: "9px 10px", border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 800, marginBottom: 4 }}>Como recuperar racha o reclamar Mochis</div>
        <div style={{ fontSize: "0.74rem", color: C.inkM, fontWeight: 700, lineHeight: 1.65 }}>
          1) Completen una interaccion hoy: mensaje, gratitud, momento, ejercicio, Conocete o acuerdo.
        </div>
        <div style={{ fontSize: "0.74rem", color: C.inkM, fontWeight: 700, lineHeight: 1.65 }}>
          2) Cuando ambos vuelven a conectar, la racha se reinicia y sube dia a dia.
        </div>
        <div style={{ fontSize: "0.74rem", color: C.inkM, fontWeight: 700, lineHeight: 1.65 }}>
          3) Al llegar al hito, se desbloquea automaticamente su recompensa Mochi 🐼.
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 800, marginBottom: 5 }}>Recursos para fortalecer la relacion</div>
        {STREAK_RESOURCES.map(r => (
          <a key={r.url} href={r.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", background: C.sandL, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 9px", marginBottom: 6 }}>
            <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 800 }}>{r.type}</div>
            <div style={{ fontSize: "0.78rem", color: C.ink, fontWeight: 700, lineHeight: 1.5 }}>{r.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ConsejoDelDiaSection({ user, onClaimReward, openRef }) {
  const ownerKey = user?.code || user?.email || "guest";
  const favKey = `mochi_consejos_fav_${ownerKey}`;
  const claimedKey = `mochi_consejo_claimed_${ownerKey}`;
  const retoKey = `mochi_consejo_reto_${ownerKey}`;
  const [claimedDay, setClaimedDay] = useState(() => ls.get(claimedKey));
  const [reto, setReto] = useState(() => ls.get(retoKey)); // { day, id, done }
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [showFavs, setShowFavs] = useState(false);
  const [selectedFav, setSelectedFav] = useState(null);
  const [favs, setFavs] = useState(() => ls.get(favKey) || []);
  const dayKey = getDateKeyLocal();

  useEffect(() => {
    setOffset(0);
    setOpen(false);
    setShowFavs(false);
    setSelectedFav(null);
  }, [dayKey, ownerKey]);

  useEffect(() => {
    ls.set(favKey, favs);
  }, [favKey, favs]);

  const dayNumber = getDayNumberLocal();
  const baseIndex = (dayNumber + hashSeed(ownerKey)) % CONSEJOS_DIARIOS.length;
  const idx = (baseIndex + offset) % CONSEJOS_DIARIOS.length;
  const consejo = CONSEJOS_DIARIOS[idx];
  const isFav = favs.includes(consejo.id);

  const toggleFav = () => {
    setFavs(prev => isFav ? prev.filter(id => id !== consejo.id) : [...prev, consejo.id]);
  };

  const removeFav = (id) => {
    setFavs(prev => prev.filter(fid => fid !== id));
    if (selectedFav?.id === id) setSelectedFav(null);
  };

  // El bambú del consejo se gana una vez al día, no cada vez que se abre
  const handleOpen = () => {
    setOpen(true);
    if (claimedDay !== dayKey) {
      ls.set(claimedKey, dayKey);
      setClaimedDay(dayKey);
      onClaimReward?.();
    }
  };
  if (openRef) openRef.current = handleOpen;

  const saveReto = (next) => { setReto(next); ls.set(retoKey, next); };
  const retoHoy = reto?.day === dayKey ? reto : null;
  const retoConsejo = retoHoy ? CONSEJOS_DIARIOS.find(c => c.id === retoHoy.id) : null;
  const acceptReto = () => {
    saveReto({ day: dayKey, id: consejo.id, done: false });
    showToast("Reto guardado. Lo verás en el jardín.");
  };

  const handleClose = () => {
    setOpen(false);
  };

  const favsList = favs.map(id => CONSEJOS_DIARIOS.find(c => c.id === id)).filter(Boolean);

  return (
    <div style={{ margin: "0 14px 12px" }}>
      {/* Botón para abrir el modal */}
      <button
        onClick={handleOpen}
        style={{
          width: "100%",
          background: "linear-gradient(130deg, #faf3df 0%, #f0e2bd 100%)",
          color: C.dark,
          border: `1.5px solid ${C.border}`,
          borderRadius: 14,
          padding: "14px 16px",
          fontFamily: "'Baloo 2',sans-serif",
          fontSize: "1rem",
          cursor: "pointer",
          boxShadow: `0 3px 0 ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{claimedDay === dayKey ? "💡 Consejo del Día · leído ✓" : "💡 Consejo del Día · +15 bambú"}</span>
        <span style={{ fontSize: "0.9rem" }}>🐼</span>
      </button>

      {/* Reto aceptado desde "Qué puedes hacer hoy" */}
      {retoConsejo && (
        <div style={{ marginTop: 8, background: "#f0f8ff", borderRadius: 14, padding: "12px 14px", border: "1.5px solid #d0e0f0" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#4a6fa5", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>✨ Tu reto de hoy</div>
          <div style={{ fontSize: "0.84rem", color: C.ink, lineHeight: 1.6, marginBottom: 10 }}>{retoConsejo.practica}</div>
          {retoHoy.done ? (
            <div style={{ fontSize: "0.8rem", fontWeight: 800, color: C.olive, textAlign: "center" }}>Hecho ✓</div>
          ) : (
            <Btn onClick={() => { saveReto({ ...retoHoy, done: true }); showToast("Reto completado ✓"); }} variant="olive" style={{ width: "100%", fontSize: "0.85rem" }}>Lo hice</Btn>
          )}
        </div>
      )}

      {/* Botón para ver favoritos (solo si hay favoritos) */}
      {favs.length > 0 && (
        <button
          onClick={() => setShowFavs(true)}
          style={{
            width: "100%",
            marginTop: 8,
            background: C.cream,
            color: C.dark,
            border: `1.5px solid ${C.border}`,
            borderRadius: 12,
            padding: "10px 14px",
            fontFamily: "'Baloo 2',sans-serif",
            fontSize: "0.85rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span>💜</span>
          <span>Ver {favs.length} favorito{favs.length !== 1 ? 's' : ''}</span>
        </button>
      )}

      <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 600, lineHeight: 1.5, textAlign: "center", marginTop: 8, padding: "0 6px" }}>
        Estos consejos son para relaciones donde los dos se sienten seguros. Si en tu relación hay miedo, control o violencia, mereces apoyo profesional.
      </div>

      {/* Modal Pop-up del Consejo */}
      {open && (
        <div 
          style={{ 
            position: "fixed", 
            inset: 0, 
            background: "rgba(45,31,70,0.65)", 
            zIndex: 6000, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            padding: "20px" 
          }} 
          onClick={handleClose}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              width: "100%", 
              maxWidth: 520, 
              background: C.white, 
              borderRadius: 28, 
              padding: "24px 22px 24px", 
              border: `2px solid ${C.border}`, 
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)", 
              maxHeight: "85vh", 
              overflowY: "auto" 
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1.8rem" }}>💡</span>
                <div>
                  <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.2rem", color: C.dark }}>Consejo del Día</div>
                  <div style={{ fontSize: "0.75rem", color: C.inkL, fontWeight: 700 }}>#{consejo.id} · +15 bambú 🌿</div>
                </div>
              </div>
              <button 
                onClick={handleClose} 
                style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: "50%", 
                  border: "none", 
                  background: C.cream, 
                  color: C.inkM, 
                  fontWeight: 900, 
                  fontSize: "1.1rem", 
                  cursor: "pointer" 
                }}
              >
                ✕
              </button>
            </div>

            {/* El consejo principal */}
            <div style={{ background: "linear-gradient(130deg, #faf3df 0%, #f0e2bd 100%)", borderRadius: 18, padding: "18px 20px", border: `2px solid ${C.border}`, marginBottom: 14 }}>
              <div style={{ fontSize: "1.15rem", color: C.dark, lineHeight: 1.6, fontWeight: 800, textAlign: "center" }}>
                {consejo.texto}
              </div>
            </div>

            {/* Por qué funciona */}
            <div style={{ background: C.sandL, borderRadius: 14, padding: "14px 16px", marginBottom: 12, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, color: C.olive, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>💜 Por qué funciona</div>
              <div style={{ fontSize: "0.9rem", color: C.ink, lineHeight: 1.7 }}>{consejo.explicacion}</div>
            </div>

            {/* Qué puedes hacer hoy */}
            <div style={{ background: "#f0f8ff", borderRadius: 14, padding: "14px 16px", marginBottom: 12, border: `1.5px solid #d0e0f0` }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#4a6fa5", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>✨ Qué puedes hacer hoy</div>
              <div style={{ fontSize: "0.9rem", color: C.ink, lineHeight: 1.7 }}>{consejo.practica}</div>
              {retoHoy?.id === consejo.id ? (
                <div style={{ marginTop: 10, fontSize: "0.82rem", fontWeight: 800, color: "#4a6fa5", textAlign: "center" }}>Reto aceptado ✓</div>
              ) : (
                <button onClick={acceptReto} style={{ marginTop: 10, width: "100%", background: "#4a6fa5", color: C.white, border: "none", borderRadius: 12, padding: "10px", fontFamily: "'Baloo 2',sans-serif", fontSize: "0.9rem", cursor: "pointer" }}>Lo haré hoy</button>
              )}
            </div>

            {/* Quién lo dice */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.cream, borderRadius: 14, padding: "14px 16px", marginBottom: 16, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "1.6rem" }}>👤</div>
              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 800, color: C.dark, marginBottom: 3 }}>{consejo.autor}</div>
                <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5 }}>{consejo.quienEs}</div>
              </div>
            </div>

            {/* Botones */}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => setOffset(v => (v + 1) % CONSEJOS_DIARIOS.length)} variant="sand" style={{ flex: 1, padding: "12px 14px", fontSize: "0.9rem" }}>
                Ver otro consejo
              </Btn>
              <Btn onClick={toggleFav} variant={isFav ? "olive" : "cream"} style={{ flex: 1, padding: "12px 14px", fontSize: "0.9rem" }}>
                {isFav ? "Guardado ✓" : "Guardar favorito"}
              </Btn>
            </div>

            {/* Botón cerrar */}
            <button 
              onClick={handleClose}
              style={{
                width: "100%",
                marginTop: 16,
                background: C.dark,
                color: C.cream2,
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontFamily: "'Baloo 2',sans-serif",
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 4px 0 rgba(0,0,0,0.2)"
              }}
            >
              Entendido 💜
            </button>
          </div>
        </div>
      )}

      {/* Modal de Favoritos */}
      {showFavs && (
        <div 
          style={{ 
            position: "fixed", 
            inset: 0, 
            background: "rgba(45,31,70,0.65)", 
            zIndex: 6001, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            padding: "20px" 
          }} 
          onClick={() => setShowFavs(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              width: "100%", 
              maxWidth: 520, 
              background: C.white, 
              borderRadius: 28, 
              padding: "24px 22px 24px", 
              border: `2px solid ${C.border}`, 
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)", 
              maxHeight: "85vh", 
              overflowY: "auto" 
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1.8rem" }}>💜</span>
                <div>
                  <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.2rem", color: C.dark }}>Mis Favoritos</div>
                  <div style={{ fontSize: "0.75rem", color: C.inkL, fontWeight: 700 }}>{favs.length} consejo{favs.length !== 1 ? 's' : ''} guardado{favs.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <button 
                onClick={() => setShowFavs(false)} 
                style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: "50%", 
                  border: "none", 
                  background: C.cream, 
                  color: C.inkM, 
                  fontWeight: 900, 
                  fontSize: "1.1rem", 
                  cursor: "pointer" 
                }}
              >
                ✕
              </button>
            </div>

            {/* Lista de favoritos */}
            {favsList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.inkL }}>
                <div style={{ fontSize: "3rem", marginBottom: 10 }}>💜</div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", marginBottom: 8 }}>No tienes favoritos aún</div>
                <div style={{ fontSize: "0.85rem" }}>Guarda los consejos que más te gusten para verlos aquí</div>
              </div>
            ) : selectedFav ? (
              /* Vista individual del favorito seleccionado */
              <div>
                <button 
                  onClick={() => setSelectedFav(null)}
                  style={{ 
                    background: "none", 
                    border: "none", 
                    color: C.olive, 
                    fontSize: "0.85rem", 
                    cursor: "pointer",
                    fontWeight: 700,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                >
                  ← Volver a favoritos
                </button>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "1.8rem" }}>💡</span>
                    <div>
                      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.2rem", color: C.dark }}>Consejo #{selectedFav.id}</div>
                      <div style={{ fontSize: "0.75rem", color: C.inkL, fontWeight: 700 }}>Guardado en favoritos</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeFav(selectedFav.id)}
                    style={{ 
                      width: 40, 
                      height: 40, 
                      borderRadius: "50%", 
                      border: "none", 
                      background: "#ffe8e8", 
                      color: "#e86040", 
                      fontWeight: 900, 
                      fontSize: "1.1rem", 
                      cursor: "pointer" 
                    }}
                  >
                    🗑️
                  </button>
                </div>

                {/* El consejo principal */}
                <div style={{ background: "linear-gradient(130deg, #faf3df 0%, #f0e2bd 100%)", borderRadius: 18, padding: "18px 20px", border: `2px solid ${C.border}`, marginBottom: 14 }}>
                  <div style={{ fontSize: "1.15rem", color: C.dark, lineHeight: 1.6, fontWeight: 800, textAlign: "center" }}>
                    {selectedFav.texto}
                  </div>
                </div>

                {/* Por qué funciona */}
                <div style={{ background: C.sandL, borderRadius: 14, padding: "14px 16px", marginBottom: 12, border: `1.5px solid ${C.border}` }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 800, color: C.olive, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>💜 Por qué funciona</div>
                  <div style={{ fontSize: "0.9rem", color: C.ink, lineHeight: 1.7 }}>{selectedFav.explicacion}</div>
                </div>

                {/* Qué puedes hacer hoy */}
                <div style={{ background: "#f0f8ff", borderRadius: 14, padding: "14px 16px", marginBottom: 12, border: `1.5px solid #d0e0f0` }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#4a6fa5", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>✨ Qué puedes hacer hoy</div>
                  <div style={{ fontSize: "0.9rem", color: C.ink, lineHeight: 1.7 }}>{selectedFav.practica}</div>
                </div>

                {/* Quién lo dice */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.cream, borderRadius: 14, padding: "14px 16px", marginBottom: 16, border: `1.5px solid ${C.border}` }}>
                  <div style={{ fontSize: "1.6rem" }}>👤</div>
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 800, color: C.dark, marginBottom: 3 }}>{selectedFav.autor}</div>
                    <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5 }}>{selectedFav.quienEs}</div>
                  </div>
                </div>
              </div>
            ) : (
              /* Lista de favoritos - vista resumida */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {favsList.map((favConsejo) => (
                  <div 
                    key={favConsejo.id} 
                    onClick={() => setSelectedFav(favConsejo)}
                    style={{ 
                      background: C.sandL, 
                      borderRadius: 16, 
                      padding: "14px 16px", 
                      border: `1.5px solid ${C.border}`,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.inkL }}>#{favConsejo.id}</div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFav(favConsejo.id); }}
                        style={{ 
                          background: "none", 
                          border: "none", 
                          color: "#e86040", 
                          fontSize: "0.75rem", 
                          cursor: "pointer",
                          fontWeight: 700
                        }}
                      >
                        Quitar ✕
                      </button>
                    </div>
                    <div style={{ fontSize: "0.95rem", color: C.dark, fontWeight: 700, marginBottom: 8, lineHeight: 1.5 }}>
                      {favConsejo.texto}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: C.inkM, fontWeight: 700 }}>
                      {favConsejo.autor} · Toca para ver completo →
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botón cerrar */}
            <button 
              onClick={() => setShowFavs(false)}
              style={{
                width: "100%",
                marginTop: 20,
                background: C.dark,
                color: C.cream2,
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontFamily: "'Baloo 2',sans-serif",
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 4px 0 rgba(0,0,0,0.2)"
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TEST STATS SECTION — Muestra estadísticas del test en el perfil
// ═══════════════════════════════════════════════════════
function TestStatsSection({ testScores, onRetakeTest, lastTestDate, streakInfo }) {
  const [expanded, setExpanded] = useState(false);

  // Calcular cuándo se puede repetir el test
  const now = new Date();
  const lastTest = lastTestDate ? new Date(lastTestDate) : null;
  const daysSinceLastTest = lastTest ? Math.floor((now - lastTest) / (1000 * 60 * 60 * 24)) : 999;
  const currentStreak = streakInfo?.currentStreak || 0;
  const canRetake = daysSinceLastTest >= 7 || currentStreak === 6;
  const daysRemaining = Math.max(0, 7 - daysSinceLastTest);

  const diagnosis = buildTestDiagnosis(testScores || {});
  if (!diagnosis) return null;
  const { prognosis, progColor, progEmoji } = diagnosis;

  return (
    <div style={{ background: C.white, borderRadius: 18, padding: 16, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", color: C.dark }}>
          📊 Estadísticas del test
        </div>
        <button 
          onClick={() => setExpanded(!expanded)}
          style={{ background: "none", border: "none", color: C.olive, fontSize: "0.8rem", cursor: "pointer", fontWeight: 700 }}
        >
          {expanded ? "Ocultar ▲" : "Ver detalles ▼"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: "2.2rem" }}>{progEmoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-block", width: 36, height: 5, borderRadius: 50, background: progColor, marginBottom: 6 }} />
          <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.5 }}>{prognosis}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <TestDiagnosisCards diagnosis={diagnosis} compact />
        </div>
      )}

      <button 
        onClick={onRetakeTest}
        style={{ width: "100%", background: C.dark, color: C.cream2, border: "none", borderRadius: 12, padding: "10px 14px", fontFamily: "'Baloo 2',sans-serif", fontSize: "0.85rem", cursor: "pointer", marginTop: 8, boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}
      >
        🔄 Volver a hacer el test
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DIARIO PERSONAL — Con técnicas ABCD y registro de conflictos
// ═══════════════════════════════════════════════════════
const DIARIO_TYPES = [
  {
    id: "abcd",
    label: "🧠 ABCD",
    sub: "Entender cómo te afectó algo que pasó",
    prompts: [
      { key:"a", label:"A · Situación activadora", hint:"¿Qué pasó exactamente?" },
      { key:"b", label:"B · Pensamiento automático", hint:"¿Qué pensé en ese momento?" },
      { key:"c", label:"C · Emoción y consecuencia", hint:"¿Cómo me sentí? ¿Qué hice?" },
      { key:"d", label:"D · Perspectiva alternativa", hint:"¿Qué puedo ver de otra manera?" },
    ]
  },
  {
    id: "discusion",
    label: "⚡ Discusión",
    sub: "Registrar y soltar un conflicto",
    prompts: [
      { key:"q1", label:"¿Qué pasó?", hint:"Sin culpar, solo los hechos..." },
      { key:"q2", label:"¿Qué sentí?", hint:"Emociones, sensaciones..." },
      { key:"q3", label:"¿Qué necesitaba yo?", hint:"La necesidad detrás de la reacción..." },
      { key:"q4", label:"¿Qué querría decirle?", hint:"Con calma, ¿qué diría ahora?" },
    ]
  },
  {
    id: "hoy",
    label: "🌙 Cómo estuve hoy",
    sub: "Un registro rápido de cómo me sentí",
    prompts: [
      { key:"q1", label:"Mi día en una oración", hint:"¿Cómo estuvo?" },
      { key:"q2", label:"Lo más significativo", hint:"Un momento, una palabra..." },
      { key:"q3", label:"En mi relación hoy", hint:"¿Cómo me sentí con mi pareja?" },
    ]
  },
  {
    id: "interpersonal",
    label: "🫶 Interpersonal",
    sub: "Reflexionar sobre lo que siento en mi relación",
    prompts: [
      { key:"q1", label:"Momento de conexión", hint:"¿Hubo alguno hoy?" },
      { key:"q2", label:"Lo que me costó expresar", hint:"¿Qué no le dije?" },
      { key:"q3", label:"Lo que necesito pedirle", hint:"Una petición clara..." },
    ]
  },
  {
    id: "autocompasion",
    label: "🫧 Autocompasión",
    sub: "Hablarte como le hablarías a quien quieres",
    prompts: [
      { key:"q1", label:"¿Qué me está costando hoy?", hint:"Sin adornarlo y sin exagerarlo..." },
      { key:"q2", label:"Si esto le pasara a alguien que quiero, ¿qué le diría?", hint:"Con las palabras que usarías con tu mejor amiga..." },
      { key:"q3", label:"Lo mismo, dicho para mí", hint:"Escríbetelo a ti: 'estás haciendo lo que puedes con...'" },
      { key:"q4", label:"Lo que necesito hoy", hint:"Descansar, pedir ayuda, poner un límite..." },
    ]
  },
  {
    id: "valores",
    label: "🧭 Mis valores",
    sub: "Volver a lo que te importa, no a lo que te duele",
    prompts: [
      { key:"q1", label:"El valor que quiero honrar hoy", hint:"Ej: calma, honestidad, cuidarme, valentía..." },
      { key:"q2", label:"¿Dónde me alejé de él?", hint:"Sin juicio, solo observar..." },
      { key:"q3", label:"Un paso pequeñísimo hacia ese valor", hint:"Tan pequeño que sea imposible fallar..." },
    ]
  },
];

function DiarioPersonal({ entries, onSave, user, onBack, initialType = null }) {
  const [view, setView] = useState(initialType ? "new" : "list"); // "list" | "new" | "detail"
  const [selType, setSelType] = useState(initialType);
  const [draft, setDraft] = useState({});
  const [selEntry, setSelEntry] = useState(null);
  const [err, setErr] = useState("");
  const [keepOnly, setKeepOnly] = useState(false);

  // Filtrar solo las entradas del usuario actual (privadas)
  const myEntries = Object.values(entries || {}).filter(entry =>
    entry.authorEmail === user?.email || entry.authorUid === user?.uid || (!entry.authorEmail && !entry.authorUid)
  );

  const sortedEntries = [...myEntries].sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  const firstFilled = entry => Object.values(entry?.prompts || {}).find(v => String(v || "").trim().length > 0) || "";

  const fmtDate = ts => {
    const d = new Date(ts);
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"short" });
  };
  const fmtTime = ts => new Date(ts).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });

  const handleSave = () => {
    const type = DIARIO_TYPES.find(t => t.id === selType);
    if (!type) return;
    const filled = type.prompts.filter(p => (draft[p.key] || "").trim().length > 0);
    if (filled.length === 0) { setErr("Escribe al menos una respuesta para poder guardar."); return; }
    const now = new Date();
    const ts = now.toISOString();
    onSave({ id: ts, ts, dateKey: getDateKeyLocal(now), type: selType, prompts: { ...draft }, keepOnlyConclusion: keepOnly });
    setDraft({}); setSelType(null); setErr(""); setKeepOnly(false);
    if (initialType && onBack) { onBack(); return; }
    setView("list");
  };

  if (view === "new" && selType) {
    const type = DIARIO_TYPES.find(t => t.id === selType);
    const abcdFieldHelp = {
      a: "Describe solo el hecho visible, como una camara. Evita interpretar intenciones.",
      b: "Escribe la frase exacta que se te vino a la mente, incluso si suena extrema.",
      c: "Nombra emocion + reaccion: por ejemplo ansiedad + me calle / enojo + discuti.",
      d: "Busca una version mas amplia y realista, sin negar lo que sentiste.",
    };
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
          <button onClick={() => { if (initialType && onBack) onBack(); else setView("list"); }} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2, marginBottom: 4 }}>{type.label}</div>
          <div style={{ fontSize: "0.8rem", color: `${C.cream}88` }}>{type.sub}</div>
        </div>
        <div style={{ padding: "10px 14px 0" }}>
          {/* Mensaje de privacidad */}
          <div style={{ background:"#fff3cd", borderRadius:14, padding:14, marginBottom:10, border:`1.5px solid #ffc107` }}>
            <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.9rem", color:"#856404", marginBottom:6 }}>🔒 Solo tú puedes ver esto</div>
            <div style={{ fontSize:"0.8rem", color:"#856404", lineHeight:1.6 }}>
              Este diario es tuyo. Tu pareja no tiene acceso a estas entradas: se guardan en tu cuenta personal,
              nunca en el espacio compartido. Puedes escribir sin filtro.
            </div>
          </div>
          
          {selType === "abcd" && (
            <div style={{ background:"#eef6ea", borderRadius:14, padding:14, marginBottom:10, border:`1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.9rem", color:C.dark, marginBottom:6 }}>¿Qué es ABCD y qué significa reestructurar?</div>
              <div style={{ fontSize:"0.8rem", color:C.inkM, lineHeight:1.6, marginBottom:8 }}>
                ABCD es una forma simple de ordenar tu mente cuando te activas. Reestructurar no es mentirte:
                es pasar de un pensamiento automático que duele a una idea más completa y justa.
              </div>
              <div style={{ background:C.white, borderRadius:10, padding:"9px 10px", border:`1px solid ${C.border}`, fontSize:"0.75rem", color:C.inkM, lineHeight:1.55 }}>
                <b>Ejemplo:</b> A: "No respondió en 2 horas". B: "Seguro ya no le importo".
                C: "Ansiedad, me cerré". D: "Puede estar ocupado/a; cuando pueda, pregunto con calma".
              </div>
            </div>
          )}
          {type.prompts.map(p => (
            <div key={p.key} style={{ background: C.white, borderRadius: 14, padding: 14, marginBottom: 10, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.9rem", color:C.dark, marginBottom:7 }}>{p.label}</div>
              {selType === "abcd" && abcdFieldHelp[p.key] && (
                <div style={{ fontSize:"0.76rem", color:C.inkL, lineHeight:1.55, marginBottom:8, background:C.cream, border:`1px solid ${C.border}`, borderRadius:9, padding:"7px 9px" }}>
                  {abcdFieldHelp[p.key]}
                </div>
              )}
              <textarea
                value={draft[p.key] || ""}
                onChange={e => { setDraft(d => ({ ...d, [p.key]: e.target.value })); if (err) setErr(""); }}
                placeholder={p.hint}
                rows={3}
                style={{ width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"9px 11px", fontSize:"0.84rem", fontFamily:"'Nunito',sans-serif", resize:"none", outline:"none", boxSizing:"border-box", color:C.ink, lineHeight:1.6 }}
              />
            </div>
          ))}
          {(selType === "abcd" || selType === "discusion") && (
            <label style={{ display:"flex", gap:10, alignItems:"flex-start", background:C.white, borderRadius:14, padding:"12px 14px", marginBottom:10, border:`1.5px solid ${C.border}`, cursor:"pointer" }}>
              <input type="checkbox" checked={keepOnly} onChange={e => setKeepOnly(e.target.checked)} style={{ width:18, height:18, marginTop:2, accentColor:C.dark, flexShrink:0 }} />
              <span>
                <span style={{ display:"block", fontFamily:"'Baloo 2',sans-serif", fontSize:"0.88rem", color:C.dark }}>Guardar solo mi conclusión</span>
                <span style={{ display:"block", fontSize:"0.76rem", color:C.inkM, lineHeight:1.5, marginTop:2 }}>
                  Borra lo demás y deja únicamente {selType === "abcd" ? "la reestructuración (D)" : "el aprendizaje final"}.
                  Si lo dejas sin marcar guardas todo, que es lo que te va a servir después para ver tus patrones.
                </span>
              </span>
            </label>
          )}
          {err && (
            <div style={{ background:"#fdecea", border:"1.5px solid #f5c2c0", borderRadius:12, padding:"10px 12px", marginBottom:10, fontSize:"0.8rem", color:"#a83a34", lineHeight:1.5 }}>{err}</div>
          )}
          <div style={{ display:"flex", gap:10, marginTop:4 }}>
            <button onClick={() => { if (initialType && onBack) onBack(); else { setSelType(null); setErr(""); setView("new"); } }} style={{ flex:1, padding:13, background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:14, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", cursor:"pointer", color:C.inkM }}>← {initialType ? "Volver" : "Tipo"}</button>
            <button onClick={handleSave} style={{ flex:2, padding:13, background:C.dark, color:C.cream2, border:"none", borderRadius:14, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>Guardar entrada ✓</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "new") {
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
          <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2, marginBottom: 4 }}>📓 Diario</div>
          <div style={{ fontSize: "0.8rem", color: `${C.cream}88` }}>¿Qué tipo de entrada?</div>
        </div>
        <div style={{ padding: "10px 14px 0" }}>
          {DIARIO_TYPES.map(t => (
            <div key={t.id} onClick={() => { setSelType(t.id); setErr(""); }}
              style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10, cursor:"pointer", border:`1.5px solid ${C.border}`, boxShadow:`0 3px 0 ${C.border}` }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.05rem", color:C.dark }}>{t.label}</div>
              <div style={{ fontSize:"0.8rem", color:C.inkM, marginTop:3 }}>{t.sub}</div>
            </div>
          ))}
          <button onClick={() => setView("list")} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:14, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.9rem", cursor:"pointer", color:C.inkM, marginTop:4 }}>← Volver</button>
        </div>
      </div>
    );
  }

  // list view
  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
        <button onClick={() => onBack && onBack()} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block", opacity: onBack ? 1 : 0, pointerEvents: onBack ? "auto" : "none" }}>←</button>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2, marginBottom: 4 }}>📓 Diario Privado</div>
        <div style={{ fontSize: "0.8rem", color: `${C.cream}88` }}>Solo tú puedes ver esto 🔒</div>
      </div>
      <div style={{ padding: "10px 14px 0" }}>
        <div style={{ background:"#fff3cd", borderRadius:14, padding:12, marginBottom:10, border:`1.5px solid #ffc107` }}>
          <div style={{ fontSize:"0.8rem", color:"#856404", lineHeight:1.55 }}>
            <strong>🔒 Tu espacio:</strong> tu pareja no tiene acceso a este diario. Se guarda en tu cuenta personal,
            fuera del espacio compartido, y solo tú puedes abrirlo.
          </div>
        </div>
        <button onClick={() => setView("new")} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:"13px 16px", fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.25)", marginBottom:14, textAlign:"left" }}>
          + Nueva entrada 📝
        </button>
        {sortedEntries.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 20px", color:C.inkL, fontSize:"0.88rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:10 }}>📓</div>
            Tu diario está vacío. Empieza con una entrada hoy.
          </div>
        )}
        {sortedEntries.map(entry => {
          const type = DIARIO_TYPES.find(t => t.id === entry.type);
          const firstPromptKey = type?.prompts?.[0]?.key;
          const preview = (firstPromptKey ? (entry.prompts?.[firstPromptKey] || "") : "") || firstFilled(entry);
          return (
            <div key={entry.id} onClick={() => { setSelEntry(entry); }}
              style={{ background:C.white, borderRadius:16, padding:"13px 15px", marginBottom:9, border:`1.5px solid ${C.border}`, boxShadow:`0 2px 0 ${C.border}`, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                <div style={{ background:C.cream, borderRadius:8, padding:"3px 10px", fontSize:"0.72rem", fontWeight:800, color:C.dark }}>{type?.label || entry.type}</div>
                <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700 }}>{fmtDate(entry.ts)} · {fmtTime(entry.ts)}</div>
              </div>
              {preview && <div style={{ fontSize:"0.84rem", color:C.inkM, lineHeight:1.55, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{preview}</div>}
            </div>
          );
        })}
      </div>
      {selEntry && (() => {
        const type = DIARIO_TYPES.find(t => t.id === selEntry.type);
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.65)", zIndex:5000, display:"flex", alignItems:"flex-end" }} onClick={() => setSelEntry(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.sandL, borderRadius:"22px 22px 0 0", width:"100%", maxHeight:"88vh", overflowY:"auto", border:`1.5px solid ${C.border}` }}>
              <div style={{ background:C.dark, padding:"16px 18px 18px", borderRadius:"22px 22px 0 0" }}>
                <div style={{ width:34, height:5, background:"rgba(255,255,255,0.2)", borderRadius:50, margin:"0 auto 12px" }}/>
                <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.1rem", color:C.cream2 }}>{type?.label}</div>
                <div style={{ fontSize:"0.75rem", color:`${C.cream}88`, marginTop:3 }}>{fmtDate(selEntry.ts)} · {fmtTime(selEntry.ts)}</div>
              </div>
              <div style={{ padding:"14px 16px 32px" }}>
                {(type?.prompts || []).map(p => {
                  const val = selEntry.prompts?.[p.key];
                  if (!val) return null;
                  return (
                    <div key={p.key} style={{ background:C.white, borderRadius:12, padding:"11px 13px", marginBottom:9, border:`1.5px solid ${C.border}` }}>
                      <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.5px" }}>{p.label}</div>
                      <div style={{ fontSize:"0.86rem", color:C.ink, lineHeight:1.65 }}>{val}</div>
                    </div>
                  );
                })}
                {Object.entries(selEntry.prompts || {})
                  .filter(([k, v]) => v && !(type?.prompts || []).some(p => p.key === k))
                  .map(([k, v]) => (
                    <div key={k} style={{ background:C.white, borderRadius:12, padding:"11px 13px", marginBottom:9, border:`1.5px solid ${C.border}` }}>
                      <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.5px" }}>{k}</div>
                      <div style={{ fontSize:"0.86rem", color:C.ink, lineHeight:1.65 }}>{String(v)}</div>
                    </div>
                  ))}
                {selEntry.isPositiveOnly && (
                  <div style={{ fontSize:"0.75rem", color:C.inkL, lineHeight:1.55, textAlign:"center", marginTop:4 }}>
                    De esta entrada elegiste guardar solo tu conclusión.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CARRIL "YO" — amor propio: racha personal + diario privado
// ═══════════════════════════════════════════════════════
const YO_MOODS = [
  { k: "muy_bajo", e: "😞", l: "Muy bajo" },
  { k: "bajo",     e: "😕", l: "Bajito" },
  { k: "neutro",   e: "😐", l: "Neutro" },
  { k: "bien",     e: "🙂", l: "Bien" },
  { k: "en_paz",   e: "😌", l: "En paz" },
];

const AUTOCOMPASION_PROMPTS = [
  "Si alguien que quieres hubiera vivido tu día de hoy, ¿qué le dirías?",
  "Nombra una cosa que hiciste bien hoy, aunque sea diminuta.",
  "¿Qué necesitas hoy que todavía no le has pedido a nadie?",
  "¿Qué emoción está pidiendo tu atención ahora mismo?",
  "¿Qué estás cargando que no te toca cargar?",
  "¿En qué te pareciste hoy a la persona que quieres ser?",
  "¿Cuál es el paso más pequeño posible hacia lo que te importa?",
  "¿Dónde te exigiste hoy más de lo que le exigirías a alguien más?",
];

function CarrilYo({ user, entries, yo, streak, onCheckin, onSaveEntry }) {
  const [view, setView] = useState("home");
  const [quickType, setQuickType] = useState(null);

  if (view === "diario") {
    return <DiarioPersonal entries={entries} onSave={onSaveEntry} user={user} onBack={() => setView("home")} />;
  }
  if (view === "quick" && quickType) {
    return (
      <DiarioPersonal
        entries={entries}
        onSave={onSaveEntry}
        user={user}
        initialType={quickType}
        onBack={() => { setQuickType(null); setView("home"); }}
      />
    );
  }

  const openQuick = id => { setQuickType(id); setView("quick"); };

  const todayKey = getDateKeyLocal();
  const todayCheckin = yo?.checkins?.[todayKey] || null;
  const myEntries = Object.values(entries || {}).filter(e =>
    e.authorEmail === user?.email || e.authorUid === user?.uid || (!e.authorEmail && !e.authorUid)
  );
  const lastEntry = [...myEntries].sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))[0] || null;

  const dayIndex = Math.floor(new Date(`${todayKey}T00:00:00`).getTime() / 86400000);
  const prompt = AUTOCOMPASION_PROMPTS[Math.abs(dayIndex) % AUTOCOMPASION_PROMPTS.length];

  const cur = streak?.currentStreak || 0;
  const best = Math.max(streak?.longestStreak || 0, cur);
  const week = streak?.last7 || [];
  const weekDone = week.filter(d => d.done).length;
  const weekGoal = 4;
  const card = { background: C.white, borderRadius: 18, padding: "15px 16px", marginBottom: 12, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` };
  const h = { fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", color: C.dark, marginBottom: 4 };

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 96 }}>
      <div style={{ background: C.dark, padding: "44px 20px 22px" }}>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.cream2, marginBottom: 4 }}>🪷 Yo</div>
        <div style={{ fontSize: "0.82rem", color: `${C.cream}99`, lineHeight: 1.55 }}>
          Tu carril propio. No necesitas a nadie más para avanzar aquí.
        </div>
      </div>

      <div style={{ padding: "12px 14px 0" }}>
        {/* ─── Racha personal ─── */}
        <div style={{ ...card, background: C.cream }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ minWidth: 64, textAlign: "center" }}>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "2.4rem", color: C.dark, lineHeight: 1 }}>{cur}</div>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, color: C.inkL, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>
                {cur === 1 ? "día" : "días"}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={h}>Mi racha personal</div>
              <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.55 }}>
                Días seguidos en que te dedicaste algo a ti. Es tuya: no depende de tu pareja.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
            {week.map(d => (
              <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: d.done ? C.dark : C.white,
                  border: `1.5px solid ${d.done ? C.dark : C.border}`,
                  color: d.done ? C.cream2 : C.inkL, fontSize: "0.8rem",
                }}>{d.done ? "🌿" : ""}</div>
                <div style={{ fontSize: "0.6rem", fontWeight: 800, color: d.key === todayKey ? C.dark : C.inkL, marginTop: 3 }}>{d.name}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, background: C.white, borderRadius: 12, padding: "10px 12px", border: `1.5px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 800, color: C.dark }}>
                {weekDone >= weekGoal ? "Meta de la semana cumplida 🌿" : `Meta amable: ${weekGoal} de 7 días`}
              </span>
              <span style={{ fontSize: "0.74rem", fontWeight: 800, color: C.inkL }}>{weekDone}/7</span>
            </div>
            <div style={{ height: 8, background: C.border, borderRadius: 50, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, Math.round((weekDone / weekGoal) * 100))}%`, height: "100%", background: C.dark, borderRadius: 50, transition: "width .4s" }} />
            </div>
            {streak?.nextMilestone && (
              <div style={{ fontSize: "0.72rem", color: C.inkL, marginTop: 8 }}>
                Siguiente marca: {streak.nextMilestone} días ({streak.progressPct}%)
              </div>
            )}
          </div>

          <div style={{ fontSize: "0.75rem", color: C.inkM, lineHeight: 1.55, marginTop: 10 }}>
            Un día sin aparecer no borra nada. Tu récord sigue siendo <b>{best} {best === 1 ? "día" : "días"}</b>:
            aquí volver cuenta más que no fallar.
          </div>
        </div>

        {/* ─── Check-in de hoy ─── */}
        <div style={card}>
          <div style={h}>¿Cómo estoy hoy?</div>
          <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.55, marginBottom: 12 }}>
            Un toque. Ponerle nombre a lo que sientes ya baja un poco la intensidad.
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {YO_MOODS.map(m => {
              const on = todayCheckin?.mood === m.k;
              return (
                <button
                  key={m.k}
                  onClick={() => onCheckin(m)}
                  style={{
                    flex: 1, padding: "11px 2px 8px", borderRadius: 14, cursor: "pointer",
                    background: on ? C.dark : C.cream,
                    border: `1.5px solid ${on ? C.dark : C.border}`,
                    color: on ? C.cream2 : C.inkM, fontFamily: "'Nunito',sans-serif",
                  }}>
                  <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>{m.e}</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, marginTop: 5 }}>{m.l}</div>
                </button>
              );
            })}
          </div>
          {todayCheckin && (
            <div style={{ fontSize: "0.75rem", color: C.inkL, marginTop: 10, textAlign: "center" }}>
              Hoy registraste {todayCheckin.emoji} {todayCheckin.label}. Puedes cambiarlo si te cambió el día.
            </div>
          )}
        </div>

        {/* ─── Autocompasión del día ─── */}
        <div style={{ ...card, background: "#eef6ea" }}>
          <div style={{ fontSize: "0.66rem", fontWeight: 800, color: C.inkL, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
            🫧 Pregunta de hoy
          </div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem", color: C.dark, lineHeight: 1.5, marginBottom: 12 }}>
            {prompt}
          </div>
          <button onClick={() => openQuick("autocompasion")}
            style={{ width: "100%", padding: 12, background: C.dark, color: C.cream2, border: "none", borderRadius: 14, fontFamily: "'Baloo 2',sans-serif", fontSize: "0.92rem", cursor: "pointer", boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}>
            Escribir sobre esto
          </button>
        </div>

        {/* ─── Diario privado ─── */}
        <div style={card}>
          <div style={h}>📓 Mi diario privado</div>
          <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.55, marginBottom: 12 }}>
            {myEntries.length === 0
              ? "Todavía no tienes entradas. Aquí puedes escribir sin cuidar a nadie."
              : `${myEntries.length} ${myEntries.length === 1 ? "entrada" : "entradas"}${lastEntry ? ` · última: ${new Date(lastEntry.ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : ""}`}
          </div>
          <button onClick={() => setView("diario")}
            style={{ width: "100%", padding: 12, background: C.dark, color: C.cream2, border: "none", borderRadius: 14, fontFamily: "'Baloo 2',sans-serif", fontSize: "0.92rem", cursor: "pointer", boxShadow: "0 3px 0 rgba(0,0,0,0.2)", marginBottom: 9 }}>
            {myEntries.length === 0 ? "Escribir mi primera entrada" : "Abrir mi diario"}
          </button>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => openQuick("valores")}
              style={{ flex: 1, padding: "10px 6px", background: C.cream, color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 12, fontFamily: "'Baloo 2',sans-serif", fontSize: "0.8rem", cursor: "pointer" }}>
              🧭 Mis valores
            </button>
            <button onClick={() => openQuick("abcd")}
              style={{ flex: 1, padding: "10px 6px", background: C.cream, color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 12, fontFamily: "'Baloo 2',sans-serif", fontSize: "0.8rem", cursor: "pointer" }}>
              🧠 Ordenar mi mente
            </button>
          </div>
        </div>

        <div style={{ fontSize: "0.73rem", color: C.inkL, lineHeight: 1.6, textAlign: "center", padding: "4px 8px 8px" }}>
          🔒 Nada de esta pestaña se comparte: ni tus entradas, ni tu ánimo, ni tu racha personal.
          Se guarda en tu cuenta y tu pareja no tiene acceso.
        </div>
      </div>
    </div>
  );
}

// PROFILE — Enhanced with more info fields
function Perfil({ user, bamboo, garden, accessories, exDone, messages, burbuja, conoce, lessonsDone, coupleInfo, streakInfo, gratitudeStreak, onSaveCoupleInfo, onSaveNames, onLogout, testScores, onRetakeTest, onDeleteAccount, gratitud, momentos, onAddGratitud, onAddMomento, onSendMessage, onClaimDailyTip, diarioEntries, onSaveDiarioEntry }) {
  const [editMode, setEditMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showLoveModal, setShowLoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalClosing, setDeleteModalClosing] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loveText, setLoveText] = useState("");
  const [quickLove, setQuickLove] = useState(null);
  const [diarioView, setDiarioView] = useState(false);
  const [nameInput, setNameInput] = useState(user?.names || "");
  const deleteCloseTimer = useRef(null);
  const [form, setForm] = useState({
    anniversary: coupleInfo.anniversary || "",
    firstDate: coupleInfo.firstDate || "",
    firstKiss: coupleInfo.firstKiss || "",
    howMet: coupleInfo.howMet || "",
    favoritePlace: coupleInfo.favoritePlace || "",
    favoriteSong: coupleInfo.favoriteSong || "",
    favoriteMovie: coupleInfo.favoriteMovie || "",
    sharedDream: coupleInfo.sharedDream || "",
    petNames: coupleInfo.petNames || "",
    mantra: coupleInfo.mantra || "",
    nextAdventure: coupleInfo.nextAdventure || "",
    bucketList: coupleInfo.bucketList || "",
  });

  const myEmail = user?.email || "guest";
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerMsgs = [...messages]
    .filter(m => m.senderEmail !== myEmail)
    .sort((a, b) => new Date(b?.time || 0).getTime() - new Date(a?.time || 0).getTime());
  const recentPartnerMsgs = partnerMsgs.slice(0, 3);

  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (user?.code && !user?.isGuest) {
      fbGetCode(user.code).then(ci => {
        setConnected(!!(ci?.partnerUid && ci?.ownerUid));
      }).catch(() => {
        // fallback: localStorage
        const codes = ls.get("mochi_codes") || {};
        const ci = codes[user.code];
        setConnected(!!(ci?.partnerEmail && ci?.ownerEmail));
      });
    }
  }, [user?.code]);

  const FIELDS = [
    { key: "anniversary", label: "💑 Aniversario", ph: "Ej: 14 de febrero de 2022" },
    { key: "firstDate", label: "🌟 Primera cita", ph: "¿Dónde fue su primera cita?" },
    { key: "firstKiss", label: "💋 Primer beso", ph: "¿Cuándo y dónde?" },
    { key: "howMet", label: "🤝 ¿Cómo se conocieron?", ph: "Su historia..." },
    { key: "favoritePlace", label: "🗺 Lugar favorito juntos", ph: "Ese lugar especial..." },
    { key: "favoriteSong", label: "🎵 Canción de ustedes", ph: "La canción que es de los dos" },
    { key: "favoriteMovie", label: "🎬 Película favorita juntos", ph: "La que ven siempre" },
    { key: "sharedDream", label: "🌙 Sueño compartido", ph: "Lo que sueñan juntos" },
    { key: "petNames", label: "🐾 Apodos del uno al otro", ph: "Ej: mi osito, mi sol..." },
    { key: "mantra", label: "✨ Mantra de la relación", ph: "Una frase que los define" },
    { key: "nextAdventure", label: "🗺 Próxima aventura", ph: "A dónde quieren ir" },
    { key: "bucketList", label: "📋 Lista de deseos", ph: "Cosas que quieren hacer juntos" },
  ];

  const save = () => { onSaveCoupleInfo(form); setEditMode(false); };
  const submitLoveMessage = () => {
    const clean = (quickLove || loveText).trim();
    if (!clean) return;
    onSendMessage(clean);
    setShowLoveModal(false);
    setLoveText("");
    setQuickLove(null);
  };

  const closeDeleteModal = useCallback(() => {
    if (deletingAccount || deleteModalClosing) return;
    setDeleteModalClosing(true);
    clearTimeout(deleteCloseTimer.current);
    deleteCloseTimer.current = setTimeout(() => {
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      setDeleteModalClosing(false);
    }, 180);
  }, [deletingAccount, deleteModalClosing]);

  useEffect(() => {
    if (!showDeleteModal) return;
    const onEsc = (e) => {
      if (e.key === "Escape") closeDeleteModal();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showDeleteModal, closeDeleteModal]);

  useEffect(() => () => clearTimeout(deleteCloseTimer.current), []);

  if (diarioView) {
    return (
      <DiarioPersonal
        entries={diarioEntries}
        onSave={onSaveDiarioEntry}
        user={user}
        onBack={() => setDiarioView(false)}
      />
    );
  }

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "38px 20px 28px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <CouplePandaSVG happy size={130} />
        </div>
        <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: "1.9rem", fontWeight: 700, color: C.cream2 }}>{user?.names || "Nosotros"}</div>
        <div style={{ color: `${C.cream}88`, fontSize: "0.85rem", fontWeight: 700, marginTop: 3 }}>{user?.since && user.since !== "Juntos desde hoy" ? user.since : ""}</div>
        {coupleInfo.anniversary && <div style={{ color: C.gold, fontSize: "0.82rem", fontWeight: 700, marginTop: 4 }}>💑 {coupleInfo.anniversary}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 14px" }}>
        {[["Bambú 🌿", bamboo], ["Días de racha 🔥", streakInfo?.currentStreak || 0]].map(([l, v]) => (
          <div key={l} style={{ background: C.white, borderRadius: 16, padding: "14px 10px", textAlign: "center", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.7rem", color: C.dark }}>{v}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>
      {/* ── MOMENTOS ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <MomentosSection user={user} momentos={momentos} onAddMomento={onAddMomento} />
      </div>

      {/* ── GRATITUD ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <GratitudSection user={user} gratitud={gratitud} onAddGratitud={onAddGratitud} gratitudeStreak={gratitudeStreak} />
      </div>

      <div style={{ margin:"0 14px 12px", background:C.white, borderRadius:18, padding:16, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}` }}>
        <button onClick={() => setShowLoveModal(true)} style={{ width:"100%", background:"#c05068", color:C.cream2, border:"none", borderRadius:12, padding:"12px 16px", fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)" }}>
          Manda un mensaje de amor
        </button>
        <div style={{ marginTop:12, background:C.cream, borderRadius:12, padding:12, border:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.88rem", color:C.dark, marginBottom:6 }}>💌 Mensajes de tu pareja</div>
          {!recentPartnerMsgs.length ? (
            <div style={{ fontSize:"0.8rem", color:C.inkL, lineHeight:1.6 }}>Aquí aparecerán los mensajes que te envíe. Solo tú los ves; los tuyos son privados para él/ella.</div>
          ) : (
            recentPartnerMsgs.map((msg, i) => (
              <div key={msg.id || i} style={{ background:C.white, borderRadius:10, padding:"9px 10px", border:`1px solid ${C.border}`, marginBottom:i === recentPartnerMsgs.length - 1 ? 0 : 8 }}>
                <div style={{ fontSize:"0.86rem", color:C.ink, lineHeight:1.65, fontWeight:700 }}>{msg.text}</div>
                <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700, marginTop:5 }}>
                  De {msg.sender} · {new Date(msg.time).toLocaleDateString("es", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── GALERÍA DE LOGROS ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <LogrosSection exDone={exDone} />
      </div>

      {/* ── DIARIO PERSONAL ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <div style={{ background: C.white, borderRadius: 16, padding: "14px 16px", border: `1.5px solid ${C.border}`, boxShadow: `0 2px 0 ${C.border}` }}>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", color: C.dark, marginBottom: 8 }}>
            📓 Mi diario privado
          </div>
          <div style={{ fontSize: "0.78rem", color: C.inkM, marginBottom: 12, lineHeight: 1.5 }}>
            Un espacio solo para ti dentro de Mochi. Tu pareja no tiene acceso a estas entradas.
          </div>
          <Btn onClick={() => setDiarioView(true)} variant="sand" style={{ width:"100%", fontSize: "0.85rem" }}>
            Abrir mi diario 📓
          </Btn>
        </div>
      </div>

      {/* ── ESTADÍSTICAS DEL TEST ── */}
      {testScores && Object.keys(testScores).length > 0 && (
        <div style={{ margin: "0 14px 12px" }}>
          <TestStatsSection testScores={testScores} onRetakeTest={onRetakeTest} lastTestDate={user?.lastTestDate} streakInfo={streakInfo} />
        </div>
      )}

      <div style={{ padding: "0 14px 20px" }}>

        {/* Couple code — discrete, at bottom */}
        {!user?.isGuest && <div style={{ background: C.white, borderRadius: 16, padding: "14px 16px", marginBottom: 12, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.6px" }}>CÓDIGO DE PAREJA</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? C.olive : C.sand }} />
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: connected ? C.olive : C.inkL }}>{connected ? "Conectados ✓" : "Esperando pareja"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", letterSpacing: 6, color: C.dark, background: C.cream, borderRadius: 10, padding: "8px 14px", flex: 1, textAlign: "center", border: `1.5px solid ${C.border}` }}>{user?.code || "----"}</div>
            <Btn onClick={() => { 
              const c = (user?.code || "").toUpperCase();
              if(navigator.clipboard) { navigator.clipboard.writeText(c).then(()=>showToast("Código copiado: "+c)).catch(()=>showToast("Tu código: "+c)); }
              else { showToast("Tu código: "+c); }
            }} variant="sand" style={{ padding: "10px 14px", fontSize: "0.8rem" }}>Copiar</Btn>
          </div>
        </div>}

        {/* ── CAMBIAR NOMBRE ── */}
        <div style={{ background: C.white, borderRadius: 16, padding: "16px", border: `1.5px solid ${C.border}`, marginBottom: 12, boxShadow: `0 2px 0 ${C.border}` }}>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "0.95rem", color: C.dark, marginBottom: 10 }}>✏️ Nombre de la pareja</div>
          {editingName ? (
            <div>
              <div style={{ fontSize: "0.72rem", color: C.inkL, marginBottom: 6, fontWeight: 700 }}>Escribe ambos nombres separados por &</div>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Ej: Pau & Jorge"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`,
                  fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", color: C.ink, background: C.sandL,
                  marginBottom: 10, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => { onSaveNames(nameInput); setEditingName(false); }} style={{ flex: 1 }}>Guardar ✓</Btn>
                <Btn onClick={() => { setNameInput(user?.names || ""); setEditingName(false); }} variant="ghost" style={{ padding: "10px 14px" }}>✕</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", color: C.ink }}>
                {user?.names || "Sin nombre"}
              </div>
              <Btn onClick={() => { setNameInput(user?.names || ""); setEditingName(true); }} variant="sand" style={{ fontSize: "0.8rem", padding: "7px 14px" }}>
                Cambiar
              </Btn>
            </div>
          )}
        </div>

        <Btn onClick={onLogout} variant="ghost" style={{ width: "100%", color: "#c04040", borderColor: "#f0d0d0", marginBottom: 8 }}>Cerrar sesión</Btn>
        {onDeleteAccount && <Btn onClick={() => { setDeleteModalClosing(false); setDeleteConfirmText(""); setShowDeleteModal(true); }} variant="ghost" style={{ width: "100%", color: "#a02020", borderColor: "#f0c0c0", fontSize: "0.82rem", marginBottom: 16 }}>Eliminar cuenta 🗑️</Btn>}

        {/* Legal & Privacy */}
        <div style={{ background: C.cream, borderRadius: 16, padding: "14px 16px", border: `1.5px solid ${C.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.6px", marginBottom: 8 }}>AVISO LEGAL Y PRIVACIDAD</div>
          <div style={{ fontSize: "0.72rem", color: C.inkM, lineHeight: 1.65 }}>
            <b>Mochi</b> es una aplicación de bienestar para parejas desarrollada por Johana Fragoso. Todos los derechos reservados © {new Date().getFullYear()}. El nombre, diseño, concepto, personajes y contenido de Mochi están protegidos por las leyes de propiedad intelectual. Queda prohibida su reproducción, distribución o uso comercial sin autorización expresa por escrito.
          </div>
          <div style={{ fontSize: "0.72rem", color: C.inkM, lineHeight: 1.65, marginTop: 8 }}>
            <b>Privacidad de datos:</b> Tu información personal (correo, nombre y progreso) se almacena de forma segura y cifrada. No se vende ni comparte con terceros. Puedes eliminar tu cuenta y todos tus datos en cualquier momento usando el botón de arriba. Al usar Mochi, aceptas estos términos.
          </div>
        </div>
        <div style={{ fontSize: "0.65rem", color: C.inkL, textAlign: "center", paddingBottom: 4 }}>Mochi v1.0 · Hecho con 🐼 amor</div>
      </div>

      {showLoveModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.62)", zIndex:5000, display:"flex", alignItems:"flex-end" }} onClick={e => {
          if (e.target === e.currentTarget) {
            setShowLoveModal(false);
            setLoveText("");
            setQuickLove(null);
          }
        }}>
          <div style={{ background:C.white, borderRadius:"22px 22px 0 0", padding:"16px 18px 44px", width:"100%", maxWidth:480, margin:"0 auto", border:`1.5px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ width:34, height:5, background:C.sand, borderRadius:50 }}/>
              <div onClick={() => { setShowLoveModal(false); setLoveText(""); setQuickLove(null); }} style={{ width:30, height:30, borderRadius:"50%", background:C.sand, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:"1rem", color:C.inkM, fontWeight:800 }}>✕</div>
            </div>
            <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.3rem", color:C.dark, marginBottom:2 }}>💌 Mensajito de amor</div>
            <div style={{ fontSize:"0.78rem", color:C.inkL, marginBottom:14, fontWeight:600 }}>+5 bambú 🌿 · Lo que envíes aparece también en los globos del jardín</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
              {LOVE_PROMPTS.map((p, i) => (
                <div key={i} onClick={() => { setQuickLove(p.idea); setLoveText(p.idea); }} style={{ display:"flex", alignItems:"center", gap:10, background:loveText===p.idea?C.cream:C.sandL, borderRadius:11, padding:"9px 12px", cursor:"pointer", border:`1.5px solid ${loveText===p.idea?C.olive:C.border}`, transition:"all 0.15s" }}>
                  <span style={{ fontSize:"1.1rem" }}>{p.icon}</span>
                  <span style={{ fontSize:"0.78rem", color:C.inkM, lineHeight:1.4, flex:1 }}>{p.idea}</span>
                  {loveText===p.idea && <span style={{ fontSize:"0.7rem", color:C.olive, fontWeight:800 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, marginBottom:6, letterSpacing:"0.5px" }}>TU MENSAJE</div>
            <TA value={loveText} onChange={v => { setLoveText(v); setQuickLove(null); }} placeholder="Escribe aquí... o edita una idea 💬" rows={3} style={{ marginBottom:12 }} />
            <Btn onClick={submitLoveMessage} variant="salmon" style={{ width:"100%", fontSize:"1.05rem" }}>Enviar con amor 💌</Btn>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(15,20,15,0.66)", zIndex:5200, display:"flex", alignItems:"center", justifyContent:"center", padding:"18px", animation: deleteModalClosing ? "fadeOutOverlay 0.18s ease forwards" : "fadeInOverlay 0.2s ease forwards" }}
          onClick={e => {
            if (deletingAccount || deleteModalClosing) return;
            if (e.target === e.currentTarget) {
              closeDeleteModal();
            }
          }}
        >
          <div style={{ width:"100%", maxWidth:430, background:C.white, border:`1.5px solid ${C.border}`, borderRadius:18, boxShadow:"0 10px 34px rgba(0,0,0,0.22)", padding:"16px 16px 14px", animation: deleteModalClosing ? "popOutCard 0.18s ease forwards" : "popInCard 0.24s cubic-bezier(.2,.9,.2,1) forwards" }}>
            <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.05rem", color:"#8b2020", marginBottom:6 }}>Eliminar cuenta</div>
            <div style={{ fontSize:"0.8rem", color:C.inkM, lineHeight:1.6, fontWeight:700, marginBottom:10 }}>
              Esta acción borra tu acceso y tus datos. Escribe <b>ELIMINAR</b> para confirmar.
            </div>
            <Inp
              value={deleteConfirmText}
              onChange={setDeleteConfirmText}
              placeholder="Escribe ELIMINAR"
              autoFocus={showDeleteModal && !deleteModalClosing}
              style={{ marginBottom:12, borderColor: deleteConfirmText ? "#e8b0b0" : C.border, background:"#fff8f8" }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <Btn
                variant="ghost"
                disabled={deletingAccount}
                onClick={closeDeleteModal}
                style={{ flex:1, padding:"10px 12px", fontSize:"0.82rem", borderColor:C.border, color:C.inkM }}
              >
                Cancelar
              </Btn>
              <Btn
                variant="salmon"
                disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
                onClick={async () => {
                  setDeletingAccount(true);
                  try {
                    await onDeleteAccount(deleteConfirmText.trim());
                    setShowDeleteModal(false);
                    setDeleteConfirmText("");
                    setDeleteModalClosing(false);
                  } finally {
                    setDeletingAccount(false);
                  }
                }}
                style={{ flex:1, padding:"10px 12px", fontSize:"0.82rem", background:"#b93434", color:"#fff" }}
              >
                {deletingAccount ? "Eliminando..." : "Eliminar ahora"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// GLOBAL STYLES + ROOT APP
// ═══════════════════════════════════════════════════════

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f3ecfb; }
*[style*="Baloo 2"] { font-weight: 800 !important; letter-spacing: 0.2px; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes floatHappy { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-18px) rotate(1.5deg)} }
@keyframes breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.025)} }
textarea:focus, input:focus { border-color: #8b6fc9 !important; box-shadow: 0 0 0 3px rgba(139,111,201,0.18) !important; outline: none !important; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-thumb { background:#ddc9f0; border-radius:50px; }
select { appearance: none; }
@keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOutOverlay { from { opacity: 1; } to { opacity: 0; } }
@keyframes popInCard { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes popOutCard { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.98); } }
`;

const OB = [
  {
    title: "Bienvenidos a Mochi 🐼",
    body: "Un espacio privado para ustedes dos, basado en 40 años de investigación del psicólogo John Gottman sobre parejas.",
    icon: "🐼"
  },
  {
    title: "Ganen bambú juntos 🌿",
    body: "Cada consejo, pregunta o ejercicio les da bambú. Con él decoran su jardín.",
    icon: "🌿"
  },
  {
    title: "Todo queda entre ustedes 🔒",
    body: "Sus respuestas, mensajes y acuerdos son privados. Solo ustedes dos pueden verlos. Sin publicidad, sin vender datos.",
    icon: "🔒"
  },
];

// ═══════════════════════════════════════════════
// RELATIONSHIP TEST DATA — 5 areas, 2 questions each
// ═══════════════════════════════════════════════
const TEST_AREAS = [
  { id:"comunicacion", label:"Comunicación", emoji:"💬",
    q:"¿Qué tan bien sienten que se comunican como pareja?",
    sub:"Escucha activa, expresar necesidades, resolver malentendidos" },
  { id:"confianza", label:"Confianza & Seguridad", emoji:"🔒",
    q:"¿Qué tan seguros y confiados se sienten en la relación?",
    sub:"Honestidad, estabilidad emocional, sentirse seguros" },
  { id:"intimidad", label:"Conexión & Intimidad", emoji:"💞",
    q:"¿Qué tan conectados se sienten emocionalmente?",
    sub:"Cercanía, vulnerabilidad, sentirse vistos y comprendidos" },
  { id:"conflicto", label:"Manejo de Conflictos", emoji:"🌊",
    q:"¿Qué tan bien manejan los desacuerdos?",
    sub:"Sin ataques personales, encontrar soluciones, reparar después" },
  { id:"proyecto", label:"Proyecto de Vida", emoji:"🌱",
    q:"¿Qué tan alineados están en sus metas y sueños?",
    sub:"Valores compartidos, planes a futuro, apoyarse mutuamente" },
];

const TEST_LABELS = ["Muy mal","Mal","Regular","Bien","Muy bien"];
const TEST_COLORS = ["#e86040","#e8a030","#e8d840","#8ac860","#4a9a40"];

// Diagnóstico general sin números: nunca mostramos promedios por área
// porque, sabiendo tu propia respuesta, se podría deducir la del otro.
// Solo se usa el orden relativo de las áreas y un pronóstico general.
function buildTestDiagnosis(scoresByArea) {
  const areas = TEST_AREAS.map(a => {
    const s = scoresByArea[a.id];
    if (!s) return null;
    const sA = s.a || s.A || 0;
    const sB = s.b || s.B || 0;
    return { ...a, combined: sA + sB };
  }).filter(Boolean);
  if (areas.length === 0) return null;

  const sorted = [...areas].sort((x, y) => y.combined - x.combined);
  const half = Math.max(1, Math.floor(sorted.length / 2));
  const goingWell = sorted.slice(0, Math.min(2, half));
  const toGrow = sorted.slice(-Math.min(2, half)).reverse();

  const total = areas.reduce((acc, a) => acc + a.combined / 2, 0) / areas.length;
  let prognosis, progColor, progEmoji;
  if (total >= 4.2) { prognosis = "Su relación tiene bases muy sólidas. Mochi los acompañará a crecer aún más."; progColor = "#4a9a40"; progEmoji = "🌟"; }
  else if (total >= 3.2) { prognosis = "Tienen mucho amor y algunas áreas para trabajar juntos. ¡Están en el lugar correcto!"; progColor = "#7ab848"; progEmoji = "🌿"; }
  else if (total >= 2.2) { prognosis = "Su relación tiene potencial real. Las herramientas de Mochi pueden hacer una gran diferencia."; progColor = "#e8a030"; progEmoji = "🌱"; }
  else { prognosis = "Se necesita valentía para ser honestos. Mochi está aquí para acompañarlos paso a paso."; progColor = "#e86040"; progEmoji = "💪"; }

  return { goingWell, toGrow, prognosis, progColor, progEmoji };
}

function TestDiagnosisCards({ diagnosis, compact }) {
  const fs = compact ? "0.78rem" : "0.84rem";
  return (
    <>
      <div style={{ background:C.white, borderRadius:compact ? 12 : 16, padding:compact ? 12 : 14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:"#4a9a40", letterSpacing:"0.6px", marginBottom:6 }}>🌟 LO QUE VA BIEN</div>
        {diagnosis.goingWell.map(a => (
          <div key={a.id} style={{ fontSize:fs, color:C.inkM, marginBottom:4 }}>
            → {a.emoji} <strong>{a.label}</strong> — una fortaleza de los dos
          </div>
        ))}
      </div>
      <div style={{ background:"#e8f4e8", borderRadius:compact ? 12 : 16, padding:compact ? 12 : 14, marginBottom:compact ? 12 : 20, border:`1px solid ${C.olive}30` }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.6px", marginBottom:6 }}>💡 LO QUE PUEDEN MEJORAR</div>
        {diagnosis.toGrow.map(a => (
          <div key={a.id} style={{ fontSize:fs, color:C.inkM, marginBottom:4 }}>
            → {a.emoji} <strong>{a.label}</strong> — pueden crecer aquí con los ejercicios de Mochi
          </div>
        ))}
      </div>
      <div style={{ fontSize:"0.7rem", color:C.inkL, textAlign:"center", lineHeight:1.5, marginBottom:compact ? 4 : 16 }}>
        🔒 Las respuestas de cada quien son privadas. Solo ven el diagnóstico en conjunto.
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════
// DAILY LESSONS DATA
// ═══════════════════════════════════════════════
const DAILY_LESSONS = [
  { id:"love_languages", emoji:"💝", title:"Los 5 Lenguajes del Amor",
    tag:"Gary Chapman",
    fullCardImages: true,
    cardsHaveDots: true,
    intro:"Cada persona siente y expresa el amor de manera diferente. Cuando no hablas el idioma de tu pareja, el amor no llega aunque lo intentes mucho.",
    sections:[
      { title:"1. Palabras de Afirmación", icon:"💬", body:"Decir 'te amo', 'estás increíble hoy', 'gracias por existir'. Para esta persona, las palabras construyen o destruyen la relación entera." },
      { title:"2. Tiempo de Calidad", icon:"⏱", body:"Atención 100% sin teléfono, actividades juntos, conversaciones profundas. No es cantidad — es presencia real." },
      { title:"3. Regalos", icon:"🎁", body:"No es materialismo — es el simbolismo de 'pensé en ti'. Un café, una flor, un meme. El detalle importa más que el precio." },
      { title:"4. Actos de Servicio", icon:"🛠", body:"Hacer algo sin que te pidan: lavar los platos, preparar el desayuno, resolver algo que les preocupa. 'Te ayudo' es su 'te amo'." },
      { title:"5. Contacto Físico", icon:"🤝", body:"Abrazos, tomarse de la mano, un beso de buenos días. El cuerpo dice lo que las palabras no alcanzan." },
    ],
    reflect:"¿Cuál es tu lenguaje principal? ¿Y el de tu pareja? ¿Los han hablado?",
    illustrations:[
      "/lessons/love_languages_cards/1.jpg",
      "/lessons/love_languages_cards/2.jpg",
      "/lessons/love_languages_cards/3.jpg",
      "/lessons/love_languages_cards/4.jpg",
      "/lessons/love_languages_cards/5.jpg",
      "/lessons/love_languages_cards/6.jpg",
      "/lessons/love_languages_cards/7.jpg"
    ] },

  { id:"four_horsemen", emoji:"🌩", title:"Los 4 Jinetes que dañan la relación",
    tag:"John Gottman",
    fullCardImages: true,
    intro:"El Dr. Gottman puede predecir el divorcio con 90% de precisión. Estos 4 patrones son las señales de alarma más peligrosas en una relación.",
    sections:[
      { title:"1. Crítica", icon:"🗡", body:"Atacar a la persona, no al comportamiento. 'Siempre eres tan descuidado' vs 'Me molestó que no avisaras'. El antídoto: queja específica con 'yo'." },
      { title:"2. Desprecio", icon:"👀", body:"El más dañino. Burlarse, poner los ojos en blanco, sarcasmo hiriente. Comunica asco. El antídoto: construir cultura de aprecio." },
      { title:"3. Defensividad", icon:"🛡", body:"'Yo no soy el problema, tú eres el problema.' Victimizarse, contraatacar. El antídoto: asumir aunque sea el 5% de responsabilidad." },
      { title:"4. Evasión o bloqueo emocional", icon:"🧱", body:"Cerrarse, ignorar o desconectarse emocionalmente. El cuerpo entra en modo supervivencia. El antídoto: pausa de 20 min y volver con calma." },
    ],
    reflect:"¿Reconocen alguno de estos patrones en sus discusiones? ¿Cuál aparece más?",
    illustrations:[
      "/lessons/four_horsemen_cards/1.jpg",
      "/lessons/four_horsemen_cards/2.jpg",
      "/lessons/four_horsemen_cards/3.jpg",
      "/lessons/four_horsemen_cards/4.jpg",
      "/lessons/four_horsemen_cards/5.jpg",
      "/lessons/four_horsemen_cards/6.jpg"
    ] },

  { id:"de_escalation", emoji:"🕊", title:"Cómo Evitar que un Desacuerdo se Convierta en Pelea",
    tag:"Gottman · EFT",
    fullCardImages: true,
    intro:"Los desacuerdos son normales. El problema es cuando se convierten en discusiones o peleas llenas de gritos y acusaciones. Casi siempre hay señales antes de que eso pase. Aprender a reconocerlas y a detenerlas a tiempo es una de las habilidades más valiosas en una pareja.",
    sections:[
      { title:"1. Empezar suavemente", icon:"🌱", body:"La forma en que empieza una discusión predice cómo va a terminar. Si arrancas con un ataque, tu pareja se va a defender. Habla de lo que sientes y lo que necesitas: 'Me siento cansada con todo lo de la casa, ¿me ayudas con la cena hoy?'" },
      { title:"2. Abordar un tema a la vez", icon:"📌", body:"Cada tema nuevo hace la discusión más grande y más difícil de resolver. Elijan de qué están hablando hoy y quédense ahí. Lo demás también importa, pero puede esperar a otro momento." },
      { title:"3. Escuchar para entender, no para responder", icon:"👂", body:"Repite lo que entendiste antes de contestar: 'Lo que escucho es que te sentiste ignorado cuando llegué tarde, ¿es así?'. Sentirse escuchado baja muchísimo la tensión." },
      { title:"4. Reconocer cuando el cuerpo ya no puede", icon:"💓", body:"El corazón se acelera, sentimos calor y ya no podemos pensar con claridad. Díselo a tu pareja con calma: 'Me estoy alterando mucho y no quiero lastimarte, ¿podemos seguir en un rato?'" },
      { title:"5. Reconocer que el enemigo es el ciclo, no tu pareja", icon:"🔄", body:"Muchas peleas se repiten como un baile: uno reclama y persigue, el otro se cierra y se aleja. Nómbrenlo juntos: 'Ya estamos otra vez en nuestro baile'. Son ustedes dos contra el problema." },
    ],
    reflect:"¿Cómo suelen empezar sus discusiones? ¿Qué señales notan en su cuerpo cuando una pelea está por salirse de control? ¿Qué palabra o gesto podrían usar para avisarse que necesitan bajarle?",
    illustrations:[
      "/lessons/de_escalation_cards/1.jpg",
      "/lessons/de_escalation_cards/2.jpg",
      "/lessons/de_escalation_cards/3.jpg",
      "/lessons/de_escalation_cards/4.jpg",
      "/lessons/de_escalation_cards/5.jpg",
      "/lessons/de_escalation_cards/6.jpg",
      "/lessons/de_escalation_cards/7.jpg"
    ] },

  { id:"repair_attempts", emoji:"🛠", title:"Cómo Reparar Después de una Pelea",
    tag:"Gottman · EFT",
    fullCardImages: true,
    intro:"Todas las parejas pelean. La diferencia no está en no pelear — está en CÓMO reparan después. Las parejas felices aprenden a 'resetear'.",
    sections:[
      { title:"Pausa consciente", icon:"⏸", body:"Cuando sientan que el corazón va a más de 100 latidos/min, paren. No es huir — es regular el sistema nervioso. 20-30 minutos y vuelven." },
      { title:"Intento de reparación", icon:"🤍", body:"Una frase, un gesto, un toque. 'Perdón, me pasé.' 'Te escucho.' 'Hagamos una pausa.' Gottman llama a esto el gesto más importante en una relación." },
      { title:"Asumir responsabilidad", icon:"🪞", body:"Encontrar aunque sea el 10% de 'yo contribuí a esto'. No es admitir que tienes razón — es abrir la puerta." },
      { title:"Reconectarse", icon:"💞", body:"Después de resolver, reconectarse físicamente o emocionalmente. Un abrazo de 20 segundos libera oxitocina y reinicia el vínculo." },
    ],
    reflect:"¿Tienen algún ritual de reparación propio? ¿Qué funciona para ustedes?",
    illustrations:[
      "/lessons/repair_attempts_cards/1.jpg",
      "/lessons/repair_attempts_cards/2.jpg",
      "/lessons/repair_attempts_cards/3.jpg",
      "/lessons/repair_attempts_cards/4.jpg",
      "/lessons/repair_attempts_cards/5.jpg",
      "/lessons/repair_attempts_cards/6.jpg"
    ] },

  { id:"emotional_flooding", emoji:"🌊", title:"La Inundación Emocional",
    tag:"Neurociencia · Gottman",
    intro:"Cuando una pelea 'explota', no es falta de amor — es biología. El sistema nervioso se activa y el cerebro racional se apaga literalmente.",
    sections:[
      { title:"¿Qué pasa en el cuerpo?", icon:"🧠", body:"El corazón supera 100 lpm. El cortisol inunda el cerebro. La corteza prefrontal (razonamiento) se desactiva. En ese estado, no es posible escuchar bien ni hablar bien." },
      { title:"La trampa", icon:"🪤", body:"Si siguen discutiendo en ese estado, solo se hacen daño. Nada de lo que digan será procesado correctamente. Es como hablarle a una alarma de incendios." },
      { title:"La pausa como acto de amor", icon:"💛", body:"Pedir pausa NO es abandono — es responsabilidad. Digan: 'Necesito 20 minutos para calmarme y volver a hablar contigo bien.'" },
      { title:"Cómo regularse", icon:"🍃", body:"Respiración 4-7-8. Caminar. No revisar el teléfono. No seguir 'practicando argumentos' mentalmente. El objetivo es bajar la activación, no ganar." },
    ],
    reflect:"¿Saben cuándo están 'inundados'? ¿Tienen señal acordada para pedir pausa?",
    illustrations:[
      "/lessons/emotional_flooding-0.png",
    "/lessons/emotional_flooding-1.png",
    "/lessons/emotional_flooding-2.png",
    "/lessons/emotional_flooding-3.png",
    "/lessons/emotional_flooding-4.png",
    "/lessons/emotional_flooding-5.png"
    ] },

  { id:"bids_connection", emoji:"🎣", title:"Las 'Ofertas' de Conexión",
    tag:"John Gottman",
    intro:"Gottman descubrió que las parejas felices no se diferencian en ser más románticas — se diferencian en cómo responden a los pequeños momentos cotidianos.",
    sections:[
      { title:"¿Qué es una oferta?", icon:"🌱", body:"Cualquier intento de conectar: 'Mira este meme', 'Hoy fue difícil', 'Tengo hambre'. No siempre son dramáticas — son pequeñas invitaciones." },
      { title:"Girar hacia", icon:"✅", body:"Responder a la oferta: voltear, preguntar, escuchar, reír juntos. Las parejas estables giran hacia el 86% del tiempo." },
      { title:"Girar en contra", icon:"❌", body:"Criticar o atacar la oferta. 'Siempre interrumpes.' Daña el vínculo acumulativamente." },
      { title:"Girar lejos", icon:"😶", body:"Ignorar, no responder, seguir en el teléfono. El más común y el más silenciosamente dañino." },
    ],
    reflect:"¿Están girando hacia las ofertas del otro? ¿Cuándo fue la última vez que lo hicieron bien?",
    illustrations:[
      "/lessons/bids_connection-0.png",
    "/lessons/bids_connection-1.png",
    "/lessons/bids_connection-2.png",
    "/lessons/bids_connection-3.png",
    "/lessons/bids_connection-4.png",
    "/lessons/bids_connection-5.png"
    ] },

  { id:"attachment_styles", emoji:"🧩", title:"Estilos de Apego",
    tag:"Bowlby · Ainsworth",
    intro:"La forma en que aprendiste a conectar de niño con tus cuidadores programa cómo te relacionas en pareja. Entenderlo cambia todo.",
    sections:[
      { title:"Apego Seguro", icon:"🏠", body:"Cómodo con la intimidad y la independencia. Puede pedir y dar sin miedo. Se siente merecedor de amor. Resultado de haber tenido cuidadores consistentes." },
      { title:"Apego Ansioso", icon:"🌀", body:"Necesita mucha reafirmación y seguridad. Miedo al abandono. Lee señales donde no las hay. 'Si no responde rápido, algo está mal.' El amor se siente como urgencia." },
      { title:"Apego Evitativo", icon:"🚪", body:"Incomodo con la dependencia emocional. Se cierra cuando hay mucha cercanía. 'No necesito a nadie.' Aprendió que los otros no son confiables." },
      { title:"Apego Desorganizado", icon:"🌩", body:"Mezcla de ansioso y evitativo. Quiere conexión y le da terror al mismo tiempo. Común en personas que vivieron trauma en sus relaciones tempranas." },
    ],
    reflect:"¿Se reconocen en alguno? ¿Cómo interactúan sus estilos de apego entre sí?",
    illustrations:[
      "/lessons/attachment_styles-0.png",
    "/lessons/attachment_styles-1.png",
    "/lessons/attachment_styles-2.png",
    "/lessons/attachment_styles-3.png",
    "/lessons/attachment_styles-4.png",
    "/lessons/attachment_styles-5.png"
    ] },

  { id:"positive_sentiment", emoji:"☀️", title:"El Banco Emocional de la Pareja",
    tag:"Gottman",
    intro:"Gottman descubrió que para que una relación sea estable, necesita una proporción de 5:1 — 5 interacciones positivas por cada negativa.",
    sections:[
      { title:"El banco emocional", icon:"🏦", body:"Cada interacción positiva deposita. Cada negativa retira. Una pelea, una crítica, un comentario frío — todo retira. La pregunta no es 'pelean', sino '¿cuánto han depositado antes?'" },
      { title:"La proporción mágica", icon:"✨", body:"5 positivas por cada 1 negativa. No significa evitar conflictos — significa mantener el saldo positivo para que cuando llegue la tormenta, tengan reservas." },
      { title:"Cómo depositar", icon:"💰", body:"Pequeños momentos: agradecer, notar algo bonito, reír juntos, un mensaje de buenos días, recordar algo que dijeron. No tiene que ser grandioso." },
      { title:"El interés genuino", icon:"🔍", body:"Gottman llama a esto 'mapas del amor' — conocer el mundo interno de tu pareja: sus miedos, sueños, el nombre de su jefa, lo que le da ansiedad esta semana." },
    ],
    reflect:"¿Cómo está su banco emocional ahora? ¿Están depositando o retirando más?",
    illustrations:[
      "/lessons/positive_sentiment-0.png",
    "/lessons/positive_sentiment-1.png",
    "/lessons/positive_sentiment-2.png",
    "/lessons/positive_sentiment-3.png",
    "/lessons/positive_sentiment-4.png",
    "/lessons/positive_sentiment-5.png"
    ] },
  { id:"lesson8", emoji:"🌻", title:"La Regla de Oro: 5 actos al día",
  tag:"Gottman · Actos de bondad",
  intro:"John Gottman descubrió que las parejas más felices no son las que nunca pelean, sino las que tienen más interacciones positivas que negativas. La proporción mágica es 5:1.",
  sections:[
    { title:"¿Qué es la proporción 5:1?", body:"Por cada momento negativo (una crítica, un silencio frío, una discusión), las parejas que perduran tienen al menos 5 interacciones positivas. No significa evitar conflictos, sino construir un colchón de amor y buena voluntad." },
    { title:"Los niveles según Gottman", body:"0 a 5 interacciones positivas al día: zona de riesgo. 5 a 7: zona saludable. 7 a 12: parejas más unidas, su banco emocional está lleno." },
    { title:"¿Qué cuenta como interacción positiva?", body:"No hacen falta grandes gestos: un beso antes de salir, preguntar cómo estuvo el día y escuchar de verdad, un mensaje de 'te pienso', reírse juntos, decir gracias mirando a los ojos." },
    { title:"Cómo practicarlo hoy", body:"Pongan una alarma diaria llamada '5:1'. Cada vez que suene, busquen hacer una interacción positiva. No tiene que ser grandioso — los pequeños momentos son los más poderosos." },
  ],
  reflect:"¿Cuántas interacciones positivas creen que tienen al día? ¿Qué pequeño acto podrían agregar mañana?",
    illustrations:[
      "/lessons/lesson8-0.png",
    "/lessons/lesson8-1.png",
    "/lessons/lesson8-2.png",
    "/lessons/lesson8-3.png",
    "/lessons/lesson8-4.png",
    "/lessons/lesson8-5.png"
    ] },

  // ═══════════════════════════════════════════════════════════════════════════════
  // NUEVAS 5 LECCIONES BASADAS EN EVIDENCIA TERAPÉUTICA
  // ═══════════════════════════════════════════════════════════════════════════════

  { id:"cognitive_restructuring", emoji:"🧠", title:"Reestructuración Cognitiva",
  tag:"TCC · Terapia Cognitivo-Conductual",
  intro:"Nuestros pensamientos crean nuestras emociones. No es lo que pasa lo que nos hace sentir mal, sino cómo lo interpretamos. Aprender a cuestionar pensamientos automáticos cambia todo.",
  sections:[
    { title:"El triángulo TCC", icon:"🔺", body:"Pensamientos → Emociones → Comportamientos. Si cambias el pensamiento, cambia todo lo demás. Ejemplo: 'No me respondió' → 'Me ignora' → Enojo. Versión alternativa: 'No me respondió' → 'Está ocupado/a' → Calma." },
    { title:"Distorsiones cognitivas comunes", icon:"👓", body:"Lectura de mente: 'Sé lo que piensa'. Generalización: 'Siempre/Nunca'. Personalización: 'Es mi culpa'. Catastrofismo: 'Esto es un desastre'. Etiquetado: 'Es un egoísta'." },
    { title:"La técnica del detective", icon:"🔍", body:"Cuando tengas un pensamiento negativo, pregúntate: ¿Qué evidencia tengo a favor? ¿Y en contra? ¿Qué le diría a un amigo en esta situación? ¿Hay otra explicación posible?" },
    { title:"Práctica diaria", icon:"✍️", body:"Durante una semana, anota un pensamiento negativo que tengas sobre tu pareja. Luego busca 3 explicaciones alternativas más benevolentes. Observa cómo cambia tu emoción." },
  ],
  reflect:"¿Qué pensamiento negativo recurrente tienes sobre tu pareja? ¿Puedes encontrar 2 explicaciones alternativas más benevolentes?",
    illustrations:[
      "/lessons/cognitive_restructuring-0.png",
    "/lessons/cognitive_restructuring-1.png",
    "/lessons/cognitive_restructuring-2.png",
    "/lessons/cognitive_restructuring-3.png",
    "/lessons/cognitive_restructuring-4.png",
    "/lessons/cognitive_restructuring-5.png"
    ] },

  { id:"acceptance_commitment", emoji:"🌊", title:"Aceptación y Compromiso",
  tag:"ACT · Terapia de Aceptación y Compromiso",
  intro:"No podemos controlar nuestras emociones ni las de otros. Lo que sí podemos controlar es nuestra respuesta. ACT nos enseña a aceptar lo incómodo y actuar según nuestros valores.",
  sections:[
    { title:"Luchar contra la marea", icon:"🌊", body:"Intentar suprimir emociones negativas es como tratar de mantener una pelota bajo el agua: cansa y al final sale con más fuerza. La aceptación no es resignación — es dejar de gastar energía en lo que no controlas." },
    { title:"Defusión cognitiva", icon:"💭", body:"Tus pensamientos no son hechos. En lugar de 'mi pareja no me quiere', prueba: 'Tengo el pensamiento de que mi pareja no me quiere'. Crea distancia entre tú y tu pensamiento." },
    { title:"Valores vs metas", icon:"🎯", body:"Una meta es: 'Que mi pareja me hable más'. Un valor es: 'Ser alguien que escucha con empatía'. Los valores son tu brújula — guían tus acciones independientemente de lo que haga el otro." },
    { title:"El ejercicio de los 5 años", icon:"⏳", body:"Imagina que es tu aniversario de 5 años. ¿Qué tipo de pareja quieres haber sido? ¿Cómo quieres que te recuerden? Actúa desde ese lugar hoy, aunque sea difícil." },
  ],
  reflect:"¿En qué situación has estado luchando contra emociones? ¿Qué pasaría si simplemente las aceptaras y actuaras desde tus valores?",
    illustrations:[
      "/lessons/acceptance_commitment-0.png",
    "/lessons/acceptance_commitment-1.png",
    "/lessons/acceptance_commitment-2.png",
    "/lessons/acceptance_commitment-3.png",
    "/lessons/acceptance_commitment-4.png",
    "/lessons/acceptance_commitment-5.png"
    ] },

  { id:"emotional_regulation", emoji:"🎭", title:"Regulación Emocional",
  tag:"DBT · Terapia Dialéctica Conductual",
  intro:"Las emociones intensas pueden hacer que digamos o hagamos cosas que dañan la relación. DBT nos da herramientas concretas para bajar la intensidad y responder con sabiduría.",
  sections:[
    { title:"STOP: La técnica de emergencia", icon:"🛑", body:"S - Stop (detente). T - Take a breath (respira). O - Observe (observa qué pasa en ti). P - Proceed mindfully (actúa con consciencia). Úsala cuando sientas que vas a explotar." },
    { title:"La regla de los 20 minutos", icon:"⏱️", body:"Cuando estás emocionalmente activado, tu cuerpo necesita 20 minutos para volver a la normalidad. No intentes resolver nada antes. Sal, camina, respira. Vuelve cuando puedas pensar claro." },
    { title:"TIPP para crisis", icon:"🧊", body:"T - Temperatura (agua fría en la cara activa el buceo reflejo y calma). I - Intenso ejercicio (30 saltos, correr). P - Paced breathing (4-7-8). P - Progressive muscle relaxation (tensar y soltar músculos)." },
    { title:"Validación antes de cambiar", icon:"💚", body:"Antes de intentar solucionar un problema, valida: 'Entiendo que estás molesto/a, tiene sentido'. La validación no es acuerdo — es reconocer que las emociones tienen razón de ser. Baja la defensiva instantáneamente." },
  ],
  reflect:"¿Qué técnica de regulación crees que te serviría más? ¿Puedes practicarla esta semana?",
    illustrations:[
      "/lessons/emotional_regulation-0.png",
    "/lessons/emotional_regulation-1.png",
    "/lessons/emotional_regulation-2.png",
    "/lessons/emotional_regulation-3.png",
    "/lessons/emotional_regulation-4.png",
    "/lessons/emotional_regulation-5.png"
    ] },

  { id:"couples_communication", emoji:"💬", title:"Comunicación No Violenta",
  tag:"Rosenberg · Terapia de Pareja",
  intro:"Marshall Rosenberg creó un método para expresar lo que necesitamos sin atacar ni culpar. Cuatro pasos que transforman cualquier conversación difícil.",
  sections:[
    { title:"1. Observar sin evaluar", icon:"👁️", body:"Describe hechos sin juicio. NO: 'Nunca me ayudas'. SÍ: 'Esta semana lavé los platos 5 veces'. La evaluación genera defensiva; la observación abre espacio para escuchar." },
    { title:"2. Identificar sentimientos", icon:"💙", body:"Expresa cómo te sientes. NO: 'Me haces sentir ignorado'. SÍ: 'Me siento sola cuando pasamos poco tiempo juntos'. Los sentimientos son tuyos, no culpas al otro." },
    { title:"3. Reconocer necesidades", icon:"🌱", body:"Detrás de cada emoción hay una necesidad. 'Me siento sola' = necesito conexión. 'Me siento frustrado' = necesito apoyo. Expresa tu necesidad sin exigir que sea ella/él quien la satisfaga." },
    { title:"4. Pedir concretamente", icon:"🙏", body:"Pide algo específico, accionable y negociable. NO: 'Quiero que me quieras más'. SÍ: '¿Podríamos tener 20 minutos de charla sin teléfonos esta noche?'" },
  ],
  reflect:"Piensa en algo que te molesta de tu pareja. ¿Puedes reformularlo usando los 4 pasos de la CNV?",
    illustrations:[
      "/lessons/couples_communication-0.png",
    "/lessons/couples_communication-1.png",
    "/lessons/couples_communication-2.png",
    "/lessons/couples_communication-3.png",
    "/lessons/couples_communication-4.png",
    "/lessons/couples_communication-5.png"
    ] },

  { id:"intimacy_vulnerability", emoji:"🔓", title:"La Valentía de Ser Vulnerable",
  tag:"Brené Brown · Terapia Emocional",
  intro:"La intimidad no es física — es emocional. Es dejarse ver tal como somos, con miedos e imperfecciones. Brené Brown dice que la vulnerabilidad es el birthplace de la conexión, la empatía y el amor.",
  sections:[
    { title:"El mito de la fortaleza", icon:"🏰", body:"Creemos que mostrar debilidad nos hace menos atractivos. Lo opuesto es verdad: la vulnerabilidad genera cercanía. Cuando dices 'tengo miedo de perderte', no te haces débil — te haces humano y accesible." },
    { title:"Micro-momentos de vulnerabilidad", icon:"✨", body:"No hace falta una confesión dramática. Compartir: 'Hoy me sentí inseguro en el trabajo', 'Me da miedo envejecer', 'A veces pienso que no soy suficiente para ti'. Pequeñas ventanas que invitan a acercarse." },
    { title:"Responder a la vulnerabilidad", icon:"🤲", body:"Cuando tu pareja se abre, responde con presencia, no con soluciones. No digas 'no es para tanto'. Di: 'Gracias por contarme', 'Entiendo por qué eso es difícil', 'Estoy aquí'." },
    { title:"El ciclo de la intimidad", icon:"🔄", body:"Me abro → Me respondes con empatía → Siento que puedo confiar → Me abro más → Nos acercamos más. Romper el ciclo en cualquier punto lo frena todo. La clave: arriesgarse a ser el primero en abrirse." },
  ],
  reflect:"¿Cuándo fue la última vez que te mostraste vulnerable con tu pareja? ¿Cómo respondió? ¿Qué pequeña cosa podrías compartir hoy?",
    illustrations:[
      "/lessons/intimacy_vulnerability-0.png",
    "/lessons/intimacy_vulnerability-1.png",
    "/lessons/intimacy_vulnerability-2.png",
    "/lessons/intimacy_vulnerability-3.png",
    "/lessons/intimacy_vulnerability-4.png",
    "/lessons/intimacy_vulnerability-5.png"
    ] }
];

// ═══════════════════════════════════════════════
// RELATIONSHIP TEST SCREEN
// ═══════════════════════════════════════════════
function RelTest({ user, onDone, onLater }) {
  const nameParts = String(user?.names || "")
    .split("&")
    .map((s) => s.trim())
    .filter(Boolean);
  const nameA = nameParts[0] || "Persona A";
  const nameB = nameParts[1] || "Persona B";
  const safeCode = String(user?.code || "").trim().toUpperCase();
  const isOwner = user?.isOwner !== false; // owner = Panda A
  const myKey = isOwner ? "owner" : "partner";
  const otherKey = isOwner ? "partner" : "owner";
  const myName = isOwner ? nameA : nameB;
  const otherName = isOwner ? nameB : nameA;

  const [step, setStep] = useState(0);
  const [myScores, setMyScores] = useState({});
  const [testData, setTestData] = useState(null);
  const [saving, setSaving] = useState(false);
  const isGuest = user?.isGuest || !safeCode;
  const hasValidAreas = Array.isArray(TEST_AREAS) && TEST_AREAS.length > 0;

  // Listen to test doc in Firebase (or just local for guests)
  useEffect(() => {
    if (isGuest) return;
    const unsub = fbListenTest(safeCode, data => setTestData(data));
    return () => unsub();
  }, [isGuest, safeCode]);

  const myDoneKey = `${myKey}Done`;
  const otherDoneKey = `${otherKey}Done`;
  const iMyDone = testData?.[myDoneKey] === true;
  const iOtherDone = testData?.[otherDoneKey] === true;
  const bothDone = iMyDone && iOtherDone;

  const area = hasValidAreas ? (TEST_AREAS[step] || TEST_AREAS[0]) : null;
  const myScore = myScores[area?.id];
  const canNext = myScore != null;

  const setScore = (val) => {
    if (!area?.id) return;
    setMyScores(s => ({ ...s, [area.id]: val }));
  };

  const next = () => {
    if (!hasValidAreas) return;
    if (step < TEST_AREAS.length - 1) setStep(s => s + 1);
    else submitMyAnswers();
  };

  const submitMyAnswers = async () => {
    setSaving(true);
    try {
      if (!isGuest) {
        await fbSaveTestAnswers(safeCode, myKey, myScores).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  };

  if (!hasValidAreas || !area) {
    return (
      <div style={{ minHeight:"100vh", background:C.sandL, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px", fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.dark, fontSize:"1.2rem", marginBottom:8 }}>No pudimos cargar el test</div>
        <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, maxWidth:320 }}>Intenta salir y volver a entrar. Si sigue pasando, avísame y lo depuramos contigo paso a paso.</div>
      </div>
    );
  }

  // Results screen — both done
  const guestDone = isGuest && Object.keys(myScores).length === TEST_AREAS.length;

  if (bothDone || guestDone) {
    const ownerScores = isGuest ? myScores : (testData?.owner || {});
    const partnerScores = isGuest ? myScores : (testData?.partner || {});
    // Build combined scores for onDone
    const combinedScores = {};
    TEST_AREAS.forEach(a => { combinedScores[a.id] = { a: ownerScores[a.id] || 3, b: partnerScores[a.id] || 3 }; });

    const diagnosis = buildTestDiagnosis(combinedScores);
    const { prognosis, progColor, progEmoji } = diagnosis;

    return (
      <div style={{ minHeight:"100vh", background:C.sandL, padding:"32px 20px 80px", fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:"3rem", marginBottom:8 }}>{progEmoji}</div>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.7rem", color:C.dark, marginBottom:6 }}>Su diagnóstico inicial</div>
          <div style={{ width:48, height:6, borderRadius:50, background:progColor, margin:"0 auto 12px" }} />
          <div style={{ fontSize:"0.9rem", color:C.inkM, lineHeight:1.6, maxWidth:320, margin:"0 auto" }}>{prognosis}</div>
        </div>
        <TestDiagnosisCards diagnosis={diagnosis} />
        <button onClick={() => onDone(combinedScores)} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:16, fontFamily:"'Baloo 2',sans-serif", fontSize:"1.1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>
          Comenzar juntos 🐼
        </button>
      </div>
    );
  }

  // Waiting screen — I'm done, waiting for partner
  if (iMyDone && !bothDone && !isGuest) {
    return (
      <div style={{ minHeight:"100vh", background:C.sandL, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 20px", fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ fontSize:"3.5rem", marginBottom:16, animation:"float 3s ease-in-out infinite" }}>🐼</div>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.5rem", color:C.dark, marginBottom:8, textAlign:"center" }}>
          ¡Ya contestaste! 🌿
        </div>
        <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, marginBottom:24, maxWidth:300 }}>
          Esperando a que <strong>{otherName}</strong> complete su parte...
        </div>
        <div style={{ background:C.white, borderRadius:18, padding:18, border:`1.5px solid ${C.border}`, width:"100%", maxWidth:340, textAlign:"center" }}>
          <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, letterSpacing:"0.6px", marginBottom:10 }}>COMPARTE ESTE CÓDIGO</div>
            <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"2rem", letterSpacing:8, color:C.dark, marginBottom:10 }}>{safeCode || "----"}</div>
          <Btn onClick={() => { 
              const c = safeCode;
              if(navigator.clipboard) { navigator.clipboard.writeText(c).then(()=>showToast("Código copiado: "+c)).catch(()=>showToast("Tu código: "+c)); }
              else { showToast("Tu código: "+c); }
            }} variant="sand" style={{ width:"100%" }}>Copiar código 📋</Btn>
        </div>
        <div style={{ fontSize:"0.75rem", color:C.inkL, marginTop:20, textAlign:"center", maxWidth:300 }}>
          Cuando {otherName} termine, verás los resultados en el jardín.
        </div>
        {onLater && <Btn onClick={onLater} style={{ width:"100%", maxWidth:340, marginTop:16 }}>Ir al jardín mientras tanto</Btn>}
      </div>
    );
  }

  // My turn to answer
  return (
    <div style={{ minHeight:"100vh", background:C.sandL, display:"flex", flexDirection:"column", fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:C.dark, padding:"44px 20px 20px" }}>
        <div style={{ display:"flex", gap:5, marginBottom:12 }}>
          {(TEST_AREAS || []).map((a,i) => (
            <div key={a.id} style={{ flex:1, height:4, borderRadius:50,
              background: i < step ? C.olive : i === step ? C.oliveL : "rgba(255,255,255,0.2)" }}/>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:"0.72rem", color:`${C.cream}88`, fontWeight:800, letterSpacing:"0.6px" }}>
            ÁREA {step+1} DE {TEST_AREAS.length} · {myName.toUpperCase()}
          </div>
          {onLater && <div onClick={onLater} style={{ fontSize:"0.72rem", color:`${C.cream}aa`, fontWeight:800, cursor:"pointer" }}>Hacerlo después →</div>}
        </div>
      </div>

      <div style={{ flex:1, padding:"24px 20px" }}>
        <div style={{ background: isOwner ? "#fce8d8" : "#d8ece8", borderRadius:12, padding:"10px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:10, border:`1.5px solid ${isOwner ? "#e8907a40" : "#4a9a8a40"}` }}>
          <div style={{ fontSize:"1.4rem" }}>{isOwner ? "🐼" : "🐾"}</div>
          <div>
            <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", color:C.dark }}>Tus respuestas son privadas</div>
            <div style={{ fontSize:"0.72rem", color:C.inkL, fontWeight:700 }}>Solo verán el resultado combinado al final</div>
          </div>
        </div>

        <div style={{ fontSize:"1.8rem", textAlign:"center", marginBottom:10 }}>{area.emoji}</div>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.35rem", color:C.dark, textAlign:"center", marginBottom:6 }}>{area.label}</div>
        <div style={{ fontSize:"0.84rem", color:C.inkL, textAlign:"center", marginBottom:8 }}>{area.sub}</div>
        <div style={{ fontSize:"1rem", color:C.inkM, textAlign:"center", lineHeight:1.6, marginBottom:28, fontWeight:700 }}>{area.q}</div>

        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} onClick={() => setScore(i)}
              style={{ flex:1, aspectRatio:"1", borderRadius:14, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", cursor:"pointer",
                background: myScore === i ? TEST_COLORS[i-1] : C.white,
                border: `2px solid ${myScore === i ? TEST_COLORS[i-1] : C.border}`,
                boxShadow: myScore === i ? `0 4px 0 ${TEST_COLORS[i-1]}80` : `0 2px 0 ${C.border}`,
                transition:"all 0.15s", transform: myScore === i ? "translateY(-3px)" : "none" }}>
              <div style={{ fontSize:"1.5rem", marginBottom:2 }}>
                {["😞","😕","😐","🙂","😊"][i-1]}
              </div>
              <div style={{ fontSize:"0.6rem", fontWeight:800, color: myScore === i ? "white" : C.inkL, textAlign:"center", lineHeight:1.2 }}>
                {TEST_LABELS[i-1]}
              </div>
            </div>
          ))}
        </div>

        <button onClick={next} disabled={!canNext || saving}
          style={{ width:"100%", background: canNext ? C.dark : C.sand, color: canNext ? C.cream2 : C.inkL,
            border:"none", borderRadius:14, padding:15, fontFamily:"'Baloo 2',sans-serif", fontSize:"1.05rem",
            cursor: canNext ? "pointer" : "default", boxShadow: canNext ? "0 4px 0 rgba(0,0,0,0.2)" : "none",
            marginTop:8, transition:"all 0.2s" }}>
          {saving ? "Guardando..." : step < TEST_AREAS.length - 1 ? "Siguiente área →" : "Enviar mis respuestas ✨"}
        </button>
      </div>
    </div>
  );
}


function LeccionDia({ lessonsDone, onComplete }) {
  const [open, setOpen] = useState(null);
  const [reading, setReading] = useState(false);
  const [section, setSection] = useState(0);

  // Pick today's lesson based on day of year
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const todayLesson = DAILY_LESSONS[dayOfYear % DAILY_LESSONS.length];
  const todayDone = lessonsDone?.[todayLesson.id];

  const openLesson = (lesson) => { setOpen(lesson); setReading(true); setSection(0); };

  if (reading && open) {
    const isDone = lessonsDone?.[open.id];
    return (
      <div style={{ background:C.sandL, minHeight:"100vh", paddingBottom:80 }}>
        <div style={{ background:C.dark, padding:"44px 20px 24px" }}>
          <button onClick={() => setReading(false)} style={{ background:"none", border:"none", color:C.cream2, fontSize:"1.5rem", cursor:"pointer", marginBottom:10, display:"block" }}>←</button>
          <div style={{ fontSize:"2.5rem", marginBottom:6 }}>{open.emoji}</div>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.5rem", color:C.cream2, marginBottom:4 }}>{open.title}</div>
          <span style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"3px 10px", fontSize:"0.72rem", fontWeight:800 }}>{open.tag}</span>
        </div>

        <div style={{ padding:"16px 16px 0" }}>
          <div style={{ background:"#e8f4e8", borderRadius:16, padding:16, marginBottom:16, border:`1px solid ${C.olive}30` }}>
            <div style={{ fontSize:"0.88rem", color:C.inkM, lineHeight:1.75, fontStyle:"italic" }}>"{open.intro}"</div>
          </div>

          {open.sections.map((s, i) => (
            <div key={i} style={{ background:C.white, borderRadius:16, padding:16, marginBottom:10, border:`1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", color:C.dark, marginBottom:6 }}>
                {s.icon} {s.title}
              </div>
              <div style={{ fontSize:"0.88rem", color:C.inkM, lineHeight:1.7 }}>{s.body}</div>
            </div>
          ))}

          <div style={{ background:"#fff8e0", borderRadius:16, padding:16, marginBottom:20, border:`1.5px solid #e8d840` }}>
            <div style={{ fontSize:"0.7rem", fontWeight:800, color:"#9a8020", marginBottom:6, letterSpacing:"0.6px" }}>🤔 REFLEXIONEN JUNTOS</div>
            <div style={{ fontSize:"0.9rem", color:C.ink, lineHeight:1.7, fontWeight:700 }}>{open.reflect}</div>
          </div>

          {!isDone ? (
            <button onClick={() => { onComplete(open.id); setReading(false); }}
              style={{ width:"100%", background:C.olive, color:C.cream2, border:"none", borderRadius:14, padding:16,
                fontFamily:"'Baloo 2',sans-serif", fontSize:"1.05rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>
              ✓ Leímos esto juntos · +10 bambú 🌿
            </button>
          ) : (
            <div style={{ textAlign:"center", background:C.cream, borderRadius:14, padding:14, border:`1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.olive, marginBottom:6 }}>✓ Ya la completaste</div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <div style={{ fontSize:"0.75rem", fontWeight:800, color: lessonsDone?.[open?.id]?.owner ? C.olive : C.sand }}>🐼 Persona A {lessonsDone?.[open?.id]?.owner ? "✓" : "pendiente"}</div>
                <div style={{ fontSize:"0.75rem", fontWeight:800, color: lessonsDone?.[open?.id]?.partner ? C.teal : C.sand }}>🐾 Persona B {lessonsDone?.[open?.id]?.partner ? "✓" : "pendiente"}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:C.sandL, minHeight:"100vh", paddingBottom:80 }}>
      <div style={{ background:C.dark, padding:"44px 20px 24px" }}>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.9rem", color:C.cream2 }}>Lecciones</div>
        <div style={{ color:`${C.cream}88`, fontSize:"0.86rem", fontWeight:600, marginTop:4 }}>Psicología de parejas · +10 bambú cada una 🌿</div>
      </div>

      {/* Today's lesson highlight */}
      <div style={{ margin:"14px 14px 0" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.6px", marginBottom:8 }}>📅 LECCIÓN DE HOY</div>
        <div onClick={() => openLesson(todayLesson)}
          style={{ background: todayDone ? C.cream : C.dark, borderRadius:20, padding:20, cursor:"pointer",
            boxShadow:`0 4px 0 ${todayDone?C.border:"rgba(0,0,0,0.25)"}`, border:`1.5px solid ${todayDone?C.border:C.dark}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:"2.5rem" }}>{todayLesson.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.15rem", color: todayDone ? C.ink : C.cream2 }}>{todayLesson.title}</div>
              <div style={{ fontSize:"0.75rem", color: todayDone ? C.inkL : `${C.cream}88`, fontWeight:700, marginTop:3 }}>{todayLesson.tag}</div>
            </div>
            {todayDone
              ? <div style={{ background:C.olive, color:C.cream2, borderRadius:8, padding:"4px 10px", fontSize:"0.72rem", fontWeight:800 }}>✓ Hecha</div>
              : <div style={{ background:C.oliveL, color:C.cream2, borderRadius:8, padding:"4px 10px", fontSize:"0.72rem", fontWeight:800 }}>+10 🌿</div>}
          </div>
        </div>
      </div>

      {/* All lessons */}
      <div style={{ padding:"16px 14px 0" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, letterSpacing:"0.6px", marginBottom:10 }}>📚 TODAS LAS LECCIONES</div>
        {DAILY_LESSONS.map(lesson => {
          const done = lessonsDone?.[lesson.id];
          const isToday = lesson.id === todayLesson.id;
          return (
            <div key={lesson.id} onClick={() => openLesson(lesson)}
              style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10, cursor:"pointer",
                border:`1.5px solid ${isToday?C.olive:C.border}`, boxShadow:`0 2px 0 ${C.border}`,
                opacity: done ? 0.75 : 1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:"1.8rem" }}>{lesson.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", color:C.dark }}>{lesson.title}</div>
                  <div style={{ fontSize:"0.72rem", color:C.inkL, fontWeight:700, marginTop:2 }}>{lesson.tag}</div>
                </div>
                {done
                  ? <div style={{ color:C.olive, fontWeight:800, fontSize:"0.8rem" }}>✓</div>
                  : <div style={{ background:C.sandL, color:C.olive, borderRadius:7, padding:"3px 8px", fontSize:"0.68rem", fontWeight:800 }}>+10 🌿</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const current = OB[i];
  const isLast = i === OB.length - 1;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f5edd8 0%, #e8dcb8 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        {/* Icono grande */}
        <div style={{ animation: "float 3s ease-in-out infinite", marginBottom: 20, fontSize: "5rem" }}>
          {current.icon}
        </div>

        {/* Título */}
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.6rem", color: C.dark, marginBottom: 12 }}>
          {current.title}
        </div>

        {/* Body */}
        <div style={{ color: C.inkM, lineHeight: 1.7, marginBottom: 28, fontFamily: "'Nunito',sans-serif", fontSize: "1rem" }}>
          {current.body}
        </div>

        {/* Indicadores de progreso */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          {OB.map((_, j) => (
            <div key={j} style={{
              width: j === i ? 28 : 8,
              height: 8,
              borderRadius: 50,
              background: j === i ? C.dark : C.border,
              transition: "all 0.3s"
            }} />
          ))}
        </div>

        {/* Botones */}
        {!isLast ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={onDone} style={{
              background: "none", border: "none", color: C.inkL, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", padding: "10px 0"
            }}>
              Saltar
            </button>
            <button onClick={() => setI(i + 1)} style={{
              background: C.dark, color: C.cream2, border: "none", borderRadius: 14,
              padding: "14px 28px", fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem",
              cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.2)"
            }}>
              Siguiente →
            </button>
          </div>
        ) : (
          <button onClick={onDone} style={{
            width: "100%", background: C.olive, color: C.cream2, border: "none",
            borderRadius: 14, padding: "16px", fontFamily: "'Baloo 2',sans-serif",
            fontSize: "1.15rem", cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.2)"
          }}>
            Comenzar juntos 💜
          </button>
        )}

        {/* Progreso numérico */}
        <div style={{ marginTop: 20, fontSize: "0.8rem", color: C.inkL, fontWeight: 600 }}>
          {i + 1} de {OB.length}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// JUEGOS — Memoria sincronizada y Scrabble
// ═══════════════════════════════════════════════════════════════════════════════
function Juegos({ onBack, user }) {
  const [selectedGame, setSelectedGame] = useState(null);

  if (selectedGame === "memoria") {
    return <JuegoMemoria onBack={() => setSelectedGame(null)} user={user} />;
  }
  if (selectedGame === "scrabble") {
    return <JuegoScrabble onBack={() => setSelectedGame(null)} user={user} />;
  }

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "44px 20px 24px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.cream2, marginBottom: 4 }}>
          🎮 Juegos para parejas
        </div>
        <div style={{ fontSize: "0.85rem", color: `${C.cream}88` }}>
          Diviértete y conecta con tu pareja
        </div>
      </div>

      <div style={{ padding: "16px 14px 0" }}>
        {/* Memoria sincronizada */}
        <div
          onClick={() => setSelectedGame("memoria")}
          style={{
            background: C.white,
            borderRadius: 18,
            padding: "18px 16px",
            marginBottom: 12,
            border: `1.5px solid ${C.border}`,
            boxShadow: `0 3px 0 ${C.border}`,
            cursor: "pointer",
            transition: "transform 0.2s"
          }}
        >
          <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>🧠</div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", color: C.dark, marginBottom: 4 }}>
            Memoria sincronizada
          </div>
          <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5 }}>
            Encuentra pares de cartas juntos. ¡Quien encuentre más gana!
          </div>
        </div>

        {/* Scrabble */}
        <div
          onClick={() => setSelectedGame("scrabble")}
          style={{
            background: C.white,
            borderRadius: 18,
            padding: "18px 16px",
            marginBottom: 12,
            border: `1.5px solid ${C.border}`,
            boxShadow: `0 3px 0 ${C.border}`,
            cursor: "pointer",
            transition: "transform 0.2s"
          }}
        >
          <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>🔤</div>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", color: C.dark, marginBottom: 4 }}>
            Scrabble de parejas
          </div>
          <div style={{ fontSize: "0.8rem", color: C.inkM, lineHeight: 1.5 }}>
            Forma palabras con letras limitadas. ¡Más puntos por palabras románticas!
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// JUEGO 1: MEMORIA SINCRONIZADA
// ═══════════════════════════════════════════════════════════════════════════════
const EMOJIS_MEMORIA = ["❤️", "💋", "🌹", "💍", "🎁", "🍫", "🥂", "🌙"];

function JuegoMemoria({ onBack, user }) {
  const names = user?.names?.split("&") || ["Jugador 1", "Jugador 2"];
  const nameA = names[0]?.trim() || "Jugador 1";
  const nameB = names[1]?.trim() || "Jugador 2";

  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [turn, setTurn] = useState(0); // 0 = jugador A, 1 = jugador B
  const [scores, setScores] = useState([0, 0]);
  const [gameOver, setGameOver] = useState(false);
  const [showInstrucciones, setShowInstrucciones] = useState(true);
  const [historial, setHistorial] = useState(() => {
    const saved = localStorage.getItem(`mochi_memoria_historial_${user?.email || 'guest'}`);
    return saved ? JSON.parse(saved) : { [nameA]: 0, [nameB]: 0 };
  });

  // Guardar historial cuando cambia
  useEffect(() => {
    localStorage.setItem(`mochi_memoria_historial_${user?.email || 'guest'}`, JSON.stringify(historial));
  }, [historial, user?.email]);

  useEffect(() => {
    // Crear pares de cartas
    const pairs = [...EMOJIS_MEMORIA, ...EMOJIS_MEMORIA];
    const shuffled = pairs.sort(() => Math.random() - 0.5).map((emoji, i) => ({
      id: i,
      emoji,
      isFlipped: false,
      isMatched: false
    }));
    setCards(shuffled);
  }, []);

  const handleCardClick = (id) => {
    if (flipped.length === 2) return;
    if (matched.includes(id)) return;
    if (flipped.includes(id)) return;

    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      const [first, second] = newFlipped;
      const firstCard = cards.find(c => c.id === first);
      const secondCard = cards.find(c => c.id === second);

      if (firstCard.emoji === secondCard.emoji) {
        // Match!
        setTimeout(() => {
          setMatched([...matched, first, second]);
          setFlipped([]);
          const newScores = [...scores];
          newScores[turn]++;
          setScores(newScores);

          if (matched.length + 2 === cards.length) {
            setGameOver(true);
            // Actualizar historial
            const winner = newScores[0] > newScores[1] ? nameA : newScores[1] > newScores[0] ? nameB : null;
            if (winner) {
              setHistorial(prev => ({ ...prev, [winner]: (prev[winner] || 0) + 1 }));
            }
          }
        }, 500);
      } else {
        // No match - cambiar turno
        setTimeout(() => {
          setFlipped([]);
          setTurn(turn === 0 ? 1 : 0);
        }, 1000);
      }
    }
  };

  const resetGame = () => {
    const pairs = [...EMOJIS_MEMORIA, ...EMOJIS_MEMORIA];
    const shuffled = pairs.sort(() => Math.random() - 0.5).map((emoji, i) => ({
      id: i,
      emoji,
      isFlipped: false,
      isMatched: false
    }));
    setCards(shuffled);
    setFlipped([]);
    setMatched([]);
    setTurn(0);
    setScores([0, 0]);
    setGameOver(false);
  };

  if (showInstrucciones) {
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2 }}>🧠 Memoria</div>
        </div>

        <div style={{ padding: "20px 16px" }}>
          <div style={{ background: C.white, borderRadius: 16, padding: "20px", marginBottom: 16, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", color: C.dark, marginBottom: 12 }}>
              📋 Cómo jugar
            </div>
            <div style={{ fontSize: "0.9rem", color: C.inkM, lineHeight: 1.7 }}>
              <p>1. <strong>Juegan juntos:</strong> Este juego es para jugar los dos en el mismo celular, cuando estén juntos.</p>
              <p>2. <strong>Turnos alternados:</strong> {nameA} y {nameB} se turnan para voltear cartas.</p>
              <p>3. <strong>Encuentra pares:</strong> Voltea dos cartas. Si son iguales, ¡sumas punto y sigues!</p>
              <p>4. <strong>Cambia turno:</strong> Si no coinciden, pasa el celular a tu pareja.</p>
              <p>5. <strong>Gana:</strong> Quien encuentre más pares al final.</p>
            </div>
          </div>

          {/* Historial */}
          <div style={{ background: C.cream, borderRadius: 16, padding: "16px", marginBottom: 16, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1rem", color: C.dark, marginBottom: 10 }}>
              🏆 Victorias
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, textAlign: "center", background: C.white, borderRadius: 10, padding: "10px" }}>
                <div style={{ fontSize: "0.8rem", color: C.inkL }}>{nameA}</div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.dark }}>{historial[nameA] || 0}</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", background: C.white, borderRadius: 10, padding: "10px" }}>
                <div style={{ fontSize: "0.8rem", color: C.inkL }}>{nameB}</div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.dark }}>{historial[nameB] || 0}</div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowInstrucciones(false)}
            style={{
              width: "100%",
              background: C.dark,
              color: C.cream2,
              border: "none",
              borderRadius: 14,
              padding: "16px",
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "1.1rem",
              cursor: "pointer"
            }}
          >
            ¡Empezar a jugar! 🎮
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2 }}>🧠 Memoria</div>
        <div style={{ fontSize: "0.8rem", color: `${C.cream}88` }}>Turno de: {turn === 0 ? nameA : nameB}</div>
      </div>

      <div style={{ padding: "16px 14px" }}>
        {/* Marcador */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: turn === 0 ? C.olive : C.white, borderRadius: 12, padding: "12px", textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.75rem", color: turn === 0 ? C.cream : C.inkL }}>{nameA}</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: turn === 0 ? C.cream2 : C.dark }}>{scores[0]}</div>
          </div>
          <div style={{ flex: 1, background: turn === 1 ? C.olive : C.white, borderRadius: 12, padding: "12px", textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.75rem", color: turn === 1 ? C.cream : C.inkL }}>{nameB}</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: turn === 1 ? C.cream2 : C.dark }}>{scores[1]}</div>
          </div>
        </div>

        {/* Grid de cartas */}
        {!gameOver ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {cards.map((card) => {
              const isFlipped = flipped.includes(card.id) || matched.includes(card.id);
              return (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(card.id)}
                  style={{
                    aspectRatio: "1",
                    background: isFlipped ? C.white : C.olive,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                    cursor: matched.includes(card.id) ? "default" : "pointer",
                    border: `2px solid ${matched.includes(card.id) ? "#4a9a40" : C.border}`,
                    boxShadow: `0 3px 0 ${matched.includes(card.id) ? "#4a9a40" : C.border}`,
                    opacity: matched.includes(card.id) ? 0.6 : 1,
                    transition: "all 0.3s"
                  }}
                >
                  {isFlipped ? card.emoji : "💜"}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "4rem", marginBottom: 16 }}>🏆</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.dark, marginBottom: 8 }}>
              ¡Juego terminado!
            </div>
            <div style={{ fontSize: "1.1rem", color: C.inkM, marginBottom: 12 }}>
              {scores[0] > scores[1] ? `¡Ganó ${nameA}!` : scores[1] > scores[0] ? `¡Ganó ${nameB}!` : "¡Empate!"}
            </div>
            {/* Historial actualizado */}
            <div style={{ background: C.cream, borderRadius: 12, padding: "12px", marginBottom: 20, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "0.8rem", color: C.inkL, marginBottom: 6 }}>Victorias totales:</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <div><strong>{nameA}:</strong> {historial[nameA] || 0}</div>
                <div>|</div>
                <div><strong>{nameB}:</strong> {historial[nameB] || 0}</div>
              </div>
            </div>
            <button
              onClick={resetGame}
              style={{
                background: C.dark,
                color: C.cream2,
                border: "none",
                borderRadius: 14,
                padding: "14px 28px",
                fontFamily: "'Baloo 2',sans-serif",
                fontSize: "1rem",
                cursor: "pointer"
              }}
            >
              Jugar otra vez 🔄
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// JUEGO 2: SCRABBLE MEJORADO
// ═══════════════════════════════════════════════════════════════════════════════
// Diccionario básico de palabras válidas (las más comunes en español)
const DICCIONARIO_PALABRAS = [
  "AMOR", "BESO", "CASA", "DIA", "FLOR", "GATO", "HOLA", "ISLA", "JUGO", "LUNA",
  "MANO", "NIÑO", "OSO", "PAZ", "QUESO", "ROSA", "SOL", "TE", "UNO", "VIDA",
  "AGUA", "BARCO", "CIELO", "DULCE", "ESTRELLA", "FUEGO", "GUITARRA", "HIELO",
  "IGLESIA", "JARDIN", "KIWI", "LIMON", "MONTAÑA", "NUBE", "OCEANO", "PALMA",
  "QUESADILLA", "RATON", "SILLA", "TIGRE", "UVA", "VACA", "WIFI", "XILOFONO",
  "YOGUR", "ZAPATO", "ABRAZO", "CORAZON", "FELIZ", "FAMILIA", "AMIGO", "NOVIO",
  "NOVIA", "PAREJA", "BODA", "REGALO", "FLORES", "CENA", "BESOS", "CARIÑO",
  "TEAMO", "BELLA", "GUAPO", "LINDA", "HERMOSA", "DIVINA", "ENCANTO", "SUEÑO",
  "FUTURO", "HOGAR", "NIÑOS", "PERRO", "GATO", "PLAYA", "VIAJE", "MUSICA",
  "BAILE", "CANTO", "RISA", "ALEgria", "SUERTE", "EXITO", "META", "LOGRO"
];

const VOCALES = ["A", "E", "I", "O", "U"];
const CONSONANTES = ["B", "C", "D", "F", "G", "H", "J", "L", "M", "N", "Ñ", "P", "R", "S", "T", "V", "Y", "Z"];

function JuegoScrabble({ onBack, user }) {
  const names = user?.names?.split("&") || ["Jugador 1", "Jugador 2"];
  const nameA = names[0]?.trim() || "Jugador 1";
  const nameB = names[1]?.trim() || "Jugador 2";

  const [letrasJugadorA, setLetrasJugadorA] = useState([]);
  const [letrasJugadorB, setLetrasJugadorB] = useState([]);
  const [turno, setTurno] = useState(0); // 0 = A, 1 = B
  const [palabraActual, setPalabraActual] = useState([]);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [palabrasA, setPalabrasA] = useState([]);
  const [palabrasB, setPalabrasB] = useState([]);
  const [cambiosRestantes, setCambiosRestantes] = useState([3, 3]); // 3 cambios por jugador
  const [showInstrucciones, setShowInstrucciones] = useState(true);

  // Generar letras asegurando que haya al menos 2 vocales
  const generarLetras = () => {
    const letras = [];
    // Al menos 2 vocales
    for (let i = 0; i < 2; i++) {
      letras.push(VOCALES[Math.floor(Math.random() * VOCALES.length)]);
    }
    // El resto aleatorio
    while (letras.length < 7) {
      const todas = [...VOCALES, ...CONSONANTES];
      letras.push(todas[Math.floor(Math.random() * todas.length)]);
    }
    return letras.sort(() => Math.random() - 0.5);
  };

  useEffect(() => {
    setLetrasJugadorA(generarLetras());
    setLetrasJugadorB(generarLetras());
  }, []);

  const letrasActuales = turno === 0 ? letrasJugadorA : letrasJugadorB;
  const setLetrasActuales = turno === 0 ? setLetrasJugadorA : setLetrasJugadorB;

  const agregarLetra = (letra, index) => {
    setPalabraActual([...palabraActual, { letra, index }]);
    const nuevas = [...letrasActuales];
    nuevas.splice(index, 1);
    setLetrasActuales(nuevas);
  };

  const quitarLetra = (i) => {
    const { letra, index } = palabraActual[i];
    const nuevaPalabra = [...palabraActual];
    nuevaPalabra.splice(i, 1);
    setPalabraActual(nuevaPalabra);
    
    // Devolver la letra a su posición original
    const nuevas = [...letrasActuales];
    nuevas.splice(index, 0, letra);
    setLetrasActuales(nuevas);
  };

  const calcularPuntos = (palabra) => {
    const puntosLetra = { A:1, E:1, I:1, O:1, U:1, N:1, R:1, S:1, T:1, L:1, 
                          D:2, G:2, B:3, C:3, M:3, P:3, F:4, H:4, V:4, Y:4, 
                          J:8, K:8, Ñ:8, Q:8, W:8, X:10, Z:10 };
    return palabra.split("").reduce((sum, l) => sum + (puntosLetra[l] || 1), 0);
  };

  const validarPalabra = () => {
    const palabra = palabraActual.map(p => p.letra).join("");
    
    if (palabra.length < 2) {
      setMensaje("Mínimo 2 letras");
      return;
    }

    if (!DICCIONARIO_PALABRAS.includes(palabra)) {
      setMensaje(`"${palabra}" no es una palabra válida`);
      return;
    }

    const puntos = calcularPuntos(palabra);
    
    if (turno === 0) {
      setScoreA(scoreA + puntos);
      setPalabrasA([...palabrasA, palabra]);
    } else {
      setScoreB(scoreB + puntos);
      setPalabrasB([...palabrasB, palabra]);
    }

    setMensaje(`¡${palabra}! +${puntos} pts`);
    setPalabraActual([]);
    
    // Reponer letras
    const nuevas = [...letrasActuales];
    while (nuevas.length < 7) {
      const todas = [...VOCALES, ...CONSONANTES];
      nuevas.push(todas[Math.floor(Math.random() * todas.length)]);
    }
    setLetrasActuales(nuevas);
  };

  const cambiarLetras = () => {
    if (cambiosRestantes[turno] <= 0) {
      setMensaje("No te quedan cambios");
      return;
    }
    
    const nuevosCambios = [...cambiosRestantes];
    nuevosCambios[turno]--;
    setCambiosRestantes(nuevosCambios);
    
    // Devolver letras de la palabra actual
    const letrasDevueltas = palabraActual.map(p => p.letra);
    const nuevas = [...letrasActuales, ...letrasDevueltas];
    
    // Cambiar todas las letras
    setLetrasActuales(generarLetras());
    setPalabraActual([]);
    setMensaje(`Cambiaste todas tus letras (${nuevosCambios[turno]} restantes)`);
  };

  const pasarTurno = () => {
    // Devolver letras de la palabra actual
    const letrasDevueltas = palabraActual.map(p => p.letra);
    const nuevas = [...letrasActuales, ...letrasDevueltas];
    setLetrasActuales(nuevas);
    
    setPalabraActual([]);
    setTurno(turno === 0 ? 1 : 0);
    setMensaje("");
  };

  if (showInstrucciones) {
    return (
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2 }}>🔤 Scrabble</div>
        </div>

        <div style={{ padding: "20px 16px" }}>
          <div style={{ background: C.white, borderRadius: 16, padding: "20px", marginBottom: 16, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.1rem", color: C.dark, marginBottom: 12 }}>
              📋 Cómo jugar
            </div>
            <div style={{ fontSize: "0.9rem", color: C.inkM, lineHeight: 1.7 }}>
              <p>1. <strong>Turnos alternados:</strong> {nameA} y {nameB} juegan por turnos.</p>
              <p>2. <strong>Forma palabras:</strong> Toca las letras para formar una palabra válida.</p>
              <p>3. <strong>Valida:</strong> Si la palabra existe en el diccionario, sumas puntos.</p>
              <p>4. <strong>Cambia letras:</strong> Tienes 3 cambios para obtener nuevas letras.</p>
              <p>5. <strong>Gana:</strong> Quien tenga más puntos al final.</p>
            </div>
          </div>

          <button
            onClick={() => setShowInstrucciones(false)}
            style={{
              width: "100%",
              background: C.dark,
              color: C.cream2,
              border: "none",
              borderRadius: 14,
              padding: "16px",
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "1.1rem",
              cursor: "pointer"
            }}
          >
            ¡Empezar a jugar! 🎮
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "44px 20px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.cream2, fontSize: "1.5rem", cursor: "pointer", marginBottom: 10, display: "block" }}>←</button>
        <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.4rem", color: C.cream2 }}>🔤 Scrabble</div>
        <div style={{ fontSize: "0.8rem", color: `${C.cream}88` }}>
          Turno de: {turno === 0 ? nameA : nameB}
        </div>
      </div>

      <div style={{ padding: "16px 14px" }}>
        {/* Marcador */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: turno === 0 ? C.olive : C.white, borderRadius: 12, padding: "12px", textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.75rem", color: turno === 0 ? C.cream : C.inkL }}>{nameA}</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.8rem", color: turno === 0 ? C.cream2 : C.dark }}>{scoreA}</div>
            <div style={{ fontSize: "0.65rem", color: turno === 0 ? `${C.cream}88` : C.inkL }}>{palabrasA.length} palabras</div>
          </div>
          <div style={{ flex: 1, background: turno === 1 ? C.olive : C.white, borderRadius: 12, padding: "12px", textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.75rem", color: turno === 1 ? C.cream : C.inkL }}>{nameB}</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.8rem", color: turno === 1 ? C.cream2 : C.dark }}>{scoreB}</div>
            <div style={{ fontSize: "0.65rem", color: turno === 1 ? `${C.cream}88` : C.inkL }}>{palabrasB.length} palabras</div>
          </div>
        </div>

        {/* Mensaje */}
        {mensaje && (
          <div style={{ background: C.cream, borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.9rem", color: C.dark, fontWeight: 700 }}>{mensaje}</div>
          </div>
        )}

        {/* Palabra en construcción */}
        <div style={{ background: C.white, borderRadius: 12, padding: "14px", marginBottom: 12, minHeight: 60, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.75rem", color: C.inkL, marginBottom: 8 }}>Tu palabra (tocá para quitar):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 40 }}>
            {palabraActual.map((p, i) => (
              <button
                key={i}
                onClick={() => quitarLetra(i)}
                style={{
                  width: 40,
                  height: 40,
                  background: C.olive,
                  border: "none",
                  borderRadius: 8,
                  fontFamily: "'Baloo 2',sans-serif",
                  fontSize: "1.2rem",
                  color: C.cream2,
                  cursor: "pointer"
                }}
              >
                {p.letra}
              </button>
            ))}
          </div>
        </div>

        {/* Letras disponibles */}
        <div style={{ background: C.cream, borderRadius: 12, padding: "14px", marginBottom: 12, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.75rem", color: C.inkL, marginBottom: 8 }}>Tus letras (tocá para usar):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {letrasActuales.map((letra, i) => (
              <button
                key={i}
                onClick={() => agregarLetra(letra, i)}
                style={{
                  width: 40,
                  height: 40,
                  background: C.white,
                  border: `2px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'Baloo 2',sans-serif",
                  fontSize: "1.2rem",
                  color: C.dark,
                  cursor: "pointer"
                }}
              >
                {letra}
              </button>
            ))}
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={validarPalabra}
            style={{
              flex: 2,
              background: C.dark,
              color: C.cream2,
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "0.9rem",
              cursor: "pointer"
            }}
          >
            ✓ Validar
          </button>
          <button
            onClick={cambiarLetras}
            disabled={cambiosRestantes[turno] <= 0}
            style={{
              flex: 1.5,
              background: cambiosRestantes[turno] > 0 ? "#e8a030" : C.sand,
              color: cambiosRestantes[turno] > 0 ? C.white : C.inkL,
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "0.85rem",
              cursor: cambiosRestantes[turno] > 0 ? "pointer" : "not-allowed"
            }}
          >
            🔄 Cambiar ({cambiosRestantes[turno]})
          </button>
          <button
            onClick={pasarTurno}
            style={{
              flex: 1,
              background: C.sand,
              color: C.dark,
              border: `2px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px",
              fontFamily: "'Baloo 2',sans-serif",
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            → Pasar
          </button>
        </div>

        {/* Palabras formadas */}
        {(palabrasA.length > 0 || palabrasB.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: "0.8rem", color: C.inkL, marginBottom: 8 }}>Palabras formadas:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {palabrasA.length > 0 && (
                <div style={{ background: "#e8f4e8", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.75rem", color: C.olive, fontWeight: 700, marginBottom: 4 }}>{nameA}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {palabrasA.map((p, i) => (
                      <span key={i} style={{ background: C.white, padding: "2px 8px", borderRadius: 6, fontSize: "0.8rem" }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {palabrasB.length > 0 && (
                <div style={{ background: "#fff0e8", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#e86040", fontWeight: 700, marginBottom: 4 }}>{nameB}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {palabrasB.map((p, i) => (
                      <span key={i} style={{ background: C.white, padding: "2px 8px", borderRadius: 6, fontSize: "0.8rem" }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


const NAV = [
  { id: "jardin", emoji: "🌿", label: "Jardín" },
  { id: "ejerc", emoji: "⭐", label: "Ejercicios" },
  { id: "conocete", emoji: "💬", label: "Conózcanse" },
  { id: "burbuja", emoji: "🫧", label: "Acuerdos" },
  { id: "perfil", emoji: "👤", label: "Nosotros" },
];

// Lo que Mochi explica la primera vez que se abre cada pestaña
const TAB_TIPS = {
  ejerc: "Ejercicios y lecciones cortas para hacer juntos.",
  conocete: "Preguntas para conocerse mejor. Cada uno responde por su lado y después ven la respuesta del otro.",
  burbuja: "Aquí arman sus acuerdos: cada uno escribe su parte y después la ajustan juntos.",
  perfil: "Momentos, gratitud, mensajes de amor y tu diario privado.",
};

const Leaf = ({ size = 20, color = "#7fb069" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block" }}>
    <path d="M12 22C12 22 20 16 20 8C20 4 16 2 12 2C8 2 4 4 4 8C4 16 12 22 12 22Z" fill={color} />
    <path d="M12 22V4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const BambooIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block" }}>
    <rect x="10" y="2" width="4" height="20" rx="2" fill="#7fb069" />
    <rect x="4" y="6" width="4" height="12" rx="2" fill="#9dc983" />
    <rect x="16" y="8" width="4" height="10" rx="2" fill="#9dc983" />
  </svg>
);

const HeartIcon = ({ size = 48, color = "#c05068" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M12 21.35l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.55 12.54L12 21.35z" fill={color} />
  </svg>
);

function DailyGratitudeModal({ user, onSubmit, onClose }) {
  const [custom, setCustom] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { nameA, nameB } = useMemo(() => getCoupleNames(user), [user]);
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerName = myRole === "owner" ? nameB : nameA;

  const expression = submitted ? "happy" : custom.trim().length > 0 ? "typing" : "default";

  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [submitted, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!custom.trim()) return;
    setSubmitted(true);
    onSubmit(custom.trim());
  };

  const canSubmit = custom.trim().length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,38,58,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Nunito',sans-serif", backdropFilter: "blur(4px)" }}>
      <style>{`
        @keyframes modalIn { from { opacity:0; transform:translateY(18px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes pandaBob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
        @keyframes leafFloat { 0% { transform:translateY(0) scale(0.6) rotate(-10deg); opacity:0; } 15% { opacity:1; } 100% { transform:translateY(-90px) scale(1.1) rotate(10deg); opacity:0; } }
      `}</style>
      <div style={{ position: "relative", background: "#FFFBF5", borderRadius: 28, padding: "28px 26px 26px", maxWidth: 380, width: "100%", boxShadow: "0 24px 60px rgba(44,38,58,0.25), 0 8px 20px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.06)", textAlign: "center", animation: "modalIn 0.45s cubic-bezier(0.22,1,0.36,1) both" }}>
        {!submitted ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <HeartIcon size={44} color="#c05068" />
            </div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.45rem", color: C.dark, lineHeight: 1.2, marginBottom: 8 }}>
              Escribe un agradecimiento para {partnerName}
            </div>
            <div style={{ fontSize: "0.92rem", color: C.inkM, lineHeight: 1.5, marginBottom: 22 }}>
              Pequeños gestos son los que fortalecen las relaciones.
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ position: "relative", marginBottom: 14 }}>
                <textarea
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={`¿Qué hizo ${partnerName} que te hizo sentir querido/a?`}
                  rows={4}
                  maxLength={280}
                  style={{ width: "100%", borderRadius: 18, border: `1.5px solid ${C.border}`, padding: "14px 16px 28px", fontFamily: "'Nunito',sans-serif", fontSize: "1rem", resize: "none", boxSizing: "border-box", background: C.white, color: C.ink, lineHeight: 1.5, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)" }}
                  onFocus={(e) => { e.target.style.borderColor = "#c9a8b3"; e.target.style.boxShadow = "0 0 0 3px rgba(192,80,104,0.12), inset 0 1px 3px rgba(0,0,0,0.04)"; }}
                  onBlur={(e) => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.04)"; }}
                />
                <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>
                  {custom.length}/280
                </div>
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{ width: "100%", background: canSubmit ? "linear-gradient(180deg, #c05068 0%, #a84058 100%)" : "#d8c5ca", color: C.white, border: "none", borderRadius: 16, padding: "14px 18px", fontFamily: "'Baloo 2',sans-serif", fontSize: "1.05rem", fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed", boxShadow: canSubmit ? "0 4px 0 #7c2e42, 0 6px 16px rgba(192,80,104,0.28)" : "none", transition: "all 0.15s", marginBottom: 12 }}
                onMouseDown={(e) => { if (canSubmit) e.currentTarget.style.transform = "translateY(2px)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              >
                Guardar gratitud
              </button>
            </form>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: C.inkL, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", padding: "8px 12px", borderRadius: 10, transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Hoy no, gracias
            </button>
          </>
        ) : (
          <div style={{ marginTop: 4 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ position: "absolute", left: `${34 + i * 16}%`, top: "42%", animation: `leafFloat ${1.3 + i * 0.2}s ease-out ${i * 0.18}s both` }}>
                <Leaf size={18 + i * 4} color={i === 1 ? "#7fb069" : "#9dc983"} />
              </span>
            ))}
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.5rem", color: C.dark, marginBottom: 8 }}>
              ¡Gracias guardada!
            </div>
            <div style={{ fontSize: "0.95rem", color: C.inkM, lineHeight: 1.5, marginBottom: 18 }}>
              Tu gesto se guardó en el baúl. Pronto será una sorpresa para {partnerName}.
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(192,80,104,0.08)", color: "#a84058", padding: "8px 14px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700 }}>
              <BambooIcon size={14} /> +5 bambú de cariño
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ROOT APP — updated state + decay logic
// ═══════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("jardin");
  const [toastMsg, setToastMsg] = useState(null);
  const [bamboo, setBamboo] = useState(0);
  const [happiness, setHappiness] = useState(20);
  const [water, setWater] = useState(40);
  const [garden, setGarden] = useState({});
  const [accessories, setAccessories] = useState({});
  const [exDone, setExDone] = useState({});
  const [exChestState, setExChestState] = useState({ opened: 0 });
  const [exStreak, setExStreak] = useState({ count: 0, lastDate: null });
  const [messages, setMessages] = useState([]);
  const [conoce, setConoce] = useState({});
  const [burbuja, setBurbuja] = useState({});
  const [coupleInfo, setCoupleInfo] = useState({});
  const [notifs, setNotifs] = useState([]);
  const [pandaBubble, setPandaBubble] = useState(null); // {nameA, textA, nameB, textB}
  const [mochiHappy, setMochiHappy] = useState(false);
  const [lastVisit, setLastVisit] = useState(null);
  const [testScores, setTestScores] = useState(null);
  const [lastTestDate, setLastTestDate] = useState(null);
  const [lessonsDone, setLessonsDone] = useState({});
  const [gratitud, setGratitud] = useState([]);
  const [momentos, setMomentos] = useState([]);
  const [diarioEntries, setDiarioEntries] = useState({});
  const [yo, setYo] = useState({ checkins: {}, longestStreak: 0 });
  const [streakInteractions, setStreakInteractions] = useState([]);
  const [streakData, setStreakData] = useState({
    currentStreak: 0,
    longestStreak: 0,
    unlockedMilestones: [],
    nextMilestone: STREAK_MILESTONES[0],
    progressPct: 0,
    settings: { reminderEnabled: true, reminderHour: "20:00", reminderTone: "suave" },
    rewards: [],
    todayDone: false,
    celebrationText: "",
  });
  const [showDailyGratitude, setShowDailyGratitude] = useState(false);
  const [testDue, setTestDue] = useState(false);
  const [testStatus, setTestStatus] = useState({ mine: false, other: false });
  const [partnerConnected, setPartnerConnected] = useState(null); // null = aún no se sabe
  const [seenTabTips, setSeenTabTips] = useState(() => ls.get("mochi_tab_tips_seen") || {});
  const dismissTabTip = (id) => {
    const next = { ...seenTabTips, [id]: true };
    setSeenTabTips(next);
    ls.set("mochi_tab_tips_seen", next);
  };
  const happyTimer = useRef(null);
  const screenRef = useRef("login");
  const streakAnalytics = useMemo(() => computeStreakAnalytics(streakInteractions), [streakInteractions]);
  const gratitudeStreak = useMemo(() => {
    const gratitudeOnly = streakInteractions.filter(i => i.type === "gratitude");
    return computeDailyStreakData(gratitudeOnly, 0).currentStreak;
  }, [streakInteractions]);

  const makeCode = () => "MO" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const saveKey = u => u?.email ? "mochi_prog_" + u.email : null;
  const toast = msg => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };
  useEffect(() => { setGlobalToast(toast); return () => setGlobalToast(() => {}); }, []);
  const trigHappy = useCallback(() => {
    setMochiHappy(true);
    clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => setMochiHappy(false), 4000);
  }, []);

  const save = useCallback((u, s) => {
    const payload = {
      ...s,
      streakInteractions: s?.streakInteractions ?? streakInteractions,
      streakData: s?.streakData ?? streakData,
    };
    const k = saveKey(u || user);
    if (k) ls.set(k, payload); // keep local backup
    const uid = (u || user)?.uid;
    if (uid) fbSaveProgress(uid, payload).catch(() => {});
  }, [streakData, streakInteractions, user]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Garden decay on login: -5 water per day away, -2 happiness per day
  const applyDecay = (savedState) => {
    const last = savedState.lastVisit ? new Date(savedState.lastVisit) : new Date();
    const now = new Date();
    const daysDiff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (daysDiff < 3) return savedState; // Only decay after 3+ days away
    const periods = Math.floor(daysDiff / 3); // Each 3-day block = one decay tick
    const waterLoss = Math.min(periods * 20, 80);
    const happyLoss = Math.min(periods * 8, 30);
    return {
      ...savedState,
      water: Math.max(0, (savedState.water || 40) - waterLoss),
      happiness: Math.max(5, (savedState.happiness || 20) - happyLoss),
    };
  };

  const afterLogin = async (u, isNew) => {
    let resolvedUser = { ...u };
    if (!resolvedUser?.isGuest && resolvedUser?.uid && !resolvedUser?.code) {
      const found = await fbFindCodeByUid(resolvedUser.uid).catch(() => null);
      if (found?.code) {
        resolvedUser = {
          ...resolvedUser,
          code: found.code,
          names: resolvedUser.names || found.names || resolvedUser.names,
          since: resolvedUser.since || found.since || "Juntos desde hoy",
        };
        await fbSaveUser(resolvedUser.uid, {
          code: found.code,
          names: resolvedUser.names,
          since: resolvedUser.since,
        }).catch(() => {});
      } else if (resolvedUser?.isOwner !== false) {
        const baseName = String(resolvedUser?.email || "nosotros").split("@")[0] || "Nosotros";
        const names = resolvedUser.names || `${baseName} & ?`;
        const since = resolvedUser.since || "Juntos desde hoy";
        let provisionedCode = null;

        for (let i = 0; i < 8; i += 1) {
          const candidate = makeCode();
          try {
            await fbCreateCodeOwner(candidate, {
              ownerEmail: resolvedUser.email || "",
              ownerUid: resolvedUser.uid,
              names,
              since,
            });
            provisionedCode = candidate;
            break;
          } catch (e) {
            if (!String(e?.message || "").includes("CODE_TAKEN")) break;
          }
        }

        if (provisionedCode) {
          resolvedUser = {
            ...resolvedUser,
            code: provisionedCode,
            names,
            since,
            isOwner: true,
          };
          await fbSaveUser(resolvedUser.uid, {
            code: provisionedCode,
            names,
            since,
            isOwner: true,
          }).catch(() => {});
        }
      }
    }

    setUser(resolvedUser);
    ls.set("mochi_last", resolvedUser.email || "guest");
    let s = null;
    if (!isNew && resolvedUser.uid) {
      // Try Firebase first, fallback to localStorage
      try { s = await fbGetProgress(resolvedUser.uid); } catch(e) {}
      if (!s) s = ls.get(saveKey(resolvedUser));
      if (s) {
        s = applyDecay(s);
        if (s.bamboo != null) setBamboo(s.bamboo);
        if (s.happiness != null) setHappiness(s.happiness);
        if (s.water != null) setWater(s.water);
        if (s.garden) setGarden(s.garden);
        if (s.accessories) setAccessories(s.accessories);
        if (s.exDone) setExDone(s.exDone);
        if (s.exChestState) setExChestState(s.exChestState);
        if (s.exStreak) setExStreak(s.exStreak);
        if (s.conoce) setConoce(s.conoce);
        if (s.burbuja) setBurbuja(s.burbuja);
        if (s.coupleInfo) setCoupleInfo(s.coupleInfo);
        if (s.testScores) setTestScores(s.testScores);
        if (s.lastTestDate) setLastTestDate(s.lastTestDate);
        if (s.lessonsDone) setLessonsDone(s.lessonsDone);
        if (s.gratitud) setGratitud(s.gratitud);
        if (s.momentos) setMomentos(s.momentos);
        if (s.diarioEntries) setDiarioEntries(s.diarioEntries);
        if (s.yo) setYo(prev => ({ ...prev, ...s.yo, checkins: { ...(prev.checkins || {}), ...(s.yo.checkins || {}) } }));
        if (s.streakInteractions) setStreakInteractions(s.streakInteractions);
        if (s.streakData) setStreakData(prev => ({ ...prev, ...s.streakData }));
      }
    }
    // Listen to real-time messages if couple code exists
    if (resolvedUser.code && !resolvedUser.isGuest) {
      const unsub = fbListenMessages(resolvedUser.code, msgs => setMessages(msgs));
      window._mochiMsgUnsub = unsub;
    } else {
      const sharedMsgs = resolvedUser.code ? (ls.get("mochi_msgs_" + resolvedUser.code) || []) : [];
      setMessages(sharedMsgs);
    }
    setLastVisit(new Date().toISOString());
    const introFlowOpen = screenRef.current === "onboarding" || screenRef.current === "reltest";
    
    // Lógica para mostrar el test: cada 7 días o cuando la racha llega a 6
    const now = new Date();
    const lastTest = s?.lastTestDate ? new Date(s.lastTestDate) : null;
    const daysSinceLastTest = lastTest ? Math.floor((now - lastTest) / (1000 * 60 * 60 * 24)) : null;
    const streakFromLoaded = s?.streakData?.currentStreak || 0;
    const shouldShowTest = !s?.testScores || daysSinceLastTest >= 7 || streakFromLoaded === 6;
    const hasCompletedTest = !!s?.testScores && !shouldShowTest;
    
    // El test ya no bloquea la entrada: si toca hacerlo, se sugiere desde el jardín
    setTestDue(!hasCompletedTest);
    if (isNew) ls.set(`mochi_first_day_${resolvedUser.email || resolvedUser.uid || "guest"}`, getDateKeyLocal());

    if (!isNew && introFlowOpen) {
      setScreen(screenRef.current);
      return;
    }
    setScreen(isNew ? "onboarding" : "main");
  };

  // Keep messages in sync whenever user/code changes
  useEffect(() => {
    if (!user?.code || user?.isGuest) return;
    if (window._mochiMsgUnsub) window._mochiMsgUnsub();
    const unsub = fbListenMessages(user.code, msgs => {
      setMessages(prev => {
        // Merge: keep any optimistic messages not yet in Firebase, plus all Firebase msgs
        const firebaseIds = new Set(msgs.map(m => String(m.id)));
        const optimistic = prev.filter(m => !firebaseIds.has(String(m.id)) && (Date.now() - Number(m.id)) < 10000);
        const merged = [...optimistic, ...msgs];
        merged.sort((a, b) => new Date(b.time) - new Date(a.time));
        return merged;
      });
    });
    window._mochiMsgUnsub = unsub;
    return () => unsub();
  }, [user?.code]);

  // ─── Sync gratitud, momentos, conoce, lessons, bamboo, notifs ───
  useEffect(() => {
    if (!user?.code || user?.isGuest) return;
    const code = user.code;
    const unsubs = [];

    // Shared bamboo bank
    unsubs.push(fbListenBamboo(code, total => {
      if (total !== null) setBamboo(total);
    }));

    // Shared garden state (plants/accessories/water/happiness)
    unsubs.push(fbListenGardenState(code, data => {
      if (!data) return;
      if (data.garden && typeof data.garden === "object") setGarden(data.garden);
      if (data.accessories && typeof data.accessories === "object") setAccessories(data.accessories);
      if (typeof data.water === "number") setWater(data.water);
      if (typeof data.happiness === "number") setHappiness(data.happiness);
    }));

    // Gratitud entries (real-time both ways)
    unsubs.push(fbListenGratitud(code, items => setGratitud(items)));

    // Momentos entries (real-time both ways)
    unsubs.push(fbListenMomentos(code, items => setMomentos(items)));

    // Conocete answers (real-time both ways)
    unsubs.push(fbListenConoce(code, map => setConoce(map)));

    // Burbuja agreements (real-time workflow)
    unsubs.push(fbListenBurbuja(code, map => setBurbuja(map)));

    // Lessons (both must read)
    unsubs.push(fbListenLessons(code, map => setLessonsDone(map)));

    // Notifications
    unsubs.push(fbListenNotifs(code, items => {
      setNotifs(items);
    }));

    // Daily streak interactions and summary profile
    unsubs.push(fbListenStreakInteractions(code, items => setStreakInteractions(items)));
    unsubs.push(fbListenStreakProfile(code, data => {
      if (data) {
        setStreakData(prev => ({ ...prev, ...data }));
      }
    }));

    return () => unsubs.forEach(u => u && u());
  }, [user?.code]);

  useEffect(() => {
    // Use Firebase Auth state to keep session alive
    const unsub = fbOnAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // If doReg/doJoin is actively handling a fresh registration, skip —
        // they will call afterLogin themselves once all Firestore writes are done.
        if (_pendingLocalAuth) return;
        try {
          let userData = await fbGetUser(firebaseUser.uid);
          if (!userData) {
            // Fallback to localStorage
            const u = ls.get("mochi_users") || {};
            userData = u[firebaseUser.email] || { email: firebaseUser.email, names: firebaseUser.email.split("@")[0] + " & ?", isOwner: true };
          }
          afterLogin({ uid: firebaseUser.uid, email: firebaseUser.email, ...userData, isGuest: false }, false);
        } catch(e) {
          // Fallback to localStorage
          const last = ls.get("mochi_last");
          if (last && last !== "guest") {
            const u = ls.get("mochi_users") || {};
            if (u[last]) {
              afterLogin({ uid: firebaseUser.uid, email: firebaseUser.email || last, ...u[last], isGuest: false }, false);
            }
          }
        }
      } else {
        // If Firebase session is gone, ensure app state returns to login.
        setUser(null);
        setScreen("login");
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line

  const trackDailyInteraction = useCallback(async (type) => {
    if (!STREAK_TYPES[type]) return;
    const date = getDateKeyLocal();
    const item = {
      id: `${user?.code || "guest"}_${date}_${type}`,
      date,
      type,
      completed: true,
      completedBy: user?.uid || "guest",
      updatedAt: new Date().toISOString(),
      coupleCode: user?.code || "guest",
    };

    setStreakInteractions(prev => {
      const idx = prev.findIndex(p => p.date === date && p.type === type);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...item };
      return next;
    });

    if (user?.code && !user?.isGuest) {
      await fbSaveStreakInteraction(user.code, date, type, true, { completedBy: user?.uid || "unknown" }).catch(() => {});
    }
  }, [user?.code, user?.isGuest, user?.uid]);

  const updateStreakSettings = useCallback(async (settingsPatch) => {
    const nextSettings = {
      ...(streakData.settings || { reminderEnabled: true, reminderHour: "20:00", reminderTone: "suave" }),
      ...settingsPatch,
    };
    setStreakData(prev => ({ ...prev, settings: nextSettings }));
    if (user?.code && !user?.isGuest) {
      await fbSaveStreakProfile(user.code, { settings: nextSettings }).catch(() => {});
    }
  }, [streakData.settings, user?.code, user?.isGuest]);

  useEffect(() => {
    const defaultSettings = streakData.settings || { reminderEnabled: true, reminderHour: "20:00", reminderTone: "suave" };
    const computed = computeDailyStreakData(streakInteractions, streakData.longestStreak || 0);
    const prevUnlocked = streakData.unlockedMilestones || [];
    const newlyUnlocked = computed.unlockedMilestones.filter(m => !prevUnlocked.includes(m));
    const nextRewards = [...(streakData.rewards || [])];

    newlyUnlocked.forEach(m => {
      if (!nextRewards.find(r => r.id === `mochi-${m}`)) {
        nextRewards.push({
          id: `mochi-${m}`,
          milestone: m,
          name: `Mochi de ${m} dias`,
          unlockedAt: new Date().toISOString(),
        });
      }
    });

    const celebrationText = newlyUnlocked.length
      ? `Nuevo hito desbloqueado: Mochi ${newlyUnlocked[newlyUnlocked.length - 1]} 🐼`
      : streakData.celebrationText || "";

    const changed =
      computed.currentStreak !== streakData.currentStreak
      || computed.longestStreak !== streakData.longestStreak
      || computed.todayDone !== streakData.todayDone
      || computed.nextMilestone !== streakData.nextMilestone
      || computed.progressPct !== streakData.progressPct
      || JSON.stringify(computed.unlockedMilestones) !== JSON.stringify(prevUnlocked)
      || JSON.stringify(nextRewards) !== JSON.stringify(streakData.rewards || []);

    if (!changed && !newlyUnlocked.length) return;

    const merged = {
      ...streakData,
      ...computed,
      unlockedMilestones: computed.unlockedMilestones,
      rewards: nextRewards,
      settings: defaultSettings,
      celebrationText,
    };

    setStreakData(merged);

    if (newlyUnlocked.length) {
      trigHappy();
      toast(`Hito de racha: ${newlyUnlocked[newlyUnlocked.length - 1]} dias. Recompensa Mochi desbloqueada 🐼`);
      if (user?.code && !user?.isGuest && user?.uid) {
        const myName = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type: "racha",
          msg: `${myName} alcanzo un nuevo hito de racha 🐼`,
          forUid: user?.isOwner !== false ? "partner" : "owner",
          fromUid: user.uid,
        }).catch(() => {});
      }
    }

    if (user?.code && !user?.isGuest) {
      fbSaveStreakProfile(user.code, {
        currentStreak: merged.currentStreak,
        longestStreak: merged.longestStreak,
        todayDone: merged.todayDone,
        unlockedMilestones: merged.unlockedMilestones,
        nextMilestone: merged.nextMilestone,
        progressPct: merged.progressPct,
        rewards: merged.rewards,
        settings: merged.settings,
        celebrationText: merged.celebrationText,
      }).catch(() => {});
    }
  }, [streakInteractions, streakData, user?.code, user?.isGuest, user?.uid, trigHappy]);

  // ─── MICRO-GRATITUD DIARIA AL ABRIR ───
  useEffect(() => {
    if (!user || screen !== "main") return;
    const today = getDateKeyLocal();
    const dismissedKey = `mochi_gratitude_dismissed_${user?.email || user?.uid || "guest"}`;
    const dismissed = ls.get(dismissedKey);
    if (dismissed === today) return;
    // El primer día ya hubo suficientes pantallas de bienvenida
    if (ls.get(`mochi_first_day_${user?.email || user?.uid || "guest"}`) === today) return;

    const doneViaStreak = streakInteractions.some(i => i.date === today && i.type === "gratitude" && i.completed);
    const doneViaEntries = gratitud.some(g => {
      const d = g?.dateKey || getDateKeyLocal(new Date(g?.time || g?.date || 0));
      return d === today;
    });

    if (!doneViaStreak && !doneViaEntries) {
      const t = setTimeout(() => setShowDailyGratitude(true), 900);
      return () => clearTimeout(t);
    }
  }, [user, screen, gratitud, streakInteractions]);

  // ─── PAREJA CONECTADA Y ESTADO DEL TEST (para la guía del jardín) ───
  useEffect(() => {
    if (!user?.code || user?.isGuest) { setPartnerConnected(false); return; }
    const unsub = fbListenCode(user.code, ci => setPartnerConnected(!!(ci?.partnerUid && ci?.ownerUid)));
    return () => unsub();
  }, [user?.code, user?.isGuest]);

  useEffect(() => {
    if (!user?.code || user?.isGuest) return;
    const myKey = user?.isOwner !== false ? "owner" : "partner";
    const otherKey = myKey === "owner" ? "partner" : "owner";
    const unsub = fbListenTest(user.code, data => setTestStatus({ mine: data?.[`${myKey}Done`] === true, other: data?.[`${otherKey}Done`] === true }));
    return () => unsub();
  }, [user?.code, user?.isGuest, user?.isOwner]);

  // ─── CARRIL "YO": persistencia privada + racha personal ───
  const yoKey = user?.email || user?.uid || "guest";

  // Se guarda en progress/{uid} (solo legible por su dueño) y en localStorage.
  // Nunca en las colecciones compartidas por coupleCode.
  const persistYoPrivate = useCallback((patch) => {
    try {
      if (patch.diarioEntries) localStorage.setItem(`mochi_diario_privado_${yoKey}`, JSON.stringify(patch.diarioEntries));
      if (patch.yo) localStorage.setItem(`mochi_yo_${yoKey}`, JSON.stringify(patch.yo));
    } catch (e) {}
    if (user?.uid && !user?.isGuest) fbSaveProgress(user.uid, patch).catch(() => {});
  }, [yoKey, user?.uid, user?.isGuest]);

  // Hidrata lo privado del dispositivo cuando cambia de usuario (lo remoto ya ganó en afterLogin)
  useEffect(() => {
    if (!user) return;
    try {
      const d = JSON.parse(localStorage.getItem(`mochi_diario_privado_${yoKey}`) || "null");
      if (d && typeof d === "object") setDiarioEntries(prev => ({ ...d, ...prev }));
      const y = JSON.parse(localStorage.getItem(`mochi_yo_${yoKey}`) || "null");
      if (y && typeof y === "object") {
        setYo(prev => ({
          ...y,
          ...prev,
          checkins: { ...(y.checkins || {}), ...(prev.checkins || {}) },
          longestStreak: Math.max(y.longestStreak || 0, prev.longestStreak || 0),
        }));
      }
    } catch (e) {}
  }, [yoKey, user]);

  const yoStreak = useMemo(() => {
    const dates = new Set(Object.keys(yo?.checkins || {}));
    Object.values(diarioEntries || {}).forEach(e => {
      const k = e?.dateKey || (e?.ts ? getDateKeyLocal(new Date(e.ts)) : null);
      if (k) dates.add(k);
    });
    const base = computeDailyStreakData([...dates].map(d => ({ date: d, completed: true })), yo?.longestStreak || 0);
    const todayKey = getDateKeyLocal();
    const last7 = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = addDaysToKey(todayKey, -i);
      const [yy, mm, dd] = key.split("-").map(Number);
      last7.push({ key, name: WEEKDAY_NAMES[new Date(yy, mm - 1, dd).getDay()], done: !!base.byDate[key] });
    }
    return { ...base, last7 };
  }, [yo, diarioEntries]);

  // El récord personal se conserva aunque la racha actual se corte
  useEffect(() => {
    if (yoStreak.longestStreak > (yo?.longestStreak || 0)) {
      const nextYo = { ...(yo || {}), longestStreak: yoStreak.longestStreak };
      setYo(nextYo);
      persistYoPrivate({ yo: nextYo });
    }
  }, [yoStreak.longestStreak, yo, persistYoPrivate]);

  const saveYoCheckin = (mood) => {
    const dateKey = getDateKeyLocal();
    const isFirstToday = !yo?.checkins?.[dateKey];
    const nextYo = {
      ...(yo || {}),
      checkins: {
        ...((yo || {}).checkins || {}),
        [dateKey]: { mood: mood.k, emoji: mood.e, label: mood.l, ts: new Date().toISOString() },
      },
    };
    setYo(nextYo);
    persistYoPrivate({ yo: nextYo });
    trigHappy();
    if (isFirstToday) {
      const reward = 5;
      setBamboo(b => b + reward);
      if (user?.code && !user?.isGuest) fbIncrementBamboo(user.code, reward).catch(() => {});
      toast(`${mood.e} Anotado. Cuidarte también riega el jardín (+${reward} 🌿)`);
    } else {
      toast(`${mood.e} Actualizado. Gracias por escucharte`);
    }
  };

  const buyItem = item => {
    try {
      if (!item?.id || typeof item?.cost !== "number") {
        toast("Este item no está disponible ahora");
        return;
      }
      const safeGarden = garden && typeof garden === "object" ? garden : {};
      if (safeGarden[item.id] === true) {
        const ng = { ...safeGarden, [item.id]: "owned" };
        setGarden(ng);
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        save(null, { bamboo, happiness, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
        toast(`${item.name} guardado`);
        return;
      }

      if (safeGarden[item.id] === "owned") {
        const POND_DEPS = ["koi1", "koi2", "lotus_pad"];
        if (POND_DEPS.includes(item.id) && safeGarden.pond !== true) {
          toast("Primero coloca el Estanque para usar este objeto 🪷");
          return;
        }
        const ng = { ...safeGarden, [item.id]: true };
        setGarden(ng);
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        save(null, { bamboo, happiness, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
        toast(`${item.name} colocado 🌿`);
        return;
      }

      // Pond-dependent items require pond first
      const POND_DEPS = ["koi1", "koi2", "lotus_pad"];
      if (POND_DEPS.includes(item.id) && safeGarden.pond !== true && safeGarden.pond !== "owned") {
        toast("Necesitas el Estanque primero 🪷");
        return;
      }
      if (bamboo < item.cost) { toast("Necesitas más bambú — completa ejercicios"); return; }
      const nb = bamboo - item.cost, ng = { ...safeGarden, [item.id]: true }, nh = Math.min(100, happiness + 10);
      const nv = new Date().toISOString();
      if (user?.code && !user?.isGuest) {
        fbPurchaseGardenUpdate(user.code, item.cost, { garden: ng, accessories, water, happiness: nh })
          .then((newTotal) => {
            setBamboo(newTotal);
            setGarden(ng);
            setHappiness(nh);
            setLastVisit(nv);
            trigHappy();
            toast(`${item.name} plantado 🌿`);
            save(null, { bamboo:newTotal, happiness:nh, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
          })
          .catch((e) => {
            if (String(e?.message || "").includes("INSUFFICIENT_BAMBOO")) {
              toast("Necesitas más bambú — completa ejercicios");
              return;
            }
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.error("buyItem error:", e);
            }
            toast("No se pudo comprar ese item");
          });
        return;
      }
      setBamboo(nb); setGarden(ng); setHappiness(nh); setLastVisit(nv); trigHappy();
      toast(`${item.name} plantado 🌿`);
      save(null, { bamboo:nb, happiness:nh, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("buyItem error:", e);
      }
      toast("No se pudo comprar ese item");
    }
  };

  const buyAccessory = item => {
    try {
      if (!item?.id || typeof item?.cost !== "number") {
        toast("Este accesorio no está disponible ahora");
        return;
      }
      const safeAccessories = accessories && typeof accessories === "object" ? accessories : {};

      // If already owned, toggle it on/off (equip/unequip)
      if (safeAccessories[item.id] === "owned") {
        const na = { ...safeAccessories, [item.id]: true };
        setAccessories(na);
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden, accessories: na, water, happiness }).catch(() => {});
        }
        save(null, { bamboo, happiness, water, garden, accessories: na, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone });
        toast(`${item.name} puesto 🐼`);
        return;
      }
      if (safeAccessories[item.id] === true) {
        const na = { ...safeAccessories, [item.id]: "owned" };
        setAccessories(na);
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden, accessories: na, water, happiness }).catch(() => {});
        }
        save(null, { bamboo, happiness, water, garden, accessories: na, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone });
        toast(`${item.name} quitado`);
        return;
      }
      if (bamboo < item.cost) { toast("Necesitas más bambú"); return; }
      const nb = bamboo - item.cost, na = { ...safeAccessories, [item.id]: true }, nh = Math.min(100, happiness + 5);
      const nv = new Date().toISOString();
      if (user?.code && !user?.isGuest) {
        fbPurchaseGardenUpdate(user.code, item.cost, { garden, accessories: na, water, happiness: nh })
          .then((newTotal) => {
            setBamboo(newTotal);
            setAccessories(na);
            setHappiness(nh);
            setLastVisit(nv);
            trigHappy();
            toast(`${item.name} puesto ${item.emoji} +5 amor`);
            save(null, { bamboo:newTotal, happiness:nh, water, garden, accessories:na, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
          })
          .catch((e) => {
            if (String(e?.message || "").includes("INSUFFICIENT_BAMBOO")) {
              toast("Necesitas más bambú");
              return;
            }
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.error("buyAccessory error:", e);
            }
            toast("No se pudo comprar ese accesorio");
          });
        return;
      }
      setBamboo(nb); setAccessories(na); setHappiness(nh); setLastVisit(nv); trigHappy();
      toast(`${item.name} puesto ${item.emoji} +5 amor`);
      save(null, { bamboo:nb, happiness:nh, water, garden, accessories:na, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("buyAccessory error:", e);
      }
      toast("No se pudo comprar ese accesorio");
    }
  };

  const waterGarden = () => {
    const nw = Math.min(100, water + 10), nh = Math.min(100, happiness + 2);
    const nv = new Date().toISOString();
    setWater(nw); setHappiness(nh); setLastVisit(nv); trigHappy();
    if (user?.code && !user?.isGuest) {
      fbSaveGardenState(user.code, { garden, accessories, water: nw, happiness: nh }).catch(() => {});
    }
    toast("Jardín regado 💧 ¡Gracias por volver!");
    save(null, { bamboo, happiness:nh, water:nw, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
  };

  const petMochi = () => {
    trigHappy();
    const nameA = user?.names ? user.names.split("&")[0].trim() : "Panda A";
    const nameB = user?.names ? user.names.split("&")[1]?.trim() || "Panda B" : "Panda B";
    const myEmail = user?.email || "guest";
    const partnerName = user?.isOwner !== false ? nameB : nameA;
    const partnerMsgs = [...messages].filter(m => m.senderEmail !== myEmail);
    const partnerMsg = partnerMsgs[0];
    const textB = partnerMsg
      ? partnerMsg.text.slice(0, BUBBLE_PREVIEW_LENGTH) + (partnerMsg.text.length > BUBBLE_PREVIEW_LENGTH ? "..." : "")
      : "¡Los quiero mucho! 🐼";
    // Show speech bubbles over pandas for 5 seconds
    setPandaBubble({ nameA: null, textA: null, nameB: partnerName, textB });
    setTimeout(() => setPandaBubble(null), 5000);
    const nh = Math.min(100, happiness + 2);
    setHappiness(nh);
  };

  const completeLesson = async (lessonId) => {
    const myKey = user?.isOwner !== false ? "owner" : "partner";
    const myName = getMyName(user, "Yo");
    if (lessonsDone[lessonId]?.[myKey]) return; // already done by me
    if (user?.code && !user?.isGuest) {
      await fbSaveLessonRead(user.code, lessonId, myKey).catch(() => {});
      const nb = await fbIncrementBamboo(user.code, 10).catch(() => bamboo + 10);
      setBamboo(nb); trigHappy();
      toast("Lección completada ✓ +10 bambú 🌿");
      trackDailyInteraction("exercise");
      fbSendNotif(user.code, { type:"leccion", msg:`${myName} leyó una lección — ¡léela tú también! 📖`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
    } else {
      const nl = { ...lessonsDone, [lessonId]: { ...(lessonsDone[lessonId] || {}), [myKey]: true } };
      setLessonsDone(nl);
      const nb = bamboo + 10; setBamboo(nb); trigHappy();
      toast("Lección completada ✓ +10 bambú 🌿");
      trackDailyInteraction("exercise");
    }
  };

  const finishTest = (scores) => {
    const now = new Date().toISOString();
    setTestDue(false);
    setTestScores(scores);
    setLastTestDate(now);
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit, testScores: scores, lastTestDate: now, lessonsDone, gratitud, momentos });
    setScreen("main");
  };

  const retakeTest = () => {
    // Resetear el test para poder hacerlo de nuevo
    setTestScores(null);
    setLastTestDate(null);
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit, testScores: null, lastTestDate: null, lessonsDone, gratitud, momentos });
    setScreen("reltest");
  };

  const completeEx = async (ex, pts) => {
    const nd = { ...exDone, [ex.id]: (exDone[ex.id] || 0) + 1 };

    // Skill XP before/after
    const prevSkillLevels = computeSkillLevels(exDone);
    const nextSkillLevels = computeSkillLevels(nd);
    const skillUps = [];
    Object.keys(EXERCISE_SKILLS).forEach(skill => {
      if (nextSkillLevels[skill].level > prevSkillLevels[skill].level) {
        skillUps.push({ skill, level: nextSkillLevels[skill].level });
      }
    });

    // Exercise streak
    const today = new Date().toISOString().slice(0, 10);
    let newStreak = { ...exStreak };
    if (exStreak.lastDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const wasYesterday = exStreak.lastDate === yesterday.toISOString().slice(0, 10);
      newStreak = {
        count: wasYesterday ? (exStreak.count || 0) + 1 : 1,
        lastDate: today,
      };
    }
    const streakBonus = newStreak.count >= 7 ? 30 : newStreak.count >= 3 ? 15 : 0;

    // Chests: auto-open if available
    const prevChest = getChestState(exDone, exChestState);
    const nextChest = getChestState(nd, exChestState);
    const chestsUnlocked = nextChest.canOpen;
    const rewardItems = [];
    let chestBamboo = 0;
    let newChestState = { ...exChestState };
    let newGarden = { ...garden };
    let newAccessories = { ...accessories };

    if (chestsUnlocked) {
      const reward = getNextChestReward(exChestState.opened || 0);
      newChestState = { opened: (exChestState.opened || 0) + 1 };
      if (reward.type === "bamboo") {
        chestBamboo += reward.amount;
      } else if (reward.type === "garden") {
        newGarden[reward.itemId] = true;
        rewardItems.push(reward);
      } else if (reward.type === "accessory") {
        newAccessories[reward.itemId] = true;
        rewardItems.push(reward);
      }
    }

    // Totals
    const masteryBonus = nd[ex.id] === 3 ? 30 : 0;
    const total = pts + masteryBonus + streakBonus + chestBamboo;
    const nh = Math.min(100, happiness + 8);

    // Update states
    setHappiness(nh);
    setExDone(nd);
    setExStreak(newStreak);
    setExChestState(newChestState);
    if (chestsUnlocked) {
      setGarden(newGarden);
      setAccessories(newAccessories);
    }
    trigHappy();

    const myName = getMyName(user, "Yo");
    let finalBamboo = bamboo + total;
    if (user?.code && !user?.isGuest) {
      finalBamboo = await fbIncrementBamboo(user.code, total).catch(() => bamboo + total);
      trackDailyInteraction("exercise");
      if (user?.uid) {
        fbSendNotif(user.code, { type:"ejercicio", msg:`${myName} completó "${ex.title}" — ¡mira tu progreso! 🌟`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
      }
    } else {
      trackDailyInteraction("exercise");
    }
    setBamboo(finalBamboo);

    // Toast
    let toastMsg = masteryBonus ? `¡Maestría! +${total} bambú 🌟` : `+${total} bambú 🌿`;
    if (skillUps.length) toastMsg += ` · ${EXERCISE_SKILLS[skillUps[0].skill].emoji} nivel ${skillUps[0].level}`;
    if (chestsUnlocked) toastMsg += ` · cofre desbloqueado 🎁`;
    toast(toastMsg);

    save(null, {
      bamboo: finalBamboo, happiness: nh, water,
      garden: newGarden, accessories: newAccessories,
      exDone: nd, exChestState: newChestState, exStreak: newStreak,
      messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos
    });

    return { skillUps, chestsUnlocked, rewardItems, streakBonus, masteryBonus, total, newStreak, newSkillLevels: nextSkillLevels };
  };

  const sendMsg = text => {
    if (!text || !text.trim()) return;
    const trimmedText = text.trim();
    if (trimmedText.length > MAX_MESSAGE_LENGTH) {
      toast(`Máximo ${MAX_MESSAGE_LENGTH} caracteres por mensaje`);
      return;
    }
    const nextMessages = [{
      id: Date.now(), text: trimmedText,
      sender: getMyName(user, "Yo"),
      senderEmail: user?.email || "guest",
      time: new Date().toISOString(), read: false
    }, ...messages];
    const msg = {
      id: nextMessages[0].id, text: trimmedText,
      sender: getMyName(user, "Yo"),
      senderEmail: user?.email || "guest",
      time: new Date().toISOString(), read: false
    };
    // Always update local state first so UI doesn't freeze
    setMessages(nextMessages);
    if (user?.code && !user?.isGuest) {
      // Fire and forget — listener will sync
      fbSendMessage(user.code, msg).catch(e => {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("Send failed:", e);
        }
      });
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, { type:"mensaje", msg:`${me} te envió un mensajito 💌`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
      }
    } else {
      const key = user?.code ? "mochi_msgs_" + user.code : "mochi_msgs_guest";
      const prev = ls.get(key) || [];
      ls.set(key, [msg, ...prev]);
    }
    const nb = bamboo + 5; setBamboo(nb); trigHappy();
    toast("💌 Mensaje enviado. Solo tu pareja lo verá +5 bambú");
    trackDailyInteraction("message");
    save(null, { bamboo:nb, happiness, water, garden, accessories, exDone, messages:nextMessages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const saveConoce = async (cat, qIdx, myAnswer, level, isNew) => {
    const key = `${cat}-${qIdx}`;
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const partnerRole = myRole === "owner" ? "partner" : "owner";
    const myName = getMyName(user, "Yo");

    // Check if completing this answer will complete the level
    const wasLevelComplete = level ? isJourneyLevelCompletedByBoth(level, conoce, myRole, partnerRole) : false;

    if (user?.code && !user?.isGuest) {
      // Save my answer to Firebase (keyed by role)
      await fbSaveConoce(user.code, key, { [myRole]: myAnswer, updatedAt: new Date().toISOString() }).catch(() => {});
      // Check if partner already answered
      const existing = conoce[key] || {};
      const bothAnswered = isNew && existing[partnerRole];
      if (bothAnswered) {
        // Both answered — award bamboo to shared bank
        const nb = await fbIncrementBamboo(user.code, 15).catch(() => bamboo + 15);
        setBamboo(nb); trigHappy();
        toast("+15 bambú por conocerse más 🌿");
        trackDailyInteraction("conoce");
      } else if (isNew) {
        // I answered first — notify partner
        trigHappy();
        toast("¡Guardado! Esperando que tu pareja responda para ganar bambú 🌿");
        trackDailyInteraction("conoce");
        fbSendNotif(user.code, { type:"conoce", msg:`${myName} respondió una pregunta — ¡tu turno! 🌿`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
      }
    } else {
      // Local mode
      const nc = { ...conoce, [key]: { ...( conoce[key] || {}), [myRole]: myAnswer } };
      setConoce(nc);
      if (isNew) { setBamboo(b => b + 15); trigHappy(); toast("+15 bambú por conocerse más 🌿"); trackDailyInteraction("conoce"); }
    }

    // Level completion reward
    if (level && !wasLevelComplete) {
      // Update local conoce for check
      const updatedConoce = { ...conoce, [key]: { ...(conoce[key] || {}), [myRole]: myAnswer } };
      const nowLevelComplete = isJourneyLevelCompletedByBoth(level, updatedConoce, myRole, partnerRole);
      if (nowLevelComplete) {
        const rewardBamboo = CONOCE_JOURNEY.find(l => l.level === level)?.rewardBamboo || 50;
        if (user?.code && !user?.isGuest) {
          const nb = await fbIncrementBamboo(user.code, rewardBamboo).catch(() => bamboo + rewardBamboo);
          setBamboo(nb);
        } else {
          setBamboo(b => b + rewardBamboo);
        }
        toast(`¡${CONOCE_LEVELS[level].label} completado! +${rewardBamboo} bambú 🎁`);
      }
    }
  };

  const saveBurbujaMine = async (id, myText) => {
    const clean = (myText || "").trim();
    if (!clean) return;
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const meta = BURBUJA_ITEM_MAP[id] || {};
    const prev = burbuja[id] || {};
    const next = { ...prev, key:id, question:meta.question || "", section:meta.section || "", [myRole]: clean };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);
    trigHappy();
    const otherRole = myRole === "owner" ? "partner" : "owner";
    const bothAnsweredNow = !!next[otherRole];
    toast(bothAnsweredNow ? "Tu parte quedó guardada. Ya pueden negociar el acuerdo ✓" : "Tu parte quedó guardada ✓");
    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type:"acuerdo",
          msg: bothAnsweredNow
            ? `${me} respondió un acuerdo — ya puedes proponer el acuerdo final 🫧`
            : `${me} actualizó su parte de un acuerdo 🫧`,
          forUid:user?.isOwner !== false ? "partner" : "owner",
          fromUid: user.uid
        }).catch(()=>{});
      }
    }
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const proposeBurbuja = async (id, text, mode = "proposal") => {
    const clean = (text || "").trim();
    if (!clean) return;
    const kind = BURBUJA_EVENT_META[mode] ? mode : "proposal";
    const meta = BURBUJA_EVENT_META[kind];
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const prev = burbuja[id] || {};
    if (!prev.owner || !prev.partner) {
      toast("Primero ambos deben escribir su parte");
      return;
    }
    const history = [...(prev.history || []), { id: Date.now(), type: kind, by: myRole, text: clean, at: new Date().toISOString() }];
    const next = {
      ...prev,
      status: "pending",
      proposalText: clean,
      proposalBy: myRole,
      history,
      bambooAwarded: !!prev.bambooAwarded || !!prev.approvedAt,
      previousAgreement: kind === "renegotiate"
        ? (prev.approvedText || prev.previousAgreement || null)
        : (prev.previousAgreement || null),
      approvedText: null,
      approvedBy: null,
      approvedAt: null,
    };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);
    trigHappy();
    toast(meta.toast);

    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type: "acuerdo",
          msg: meta.notif(me),
          forUid: user?.isOwner !== false ? "partner" : "owner",
          fromUid: user.uid
        }).catch(() => {});
      }
    }

    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const approveBurbuja = async (id) => {
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const prev = burbuja[id] || {};
    if (prev.status !== "pending" || !prev.proposalText) return;
    if (prev.proposalBy === myRole) {
      toast("Tu pareja debe aprobar esta propuesta");
      return;
    }
    const alreadyAwarded = !!prev.bambooAwarded;
    const history = [...(prev.history || []), { id: Date.now(), type: "approved", by: myRole, text: prev.proposalText, at: new Date().toISOString() }];
    const next = {
      ...prev,
      status: "approved",
      approvedText: prev.proposalText,
      approvedBy: myRole,
      approvedAt: new Date().toISOString(),
      previousAgreement: null,
      bambooAwarded: true,
      history,
    };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);

    let nextBamboo = bamboo;
    if (!alreadyAwarded) {
      if (user?.code && !user?.isGuest) {
        nextBamboo = await fbIncrementBamboo(user.code, 10).catch(() => bamboo + 10);
      } else {
        nextBamboo = bamboo + 10;
      }
      setBamboo(nextBamboo);
    }

    trigHappy();
    toast(alreadyAwarded ? "Acuerdo actualizado ✓" : "Acuerdo aprobado ✓ +10 bambú 🌿");
    trackDailyInteraction("agreement");

    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type: "acuerdo",
          msg: BURBUJA_EVENT_META.approved.notif(me),
          forUid: user?.isOwner !== false ? "partner" : "owner",
          fromUid: user.uid
        }).catch(() => {});
      }
    }

    save(null, { bamboo:nextBamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const saveCoupleInfo = (info) => {
    const isNew = Object.keys(coupleInfo).length === 0;
    setCoupleInfo(info);
    const nb = isNew ? bamboo + 20 : bamboo;
    if (isNew) { setBamboo(nb); trigHappy(); toast("Historia guardada 💚 +20 bambú"); }
    else toast("Historia actualizada 💚");
    save(null, { bamboo:nb, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo:info, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const saveNames = async (newNames) => {
    if (!newNames.trim()) return;
    const formatted = newNames.trim();
    setUser(u => ({ ...u, names: formatted }));
    if (user?.uid && !user?.isGuest) {
      await fbSaveUser(user.uid, { names: formatted }).catch(() => {});
    }
    toast("✏️ Nombre actualizado");
  };

  const addGratitud = async (entry) => {
    const myName = getMyName(user, "Yo");
    const enriched = { ...entry, authorName: myName, authorUid: user?.uid, date: new Date().toLocaleDateString("es", {day:"numeric",month:"short"}) };
    trigHappy();
    if (user?.code && !user?.isGuest) {
      await fbAddGratitud(user.code, enriched).catch(() => {});
      const nb = await fbIncrementBamboo(user.code, 5).catch(() => bamboo + 5);
      setBamboo(nb);
      trackDailyInteraction("gratitude");
      // Notify partner
      if (user?.uid) fbSendNotif(user.code, { type:"gratitud", msg:`${myName} escribió algo de gratitud 💛`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
    } else {
      const ng = [{ ...enriched, id: Date.now() }, ...gratitud];
      setGratitud(ng);
      setBamboo(b => b + 5);
      trackDailyInteraction("gratitude");
    }
    toast("💛 Enviado a tu pareja. Solo él/ella lo verá aquí +5 bambú 🌿");
  };

  const submitDailyGratitude = (text) => {
    addGratitud({ text });
    ls.set(`mochi_gratitude_dismissed_${user?.email || user?.uid || "guest"}`, getDateKeyLocal());
  };

  const dismissDailyGratitude = () => {
    setShowDailyGratitude(false);
    ls.set(`mochi_gratitude_dismissed_${user?.email || user?.uid || "guest"}`, getDateKeyLocal());
  };

  const submitDailySeed = async ({ dateKey }) => {
    const coupleCode = user?.code;
    const isGuest = !user?.uid || user?.isGuest;

    if (!isGuest && coupleCode) {
      const nb = await fbIncrementBamboo(coupleCode, DAILY_SEED_BAMBOO_REWARD).catch(() => bamboo + DAILY_SEED_BAMBOO_REWARD);
      setBamboo(nb);
    } else {
      setBamboo(b => b + DAILY_SEED_BAMBOO_REWARD);
    }

    trackDailyInteraction("dailySeed");
    toast("¡Gracias! ✅ +10 bambú 🌱");
    trigHappy();

    ls.set(`mochi_seed_dismissed_${user?.email || user?.uid || "guest"}`, dateKey);

    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
  };

  const addMomento = async (entry) => {
    const myName = getMyName(user, "Yo");
    const enriched = { ...entry, authorName: myName, authorUid: user?.uid, date: new Date().toLocaleDateString("es", {day:"numeric",month:"short",year:"numeric"}) };
    trigHappy();
    if (user?.code && !user?.isGuest) {
      await fbAddMomento(user.code, enriched).catch(() => {});
      const nb = await fbIncrementBamboo(user.code, 5).catch(() => bamboo + 5);
      setBamboo(nb);
      trackDailyInteraction("moment");
      if (user?.uid) fbSendNotif(user.code, { type:"momento", msg:`${myName} guardó un momento especial ✨`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
    } else {
      const nm = [{ ...enriched, id: Date.now() }, ...momentos];
      setMomentos(nm);
      setBamboo(b => b + 5);
      trackDailyInteraction("moment");
    }
    toast("✨ Guardado en el baúl de momentos +5 bambú 🌿");
  };

  const saveDiarioEntry = (entry) => {
    const ts = entry?.ts || new Date().toISOString();
    const dateKey = entry?.dateKey || getDateKeyLocal(new Date(ts));
    let prompts = { ...(entry?.prompts || {}) };
    let isPositiveOnly = false;

    // Por defecto se guarda todo (es lo que sirve para ver patrones).
    // Solo se recorta si la persona lo pidió explícitamente en la casilla.
    if (entry?.keepOnlyConclusion) {
      if (entry.type === "abcd" && prompts.d) {
        prompts = { d: prompts.d };
        isPositiveOnly = true;
      } else if (entry.type === "discusion") {
        const conclusion = prompts.q4 || prompts.q3 || "";
        if (conclusion) {
          prompts = { q4: conclusion };
          isPositiveOnly = true;
        }
      }
    }

    const privateEntry = {
      id: entry?.id || ts,
      ts,
      dateKey,
      type: entry?.type,
      prompts,
      isPositiveOnly,
      isPrivate: true,
      authorEmail: user?.email || null,
      authorUid: user?.uid || null,
      visibleToPartner: false, // La pareja NUNCA puede ver esto
    };

    const next = { ...(diarioEntries || {}), [privateEntry.id]: privateEntry };
    setDiarioEntries(next);

    // localStorage + progress/{uid} (documento privado del dueño, nunca el compartido)
    persistYoPrivate({ diarioEntries: next });

    toast(isPositiveOnly ? "📓 Guardé solo tu conclusión 🔒" : "📓 Entrada guardada en tu diario privado 🔒");
  };

  const claimDailyTip = async () => {
    const reward = 15;
    const message = `Consejo del día leído +${reward} bambú 🌿`;
    trigHappy();
    trackDailyInteraction("consejo");

    if (user?.code && !user?.isGuest) {
      const nb = await fbIncrementBamboo(user.code, reward).catch(() => bamboo + reward);
      setBamboo(nb);
      toast(message);
      save(null, { bamboo:nb, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
      return;
    }

    const nb = bamboo + reward;
    setBamboo(nb);
    toast(message);
    save(null, { bamboo:nb, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const logout = async () => {
    await fbLogout().catch(() => {});
    ls.set("mochi_last", null); setUser(null); setScreen("login");
    setBamboo(0); setHappiness(20); setWater(40); setGarden({});
    setAccessories({}); setExDone({}); setMessages([]); setConoce({}); setBurbuja({}); setCoupleInfo({});
    setGratitud([]); setMomentos([]); setDiarioEntries({}); setYo({ checkins: {}, longestStreak: 0 });
    setStreakInteractions([]);
    setStreakData({
      currentStreak: 0,
      longestStreak: 0,
      unlockedMilestones: [],
      nextMilestone: STREAK_MILESTONES[0],
      progressPct: 0,
      settings: { reminderEnabled: true, reminderHour: "20:00", reminderTone: "suave" },
      rewards: [],
      todayDone: false,
      celebrationText: "",
    });
  };

  const deleteAccount = async (confirmText = "") => {
    if (String(confirmText).trim().toUpperCase() !== "ELIMINAR") {
      toast("Eliminación cancelada");
      return;
    }

    try {
      if (user?.uid && !user?.isGuest) {
        await fbCleanupBeforeAccountDelete({
          uid: user.uid,
          code: user.code || "",
          isOwner: user?.isOwner !== false,
        });
        await fbDeleteCurrentUser();
      }
    } catch (e) {
      const errCode = e?.code || "";
      if (errCode === "auth/requires-recent-login") {
        toast("Por seguridad, vuelve a iniciar sesión y repite la eliminación de cuenta.");
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("deleteAccount error:", e);
      }
      toast("No se pudo eliminar la cuenta completa. Intenta de nuevo.");
      return;
    }

    const u = ls.get("mochi_users") || {};
    const c = ls.get("mochi_codes") || {};
    if (user?.email) delete u[user.email];
    if (user?.code) {
      ls.remove ? ls.remove("mochi_msgs_" + user.code) : ls.set("mochi_msgs_" + user.code, null);
      delete c[user.code];
    }
    ls.set("mochi_users", u); ls.set("mochi_codes", c);
    ls.set("mochi_prog_" + (user?.email || ""), null);
    // Diario y carril "Yo" (privados, viven fuera del progreso compartido)
    try {
      localStorage.removeItem(`mochi_diario_privado_${yoKey}`);
      localStorage.removeItem(`mochi_yo_${yoKey}`);
    } catch (e) {}
    toast("Cuenta eliminada correctamente");
    await logout();
  };

  if (screen === "login") return <><style>{STYLES}</style><Login onLogin={afterLogin}/></>;
  if (screen === "onboarding") return <><style>{STYLES}</style><Onboarding onDone={()=>setScreen("main")}/></>;
  const relTestFallback = (
    <div style={{ minHeight:"100vh", background:C.sandL, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px", fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.dark, fontSize:"1.2rem", marginBottom:8 }}>Hubo un error en el test</div>
      <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, maxWidth:320, marginBottom:14 }}>No te preocupes, tus datos siguen guardados. Puedes reintentar sin cerrar sesión.</div>
      <Btn onClick={() => setScreen("reltest")}>Reintentar test</Btn>
    </div>
  );

  if (screen === "reltest") return <><style>{STYLES}</style><SectionErrorBoundary fallback={relTestFallback}><RelTest user={user} onDone={finishTest} onLater={() => setScreen("main")}/></SectionErrorBoundary></>;

  return (
    <div style={{ fontFamily:"'Nunito',sans-serif", maxWidth:480, margin:"0 auto", minHeight:"100vh", background:C.sandL, position:"relative" }}>
      <style>{STYLES}</style>
      <div style={{ paddingBottom:72 }}>
        {tab==="jardin" && <Jardin bamboo={bamboo} happiness={happiness} water={water} garden={garden} accessories={accessories} mochiHappy={mochiHappy} pandaBubble={pandaBubble} onPet={petMochi} onBuy={buyItem} onWater={waterGarden} onBuyAccessory={buyAccessory}/>}
        {tab==="ejerc" && <Ejercicios exDone={exDone} onComplete={completeEx} user={user} lessonsDone={lessonsDone} onCompleteLesson={completeLesson} bamboo={bamboo} exChestState={exChestState} exStreak={exStreak} onGoToGarden={() => setTab("jardin")}/>}
        {tab==="conocete" && <Conocete conoce={conoce} onSave={saveConoce} user={user} streakInfo={streakData} onDailySeedAnswer={submitDailySeed}/>}
        {tab==="burbuja" && <Burbuja burbuja={burbuja} onSaveMine={saveBurbujaMine} onPropose={proposeBurbuja} onApprove={approveBurbuja} user={user}/>}
        {tab==="perfil" && <Perfil user={user} bamboo={bamboo} garden={garden} accessories={accessories} exDone={exDone} messages={messages} burbuja={burbuja} conoce={conoce} lessonsDone={lessonsDone} coupleInfo={coupleInfo} streakInfo={streakData} gratitudeStreak={gratitudeStreak} onSaveCoupleInfo={saveCoupleInfo} onSaveNames={saveNames} onLogout={logout} testScores={testScores} onRetakeTest={retakeTest} onDeleteAccount={deleteAccount} gratitud={gratitud} momentos={momentos} onAddGratitud={addGratitud} onAddMomento={addMomento} onSendMessage={sendMsg} onClaimDailyTip={claimDailyTip} diarioEntries={diarioEntries} onSaveDiarioEntry={saveDiarioEntry}/>} 
      </div>
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.white, borderTop:`1.5px solid ${C.border}`, display:"flex", zIndex:1000, boxShadow:`0 -3px 0 ${C.line}` }}>
        {NAV.map(n => {
          const active = tab === n.id;
          const myNotifRole = user?.isOwner !== false ? "owner" : "partner";
          const isNotifForMe = (x) => {
            if (!x || x.read) return false;
            if (x.fromUid && user?.uid && x.fromUid === user.uid) return false;
            return x.forUid === user?.uid || x.forUid === myNotifRole || (x.forUid === "partner" && myNotifRole === "partner");
          };
          const notifTypes = { "ejerc":["ejercicio","leccion"], "conocete":["conoce"], "burbuja":["gratitud","momento","acuerdo"], "perfil":["racha","mensaje"] };
          const nBadge = notifTypes[n.id] ? notifs.filter(x => isNotifForMe(x) && notifTypes[n.id].includes(x.type)).length : 0;
          const badge = nBadge > 0 ? nBadge : null;
          return (
            <div key={n.id} onClick={()=>{
              setTab(n.id);
              // Mark related notifs as read
              const tabTypes = notifTypes[n.id] || [];
              notifs
                .filter(x => isNotifForMe(x) && tabTypes.includes(x.type))
                .forEach(x => fbMarkNotifRead(x.id).catch(()=>{}));
            }} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"8px 0 7px", cursor:"pointer" }}>
              <div style={{ position:"relative" }}>
                <div style={{ fontSize:active?"1.3rem":"1.1rem", transition:"all 0.15s", filter:active?"none":"opacity(0.45)", transform:active?"scale(1.15) translateY(-2px)":"none" }}>{n.emoji}</div>
                {badge && <div style={{ position:"absolute", top:-4, right:-6, background:"#c05068", color:C.white, borderRadius:5, width:15, height:15, fontSize:"0.6rem", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{badge}</div>}
              </div>
              <div style={{ fontSize:"0.58rem", fontWeight:active?800:600, color:active?C.dark:C.inkL, marginTop:2, letterSpacing:"0.3px" }}>{n.label}</div>
              {active && <div style={{ width:16, height:3, borderRadius:50, background:C.dark, marginTop:2 }}/>}
            </div>
          );
        })}
      </div>
      {TAB_TIPS[tab] && !seenTabTips[tab] && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 28px)", maxWidth:452, background:C.white, border:`1.5px solid ${C.olive}`, borderRadius:16, padding:"12px 14px", boxShadow:"0 6px 20px rgba(0,0,0,0.18)", zIndex:1001, display:"flex", gap:10, alignItems:"flex-start", animation:"fadeIn 0.3s ease" }}>
          <div style={{ fontSize:"1.6rem" }}>🐼</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"0.84rem", color:C.ink, lineHeight:1.55, fontWeight:700 }}>{TAB_TIPS[tab]}</div>
            <div onClick={() => dismissTabTip(tab)} style={{ marginTop:8, fontSize:"0.8rem", fontWeight:800, color:C.olive, cursor:"pointer" }}>Entendido ✓</div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg}/>
      {showDailyGratitude && (
        <DailyGratitudeModal
          user={user}
          onSubmit={submitDailyGratitude}
          onClose={dismissDailyGratitude}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// BAUL SECTION — embedded in Perfil
// ═══════════════════════════════════════════════
// ─── Helpers compartidos por Momentos y Gratitud ───
const getEntryTime = (entry) => {
  if (entry?.createdAt?.toDate) return entry.createdAt.toDate().getTime();
  if (entry?.createdAt?.seconds) return entry.createdAt.seconds * 1000;
  if (entry?.time) return new Date(entry.time).getTime();
  return 0;
};

function AllEntriesModal({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.65)", zIndex:6000, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.sandL, borderRadius:"22px 22px 0 0", width:"100%", maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ background:C.dark, padding:"16px 18px 18px", borderRadius:"22px 22px 0 0" }}>
          <div style={{ width:34, height:5, background:"rgba(255,255,255,0.2)", borderRadius:50, margin:"0 auto 12px" }}/>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.2rem", color:C.cream2 }}>{title}</div>
          <div style={{ fontSize:"0.75rem", color:`${C.cream}88`, marginTop:3 }}>{subtitle}</div>
        </div>
        <div style={{ padding:"14px 16px 32px" }}>
          {children}
          <button onClick={onClose} style={{ width:"100%", marginTop:10, padding:"12px", background:C.dark, color:C.cream2, border:"none", borderRadius:14, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", cursor:"pointer" }}>
            Cerrar ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MOMENTOS — su historia de pareja
// ═══════════════════════════════════════════════
function MomentosSection({ user, momentos, onAddMomento }) {
  const nameA = user?.names ? user.names.split("&")[0].trim() : "Panda A";
  const nameB = user?.names ? user.names.split("&")[1]?.trim() || "Panda B" : "Panda B";
  const [showForm, setShowForm] = useState(false);
  const [mTitle, setMTitle] = useState(""); const [mText, setMText] = useState("");
  const [showAll, setShowAll] = useState(false);

  const getAuthorLabel = (entry) => {
    if (entry?.authorName && entry.authorName !== "Tú") return entry.authorName;
    if (entry?.authorUid && user?.uid) {
      return entry.authorUid === user.uid ? nameA : nameB;
    }
    return nameA;
  };

  const allMomentos = [...momentos].sort((a, b) => getEntryTime(b) - getEntryTime(a));
  const recentMomentos = allMomentos.slice(0, 3);

  const submit = () => { if (!mTitle.trim()||!mText.trim()) return; onAddMomento({ title:mTitle.trim(), text:mText.trim() }); setMTitle(""); setMText(""); setShowForm(false); };

  const renderMomento = (m, i, big) => (
    <div key={m.id||i} style={{ background:"#f2f6e6", borderRadius:12, padding:big ? "12px 14px" : "10px 14px", marginBottom:big ? 10 : 8, border:`1px solid #a8d48830` }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:big ? "0.9rem" : "0.88rem", color:C.dark }}>✨ {m.title}</div>
        <div style={{ fontSize:"0.68rem", color:C.inkL, fontWeight:700 }}>{m.date}</div>
      </div>
      <div style={{ fontSize:big ? "0.88rem" : "0.85rem", color:C.inkM, lineHeight:1.65 }}>{m.text}</div>
      <div style={{ fontSize:"0.68rem", color:C.inkL, marginTop:6, fontWeight:700 }}>
        Por {getAuthorLabel(m)}
      </div>
    </div>
  );

  return (
    <div style={{ background:C.white, borderRadius:20, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}`, overflow:"hidden" }}>
      <div style={{ background:C.dark, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.2rem", color:C.cream2 }}>✨ Nuestros momentos</div>
          <div style={{ fontSize:"0.75rem", color:`${C.cream}88`, fontWeight:700, marginTop:2 }}>Su historia de pareja, escrita por ustedes</div>
        </div>
        <div style={{ textAlign:"center", minWidth:44 }}>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.6rem", color:C.gold, lineHeight:1 }}>{momentos.length}</div>
          <div style={{ fontSize:"0.62rem", color:`${C.cream}88`, fontWeight:700 }}>guardados</div>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {!showForm
          ? <button onClick={() => setShowForm(true)} style={{ width:"100%", background:C.olive, color:C.cream2, border:"none", borderRadius:12, padding:"12px 0", fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)", marginBottom:12 }}>+ Guardar un momento</button>
          : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
              <input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Título del momento" style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:10, padding:"9px 12px", fontFamily:"'Nunito',sans-serif", fontSize:"0.88rem", outline:"none", color:C.ink, background:C.cream2, marginBottom:8, boxSizing:"border-box" }}/>
              <TA value={mText} onChange={setMText} placeholder="¿Qué pasó? ¿Cómo se sintieron?" rows={3} style={{ marginBottom:10 }}/>
              <div style={{ display:"flex", gap:8 }}><Btn onClick={submit} style={{ flex:1 }}>Guardar ✨</Btn><Btn onClick={() => { setShowForm(false); setMTitle(""); setMText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
            </div>}
        {momentos.length === 0
          ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>✨ Todavía no hay momentos guardados</div>
          : recentMomentos.map((m,i) => renderMomento(m, i, false))}
        {momentos.length > 3 && (
          <button onClick={() => setShowAll(true)} style={{ width:"100%", marginTop:8, padding:"10px", background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:12, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.85rem", color:C.dark, cursor:"pointer" }}>
            Ver todos ({momentos.length})
          </button>
        )}
      </div>

      {showAll && (
        <AllEntriesModal title="✨ Todos los momentos" subtitle={`${allMomentos.length} momentos`} onClose={() => setShowAll(false)}>
          {allMomentos.map((m,i) => renderMomento(m, i, true))}
        </AllEntriesModal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// GRATITUD — agradecimientos de tu pareja + racha
// ═══════════════════════════════════════════════
function GratitudSection({ user, gratitud, onAddGratitud, gratitudeStreak }) {
  const [showForm, setShowForm] = useState(false);
  const [gText, setGText] = useState("");
  const [showAll, setShowAll] = useState(false);

  const myName = getMyName(user, "");
  const isFromMe = (entry) => {
    if (user?.uid && entry?.authorUid) return entry.authorUid === user.uid;
    if (entry?.authorName) return entry.authorName === myName;
    return false;
  };

  const partnerGratitud = [...gratitud].filter(g => !isFromMe(g)).sort((a, b) => getEntryTime(b) - getEntryTime(a));
  const recentGratitud = partnerGratitud.slice(0, 3);

  const submit = () => { if (!gText.trim()) return; onAddGratitud({ text:gText.trim() }); setGText(""); setShowForm(false); };

  const renderGratitud = (g, i, big) => (
    <div key={g.id||i} style={{ background:"#fffde8", borderRadius:12, padding:big ? "12px 14px" : "10px 14px", marginBottom:big ? 10 : 8, border:"1px solid #e8d84030" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:big ? "0.85rem" : "0.8rem", color:C.dark }}>🐼 {g.authorName || g.name || "Tu pareja"}</div>
        <div style={{ fontSize:"0.68rem", color:C.inkL, fontWeight:700 }}>{g.date}</div>
      </div>
      <div style={{ fontSize:big ? "0.9rem" : "0.86rem", color:C.inkM, lineHeight:1.6 }}>{g.text}</div>
    </div>
  );

  return (
    <div style={{ background:C.white, borderRadius:20, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}`, overflow:"hidden" }}>
      <div style={{ background:"#fff6dc", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1.5px solid ${C.border}` }}>
        <div>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.1rem", color:C.dark }}>💛 Gratitud</div>
          <div style={{ fontSize:"0.75rem", color:C.inkL, fontWeight:700, marginTop:2 }}>
            {gratitudeStreak > 0 ? `${gratitudeStreak} días seguidos agradeciendo` : "Agradece hoy para empezar tu racha"}
          </div>
        </div>
        <div style={{ textAlign:"center", minWidth:44 }}>
          <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.6rem", color:"#c05068", lineHeight:1 }}>{gratitudeStreak}</div>
          <div style={{ fontSize:"0.62rem", color:C.inkL, fontWeight:700 }}>racha</div>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {!showForm
          ? <button onClick={() => setShowForm(true)} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:12, padding:"11px 0", fontFamily:"'Baloo 2',sans-serif", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)", marginBottom:12 }}>+ Anotar acto de bondad</button>
          : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
              <TA value={gText} onChange={setGText} placeholder="¿Qué le agradeces a tu pareja hoy?" rows={2} style={{ marginBottom:10 }}/>
              <div style={{ display:"flex", gap:8 }}><Btn onClick={submit} style={{ flex:1 }}>Guardar 💛</Btn><Btn onClick={() => { setShowForm(false); setGText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
            </div>}
        {partnerGratitud.length === 0
          ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>💛 Aquí aparecerán los agradecimientos que te escriba tu pareja</div>
          : recentGratitud.map((g,i) => renderGratitud(g, i, false))}
        {partnerGratitud.length > 3 && (
          <button onClick={() => setShowAll(true)} style={{ width:"100%", marginTop:8, padding:"10px", background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:12, fontFamily:"'Baloo 2',sans-serif", fontSize:"0.85rem", color:C.dark, cursor:"pointer" }}>
            Ver todas ({partnerGratitud.length})
          </button>
        )}
      </div>

      {showAll && (
        <AllEntriesModal title="💛 Todas las gratitudes" subtitle={`${partnerGratitud.length} agradecimientos de tu pareja`} onClose={() => setShowAll(false)}>
          {partnerGratitud.map((g,i) => renderGratitud(g, i, true))}
        </AllEntriesModal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// GALERÍA DE LOGROS — habilidades ganadas en ejercicios
// ═══════════════════════════════════════════════
function LogrosSection({ exDone }) {
  const skillLevels = useMemo(() => computeSkillLevels(exDone), [exDone]);
  const maxLevel = SKILL_LEVELS.length - 1;

  return (
    <div style={{ background:C.white, borderRadius:20, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}`, padding:16 }}>
      <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.05rem", color:C.dark }}>🏆 Galería de logros</div>
      <div style={{ fontSize:"0.75rem", color:C.inkL, fontWeight:700, marginTop:2, marginBottom:12 }}>Habilidades de pareja que ganan con los ejercicios</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {Object.entries(EXERCISE_SKILLS).map(([skillKey, meta]) => {
          const data = skillLevels[skillKey];
          const locked = data.level === 0 && data.xp === 0;
          const maxed = data.level >= maxLevel;
          return (
            <div key={skillKey} style={{ background: locked ? C.sandL : meta.color + "1f", borderRadius:16, padding:12, border:`1.5px solid ${locked ? C.border : meta.color + "60"}`, display:"flex", flexDirection:"column", gap:6, opacity: locked ? 0.7 : 1 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:"1.6rem", filter: locked ? "grayscale(1)" : "none" }}>{meta.emoji}</div>
                <div style={{ fontSize:"0.68rem", fontWeight:800, color:C.inkM }}>{maxed ? "⭐ Máx." : `Nv. ${data.level}`}</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"0.9rem", color:C.dark }}>{meta.label}</div>
                <div style={{ fontSize:"0.68rem", color:C.inkL, lineHeight:1.4 }}>{meta.desc}</div>
              </div>
              <div style={{ background:C.white, borderRadius:50, height:5, overflow:"hidden" }}>
                <div style={{ width:`${maxed ? 100 : data.pct}%`, height:"100%", background:meta.color, borderRadius:50 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════
// BAÚL — Gratitud + Momentos
// ═══════════════════════════════════════════════
function Baul({ user, gratitud, momentos, onAddGratitud, onAddMomento }) {
  const nameA = user?.names ? user.names.split("&")[0].trim() : "Panda A";
  const nameB = user?.names ? user.names.split("&")[1]?.trim() || "Panda B" : "Panda B";
  const getAuthorLabel = (entry) => {
    if (entry?.authorName && entry.authorName !== "Tú") return entry.authorName;
    if (entry?.authorUid && user?.uid) {
      return entry.authorUid === user.uid ? nameA : nameB;
    }
    return nameA;
  };
  const [activeTab, setActiveTab] = useState("gratitud");
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [momentoTitle, setMomentoTitle] = useState("");
  const [momentoText, setMomentoText] = useState("");
  const [showMomentoForm, setShowMomentoForm] = useState(false);

  const myNameBaul = getMyName(user, "");
  const isFromMeBaul = (entry) => {
    if (user?.uid && entry?.authorUid) return entry.authorUid === user.uid;
    if (entry?.authorName) return entry.authorName === myNameBaul;
    return false;
  };

  const partnerGratitudBaul = [...gratitud].filter(g => !isFromMeBaul(g)).sort((a, b) => new Date(b?.time || b?.date || 0) - new Date(a?.time || a?.date || 0));

  const submitGratitud = () => {
    if (!text.trim()) return;
    onAddGratitud({ text: text.trim() });
    setText(""); setShowForm(false);
  };

  const submitMomento = () => {
    if (!momentoTitle.trim() || !momentoText.trim()) return;
    onAddMomento({ title: momentoTitle.trim(), text: momentoText.trim() });
    setMomentoTitle(""); setMomentoText(""); setShowMomentoForm(false);
  };

  return (
    <div style={{ background:C.sandL, minHeight:"100vh", paddingBottom:90 }}>
      {/* Header */}
      <div style={{ background:C.dark, padding:"44px 20px 0" }}>
        <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1.9rem", color:C.cream2, marginBottom:4 }}>Baúl 💝</div>
        <div style={{ color:`${C.cream}88`, fontSize:"0.84rem", fontWeight:600, marginBottom:14 }}>Gratitud y momentos hermosos</div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4 }}>
          {[["gratitud","💛 Gratitud"],["momentos","✨ Momentos"]].map(([id,label]) => (
            <div key={id} onClick={() => setActiveTab(id)}
              style={{ flex:1, padding:"10px 0", textAlign:"center", fontFamily:"'Baloo 2',sans-serif",
                fontSize:"0.9rem", cursor:"pointer", borderRadius:"12px 12px 0 0",
                background: activeTab===id ? C.sandL : "transparent",
                color: activeTab===id ? C.dark : `${C.cream}88`,
                transition:"all 0.15s" }}>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px 14px 0" }}>

        {/* ── GRATITUD TAB ── */}
        {activeTab === "gratitud" && (
          <>
            <div style={{ background:"#fffde8", borderRadius:16, padding:14, marginBottom:14, border:`1.5px solid #e8d840` }}>
              <div style={{ fontSize:"0.84rem", color:"#7a7020", lineHeight:1.6 }}>
                💡 Escribe algo lindo que tu pareja hizo por ti. Será un regalo privado: solo tu pareja lo verá aquí.
              </div>
            </div>

            {/* Add button */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:14,
                  fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)", marginBottom:14 }}>
                + Añadir acto de bondad
              </button>
            ) : (
              <div style={{ background:C.white, borderRadius:18, padding:16, marginBottom:14, border:`1.5px solid ${C.border}`, boxShadow:`0 3px 0 ${C.border}` }}>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:6, letterSpacing:"0.6px" }}>¿QUÉ HIZO POR TI?</div>
                <TA value={text} onChange={setText} placeholder={`Ej: Me preparó el desayuno sin que se lo pidiera...`} rows={3} style={{ marginBottom:12 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn onClick={submitGratitud} style={{ flex:1 }}>Guardar 💛</Btn>
                  <Btn onClick={() => { setShowForm(false); setText(""); }} variant="ghost" style={{ padding:"12px 14px" }}>✕</Btn>
                </div>
              </div>
            )}

            {/* Gratitud entries */}
            {partnerGratitudBaul.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.inkL }}>
                <div style={{ fontSize:"2.5rem", marginBottom:8 }}>💛</div>
                <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.inkM }}>Aquí aparecerán los agradecimientos de tu pareja</div>
                <div style={{ fontSize:"0.82rem", marginTop:6 }}>Cuando te escriba algo, lo verás aquí</div>
              </div>
            ) : partnerGratitudBaul.map((g, i) => (
              <div key={g.id || i} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
                border:`1.5px solid ${C.border}`, boxShadow:`0 2px 0 ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ background:"#fff0d0", borderRadius:8, padding:"3px 10px",
                    fontFamily:"'Baloo 2',sans-serif", fontSize:"0.82rem", color:C.dark }}>
                    🐼 {g.authorName || g.name || "Tu pareja"}
                  </div>
                  <div style={{ fontSize:"0.7rem", color:C.inkL, marginLeft:"auto", fontWeight:700 }}>{g.date}</div>
                </div>
                <div style={{ fontSize:"0.9rem", color:C.ink, lineHeight:1.65 }}>{g.text}</div>
              </div>
            ))}
          </>
        )}

        {/* ── MOMENTOS TAB ── */}
        {activeTab === "momentos" && (
          <>
            <div style={{ background:"#eef6e4", borderRadius:16, padding:14, marginBottom:14, border:`1.5px solid #a8d488` }}>
              <div style={{ fontSize:"0.84rem", color:"#3e5e28", lineHeight:1.6 }}>
                ✨ Guarden aquí los momentos que no quieren olvidar. Su historia de pareja, escrita por ustedes.
              </div>
            </div>

            {!showMomentoForm ? (
              <button onClick={() => setShowMomentoForm(true)}
                style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:14,
                  fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)", marginBottom:14 }}>
                + Guardar un momento
              </button>
            ) : (
              <div style={{ background:C.white, borderRadius:18, padding:16, marginBottom:14, border:`1.5px solid ${C.border}`, boxShadow:`0 3px 0 ${C.border}` }}>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:6, letterSpacing:"0.6px" }}>TÍTULO DEL MOMENTO</div>
                <input value={momentoTitle} onChange={e => setMomentoTitle(e.target.value)}
                  placeholder="Ej: Nuestro primer viaje juntos"
                  style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:12, padding:"10px 12px",
                    fontFamily:"'Nunito',sans-serif", fontSize:"0.9rem", outline:"none", color:C.ink,
                    background:C.cream2, marginBottom:10, boxSizing:"border-box" }}/>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:6, letterSpacing:"0.6px" }}>CUÉNTALO</div>
                <TA value={momentoText} onChange={setMomentoText} placeholder="¿Qué pasó? ¿Cómo se sintieron? ¿Qué lo hizo especial?" rows={4} style={{ marginBottom:12 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn onClick={submitMomento} style={{ flex:1 }}>Guardar ✨</Btn>
                  <Btn onClick={() => { setShowMomentoForm(false); setMomentoTitle(""); setMomentoText(""); }} variant="ghost" style={{ padding:"12px 14px" }}>✕</Btn>
                </div>
              </div>
            )}

            {momentos.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.inkL }}>
                <div style={{ fontSize:"2.5rem", marginBottom:8 }}>✨</div>
                <div style={{ fontFamily:"'Baloo 2',sans-serif", color:C.inkM }}>Todavía no hay momentos</div>
                <div style={{ fontSize:"0.82rem", marginTop:6 }}>Guarden aquí sus recuerdos más lindos</div>
              </div>
            ) : momentos.map((m, i) => (
              <div key={m.id || i} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
                border:`1.5px solid #a8d488`, boxShadow:`0 2px 0 #dcecc4` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div style={{ fontFamily:"'Baloo 2',sans-serif", fontSize:"1rem", color:C.dark, flex:1 }}>✨ {m.title}</div>
                  <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700, marginLeft:8, whiteSpace:"nowrap" }}>{m.date}</div>
                </div>
                <div style={{ fontSize:"0.88rem", color:C.inkM, lineHeight:1.7 }}>{m.text}</div>
                <div style={{ fontSize:"0.7rem", color:C.inkL, marginTop:6, fontWeight:700 }}>
                  Por {getAuthorLabel(m)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
