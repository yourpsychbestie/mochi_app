import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fbRegister, fbLogin, fbLogout, fbOnAuthChange,
  fbDeleteCurrentUser,
  fbCleanupBeforeAccountDelete,
  fbSaveUser, fbGetUser,
  fbGetCode, fbCreateCodeOwner, fbClaimPartnerCode, fbFindCodeByUid,
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
  fbSaveGameState, fbListenGameState, fbResetGame,
  fbSendNotif, fbListenNotifs, fbMarkNotifRead,
  fbSaveStreakInteraction, fbListenStreakInteractions,
  fbSaveStreakProfile, fbListenStreakProfile,
  fbSaveDiarioEntry, fbListenDiario,
} from "./firebase";
import Cuestionarios, { getQuizAdviceFromConoce } from "./Cuestionarios";

// Prevents the fbOnAuthChange listener from calling afterLogin while doReg/doJoin
// is actively handling a fresh registration (avoids race conditions on new sign-ups).
let _pendingLocalAuth = false;

const C = {
  cream:"#ede5ff", cream2:"#faf6ff", dark:"#2d1b4e",
  olive:"#7c5cbf", oliveL:"#b39ddb", gold:"#d4a843",
  salmon:"#e8907a", sky:"#a78bda", sand:"#e3d8f8", sandL:"#f5f0ff",
  white:"#ffffff", ink:"#1a1030", inkM:"#6b5a8a", inkL:"#9e8dc2",
  border:"rgba(100,70,180,0.14)", line:"rgba(100,70,180,0.08)",
  pink:"#f4a8c0", rose:"#c05068",
  mint:"#d4c8ff", teal:"#7c5cbf",
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
  conoce: "Pregunta de Conocete",
  agreement: "Acuerdo en Burbuja",
};

const STREAK_RESOURCES = [
  { type: "Articulo", title: "Escucha activa en pareja (5 minutos)", url: "https://www.gottman.com/blog/active-listening/" },
  { type: "Video", title: "Reparar conflictos con calidez", url: "https://www.youtube.com/watch?v=AKTyPgwfPgg" },
  { type: "Articulo", title: "Micro-habitos de conexion emocional", url: "https://positivepsychology.com/emotional-intimacy/" },
];

const getDateKeyLocal = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

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
    console.error("Section render error:", error);
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
  const parts = String(user?.names || "")
    .split("&")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    nameA: parts[0] || "Persona A",
    nameB: parts[1] || parts[0] || "Persona B",
  };
};

// ═══════════════════════════════════════════════
// GARDEN ITEMS — multiple quantities, koi/lotus aesthetic
// ═══════════════════════════════════════════════
const GARDEN_ITEMS = [
  // Plantas
  {id:"bamboo1",   cat:"plantas", name:"Bambú",           cost:20,  desc:"Trae serenidad al jardín"},
  {id:"bamboo2",   cat:"plantas", name:"Bambusal",         cost:35,  desc:"Bosquecito de bambú"},
  {id:"bonsai",    cat:"plantas", name:"Bonsái",           cost:90,  desc:"Paciencia y belleza cultivada"},
  {id:"lotus1",    cat:"plantas", name:"Loto Rosa",        cost:25,  desc:"Flor del amor puro"},
  {id:"lotus2",    cat:"plantas", name:"Loto Blanco",      cost:30,  desc:"Pureza y paz"},
  {id:"willow",    cat:"plantas", name:"Sauce Llorón",     cost:45,  desc:"Elegancia serena"},
  {id:"peony",     cat:"plantas", name:"Peonía",           cost:15,  desc:"Flores de primavera"},
  {id:"cherry",    cat:"plantas", name:"Cerezo",           cost:80,  desc:"Belleza efímera"},
  {id:"lily",      cat:"plantas", name:"Lirio Azul",       cost:20,  desc:"Calma y claridad"},
  {id:"flower_pot",cat:"plantas", name:"Maceta con Flor",  cost:18,  desc:"Tierna y colorida"},
  {id:"herb_pot",  cat:"plantas", name:"Hierbitas",        cost:22,  desc:"Un jardín pequeñito"},
  {id:"seeds",     cat:"plantas", name:"Bolsita de Semillas",cost:12, desc:"Todo empieza con una semilla"},
  // Agua
  {id:"pond",      cat:"agua",    name:"Estanque",         cost:60,  desc:"Espejo del cielo"},
  {id:"koi1",      cat:"agua",    name:"Pez Koi Rojo",     cost:40,  desc:"Buena fortuna"},
  {id:"koi2",      cat:"agua",    name:"Pez Koi Dorado",   cost:55,  desc:"Prosperidad"},
  {id:"lotus_pad", cat:"agua",    name:"Hoja de Loto",     cost:20,  desc:"Reposa en el agua"},
  {id:"wateringcan",cat:"agua",   name:"Regadera",         cost:28,  desc:"Con amor se riega todo"},
  {id:"hose",      cat:"agua",    name:"Manguera",         cost:32,  desc:"Para el jardín grande"},
  // Cielo & Pájaros
  {id:"sun",       cat:"cielo",   name:"Sol",              cost:30,  desc:"Calienta el jardín"},
  {id:"rainbow",   cat:"cielo",   name:"Arcoíris",         cost:100, desc:"Magia después de la lluvia"},
  {id:"swallow1",  cat:"cielo",   name:"Gorrión",          cost:35,  desc:"Mensajero del amor"},
  {id:"swallow2",  cat:"cielo",   name:"Par de Gorriones", cost:55,  desc:"Vuelan juntos siempre"},
  {id:"clouds",    cat:"cielo",   name:"Nubecitas",        cost:25,  desc:"Sueños flotantes"},
  {id:"birds_fly", cat:"cielo",   name:"Bandada",          cost:65,  desc:"Libertad compartida"},
  // Decoración
  {id:"arch",      cat:"deco",    name:"Arco de Enredaderas",cost:75, desc:"Entrada a su mundo"},
  {id:"birdhouse", cat:"deco",    name:"Casita de Pájaro",  cost:40,  desc:"Un hogar dentro del hogar"},
  {id:"lantern",   cat:"deco",    name:"Farolito",          cost:25,  desc:"Luz cálida"},
  {id:"lantern2",  cat:"deco",    name:"Farolitos",         cost:40,  desc:"Noche romántica"},
  {id:"heart",     cat:"deco",    name:"Corazón",           cost:50,  desc:"Amor visible"},
  {id:"bridge",    cat:"deco",    name:"Puente",            cost:70,  desc:"Un camino juntos"},
  {id:"pagoda",    cat:"deco",    name:"Pagoda",            cost:90,  desc:"Refugio sagrado"},
  {id:"tools",     cat:"deco",    name:"Herramientas",      cost:20,  desc:"Los jardineros expertos"},
  {id:"rocks",     cat:"deco",    name:"Jardín de Rocas",   cost:45,  desc:"Calma zen"},
  // Especiales
  {id:"firefly",   cat:"especial",name:"Luciérnagas",       cost:65,  desc:"Magia nocturna"},
  {id:"moongate",  cat:"especial",name:"Luna Llena",        cost:120, desc:"Romance bajo la luna"},
  // Cuarto (indoor)
  {id:"lamp",        cat:"cuarto", name:"Lámpara Cozy",      cost:30, desc:"Calidez de hogar"},
  {id:"rug",         cat:"cuarto", name:"Alfombra Suave",    cost:25, desc:"Pisada suave"},
  {id:"cushions",    cat:"cuarto", name:"Cojines",            cost:20, desc:"Para acurrucarse"},
  {id:"shelf",       cat:"cuarto", name:"Librero",            cost:45, desc:"Historias compartidas"},
  {id:"fairy_lights",cat:"cuarto", name:"Luces de Hada",     cost:40, desc:"Noche mágica"},
  {id:"indoor_plant",cat:"cuarto", name:"Plantita Interior", cost:15, desc:"Vida en el cuarto"},
];

// Regar sigue siendo acción especial
const WATER_ACTION = {id:"water", name:"Regar", cost:5};

// ═══════════════════════════════════════════════
// PANDA ACCESSORIES
// ═══════════════════════════════════════════════
const PANDA_ACCESSORIES = [
  // Sombreros
  {id:"hat_flower",   cat:"sombrero", name:"Corona de Flores",   cost:40, emoji:"🌸", desc:"Romanticísima"},
  {id:"hat_crown",    cat:"sombrero", name:"Corona Real",         cost:70, emoji:"👑", desc:"Son reyes"},
  {id:"hat_straw",    cat:"sombrero", name:"Sombrero de Paja",   cost:25, emoji:"🌾", desc:"Del jardín"},
  {id:"hat_beret",    cat:"sombrero", name:"Boina Chic",          cost:32, emoji:"🧢", desc:"Cute y elegante"},
  {id:"hat_beanie",   cat:"sombrero", name:"Gorrito Nube",        cost:36, emoji:"🧶", desc:"Suave y cozy"},
  {id:"hat_frog",     cat:"sombrero", name:"Sombrero Ranita",     cost:45, emoji:"🐸", desc:"Demasiado tierno"},
  {id:"hat_garden",   cat:"sombrero", name:"Gorro Jardinero",     cost:30, emoji:"🪴", desc:"El experto del jardín"},
  // Lentes
  {id:"glasses_heart",cat:"lentes",  name:"Lentes Corazón",      cost:30, emoji:"💝", desc:"Ver con amor"},
  {id:"glasses_sun",  cat:"lentes",  name:"Lentes de Sol",       cost:25, emoji:"😎", desc:"Fresquísimos"},
  {id:"glasses_round",cat:"lentes",  name:"Lentes Redondos",     cost:28, emoji:"🕶️", desc:"Estilo clásico"},
  {id:"glasses_star", cat:"lentes",  name:"Lentes Estrella",     cost:42, emoji:"⭐", desc:"Brillo total"},
  // Accesorios
  {id:"acc_bow",      cat:"accesorio",name:"Moño Rosa",           cost:20, emoji:"🎀", desc:"Kawaii"},
  {id:"acc_scarf",    cat:"accesorio",name:"Bufanda",             cost:25, emoji:"🧣", desc:"Para el frío"},
  {id:"acc_apron",    cat:"accesorio",name:"Delantal de Jardín",  cost:28, emoji:"🌿", desc:"El/la chef del jardín"},
  {id:"acc_gloves",   cat:"accesorio",name:"Guantes de Jardín",   cost:22, emoji:"🧤", desc:"Manos protegidas"},
  {id:"acc_basket",   cat:"accesorio",name:"Cesta de Flores",     cost:35, emoji:"🧺", desc:"Recolector/a de amor"},
  // Trajes
  {id:"outfit_kimono",  cat:"traje", name:"Kimono",               cost:60, emoji:"👘", desc:"Elegancia japonesa"},
  {id:"outfit_sailor",  cat:"traje", name:"Marinero",             cost:55, emoji:"⚓", desc:"Aventureros del mar"},
  {id:"outfit_witch",   cat:"traje", name:"Brujita",              cost:65, emoji:"🧙", desc:"Magia y misterio"},
  {id:"outfit_angel",   cat:"traje", name:"Angelitos",            cost:80, emoji:"👼", desc:"Purísimos"},
  {id:"outfit_cottage", cat:"traje", name:"Cottagecore",          cost:70, emoji:"🌻", desc:"Encanto rural"},
  {id:"outfit_overalls",cat:"traje", name:"Overol de Jardín",     cost:55, emoji:"🌱", desc:"Jardinero/a en acción"},
  {id:"outfit_cozy",    cat:"traje", name:"Cozy de Invierno",     cost:75, emoji:"☕", desc:"Calientito y adorable"},
];


const EXERCISES = [
  {id:"validacion",emoji:"💬",title:"La Danza de la Validación",tags:"DBT · Sistémica",bamboo:40,time:"15 min",
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
  {id:"ojos",emoji:"👁",title:"4 Minutos de Contacto Visual",tags:"ACT · Arthur Aron",bamboo:30,time:"5 min",
    desc:"Mirarse a los ojos 4 minutos sin hablar. Estudios de Arthur Aron demuestran que esta práctica genera sentimientos de amor profundo entre extraños — imagina entre parejas.",
    instructions:["Abran Mochi al mismo tiempo en sus celulares","Este ejercicio es de presencia — sin hablar, solo escribir","Escriban lo que sienten al pensar en el otro en este momento","Lean la respuesta del otro en silencio","Compartan una palabra de cómo se sintieron al final"],
    timer:240,timerLabel:"Mírense a los ojos en silencio",
    beforeTimer:["Siéntense frente a frente, muy cerca.","Pongan el teléfono entre los dos.","Está permitido sonreír — no hablar.","Presionen INICIAR cuando estén listos."],
    afterPrompts:[{role:0,ph:"Una palabra para lo que sentí…"},{role:1,ph:"Lo que vi en tus ojos fue…"}]},
  {id:"espejo",emoji:"🪞",title:"Técnica del Espejo",tags:"Imago · Narrativa",bamboo:35,time:"20 min",
    desc:"El espejo confirma que el mensaje fue recibido antes de responder. Basada en terapia Imago de Harville Hendrix.",
    instructions:["Persona A escribe algo importante que quiera compartir","Persona B refleja con sus palabras lo que entendió","A confirma si fue bien capturado o aclara","B valida la experiencia de A sin dar consejos","Intercambien roles en la siguiente ronda"],
    phases:[
      {role:0,q:"Persona A: Algo que quieras que tu pareja entienda mejor.",ph:"Quiero que entiendas que…"},
      {role:1,q:"Persona B: Refleja lo que escuchaste.",ph:"Lo que escucho es… ¿Lo capté bien?",hint:"No interpretes — solo refleja. Usa sus mismas palabras."},
      {role:0,q:"Persona A: ¿Te sentiste reflejado/a?",ph:"Sí captaste… / Lo que faltó fue…"},
      {role:1,q:"Persona B: Valida.",ph:"Tiene sentido porque…"},
      {role:1,q:"Persona B: Ahora comparte tú.",ph:"Quiero que entiendas que…"},
      {role:0,q:"Persona A: Refleja.",ph:"Lo que escucho es…"},
      {role:1,q:"¿Cómo fue sentirte reflejado/a?",ph:"De este ejercicio me llevo…"},
    ]},
  {id:"apreciacion",emoji:"💝",title:"3 Apreciaciones Específicas",tags:"Gottman · TCC+",bamboo:25,time:"10 min",
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
  {id:"respiracion",emoji:"🌬",title:"Respiración Sincronizada",tags:"ACT · Mindfulness",bamboo:20,time:"8 min",
    desc:"Respirar juntos activa el nervio vago — el nervio de la seguridad. Sincronizar la respiración reduce cortisol y genera co-regulación emocional.",
    instructions:["Búsquense un lugar tranquilo en sus respectivos espacios","Escriban cómo se sienten en este momento (sin filtro)","El otro responde con presencia, sin consejos","Compartan una cosa que necesitan del otro hoy","Terminen enviando un emoji que represente cómo se sienten"],
    timer:300,timerLabel:"4 seg inhalar · 2 sostener · 6 exhalar",
    beforeTimer:["Siéntense uno detrás del otro.","El de atrás coloca su mano en la espalda.","Sigan el ritmo 4-2-6 juntos.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Después de respirar juntos, siento…"},{role:1,ph:"Lo que noté al sincronizarme fue…"}]},
  {id:"carta",emoji:"✉️",title:"Carta a mi Herida",tags:"Narrativa · TCC",bamboo:60,time:"30 min",
    desc:"Identificar las creencias de infancia que gobiernan cómo amamos. Cada uno escribe individualmente y luego comparte lo que quiera.",
    instructions:["Cada uno escribe su carta por separado (tómense 10-15 min)","Compartan lo que se sientan cómodos compartiendo aquí","El otro solo lee y responde con presencia, sin consejo","No hay respuesta correcta — solo estar presente","Terminen con un mensaje de cierre cálido"],
    isEscritura:true,
    instruccion:"Escribe una carta a tu herida de infancia. Comienza: 'Querida [soledad / miedo al abandono…], sé que estás ahí porque...'",
    prompts:["¿Cómo y cuándo apareciste en mi vida?","¿Qué creencias sobre el amor me enseñaste?","¿Cómo apareces en mi relación hoy?","¿Qué quiero decirte desde mi yo adulto?"],
    afterPrompts:[{role:0,ph:"Compartir esto me hizo sentir…"},{role:1,ph:"Después de escucharte, entiendo mejor que…"}]},
  {id:"suenos",emoji:"🌙",title:"Mapa de Sueños",tags:"Narrativa · Positiva",bamboo:35,time:"15 min",
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
  {id:"perdida",emoji:"🕊",title:"El Perdón Activo",tags:"Gottman · EFT",bamboo:55,time:"25 min",
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
  {id:"amor_idiomas",emoji:"💞",title:"Idiomas del Amor",tags:"Chapman · ACT",bamboo:30,time:"12 min",
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
  {id:"conflicto",emoji:"⚡",title:"Mapa del Conflicto",tags:"EFT · Sistémica",bamboo:45,time:"20 min",
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
  {id:"presencia",emoji:"🌿",title:"Presencia Plena",tags:"Mindfulness · ACT",bamboo:25,time:"10 min",
    desc:"En un mundo de distracciones, dar presencia plena es el regalo más raro. 10 minutos sin teléfonos, sin listas mentales — solo ustedes.",
    instructions:["Silencien notificaciones — solo Mochi abierto","No hay agenda — solo estar presentes el uno para el otro","Escriban lo primero que piensan al ver el nombre del otro","No hay respuesta correcta ni incorrecta","Al terminar, compartan una observación del ejercicio"],
    timer:600,timerLabel:"Presencia plena — sin distracciones",
    beforeTimer:["Apaguen o silencien los teléfonos.","Siéntense cómodos, cerca.","No hay tema — solo estén presentes.","Hablen de lo que surja naturalmente.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Lo que noté en ti hoy fue…"},{role:1,ph:"Estar presente contigo me hizo sentir…"}]},
];

const CONOCE_CATS = {
  infancia:{emoji:"🧸",label:"Infancia",bg:"#f5edda",preguntas:["¿Cuál es tu recuerdo más feliz de la infancia?","¿Cómo era tu relación con tu mamá cuando eras pequeño/a?","¿Cómo era tu relación con tu papá cuando eras pequeño/a?","¿Qué aprendiste sobre el amor en tu familia de origen?","¿Cuál fue el momento más difícil de tu infancia?","¿Qué cosas de tu infancia te gustaría haber tenido?"]},
  amor: {emoji:"💕",label:"El Amor",bg:"#fce8e0",preguntas:["¿Qué significa para ti sentirte amado/a?","¿Cuál ha sido tu mayor herida en el amor?","¿Qué es lo que más te da miedo en una relación?","¿Qué valoras más de nuestra relación hoy?","¿Hay algo que siempre has querido decirme y no has podido?","¿Qué necesitas de mí que quizás no me has pedido?"]},
  suenos: {emoji:"🌙",label:"Sueños",bg:"#e4e8f8",preguntas:["¿Cuál es el sueño que sientes que aún no has perseguido?","¿Cómo te imaginas tu vida en 10 años?","¿Qué cosa quisiste lograr y aún no has intentado?","¿Qué nos falta vivir juntos?","Si el dinero no fuera problema, ¿cómo vivirías?","¿Qué legado quieres dejar en el mundo?"]},
  miedos: {emoji:"🫂",label:"Miedos",bg:"#e4f0e0",preguntas:["¿A qué le tienes más miedo en la vida?","¿Cuándo más necesitas que te abracen?","¿Cuándo te sientes solo/a aunque esté presente?","¿Qué es lo que más te cuesta pedir?","¿Qué es lo que más te cuesta recibir?","¿Cuál es tu mayor inseguridad y cómo puedo apoyarte?"]},
};

const BURBUJA_SECTIONS = [
  {id:"tipo",icon:"💑",title:"Tipo de relación",sub:"Monogamia, exclusividad, definición",itemBg:"#fce4d0",
    items:[
      {id:"tipo1",q:"¿Qué tipo de relación tienen? ¿Cómo la definirían?",phA:"Para mí nuestra relación es...",phB:"Para mí nuestra relación es..."},
      {id:"tipo2",q:"¿Cuánto espacio personal necesita cada uno?",phA:"Necesito...",phB:"Necesito..."},
      {id:"tipo3",q:"¿Cómo manejan el tiempo con amigos y familia por separado?",phA:"Para mí es importante...",phB:"Para mí es importante..."},
    ]},
  {id:"fidelidad",icon:"🤝",title:"Fidelidad & Límites",sub:"Qué es infidelidad para nosotros",itemBg:"#fce4e4",
    items:[
      {id:"fidel1",q:"¿Qué consideras tú que es infidelidad?",phA:"Para mí la infidelidad es...",phB:"Para mí la infidelidad es...",note:"Más allá de lo físico: mensajes, emocional, coqueteo. Sin respuestas incorrectas."},
      {id:"fidel2",q:"¿Qué le pides al otro para sentirte seguro/a?",phA:"Para sentirme seguro/a necesito...",phB:"Para sentirme seguro/a necesito..."},
      {id:"fidel3",q:"¿Cómo manejan la privacidad (teléfonos, contraseñas)?",phA:"Para mí la privacidad significa...",phB:"Para mí la privacidad significa..."},
    ]},
  {id:"discusion",icon:"⚡",title:"Reglas para discutir",sub:"Cómo manejar conflictos juntos",itemBg:"#e8eafc",
    items:[
      {id:"disc1",q:"Señal de 'necesito pausa' — ¿cuál es la tuya?",phA:"Cuando me desborda...",phB:"Cuando me desborda..."},
      {id:"disc2",q:"¿Qué está PROHIBIDO en una discusión entre ustedes?",phA:"Ej: gritar, traer el pasado...",phB:"Ej: insultar, silencio de días..."},
      {id:"disc3",q:"¿Cómo se reconcilian después de una pelea?",phA:"Para reconciliarme necesito...",phB:"Para reconciliarme necesito..."},
      {id:"disc4",q:"¿Cuánto tiempo de pausa está bien antes de retomar una conversación?",phA:"Necesito al menos...",phB:"Necesito al menos..."},
    ]},
  {id:"quiero",icon:"✨",title:"Lo que quiero del otro",sub:"Necesidades, deseos, peticiones",itemBg:"#fce4f4",
    items:[
      {id:"quiero1",q:"¿Qué MÁS necesitas de tu pareja que no has pedido?",phA:"Lo que más necesito es...",phB:"Lo que más necesito es..."},
      {id:"quiero2",q:"¿Cómo prefieres recibir amor?",phA:"Me siento amado/a cuando...",phB:"Me siento amado/a cuando..."},
      {id:"quiero3",q:"¿Qué es algo pequeño que el otro podría hacer y te haría muy feliz?",phA:"Algo pequeño que me haría feliz...",phB:"Algo pequeño que me haría feliz..."},
    ]},
  {id:"futuro",icon:"🌱",title:"El Futuro",sub:"Planes, metas y sueños compartidos",itemBg:"#e4f4e8",
    items:[
      {id:"fut1",q:"¿Dónde se imaginan viviendo en 5 años?",phA:"Me imagino que...",phB:"Me imagino que..."},
      {id:"fut2",q:"¿Quieren tener o no tener hijos? ¿Cuándo?",phA:"Sobre los hijos, yo siento...",phB:"Sobre los hijos, yo siento..."},
      {id:"fut3",q:"¿Cómo se imaginan su hogar ideal?",phA:"Mi hogar ideal es...",phB:"Mi hogar ideal es..."},
    ]},
  {id:"economia",icon:"💰",title:"Economía & Dinero",sub:"Finanzas, gastos y metas económicas",itemBg:"#fef8e0",
    items:[
      {id:"eco1",q:"¿Cómo van a manejar el dinero? ¿Juntos, separados o mixto?",phA:"Para mí lo ideal es...",phB:"Para mí lo ideal es..."},
      {id:"eco2",q:"¿Cuánto es 'gasto grande' que requiere consultarse?",phA:"Para mí, más de...",phB:"Para mí, más de..."},
      {id:"eco3",q:"¿Qué metas económicas tienen juntos?",phA:"Una meta que quiero es...",phB:"Una meta que quiero es..."},
      {id:"eco4",q:"¿Cómo manejan las deudas o situaciones económicas difíciles?",phA:"En esos momentos yo...",phB:"En esos momentos yo..."},
      {id:"eco5",q:"¿Ahorran juntos? ¿Para qué?",phA:"Me gustaría que ahorráramos para...",phB:"Me gustaría que ahorráramos para..."},
    ]},
  {id:"familia",icon:"🏠",title:"Familia & Crianza",sub:"Familias de origen, hijos y límites",itemBg:"#ffe8f0",
    items:[
      {id:"fam1",q:"¿Cuánto espacio tiene la familia de origen en su relación?",phA:"Para mí, mi familia...",phB:"Para mí, mi familia..."},
      {id:"fam2",q:"¿Cómo manejan las opiniones o críticas de sus familias sobre la relación?",phA:"Cuando mi familia opina...",phB:"Cuando mi familia opina..."},
      {id:"fam3",q:"¿Quieren tener hijos? ¿Cuántos y cuándo?",phA:"Sobre los hijos yo pienso...",phB:"Sobre los hijos yo pienso..."},
      {id:"fam4",q:"¿Cómo quieren criar a sus hijos? ¿Qué valores son innegociables?",phA:"Para mí es esencial enseñar...",phB:"Para mí es esencial enseñar..."},
      {id:"fam5",q:"¿Cómo dividen responsabilidades del hogar?",phA:"Yo me siento cómodo/a haciendo...",phB:"Yo me siento cómodo/a haciendo..."},
      {id:"fam6",q:"¿Tienen mascotas o quieren tenerlas?",phA:"Sobre las mascotas...",phB:"Sobre las mascotas..."},
    ]},
];

const BURBUJA_ITEM_MAP = BURBUJA_SECTIONS.reduce((acc, sec) => {
  sec.items.forEach(item => {
    acc[item.id] = { question: item.q, section: sec.title };
  });
  return acc;
}, {});

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
  { id: 1, fuente:"TCC", titulo:"Pensamientos vs. hechos", texto:"Antes de reaccionar, pregúntate: ¿esto es un hecho real o una interpretación mía? La mente llena huecos con miedos. Chécalo con tu pareja antes de asumir." },
  { id: 2, fuente:"DBT", titulo:"Conciencia sin juicio", texto:"Hoy practica observar lo que sientes sin calificarlo de bueno o malo. Decir 'noto que me siento alejado/a' en vez de 'eres distante' abre puertas, no las cierra." },
  { id: 3, fuente:"ACT", titulo:"Valores como brújula", texto:"¿Qué cualidad de pareja quieres ser hoy, independientemente de cómo te sientes? Actuar desde tus valores —no desde el humor del momento— construye la relación que quieres." },
  { id: 4, fuente:"Sistémica", titulo:"Patrones circulares", texto:"En pareja, cada acción genera una reacción. Si te preguntas '¿qué hago yo que mantiene este patrón?', encuentras el poder de cambiarlo desde tu lado." },
  { id: 5, fuente:"Centrado en la persona", titulo:"Presencia total", texto:"Regala 10 minutos de atención plena a tu pareja hoy, sin teléfono ni distracciones. Sentirse visto y escuchado es una de las necesidades más profundas del ser humano." },
  { id: 6, fuente:"DBT", titulo:"FAST para el respeto propio", texto:"En una conversación difícil: sé Justo/a contigo y con el otro, pide sin Amenazas, mantén tu Sinceridad y Ten respeto propio. Tu bienestar importa tanto como el de tu pareja." },
  { id: 7, fuente:"TCC", titulo:"Reestructuración cognitiva", texto:"Cuando pienses 'siempre hace esto', prueba con 'últimamente ha pasado esto seguido'. Pequeños cambios en el lenguaje interno reducen la intensidad del conflicto." },
  { id: 8, fuente:"ACT", titulo:"Defusión cognitiva", texto:"Un pensamiento no es una verdad absoluta. La próxima vez que aparezca una crítica interna como 'no soy suficiente', nómbrala: 'estoy teniendo el pensamiento de que...' Eso crea distancia y libertad." },
  { id: 9, fuente:"Sistémica", titulo:"La relación como entidad", texto:"Imaginen que su relación es un tercer ser que los dos cuidan. ¿Qué necesita ese ser hoy de ti? ¿Atención, descanso, juego, ternura?" },
  { id: 10, fuente:"Centrado en la persona", titulo:"Validación genuina", texto:"Validar no es estar de acuerdo; es decir 'entiendo que eso te duele'. Esa frase puede transformar una discusión en una conexión." },
  { id: 11, fuente:"DBT", titulo:"Regulación emocional", texto:"Cuando sientas que la emoción te desborda, activa el TIPP: Temperatura (agua fría en la cara), Intensidad (ejercicio fuerte 20 seg), Pausa respirada, Pasear. Regula el cuerpo primero." },
  { id: 12, fuente:"ACT", titulo:"Comprometerse en acción", texto:"El amor no es solo sentimiento; es elección y acción. Elige hoy un gesto concreto de amor hacia tu pareja, aunque no 'tengas ganas'. La acción muchas veces precede al sentimiento." },
  { id: 13, fuente:"TCC", titulo:"Comunicación asertiva", texto:"El triángulo de la comunicación sana: di lo que observas, lo que sientes y lo que necesitas. Ej: 'Cuando no contestas (observo), me siento invisible (siento), necesito saber que me escuchas (necesito).'"},
  { id: 14, fuente:"Sistémica", titulo:"Historia de la relación", texto:"Recuerden una historia que los hizo reír juntos. Evocar recuerdos positivos activa el sistema de apego seguro y recuerda por qué eligieron estar juntos." },
  { id: 15, fuente:"Centrado en la persona", titulo:"Escucha empática profunda", texto:"Hoy escucha para entender, no para responder. Refleja lo que tu pareja dijo con tus palabras antes de opinar. Eso comunica: 'eres importante para mí'." },
  { id: 16, fuente:"DBT", titulo:"Tolerancia al malestar", texto:"No todas las incomodidades necesitan resolverse ahora. A veces acompañar el silencio o la tristeza del otro sin 'arreglarlo' es la forma más amorosa de estar presente." },
  { id: 17, fuente:"ACT", titulo:"Flexibilidad psicológica", texto:"Soltar el control de cómo 'debería' ser tu pareja te libera. Aceptar que son dos personas distintas no significa resignarse; significa dejar espacio para el amor real, no el idealizado." },
  { id: 18, fuente:"TCC", titulo:"Pensamientos automáticos", texto:"Cuando una situación te genere una reacción fuerte, pregúntate: ¿qué pensé automáticamente? ¿Qué evidencia tengo a favor y en contra? Muchas veces la emoción va al pasado, no al presente." },
  { id: 19, fuente:"Sistémica", titulo:"Roles y complementariedad", texto:"En toda pareja hay roles que se complementan. Reflexiona: ¿cuál es tu posición habitual en los conflictos? ¿Persigues o te alejas? Comprender tu patrón es el primer paso para cambiarlo." },
  { id: 20, fuente:"Centrado en la persona", titulo:"El yo auténtico", texto:"Para dar amor genuino, primero necesitas conocerte. ¿Qué te nutre? ¿Qué te agota? Cuidarte a ti mismo/a no es egoísmo; es la base para amar bien a otra persona." },
  { id: 21, fuente:"DBT", titulo:"Habilidades interpersonales DEAR MAN", texto:"Para pedir algo importante: Describe el contexto, Expresa cómo te sientes, Afirma lo que quieres, Refuerza por qué es bueno para ambos, Mantente enfocado/a, Aparenta seguridad, Negocia si es necesario." },
  { id: 22, fuente:"ACT", titulo:"El observador interno", texto:"Detrás de tus pensamientos y emociones hay una parte de ti que los observa sin juzgar. Desde ese lugar, puedes elegir cómo responder en vez de reaccionar automáticamente." },
  { id: 23, fuente:"TCC", titulo:"Distorsión: lectura de mente", texto:"Cuando asumas que sabes lo que tu pareja piensa o siente sin preguntarlo, detente. La lectura de mente genera malentendidos. Pregunta siempre antes de concluir." },
  { id: 24, fuente:"Sistémica", titulo:"Contexto y narrativa", texto:"Cada relación tiene una narrativa única: cómo se cuentan su historia importa. ¿La cuentan desde la fortaleza o desde las heridas? Pueden reescribir juntos el relato que los define." },
  { id: 25, fuente:"Centrado en la persona", titulo:"Congruencia emocional", texto:"Cuando lo que sientes, piensas y dices están alineados, transmites confianza y seguridad. La autenticidad es uno de los ingredientes más atractivos en una relación duradera." },
  { id: 26, fuente:"DBT", titulo:"Mindfulness en la relación", texto:"Durante una conversación importante, noten su respiración, la postura, el tono de voz del otro. La conciencia plena del momento evita que piloto automático tome el control." },
  { id: 27, fuente:"ACT", titulo:"Compasión hacia ti mismo/a", texto:"Trátate como tratarías a un amigo querido que está sufriendo. La autocompasión no es debilidad; es el cimiento desde el que puedes dar y recibir amor con más plenitud." },
  { id: 28, fuente:"TCC", titulo:"Conducta vs. personalidad", texto:"Critica la conducta, no a la persona. 'No me gustó que llegaras tarde' es muy diferente a 'eres irresponsable'. La primera invita al cambio; la segunda activa la defensa." },
  { id: 29, fuente:"Sistémica", titulo:"Límites sanos", texto:"Los límites no separan a las personas; las conectan de forma segura. Un límite sano dice: 'esto me lastima y lo que necesito es...' No es un ultimátum, es un puente." },
  { id: 30, fuente:"Centrado en la persona", titulo:"Crecimiento mutuo", texto:"La mejor relación no es la que te hace cómodo/a, sino la que te ayuda a crecer. ¿Tu relación te invita a ser tu mejor versión? ¿Tú invitas a tu pareja a serlo?" },
];

// ════════════════════ GAME CONSTANTS ════════════════════
const MEMORY_EMOJIS = ["🌸","🌺","🌻","🌹","🌈","⭐","🦋","🐝","💫","🎀"];

function checkC4Win(board, row, col, ROWS, COLS, role) {
  const check = (dr, dc) => {
    let n = 1;
    for (let d = 1; d < 4; d++) { const r=row+dr*d, c=col+dc*d; if(r<0||r>=ROWS||c<0||c>=COLS||board[r*COLS+c]!==role)break; n++; }
    for (let d = 1; d < 4; d++) { const r=row-dr*d, c=col-dc*d; if(r<0||r>=ROWS||c<0||c>=COLS||board[r*COLS+c]!==role)break; n++; }
    return n >= 4;
  };
  return check(0,1)||check(1,0)||check(1,1)||check(1,-1);
}

const QUIZ_QS = [
  "¿Cuál es la comida favorita de tu pareja?",
  "¿Cuál es su canción o artista favorito en este momento?",
  "Cuando tiene un mal día, ¿qué hace primero?",
  "¿Cuál es su mayor miedo?",
  "¿Qué sueño o meta tiene para los próximos años?",
  "¿Cómo prefiere que lo/la consueles cuando está triste?",
  "¿Qué le da vergüenza pero le encanta en secreto?",
  "¿Cuál es el recuerdo favorito que tienen juntos?",
  "¿Qué cualidad de tu pareja te enamora más?",
  "¿Cuál es su frase o expresión más repetida?",
];

const WYR_QS = [
  { a:"Viajar siempre sin casa fija", b:"Casa perfecta sin viajar" },
  { a:"Saber lo que tu pareja piensa en todo momento", b:"Que nunca sepa lo que tú piensas" },
  { a:"Vivir en la playa para siempre", b:"Vivir en la montaña para siempre" },
  { a:"Cenar solos en casa con música", b:"Salir a un restaurante especial" },
  { a:"Que tu pareja te sorprenda siempre", b:"Planear los planes tú mismo/a" },
  { a:"Ver películas toda la noche", b:"Charlar hasta el amanecer" },
  { a:"Cocinar juntos siempre", b:"Que alguien siempre cocine para los dos" },
  { a:"Tener un perro juntos", b:"Tener un gato juntos" },
  { a:"Que te digan 'te amo' cada día", b:"Que lo demuestren con acciones" },
  { a:"Tarde de librería", b:"Tarde en café sin hacer nada" },
  { a:"Ciudad grande y activa", b:"Pueblo pequeño y tranquilo" },
  { a:"Bailar juntos en la sala", b:"Caminar juntos bajo la lluvia" },
  { a:"Dormir temprano juntos", b:"Trasnochar haciendo algo especial" },
  { a:"Cita perfecta en casa", b:"Aventura espontánea afuera" },
  { a:"Conocer el país del otro", b:"Viajar a un lugar nuevo juntos" },
  { a:"Desayuno perfecto cada mañana", b:"Noche especial cada semana" },
  { a:"Recordar todos sus mensajes de amor", b:"Recordar perfectamente cada abrazo" },
  { a:"Ser honestos aunque duela", b:"Protegerse de la verdad dolorosa" },
  { a:"Leer el mismo libro a la vez", b:"Ver la misma serie a la vez" },
  { a:"Que tu pareja sea tu mejor amigo/a", b:"Que tu pareja sea tu aventura constante" },
];

function CouplePandaSVG({ happy = false, size = 160 }) {
  const s = size;
  const G = "#5c5c5c";
  const GD = "#4a4a4a";
  const W = "#f9f9f9";
  const WW = "#ffffff";
  return (
    <svg viewBox="0 0 260 220" width={s} height={s * 0.846} style={{ display: "block" }}>
      <defs>
        <filter id="kShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#3a3a3a" floodOpacity="0.13"/></filter>
        <filter id="kGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f8d0e8" floodOpacity="0.7"/></filter>
      </defs>

      {/* ── LEFT PANDA ── */}
      <ellipse cx="76" cy="213" rx="40" ry="6" fill="#3a3a3a" opacity="0.09"/>
      {/* Body */}
      <path d="M46 210 C30 210 24 188 26 166 C28 146 40 132 62 128 C70 126 82 126 90 128 C112 132 124 146 124 166 C126 188 120 210 104 210 Z" fill={W} stroke={GD} strokeWidth="2" filter="url(#kShadow)"/>
      {/* Tummy */}
      <ellipse cx="76" cy="172" rx="19" ry="24" fill={WW} opacity="0.7"/>
      {/* Left arm */}
      <path d="M30 158 C18 165 14 180 18 192" fill="none" stroke={GD} strokeWidth="17" strokeLinecap="round"/>
      <path d="M30 158 C18 165 14 180 18 192" fill="none" stroke={G} strokeWidth="13" strokeLinecap="round"/>
      {/* Right arm */}
      <path d="M122 152 C135 144 148 142 154 147 C158 150 156 162 148 162" fill="none" stroke={GD} strokeWidth="17" strokeLinecap="round"/>
      <path d="M122 152 C135 144 148 142 154 147 C158 150 156 162 148 162" fill="none" stroke={G} strokeWidth="13" strokeLinecap="round"/>
      {/* Feet */}
      <ellipse cx="56" cy="202" rx="20" ry="11" fill={GD}/>
      <ellipse cx="56" cy="200" rx="17" ry="9" fill={G}/>
      <ellipse cx="96" cy="202" rx="20" ry="11" fill={GD}/>
      <ellipse cx="96" cy="200" rx="17" ry="9" fill={G}/>
      <ellipse cx="56" cy="208" rx="11" ry="5" fill="#f0ece8" opacity="0.55"/>
      <ellipse cx="96" cy="208" rx="11" ry="5" fill="#f0ece8" opacity="0.55"/>
      {/* Head */}
      <circle cx="76" cy="85" r="44" fill={W} stroke={GD} strokeWidth="2" filter="url(#kShadow)"/>
      {/* Ears */}
      <circle cx="40" cy="50" r="16" fill={GD}/>
      <circle cx="40" cy="50" r="10" fill={G}/>
      <circle cx="112" cy="50" r="16" fill={GD}/>
      <circle cx="112" cy="50" r="10" fill={G}/>
      {/* Eye patches */}
      <ellipse cx="61" cy="84" rx="14" ry="12" fill={G} transform="rotate(-12 61 84)"/>
      <ellipse cx="91" cy="84" rx="14" ry="12" fill={G} transform="rotate(12 91 84)"/>
      {/* Eyes */}
      {happy ? (
        <>
          <path d="M55 83 Q61 90 67 83" fill="none" stroke={WW} strokeWidth="2.8" strokeLinecap="round"/>
          <path d="M85 83 Q91 90 97 83" fill="none" stroke={WW} strokeWidth="2.8" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <circle cx="62" cy="85" r="8" fill={WW}/>
          <circle cx="90" cy="85" r="8" fill={WW}/>
          <circle cx="63" cy="86" r="5" fill="#2a2a2a"/>
          <circle cx="91" cy="86" r="5" fill="#2a2a2a"/>
          <circle cx="65" cy="84" r="2" fill={WW}/>
          <circle cx="93" cy="84" r="2" fill={WW}/>
        </>
      )}
      {/* Nose */}
      <ellipse cx="76" cy="96" rx="4" ry="3" fill="#3a3a3a" opacity="0.85"/>
      {/* Mouth */}
      {happy
        ? <path d="M68 103 Q76 111 84 103" fill="none" stroke="#3a3a3a" strokeWidth="2.2" strokeLinecap="round"/>
        : <path d="M70 101 Q76 107 82 101" fill="none" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>}
      {/* Cheeks */}
      <ellipse cx="44" cy="98" rx="12" ry="7" fill="#f4a896" opacity={happy ? "0.65" : "0.42"}/>
      <ellipse cx="108" cy="98" rx="12" ry="7" fill="#f4a896" opacity={happy ? "0.65" : "0.42"}/>

      {/* ── RIGHT PANDA (slightly turned) ── */}
      <ellipse cx="184" cy="213" rx="42" ry="6" fill="#3a3a3a" opacity="0.09"/>
      {/* Body */}
      <path d="M148 208 C132 208 126 186 128 164 C130 144 142 130 164 126 C174 124 186 124 196 126 C218 130 228 144 228 164 C230 186 224 208 208 208 Z" fill={W} stroke={GD} strokeWidth="2" filter="url(#kShadow)"/>
      {/* Tummy */}
      <ellipse cx="178" cy="170" rx="20" ry="25" fill={WW} opacity="0.7"/>
      {/* Left arm */}
      <path d="M138 150 C128 142 120 140 114 144 C110 148 112 160 118 160" fill="none" stroke={GD} strokeWidth="17" strokeLinecap="round"/>
      <path d="M138 150 C128 142 120 140 114 144 C110 148 112 160 118 160" fill="none" stroke={G} strokeWidth="13" strokeLinecap="round"/>
      {/* Right arm — raised slightly */}
      <path d="M222 156 C234 148 240 160 236 174 C234 182 226 184 220 180" fill="none" stroke={GD} strokeWidth="17" strokeLinecap="round"/>
      <path d="M222 156 C234 148 240 160 236 174 C234 182 226 184 220 180" fill="none" stroke={G} strokeWidth="13" strokeLinecap="round"/>
      {/* Feet */}
      <ellipse cx="158" cy="200" rx="21" ry="11" fill={GD}/>
      <ellipse cx="158" cy="198" rx="18" ry="9" fill={G}/>
      <ellipse cx="200" cy="200" rx="21" ry="11" fill={GD}/>
      <ellipse cx="200" cy="198" rx="18" ry="9" fill={G}/>
      <ellipse cx="158" cy="207" rx="12" ry="5" fill="#f0ece8" opacity="0.55"/>
      <ellipse cx="200" cy="207" rx="12" ry="5" fill="#f0ece8" opacity="0.55"/>
      {/* Head — slightly tilted */}
      <g transform="rotate(-5, 182, 84)">
        <circle cx="182" cy="84" r="46" fill={W} stroke={GD} strokeWidth="2" filter="url(#kShadow)"/>
        {/* Ears */}
        <circle cx="144" cy="48" r="17" fill={GD}/>
        <circle cx="144" cy="48" r="11" fill={G}/>
        <circle cx="220" cy="48" r="17" fill={GD}/>
        <circle cx="220" cy="48" r="11" fill={G}/>
        {/* Eye patches */}
        <ellipse cx="167" cy="83" rx="15" ry="13" fill={G} transform="rotate(-10 167 83)"/>
        <ellipse cx="197" cy="83" rx="15" ry="13" fill={G} transform="rotate(10 197 83)"/>
        {/* Eyes */}
        {happy ? (
          <>
            <path d="M161 82 Q167 89 173 82" fill="none" stroke={WW} strokeWidth="2.8" strokeLinecap="round"/>
            <path d="M191 82 Q197 89 203 82" fill="none" stroke={WW} strokeWidth="2.8" strokeLinecap="round"/>
          </>
        ) : (
          <>
            <circle cx="168" cy="84" r="8.5" fill={WW}/>
            <circle cx="196" cy="84" r="8.5" fill={WW}/>
            <circle cx="169" cy="85" r="5.5" fill="#2a2a2a"/>
            <circle cx="197" cy="85" r="5.5" fill="#2a2a2a"/>
            <circle cx="171" cy="83" r="2.2" fill={WW}/>
            <circle cx="199" cy="83" r="2.2" fill={WW}/>
          </>
        )}
        {/* Nose */}
        <ellipse cx="182" cy="95" rx="4" ry="3" fill="#3a3a3a" opacity="0.85"/>
        {/* Mouth */}
        {happy
          ? <path d="M174 102 Q182 110 190 102" fill="none" stroke="#3a3a3a" strokeWidth="2.2" strokeLinecap="round"/>
          : <path d="M176 100 Q182 106 188 100" fill="none" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round"/>}
        {/* Cheeks */}
        <ellipse cx="150" cy="97" rx="12" ry="7" fill="#f4a896" opacity={happy ? "0.65" : "0.42"}/>
        <ellipse cx="214" cy="97" rx="12" ry="7" fill="#f4a896" opacity={happy ? "0.65" : "0.42"}/>
      </g>

      {happy && (
        <>
          <g filter="url(#kGlow)">
            <path d="M126 96 C126 91 130 89 134 93 C138 89 142 91 142 96 C142 102 134 111 134 111 C134 111 126 102 126 96Z" fill="#e8607a" opacity="0.95"/>
          </g>
          <path d="M110 74 C110 71 112 70 114 72 C116 70 118 71 118 74 C118 77 114 81 114 81 C114 81 110 77 110 74Z" fill="#f4a0b8" opacity="0.7"/>
          <path d="M150 68 C150 66 151.5 65 153 67 C154.5 65 156 66 156 68 C156 70.5 153 74 153 74 C153 74 150 70.5 150 68Z" fill="#f4a0b8" opacity="0.6"/>
        </>
      )}
    </svg>
  );
}

function SinglePandaSVG({ size = 100 }) {
  return (
    <svg viewBox="0 0 160 200" width={size} height={size * 1.25} style={{ display: "block" }}>
      <defs><radialGradient id="sb" cx="45%" cy="35%" r="60%"><stop offset="0%" stopColor="#fdf9f0"/><stop offset="100%" stopColor="#ede4d0"/></radialGradient></defs>
      <ellipse cx="80" cy="196" rx="38" ry="6" fill="#1a261a" opacity="0.1"/>
      <path d="M42 195 C28 195 22 175 24 155 C26 138 38 126 58 122 C66 120 80 120 94 122 C114 126 126 138 128 155 C130 175 124 195 110 195Z" fill="url(#sb)"/>
      <ellipse cx="76" cy="162" rx="20" ry="24" fill="#fefcf6" opacity="0.85"/>
      <ellipse cx="57" cy="190" rx="18" ry="10" fill="#1a261a"/>
      <ellipse cx="97" cy="190" rx="18" ry="10" fill="#1a261a"/>
      <ellipse cx="57" cy="196" rx="12" ry="5" fill="#f0e8d8" opacity="0.5"/>
      <ellipse cx="97" cy="196" rx="12" ry="5" fill="#f0e8d8" opacity="0.5"/>
      <path d="M34 150 C24 158 20 172 24 180" fill="none" stroke="#1a261a" strokeWidth="13" strokeLinecap="round"/>
      <path d="M34 150 C24 158 20 172 24 180" fill="none" stroke="#2d3d2d" strokeWidth="10" strokeLinecap="round"/>
      <path d="M118 150 C128 158 132 172 128 180" fill="none" stroke="#1a261a" strokeWidth="13" strokeLinecap="round"/>
      <path d="M118 150 C128 158 132 172 128 180" fill="none" stroke="#2d3d2d" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="80" cy="76" r="50" fill="url(#sb)"/>
      <circle cx="42" cy="38" r="22" fill="#1a261a"/>
      <circle cx="42" cy="38" r="14" fill="#2d3d2d"/>
      <circle cx="118" cy="38" r="22" fill="#1a261a"/>
      <circle cx="118" cy="38" r="14" fill="#2d3d2d"/>
      <ellipse cx="62" cy="76" rx="19" ry="18" fill="#1a261a" transform="rotate(-8 62 76)"/>
      <ellipse cx="98" cy="76" rx="19" ry="18" fill="#1a261a" transform="rotate(8 98 76)"/>
      <circle cx="62" cy="77" r="11" fill="#fdf9f0"/>
      <circle cx="98" cy="77" r="11" fill="#fdf9f0"/>
      <circle cx="64" cy="78" r="7" fill="#1a1a2a"/>
      <circle cx="100" cy="78" r="7" fill="#1a1a2a"/>
      <circle cx="66" cy="75" r="2.8" fill="white"/>
      <circle cx="102" cy="75" r="2.8" fill="white"/>
      <path d="M76 94 C76 91 78 90 80 92 C82 90 84 91 84 94 C84 97 80 100 80 100 C80 100 76 97 76 94Z" fill="#1a261a" opacity="0.85"/>
      <path d="M72 103 Q80 112 88 103" fill="none" stroke="#1a261a" strokeWidth="2.5" strokeLinecap="round"/>
      <ellipse cx="40" cy="92" rx="14" ry="8" fill="#f0907a" opacity="0.3"/>
      <ellipse cx="120" cy="92" rx="14" ry="8" fill="#f0907a" opacity="0.3"/>
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
      style={{ fontFamily: "'Fredoka One',cursive", letterSpacing: "0.4px", background: v.bg, color: v.fg, border: v.border || "none", borderRadius: 12, padding: "12px 24px", fontSize: "0.98rem", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, boxShadow: disabled ? "none" : "0 3px 0 rgba(0,0,0,0.18)", transition: "transform 0.12s", ...style }}
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
    <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0, letterSpacing: "0.5px" }}>{title}</h1>
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
    // Nuevos ítems kawaii
    bonsai: (<svg viewBox="0 0 52 56" width={s} height={s}><rect x="16" y="42" width="20" height="8" rx="4" fill="#8a7060"/><rect x="10" y="38" width="32" height="6" rx="3" fill="#9a8070"/><rect x="23" y="20" width="6" height="20" rx="3" fill="#7a6050"/><rect x="20" y="12" width="4" height="12" rx="2" fill="#8a7060" transform="rotate(-20 22 18)"/><rect x="28" y="14" width="4" height="10" rx="2" fill="#8a7060" transform="rotate(15 30 19)"/><circle cx="26" cy="14" r="14" fill="#5a8840" opacity="0.9"/><circle cx="16" cy="18" r="10" fill="#6a9848" opacity="0.85"/><circle cx="36" cy="17" r="11" fill="#5a8840" opacity="0.85"/><circle cx="26" cy="8" r="8" fill="#7aac50" opacity="0.8"/></svg>),
    flower_pot: (<svg viewBox="0 0 40 48" width={s} height={s}><path d="M8 24 L6 44 L34 44 L32 24Z" fill="#c07848"/><path d="M6 22 L34 22 L36 26 L4 26Z" fill="#b06838"/><rect x="17" y="10" width="6" height="14" rx="3" fill="#5a8840"/><circle cx="20" cy="9" r="9" fill="#f4a0b0"/><circle cx="20" cy="9" r="6" fill="#f8c0cc"/><circle cx="20" cy="9" r="3" fill="#f8e080"/><circle cx="14" cy="13" r="5" fill="#f4a0b0" opacity="0.8"/><circle cx="26" cy="13" r="5" fill="#e89090" opacity="0.8"/></svg>),
    herb_pot: (<svg viewBox="0 0 40 48" width={s} height={s}><path d="M8 24 L6 44 L34 44 L32 24Z" fill="#c07848"/><path d="M6 22 L34 22 L36 26 L4 26Z" fill="#b06838"/>{[[14,8],[20,6],[26,9]].map(([x,y],i)=><g key={i}><rect x={x} y={y} width="4" height="16" rx="2" fill="#5a8840"/><ellipse cx={x+2} cy={y} rx="5" ry="4" fill={["#6ab848","#5a9838","#78c048"][i]}/></g>)}</svg>),
    seeds: (<svg viewBox="0 0 36 44" width={s} height={s}><path d="M4 16 L4 36 Q4 42 10 42 L26 42 Q32 42 32 36 L32 16Z" fill="#d4a860"/><path d="M4 16 L8 8 L28 8 L32 16Z" fill="#c49850"/><line x1="18" y1="8" x2="18" y2="2" stroke="#5a8840" strokeWidth="2"/><circle cx="18" cy="2" r="3" fill="#6ab848"/><circle cx="14" cy="1" r="2" fill="#5a9838"/><circle cx="22" cy="1" r="2" fill="#78c048"/><circle cx="14" cy="24" r="3" fill="#5a8840"/><circle cx="18" cy="30" r="2.5" fill="#6ab848"/><circle cx="22" cy="24" r="3" fill="#5a9838"/></svg>),
    wateringcan: (<svg viewBox="0 0 52 42" width={s} height={s}><ellipse cx="22" cy="24" rx="16" ry="13" fill="#b0b8c0"/><ellipse cx="22" cy="22" rx="14" ry="11" fill="#c8d0d8"/><path d="M38 20 L48 14 L50 18 L40 24Z" fill="#a0a8b0"/><path d="M8 18 Q2 14 2 24 Q2 30 8 30" fill="none" stroke="#a0a8b0" strokeWidth="3" strokeLinecap="round"/><path d="M36 10 L40 4 Q42 2 44 4" fill="none" stroke="#a0a8b0" strokeWidth="2.5" strokeLinecap="round"/>{[44,47,50].map((x,i)=><line key={i} x1={x} y1={4+i*2} x2={x+2} y2={8+i*2} stroke="#88b8d0" strokeWidth="2" strokeLinecap="round"/>)}</svg>),
    hose: (<svg viewBox="0 0 52 36" width={s} height={s}><path d="M6 30 Q6 6 20 6 Q34 6 34 20 Q34 30 46 30" fill="none" stroke="#5a8840" strokeWidth="8" strokeLinecap="round"/><path d="M6 30 Q6 6 20 6 Q34 6 34 20 Q34 30 46 30" fill="none" stroke="#6aac48" strokeWidth="5" strokeLinecap="round" opacity="0.6"/><rect x="42" y="26" width="10" height="8" rx="3" fill="#c07848"/><path d="M4 28 L0 32 L4 36 L8 32Z" fill="#a06838"/></svg>),
    arch: (<svg viewBox="0 0 52 56" width={s} height={s}><rect x="4" y="28" width="6" height="28" rx="3" fill="#9a7848"/><rect x="42" y="28" width="6" height="28" rx="3" fill="#9a7848"/><path d="M7 30 Q26 4 45 30" fill="none" stroke="#9a7848" strokeWidth="5" strokeLinecap="round"/>{[[8,38],[12,32],[10,44],[42,36],[44,28],[40,44],[20,8],[26,6],[32,8],[16,20],[36,20]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="4" ry="3" fill={["#5a8840","#6aac48","#78c050","#5a8840","#6aac48"][i%5]} opacity="0.9" transform={`rotate(${i*37} ${x} ${y})`}/>)}</svg>),
    birdhouse: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="6" y="22" width="28" height="22" rx="3" fill="#d4a860"/><rect x="8" y="24" width="24" height="18" rx="2" fill="#e8c080"/><path d="M2 22 L20 6 L38 22Z" fill="#c49040"/><rect x="14" y="30" width="12" height="10" rx="6" fill="#1a1a1a"/><circle cx="20" cy="33" r="4" fill="#2a2a2a"/><rect x="18" y="40" width="4" height="8" rx="2" fill="#a07030"/></svg>),
    tools: (<svg viewBox="0 0 52 44" width={s} height={s}><rect x="22" y="4" width="5" height="32" rx="2.5" fill="#9a7848"/><path d="M17 4 L27 4 L29 8 L15 8Z" fill="#c0c8c0"/><rect x="30" y="6" width="5" height="30" rx="2.5" fill="#9a7848"/>{[-4,-2,0,2,4].map((d,i)=><rect key={i} x={32+d/2} y={6+i*1} width="4" height="4" rx="1" fill="#b0b8b0" transform={`translate(${d} 0)`}/>)}<path d="M34 6 L30 6 L30 10 L38 10 L38 6Z" fill="#b8c0b8"/><rect x="10" y="8" width="5" height="28" rx="2.5" fill="#9a7848"/><path d="M8 6 L16 6 L16 12 L14 8 L10 8 L8 12Z" fill="#c8c0a8"/></svg>),
    rocks: (<svg viewBox="0 0 52 32" width={s} height={s*0.62}><ellipse cx="26" cy="22" rx="24" ry="10" fill="#c8d0c8" opacity="0.4"/>{[[10,20,16,10],[24,14,18,12],[38,18,14,9],[6,24,12,8],[44,22,10,7]].map(([x,y,rx,ry],i)=><ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={["#b0b8b0","#c0c8c0","#a8b0a8","#b8c0b8","#c8d0c8"][i]} stroke="#a0a8a0" strokeWidth="1"/>)}<ellipse cx="20" cy="18" rx="8" ry="6" fill="#c0c8c0"/><ellipse cx="34" cy="16" rx="7" ry="5" fill="#b8c0b8"/></svg>),
    birds_fly: (<svg viewBox="0 0 56 36" width={s} height={s*0.64}><g opacity="0.85">{[[8,12],[18,6],[28,14],[38,8],[48,10],[14,20],[34,18]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y}) scale(${0.5+i%3*0.1})`}><path d="M0 0 Q-6 -5 -10 0" fill="none" stroke="#4a5060" strokeWidth="2" strokeLinecap="round"/><path d="M0 0 Q6 -5 10 0" fill="none" stroke="#4a5060" strokeWidth="2" strokeLinecap="round"/></g>)}</g></svg>),
    firefly: (<svg viewBox="0 0 48 48" width={s} height={s}><circle cx="24" cy="24" r="20" fill="#1a2a1a" opacity="0.2"/>{[[12,15],[30,10],[8,30],[36,28],[20,36],[38,18],[16,22],[28,34]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2.5" fill="#f8e840" opacity="0.9"/><circle cx={x} cy={y} r="4" fill="#f8e840" opacity="0.25"/></g>)}</svg>),
    moongate: (<svg viewBox="0 0 52 52" width={s} height={s}><circle cx="26" cy="22" r="20" fill="none" stroke="#f8e0a0" strokeWidth="3"/><path d="M6 40 L6 22 A20 20 0 0 1 46 22 L46 40" fill="#f8e0a0" opacity="0.1" stroke="#f8e0a0" strokeWidth="2"/><circle cx="26" cy="22" r="16" fill="#1a2a3a" opacity="0.5"/><circle cx="26" cy="22" r="15" fill="none"/>{[5,4,3,2].map((r,i)=><circle key={i} cx={26-r} cy={18+r} r={r} fill="#f8e0a0" opacity={0.4-i*0.08}/>)}<path d="M6 42 L6 52 L46 52 L46 42" fill="#7ab848" opacity="0.8"/></svg>),
  };
  return icons[id] || <svg viewBox="0 0 40 40" width={s} height={s}><circle cx="20" cy="20" r="16" fill={C.sand}/></svg>;
}


function PandaAccessoryLayer({ accessories, pandaSize = 160 }) {
  const owned = accessories || {};
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
                  rx="4" ry="2.5" fill={[["#ffb8cc","#ffe0ea"],["#f4c860","#ffe898"],["#c8b8f8","#e8d8ff"],["#ffb8cc","#ffe0ea"]][i][j%2]}
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
          <path d="M-20 -1 C-20 -5 -17 -7 -14 -4 C-11 -7 -8 -5 -8 -1 C-8 3 -14 8 -14 8 C-14 8 -20 3 -20 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <path d="M8 -1 C8 -5 11 -7 14 -4 C17 -7 20 -5 20 -1 C20 3 14 8 14 8 C14 8 8 3 8 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <line x1="-8" y1="0" x2="8" y2="0" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-20" y1="0" x2="-29" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="20" y1="0" x2="29" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
        </g>
      )}

      {/* GLASSES: SUNGLASSES */}
      {owned.glasses_sun && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <rect x="-24" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <rect x="8" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-24" y1="-2" x2="-32" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="24" y1="-2" x2="32" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <rect x="-21" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
          <rect x="11" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
        </g>
      )}

      {owned.glasses_round && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <circle cx="-12" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <circle cx="12" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <line x1="-4.8" y1="-1" x2="4.8" y2="-1" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-19" y1="-2" x2="-27" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="19" y1="-2" x2="27" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_clear && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <rect x="-22" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <rect x="8" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-22" y1="-2" x2="-30" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="22" y1="-2" x2="30" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_star && (
        <g transform="rotate(6, 76, 88) translate(76, 84)">
          <path d="M-13 -8 L-11 -3 L-6 -3 L-10 -0.5 L-8.5 4.5 L-13 2 L-17.5 4.5 L-16 -0.5 L-20 -3 L-15 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <path d="M13 -8 L15 -3 L20 -3 L16 -0.5 L17.5 4.5 L13 2 L8.5 4.5 L10 -0.5 L6 -3 L11 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <line x1="-6" y1="-1" x2="6" y2="-1" stroke="#c28d1f" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {/* ACC: BOW */}
      {owned.acc_bow && (
        <g transform="rotate(6, 76, 88) translate(106, 60)">
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
          <path d="M38 140 C34 150 32 170 34 195 C40 200 70 202 114 195 C116 170 114 150 110 140 C100 132 88 130 76 130 C64 130 52 132 38 140Z"
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
          <path d="M138 140 C134 150 132 170 134 195 C140 200 170 202 214 195 C216 170 214 150 210 140 C200 132 188 130 176 130 C164 130 152 132 138 140Z"
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
          <path d="M45 136 C43 151 43 170 45 192 C56 197 95 197 107 192 C109 170 109 151 107 136 C92 131 61 131 45 136Z" fill="#f5f8ff" opacity="0.96"/>
          <path d="M59 132 L76 152 L93 132" fill="none" stroke="#5d7bbd" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="47" y="161" width="58" height="10" rx="5" fill="#5d7bbd" opacity="0.85"/>
          <circle cx="76" cy="156" r="4" fill="#f4a8c0"/>

          <path d="M145 136 C143 151 143 170 145 192 C156 197 195 197 207 192 C209 170 209 151 207 136 C192 131 161 131 145 136Z" fill="#f5f8ff" opacity="0.96"/>
          <path d="M159 132 L176 152 L193 132" fill="none" stroke="#3f669f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="147" y="161" width="58" height="10" rx="5" fill="#3f669f" opacity="0.9"/>
          <circle cx="176" cy="156" r="4" fill="#b8d8ff"/>
        </g>
      )}

      {owned.outfit_witch && (
        <g>
          <path d="M44 138 C40 155 40 176 44 194 C56 201 97 201 108 194 C112 176 112 155 108 138 C92 132 60 132 44 138Z" fill="#7b5bb8" opacity="0.9"/>
          <path d="M52 138 C60 145 69 149 76 149 C83 149 92 145 100 138" fill="none" stroke="#d6a55a" strokeWidth="2.5"/>
          <circle cx="76" cy="168" r="6" fill="#2f1d4a" opacity="0.8"/>

          <path d="M144 138 C140 155 140 176 144 194 C156 201 197 201 208 194 C212 176 212 155 208 138 C192 132 160 132 144 138Z" fill="#5f4aa0" opacity="0.9"/>
          <path d="M152 138 C160 145 169 149 176 149 C183 149 192 145 200 138" fill="none" stroke="#d6a55a" strokeWidth="2.5"/>
          <circle cx="176" cy="168" r="6" fill="#24163b" opacity="0.85"/>
        </g>
      )}

      {owned.outfit_angel && (
        <g>
          <path d="M44 137 C42 154 42 174 44 192 C56 199 96 199 108 192 C110 174 110 154 108 137 C92 132 60 132 44 137Z" fill="#fff8f0" opacity="0.97"/>
          <ellipse cx="34" cy="151" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
          <ellipse cx="118" cy="151" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>

          <path d="M144 137 C142 154 142 174 144 192 C156 199 196 199 208 192 C210 174 210 154 208 137 C192 132 160 132 144 137Z" fill="#fff8f0" opacity="0.97"/>
          <ellipse cx="134" cy="151" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
          <ellipse cx="218" cy="151" rx="10" ry="18" fill="#f6fcff" opacity="0.8"/>
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
          <path d="M-20 -1 C-20 -5 -17 -7 -14 -4 C-11 -7 -8 -5 -8 -1 C-8 3 -14 8 -14 8 C-14 8 -20 3 -20 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <path d="M8 -1 C8 -5 11 -7 14 -4 C17 -7 20 -5 20 -1 C20 3 14 8 14 8 C14 8 8 3 8 -1Z" fill="#ff84a7" stroke="#b93d62" strokeWidth="1.5"/>
          <line x1="-8" y1="0" x2="8" y2="0" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-20" y1="0" x2="-29" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
          <line x1="20" y1="0" x2="29" y2="-2" stroke="#b93d62" strokeWidth="2" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_sun && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <rect x="-24" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <rect x="8" y="-7" width="16" height="11" rx="5.5" fill="#1b2230"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="-24" y1="-2" x2="-32" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <line x1="24" y1="-2" x2="32" y2="-3" stroke="#2f3540" strokeWidth="2" strokeLinecap="round"/>
          <rect x="-21" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
          <rect x="11" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.18"/>
        </g>
      )}

      {owned.glasses_round && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <circle cx="-12" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <circle cx="12" cy="-1" r="7.2" fill="none" stroke="#6a6f78" strokeWidth="2"/>
          <line x1="-4.8" y1="-1" x2="4.8" y2="-1" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-19" y1="-2" x2="-27" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="19" y1="-2" x2="27" y2="-3" stroke="#6a6f78" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_clear && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <rect x="-22" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <rect x="8" y="-7" width="14" height="11" rx="4" fill="#d9eef9" opacity="0.35" stroke="#7891a0" strokeWidth="1.6"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="-22" y1="-2" x2="-30" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="22" y1="-2" x2="30" y2="-3" stroke="#7891a0" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.glasses_star && (
        <g transform="rotate(-4, 176, 88) translate(176, 84)">
          <path d="M-13 -8 L-11 -3 L-6 -3 L-10 -0.5 L-8.5 4.5 L-13 2 L-17.5 4.5 L-16 -0.5 L-20 -3 L-15 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <path d="M13 -8 L15 -3 L20 -3 L16 -0.5 L17.5 4.5 L13 2 L8.5 4.5 L10 -0.5 L6 -3 L11 -3Z" fill="#ffd76a" stroke="#c28d1f" strokeWidth="1.2"/>
          <line x1="-6" y1="-1" x2="6" y2="-1" stroke="#c28d1f" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
      )}

      {owned.acc_bow && (
        <g transform="rotate(-4, 176, 88) translate(206, 58)">
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
function GardenScene({ garden, waterLevel, bgImage, isIndoor }) {
  const g = garden || {};
  // showIn: returns true if item should render in current view
  // stored as "garden"|"indoor" (or true for backward compat = "garden")
  const showIn = id => {
    const v = g[id];
    if (!v) return false;
    const loc = v === true || v === "garden" ? "garden" : "indoor";
    return isIndoor ? loc === "indoor" : loc === "garden";
  };
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
    <svg viewBox="0 0 390 340" style={{ width:"100%", height:"340px", display:"block", borderRadius: "0 0 20px 20px" }}>
      {bgImage ? (
        <image href={bgImage} x="0" y="0" width="390" height="290" preserveAspectRatio="xMidYMid slice"/>
      ) : (<>
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
      {showIn("clouds") && <g>
        <ellipse cx="80" cy="45" rx="40" ry="20" fill="white" opacity="0.85"/>
        <ellipse cx="100" cy="38" rx="28" ry="18" fill="white" opacity="0.9"/>
        <ellipse cx="60" cy="42" rx="22" ry="14" fill="white" opacity="0.8"/>
        <ellipse cx="280" cy="55" rx="34" ry="16" fill="white" opacity="0.75"/>
        <ellipse cx="300" cy="48" rx="22" ry="14" fill="white" opacity="0.8"/>
      </g>}
      {!showIn("clouds") && <g>
        <ellipse cx="90" cy="50" rx="28" ry="12" fill="white" opacity="0.5"/>
        <ellipse cx="280" cy="42" rx="20" ry="9" fill="white" opacity="0.4"/>
      </g>}

      {/* Sun / Moon */}
      {showIn("sun") ? <>
        <circle cx="330" cy="55" r="28" fill="#f0b030" opacity="0.95"/>
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(
          <line key={a} x1={330+Math.cos(a*Math.PI/180)*32} y1={55+Math.sin(a*Math.PI/180)*32}
            x2={330+Math.cos(a*Math.PI/180)*40} y2={55+Math.sin(a*Math.PI/180)*40}
            stroke="#f0b030" strokeWidth="2.5" strokeLinecap="round" opacity="0.7"/>
        ))}
      </> : <circle cx="330" cy="55" r="18" fill="#e8c860" opacity="0.5"/>}

      {/* Rainbow */}
      {showIn("rainbow") && [["#e87878",0],["#e8a858",7],["#e8d860",14],["#8ac868",21],["#5ab8c8",28]].map(([c,o],i)=>(
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
      </>)}

      {/* Willow tree */}
      {showIn("willow") && <g>
        <rect x="340" y="100" width="8" height="130" rx="4" fill="#9a8048"/>
        {[[-25,0],[-20,10],[-15,5],[-10,12],[-5,8],[0,15],[5,10],[10,14],[15,8],[20,5]].map(([dx,dy],i)=>(
          <path key={i} d={`M344 ${108+i*8} Q${344+dx} ${130+i*8+dy} ${344+dx*1.4} ${155+i*8+dy*1.5}`}
            fill="none" stroke={withering?"#c0b060":"#5a9840"} strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
        ))}
        <ellipse cx="344" cy="105" rx="20" ry="12" fill={withering?"#b0b040":"#6aaa40"} opacity="0.9"/>
      </g>}

      {/* Bamboo */}
      {showIn("bamboo1") && <g>
        <rect x="22" y="80" width="10" height="150" rx="5" fill={withering?"#8a9030":"#4a7a30"}/>
        {[98,122,148,172].map((y,i)=><rect key={i} x="19" y={y} width="16" height="6" rx="3" fill={withering?"#7a8028":"#3a6020"}/>)}
        <ellipse cx="10" cy="95" rx="20" ry="7" fill={withering?"#8a9830":"#5a8a3c"} transform="rotate(-32 10 95)" opacity="0.9"/>
        <ellipse cx="36" cy="86" rx="16" ry="6" fill={withering?"#909838":"#6a9a48"} transform="rotate(22 36 86)" opacity="0.9"/>
      </g>}
      {showIn("bamboo2") && <g>
        {[105,132,158].map((y,i)=><rect key={i} x="47" y={y} width="15" height="6" rx="3" fill={withering?"#7a8028":"#3a6020"}/>)}
        <rect x="66" y="90" width="9" height="140" rx="4.5" fill={withering?"#909838":"#5a8a35"}/>
        {[112,140,166].map((y,i)=><rect key={i} x="63" y={y} width="14" height="6" rx="3" fill={withering?"#7a8028":"#3a6520"}/>)}
      </g>}

      {/* Cherry tree */}
      {showIn("cherry") && <g>
        <rect x="278" y="148" width="12" height="82" rx="5" fill="#9a7848"/>
        <circle cx="284" cy="135" r="32" fill={dry?"#d4b070":"#f4a8b8"} opacity={dry?0.6:0.8}/>
        <circle cx="266" cy="148" r="22" fill={dry?"#ccaa60":"#f8b8c8"} opacity={dry?0.5:0.75}/>
        <circle cx="302" cy="145" r="24" fill={dry?"#d0a868":"#f0a0b0"} opacity={dry?0.55:0.75}/>
      </g>}

      {/* Pond */}
      {showIn("pond") && <g>
        <ellipse cx="200" cy="262" rx="90" ry="22" fill={waterCol} opacity="0.55"/>
        <ellipse cx="200" cy="259" rx="74" ry="15" fill={waterCol} opacity={dry?0.3:0.5}/>
        {showIn("koi1") && <g>
          <ellipse cx="185" cy="260" rx="18" ry="7" fill="#e86040" opacity="0.8"/>
          <path d="M167 260 Q163 254 160 260 Q163 266 167 260Z" fill="#e05030" opacity="0.8"/>
          <circle cx="196" cy="258" r="2" fill="white" opacity="0.9"/>
        </g>}
        {showIn("koi2") && <g>
          <ellipse cx="215" cy="264" rx="16" ry="6" fill="#d4a843" opacity="0.8"/>
          <path d="M231 264 Q235 258 238 264 Q235 270 231 264Z" fill="#c89030" opacity="0.8"/>
        </g>}
        {showIn("lotus_pad") && <g>
          <ellipse cx="175" cy="255" rx="18" ry="10" fill="#5a9840" opacity="0.8"/>
          <ellipse cx="222" cy="260" rx="14" ry="8" fill="#5a9840" opacity="0.7"/>
        </g>}
      </g>}

      {/* Lotus flowers */}
      {showIn("lotus1") && <g>
        <ellipse cx="110" cy="208" rx="14" ry="12" fill={dry?"#d4a060":"#f4a8b8"}/>
        <ellipse cx="110" cy="210" rx="9" ry="8" fill={dry?"#e0b070":"#f8c0cc"}/>
        <ellipse cx="100" cy="215" rx="8" ry="10" fill={dry?"#cc9848":"#f4a8b8"} transform="rotate(25 100 215)" opacity="0.75"/>
        <ellipse cx="120" cy="215" rx="8" ry="10" fill={dry?"#cc9848":"#f0a0b4"} transform="rotate(-25 120 215)" opacity="0.75"/>
      </g>}
      {showIn("lotus2") && <g>
        <rect x="140" y="215" width="5" height="18" rx="2.5" fill="#5a9060"/>
        <ellipse cx="142" cy="213" rx="13" ry="11" fill={dry?"#d8d0b0":"#f8f8f8"}/>
        <ellipse cx="134" cy="218" rx="7" ry="9" fill={dry?"#c8c0a0":"#f0f0f0"} transform="rotate(25 134 218)" opacity="0.8"/>
        <ellipse cx="150" cy="218" rx="7" ry="9" fill={dry?"#c0b898":"#eeeeee"} transform="rotate(-25 150 218)" opacity="0.8"/>
        <ellipse cx="142" cy="212" rx="4" ry="3" fill="#f8e060"/>
      </g>}

      {/* Lily */}
      {showIn("lily") && <g>
        <rect x="165" y="218" width="5" height="16" rx="2.5" fill="#5a7e3c"/>
        {[0,60,120,180,240,300].map((a,i)=>(
          <ellipse key={i} cx={168+Math.cos(a*Math.PI/180)*10} cy={216+Math.sin(a*Math.PI/180)*8}
            rx="6" ry="10" fill={dry?"#9898c0":i%2===0?"#8ab8e8":"#a8ccf0"}
            transform={`rotate(${a} ${168+Math.cos(a*Math.PI/180)*10} ${216+Math.sin(a*Math.PI/180)*8})`} opacity="0.85"/>
        ))}
        <circle cx="168" cy="216" r="4.5" fill="#f8e060"/>
      </g>}

      {/* Peony */}
      {showIn("peony") && <g>
        <ellipse cx="250" cy="208" rx="14" ry="12" fill={dry?"#c8a8a0":"#d4a0d8"}/>
        <ellipse cx="250" cy="210" rx="10" ry="9" fill={dry?"#d0b0a8":"#e0b8e8"}/>
        <ellipse cx="250" cy="212" rx="6" ry="6" fill={dry?"#d8b8b0":"#f0d0f4"}/>
        <ellipse cx="250" cy="213" rx="3" ry="3" fill="#f8e0a0"/>
        <ellipse cx="238" cy="216" rx="8" ry="10" fill={dry?"#c0a098":"#c890cc"} transform="rotate(20 238 216)" opacity="0.7"/>
        <ellipse cx="262" cy="216" rx="8" ry="10" fill={dry?"#c0a098":"#c890cc"} transform="rotate(-20 262 216)" opacity="0.7"/>
      </g>}

      {/* Swallows */}
      {showIn("swallow1") && <g transform="translate(164,68)">
        <path d="M0 -2 C-8 -14 -22 -18 -34 -13 C-24 -9 -16 -3 -10 3 C-18 1 -26 5 -32 11 C-20 11 -10 8 -1 2" fill="#263247" opacity="0.95"/>
        <path d="M0 -2 C8 -14 22 -18 34 -13 C24 -9 16 -3 10 3 C18 1 26 5 32 11 C20 11 10 8 1 2" fill="#263247" opacity="0.95"/>
        <ellipse cx="0" cy="2" rx="6.5" ry="3.6" fill="#1b2432"/>
        <path d="M-1 4 L-9 14 L-3 12 L0 17 L3 12 L9 14 L1 4" fill="#1b2432"/>
      </g>}
      {showIn("swallow2") && <g>
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
      {showIn("heart") && <path d="M195 90 C195 90 182 78 182 69 C182 63 187 60 191 62 C194 63 195 66 195 66 C195 66 196 63 199 62 C203 60 208 63 208 69 C208 78 195 90 195 90Z" fill="#e8607a" opacity="0.9"/>}

      {/* Bridge */}
      {showIn("bridge") && <g>
        <path d="M100 265 Q195 235 290 265" fill="none" stroke="#9a7848" strokeWidth="6" strokeLinecap="round"/>
        {[120,148,176,204,232,260].map((x,i)=>(
          <line key={i} x1={x} y1={248+(x-195)**2/1200} x2={x} y2={268} stroke="#8a6838" strokeWidth="3" opacity="0.9"/>
        ))}
        <line x1="100" y1="265" x2="290" y2="265" stroke="#8a6838" strokeWidth="4"/>
      </g>}

      {/* Pagoda */}
      {showIn("pagoda") && <g>
        <rect x="310" y="218" width="36" height="16" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M302 218 L328 200 L354 218Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="314" y="200" width="28" height="19" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M306 200 L328 184 L350 200Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="318" y="184" width="20" height="17" rx="2" fill={dry?"#c07840":"#d08848"}/>
        <path d="M312 184 L328 168 L344 184Z" fill={dry?"#b06830":"#c07040"}/>
        <rect x="322" y="162" width="12" height="8" rx="2" fill="#e8a030" opacity="0.9"/>
      </g>}

      {/* Lanterns */}
      {showIn("lantern") && <g>
        <rect x="22" y="185" width="6" height="40" rx="3" fill="#9a7848"/>
        <rect x="16" y="225" width="18" height="28" rx="8" fill="#e86030"/>
        <rect x="18" y="225" width="14" height="28" rx="6" fill="#f08050" opacity="0.6"/>
        <ellipse cx="25" cy="225" rx="10" ry="4" fill="#9a7848"/>
        <ellipse cx="25" cy="253" rx="10" ry="4" fill="#9a7848"/>
        <circle cx="25" cy="239" r="6" fill="#f8e060" opacity="0.5"/>
      </g>}
      {showIn("lantern2") && <g>
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
      {showIn("firefly") && <g>
        {[[45,190],[380,140],[200,185],[350,200],[80,160],[170,170],[310,185],[240,195],[130,180]].map(([x,y],i)=>(
          <g key={i}>
            <circle cx={x} cy={y} r="2.5" fill="#f8e840" opacity="0.95"/>
            <circle cx={x} cy={y} r="5" fill="#f8e840" opacity="0.2"/>
          </g>
        ))}
      </g>}

      {/* Moon gate */}
      {showIn("moongate") && <g>
        <circle cx="195" cy="160" r="50" fill="none" stroke="#f8e0a0" strokeWidth="6" opacity="0.8"/>
        <path d="M145 195 L145 230 L245 230 L245 195" fill="#b8d8a0" opacity="0.7"/>
        <circle cx="187" cy="152" r="7" fill="#f8e0a0" opacity="0.5"/>
        <circle cx="192" cy="148" r="5" fill="#f8e0a0" opacity="0.4"/>
        <circle cx="197" cy="152" r="4" fill="#f8e0a0" opacity="0.35"/>
      </g>}

      {/* ── INDOOR ITEMS ── only visible in cuarto view */}
      {showIn("rug") && <g>
        <ellipse cx="195" cy="262" rx="110" ry="22" fill="#c8a8d8" opacity="0.65"/>
        <ellipse cx="195" cy="262" rx="95" ry="16" fill="#d4b8e4" opacity="0.5"/>
        {[0,1,2,3].map(i=><ellipse key={i} cx={130+i*44} cy="262" rx="8" ry="6" fill="#e8d0f0" opacity="0.5"/>)}
      </g>}
      {showIn("fairy_lights") && <g>
        <path d="M0 28 Q50 36 100 28 Q150 36 200 28 Q250 36 300 28 Q350 36 390 28" fill="none" stroke="#c8a840" strokeWidth="1.2" opacity="0.7"/>
        {[15,42,68,95,122,148,175,202,228,255,280,308,335,362].map((x,i)=>(
          <g key={i}>
            <circle cx={x} cy={28+Math.sin(i)*3} r="5" fill={["#f8e840","#f8a0b0","#a0d8f8","#c0f0b0"][i%4]} opacity="0.9"/>
            <circle cx={x} cy={28+Math.sin(i)*3} r="9" fill={["#f8e840","#f8a0b0","#a0d8f8","#c0f0b0"][i%4]} opacity="0.2"/>
          </g>
        ))}
      </g>}
      {showIn("shelf") && <g>
        <rect x="8" y="100" width="68" height="90" rx="4" fill="#c8a878" opacity="0.9"/>
        <rect x="8" y="100" width="68" height="8" rx="2" fill="#a07848"/>
        <rect x="8" y="143" width="68" height="6" rx="2" fill="#a07848"/>
        <rect x="8" y="180" width="68" height="6" rx="2" fill="#a07848"/>
        {[{x:12,h:28,c:"#e87878"},{x:22,h:22,c:"#78a8e8"},{x:32,h:30,c:"#88c878"},{x:43,h:25,c:"#f8e060"},{x:53,h:28,c:"#d878e8"}].map((b,i)=>(
          <rect key={i} x={b.x} y={141-b.h} width="7" height={b.h} rx="2" fill={b.c} opacity="0.85"/>
        ))}
        {[{x:12,h:20,c:"#e8a030"},{x:22,h:24,c:"#8888e8"},{x:34,h:18,c:"#e87060"},{x:46,h:22,c:"#50c8a0"},{x:56,h:20,c:"#f0a0c0"}].map((b,i)=>(
          <rect key={i} x={b.x} y={178-b.h} width="7" height={b.h} rx="2" fill={b.c} opacity="0.85"/>
        ))}
      </g>}
      {showIn("lamp") && <g>
        <rect x="318" y="170" width="8" height="100" rx="4" fill="#b09060"/>
        <ellipse cx="322" cy="274" rx="22" ry="8" fill="#9a7848" opacity="0.7"/>
        <path d="M300 170 Q322 140 344 170Z" fill="#f8e8c0" opacity="0.9"/>
        <path d="M300 170 Q322 140 344 170Z" fill="none" stroke="#d4b070" strokeWidth="2"/>
        <circle cx="322" cy="165" r="8" fill="#f8e060" opacity="0.7"/>
        <ellipse cx="322" cy="190" rx="35" ry="18" fill="#f8e860" opacity="0.15"/>
      </g>}
      {showIn("cushions") && <g>
        <ellipse cx="155" cy="255" rx="32" ry="18" fill="#f0b8c8" opacity="0.85"/>
        <ellipse cx="155" cy="252" rx="28" ry="14" fill="#f8c8d4" opacity="0.7"/>
        <ellipse cx="225" cy="252" rx="28" ry="16" fill="#c8d8f8" opacity="0.85"/>
        <ellipse cx="225" cy="249" rx="24" ry="12" fill="#d8e4fc" opacity="0.7"/>
        <circle cx="155" cy="251" r="4" fill="#f8d8e0" opacity="0.6"/>
        <circle cx="225" cy="248" r="4" fill="#dce8fc" opacity="0.6"/>
      </g>}
      {showIn("indoor_plant") && <g>
        <ellipse cx="362" cy="270" rx="22" ry="12" fill="#9a7040" opacity="0.9"/>
        <path d="M362 268 C362 268 350 248 345 230 C352 238 358 248 362 255 C366 248 372 238 379 230 C374 248 362 268 362 268Z" fill="#5a9840" opacity="0.9"/>
        <path d="M362 260 C362 260 354 244 358 228 C362 242 362 260 362 260Z" fill="#6aaa48" opacity="0.6"/>
        <ellipse cx="362" cy="268" rx="12" ry="7" fill="#b08848" opacity="0.7"/>
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
function Jardin({ bamboo, happiness, water, garden, accessories, mochiHappy, pandaBubble, onPetA, onPetB, onBuy, onWater, onBuyAccessory, user }) {
  const [indoor, setIndoor] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [shopTab, setShopTab] = useState("plantas");
  const cats = [{id:"plantas",label:"🌿 Plantas"},{id:"agua",label:"🐟 Agua"},{id:"cielo",label:"☁️ Cielo"},{id:"deco",label:"🏮 Deco"},{id:"especial",label:"✨ Especiales"},{id:"cuarto",label:"🛋️ Cuarto"},{id:"accesorios",label:"🐼 Pandas"}];
  const shopItems = (shopTab === "accesorios"
    ? PANDA_ACCESSORIES
    : GARDEN_ITEMS.filter(i => i.cat === shopTab)).filter(i => i && i.id && typeof i.cost === "number");

  const dry = water < 20;
  const withering = water < 40;

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ background: C.dark, padding: "44px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.55rem", color: C.cream2 }}>El Jardín</div>
            <div style={{ fontSize: "0.72rem", color: `${C.cream}88`, fontWeight: 700, letterSpacing: "0.5px" }}>
              {water < 20 ? "🏜️ JARDÍN SECO" : water < 40 ? "🌱 SEDIENTO" : water < 60 ? "🌿 SANO" : water < 80 ? "🌸 FLORECIENDO" : "🌺 RADIANTE"}
            </div>
          </div>
          <div style={{ background: C.olive, borderRadius: 10, padding: "8px 16px", fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.cream2, boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}>🌿 {bamboo}</div>
        </div>
        {/* Bars */}
        {[{l:"♡ AMOR",v:happiness,c:C.salmon},{l:"💧 AGUA",v:water,c:dry?"#e86030":withering?"#e8a030":C.sky}].map(b => (
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
        {/* Toggle jardín/cuarto */}
        <button onClick={() => setIndoor(v => !v)} style={{ position:"absolute", top:10, right:10, zIndex:20, background:"rgba(255,255,255,0.85)", backdropFilter:"blur(4px)", border:"1.5px solid rgba(100,70,180,0.25)", borderRadius:12, padding:"7px 13px", fontFamily:"'Fredoka One',cursive", fontSize:"0.82rem", color:"#2d1b4e", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.12)", display:"flex", alignItems:"center", gap:6 }}>
          {indoor ? "🌿 Jardín" : "🏠 Cuarto"}
        </button>
        <SectionErrorBoundary fallback={<div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:16, margin:12, padding:12, textAlign:"center", color:C.inkM, fontWeight:700 }}>No se pudo cargar esta vista del jardín. Cambia de pestaña y vuelve a intentar.</div>}>
          <GardenScene garden={garden} waterLevel={water} bgImage={indoor ? "/bg_indoor.png" : "/bg_garden.png"} isIndoor={indoor}/>
          <div onClick={onPetA} style={{ position:"absolute", bottom:-5, left:"50%", transform:"translateX(-50%)", cursor:"pointer",
            animation: mochiHappy ? "floatHappy 1.6s ease-in-out infinite" : "float 3s ease-in-out infinite" }}>
            <div style={{ position:"relative", display:"inline-block" }}>
              {/* Speech bubble A — left panda, messages received by me */}
              {pandaBubble?.textA && (
                <div style={{ position:"absolute", bottom:"90%", left:"-18px", maxWidth:112, background:"white",
                  border:`2px solid ${C.olive}`, borderRadius:"14px 14px 4px 14px", padding:"7px 10px",
                  fontSize:"0.7rem", color:C.ink, fontWeight:700, lineHeight:1.4,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.15)", zIndex:10, animation:"fadeIn 0.3s ease" }}>
                  {pandaBubble.nameA && <div style={{ fontSize:"0.6rem", color:C.olive, fontWeight:800, marginBottom:2 }}>{pandaBubble.nameA}</div>}
                  {pandaBubble.textA}
                  <div style={{ position:"absolute", bottom:-8, left:10, width:0, height:0,
                    borderLeft:"8px solid transparent", borderRight:"0 solid transparent",
                    borderTop:`8px solid ${C.olive}` }}/>
                </div>
              )}
              {/* Speech bubble B — right panda, messages received by partner */}
              {pandaBubble?.textB && (
                <div style={{ position:"absolute", bottom:"84%", right:"-16px", maxWidth:112, background:"white",
                  border:"2px solid #e8907a", borderRadius:"14px 14px 14px 4px", padding:"7px 10px",
                  fontSize:"0.7rem", color:C.ink, fontWeight:700, lineHeight:1.4,
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
              {/* Invisible split click zones */}
              <div onClick={e => { e.stopPropagation(); onPetA(); }} style={{ position:"absolute", top:0, left:0, width:"50%", height:"100%", cursor:"pointer" }}/>
              <div onClick={e => { e.stopPropagation(); onPetB(); }} style={{ position:"absolute", top:0, right:0, width:"50%", height:"100%", cursor:"pointer" }}/>
            </div>
          </div>
        </SectionErrorBoundary>
      </div>

      {/* Water + Games buttons */}
      <div style={{ display:"flex", gap:10, padding:"22px 14px 6px", justifyContent:"center" }}>
        <button onClick={onWater} style={{ background: dry?"#e86030":C.sky, color:C.white, border:"none", borderRadius:12, padding:"10px 22px", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)" }}>💧 Regar</button>
        <button onClick={() => setShowGames(true)} style={{ background:"linear-gradient(135deg, #6a3cbf 0%, #9c5cbf 100%)", color:"#fff", border:"none", borderRadius:12, padding:"10px 22px", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(100,60,180,0.3)" }}>🎮 Jugar</button>
      </div>

      {showGames && <GamesHub user={user} onClose={() => setShowGames(false)}/>}

      {/* Shop */}
      <div style={{ background:C.white, borderRadius:"22px 22px 0 0", border:`1.5px solid ${C.border}`, boxShadow:`0 -3px 0 ${C.border}`, marginTop:10 }}>
        <div style={{ padding:"16px 16px 0" }}>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark }}>Tienda del jardín</div>
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
            const locked = shopTab !== "accesorios" && POND_DEPS.includes(item.id) && !garden?.pond && !owned;
            return (
              <div key={item.id} onClick={() => shopTab==="accesorios" ? onBuyAccessory(item) : onBuy({...item, location: indoor ? "indoor" : "garden"})}
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
                {owned
                  ? <div style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>✓</div>
                  : locked
                  ? <div style={{ background:C.sand, color:C.inkL, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>🔒</div>
                  : <div style={{ background:C.dark, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>{item.cost} 🌿</div>}
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
  const [nameA, setNameA] = useState(""); const [nameB, setNameB] = useState(""); const [durN, setDurN] = useState(""); const [durU, setDurU] = useState("meses");
  const [pCode, setPCode] = useState(""); const [pEmail, setPEmail] = useState(""); const [pPass, setPPass] = useState("");
  const [err, setErr] = useState("");
  const makeCode = () => "MO" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [code, setCode] = useState(makeCode());
  const [codeStatus, setCodeStatus] = useState("checking"); // checking | available | taken | error

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!code || tab !== "register") return;

    setCodeStatus("checking");
    fbGetCode(code)
      .then((data) => {
        if (cancelled) return;
        setCodeStatus(data ? "taken" : "available");
      })
      .catch(() => {
        if (cancelled) return;
        setCodeStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [code, tab]);

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
      return "Email/Password no está habilitado en Firebase Authentication.";
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
      const since = durN ? `Juntos ${durN} ${durU}` : "Juntos desde hoy";
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
      onLogin({ uid, email: cleanEmail, names, code: finalCode, since, isOwner: true, isGuest: false }, true);
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
  const TABS = [{ id: "login", label: "Entrar" }, { id: "register", label: "Crear" }, { id: "pair", label: "Unirse" }];

  return (
    <div style={{ minHeight: "100vh", background: C.sandL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", fontFamily: "'Nunito',sans-serif" }}>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "3rem", color: C.dark, letterSpacing: "2px" }}>mochi</div>
      <div style={{ color: C.inkL, fontWeight: 700, marginBottom: 12, fontSize: "0.85rem", letterSpacing: "0.6px" }}>TU JARDÍN DE PAREJA 🌿</div>
      <div style={{ marginBottom: 18, animation: "float 3s ease-in-out infinite" }}>
        <CouplePandaSVG size={160} happy={true} />
      </div>
      <div style={{ background: C.white, borderRadius: 24, padding: "22px 20px", width: "100%", maxWidth: 380, boxShadow: `0 4px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ display: "flex", background: C.sand, borderRadius: 12, padding: 3, marginBottom: 18, gap: 3 }}>
          {TABS.map(t => (
            <div key={t.id} onClick={() => { setTab(t.id); setErr(""); }} style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRadius: 9, fontFamily: "'Fredoka One',cursive", fontSize: "0.9rem", cursor: "pointer", background: tab === t.id ? C.white : "transparent", color: tab === t.id ? C.dark : C.inkL, boxShadow: tab === t.id ? `0 2px 0 ${C.border}` : "none", border: tab === t.id ? `1.5px solid ${C.border}` : "1.5px solid transparent", transition: "all 0.18s" }}>
              {t.label}
            </div>
          ))}
        </div>
        {tab === "register" && (
          <div style={{ background: "#f0f7e8", borderRadius: 12, padding: "9px 14px", marginBottom: 10, border: "1px solid #c8ddb0", textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: "#4a6a30", lineHeight: 1.6 }}>
              🌱 <strong>¿Eres el primero?</strong> Crea la cuenta y le mandas tu código a tu pareja para que se una.
            </div>
          </div>
        )}
        {tab === "pair" && (
          <div style={{ background: "#f0f0ff", borderRadius: 12, padding: "9px 14px", marginBottom: 10, border: "1px solid #b8b8e0", textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: "#404090", lineHeight: 1.6 }}>
              🐾 <strong>¿Tu pareja ya tiene cuenta?</strong> Pídele su código y úsalo aquí para conectarse.
            </div>
          </div>
        )}
        {err && <div style={{ background: "#fce4e4", color: "#c04040", fontSize: "0.82rem", fontWeight: 700, padding: "9px 13px", borderRadius: 10, marginBottom: 12, textAlign: "center" }}>{err}</div>}
        {tab === "login" && <>
          <label style={LBL}>Correo</label><Inp value={email} onChange={setEmail} placeholder="tu@correo.com" type="email" style={{ marginBottom: 10 }} />
          <label style={LBL}>Contraseña</label><Inp value={pass} onChange={setPass} placeholder="••••••••" type="password" style={{ marginBottom: 16 }} />
          <Btn onClick={doLogin} style={{ width: "100%", marginBottom: 8 }} disabled={loading}>{loading ? "Entrando..." : "Entrar 🐼"}</Btn>
          <Btn onClick={() => onLogin({ isGuest: true, names: "Nosotros", since: "Siempre juntos" }, false)} variant="ghost" style={{ width: "100%" }}>Continuar sin cuenta</Btn>
        </>}
        {tab === "register" && <>
          <div style={{ marginBottom:10 }}>
              <label style={LBL}>🐼 Tu nombre</label>
              <Inp value={nameA} onChange={setNameA} placeholder="Johana" type="text"/>
          </div>
          {[["Correo", email, setEmail, "tu@correo.com", "email"], ["Contraseña", pass, setPass, "Mínimo 6 caracteres", "password"]].map(([l, v, fn, ph, t]) => (
            <div key={l}><label style={LBL}>{l}</label><Inp value={v} onChange={fn} placeholder={ph} type={t} style={{ marginBottom: 10 }} /></div>
          ))}
          <label style={LBL}>¿Cuánto tiempo llevan juntos?</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="number" placeholder="Ej: 2" value={durN} onChange={e => setDurN(e.target.value)} style={{ flex: 1, border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", outline: "none", color: C.ink, background: C.cream2 }} />
            <select value={durU} onChange={e => setDurU(e.target.value)} style={{ flex: 1.3, border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Nunito',sans-serif", fontSize: "0.88rem", outline: "none", color: C.ink, background: C.cream2 }}>
              {["días", "semanas", "meses", "años"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <Btn onClick={doReg} style={{ width: "100%", marginBottom: 14 }} disabled={loading}>{loading ? "Creando..." : "Crear cuenta 🌱"}</Btn>
          <div style={{ background: C.cream, borderRadius: 16, padding: 14, textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.6px", marginBottom: 7 }}>TU CÓDIGO DE PAREJA</div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "2.2rem", letterSpacing: 9, color: C.dark, background: C.white, borderRadius: 10, padding: "10px", marginBottom: 6, border: `1.5px solid ${C.border}` }}>{code}</div>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, marginBottom: 8, color: codeStatus === "available" ? C.olive : codeStatus === "taken" ? "#c04040" : C.inkL }}>
              {codeStatus === "checking" && "Verificando disponibilidad..."}
              {codeStatus === "available" && "Código disponible ✓"}
              {codeStatus === "taken" && "Código ocupado, genera otro"}
              {codeStatus === "error" && "No se pudo verificar ahora, se validará al crear"}
            </div>
            <Btn onClick={() => setCode(makeCode())} variant="sand" style={{ padding: "8px 12px", fontSize: "0.76rem", marginBottom: 8 }}>
              Generar otro código
            </Btn>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>Compártelo para que tu pareja se una</div>
          </div>
        </>}
        {tab === "pair" && <>
          <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: "1.8rem", marginBottom: 4 }}>🔗</div><div style={{ fontFamily: "'Fredoka One',cursive", color: C.dark, fontSize: "1.1rem" }}>Únete al jardín de tu pareja</div></div>
          <div style={{ marginBottom:10 }}>
            <label style={LBL}>🐾 Tu nombre</label>
            <Inp value={nameB} onChange={setNameB} placeholder="Rodrigo" type="text"/>
          </div>
          <input value={pCode} onChange={e => setPCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CÓDIGO" style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Fredoka One',cursive", fontSize: "1.8rem", letterSpacing: 9, textAlign: "center", outline: "none", marginBottom: 12, color: C.dark, background: C.cream2, boxSizing: "border-box" }} />
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
        forUid: "partner",
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
          forUid: "partner",
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
        <div style={{ fontFamily:"'Fredoka One',cursive", color:C.dark, fontSize:"1.1rem", marginBottom:6 }}>¡Ejercicio completado!</div>
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
            {cur.q.replace(/Persona A/g, scenarioNameA).replace(/Persona B/g, scenarioNameB)}
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
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "4.8rem", color: C.dark, letterSpacing: 4 }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
      <div style={{ fontSize: "0.85rem", color: C.inkM, fontWeight: 700, marginTop: 8 }}>{ex.timerLabel}</div>
    </div>
  );

  return (
    <div>
      <div style={{ background: C.cream, borderRadius: 12, padding: 12, textAlign: "center", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark, marginBottom: 14, border: `1.5px solid ${C.border}` }}>¡{Math.floor(ex.timer / 60)} minutos completados! 🎉</div>
      {ex.afterPrompts.map((p, i) => <div key={i} style={{ marginBottom: 10 }}><PBadge who={i === 0 ? "A" : "B"} name={i === 0 ? nameA : nameB} /><TA value={vals[i]} onChange={v => { const n = [...vals]; n[i] = v; setVals(n); }} placeholder={p.ph} /></div>)}
      <Btn onClick={() => { if (!vals.some(v => v.length < 2)) onDone(); }} style={{ width: "100%" }}>Finalizar ✓</Btn>
    </div>
  );
}


function ExModal({ ex, onClose, onComplete, nameA, nameB, user }) {
  const [done, setDone] = useState(false);
  const [pts, setPts] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);

  const finish = (p = ex.bamboo) => { setDone(true); setPts(p); onComplete(ex, p); };

  if (done) return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ marginBottom: 14 }}><CouplePandaSVG happy size={120} /></div>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.6rem", color: C.dark, marginBottom: 5 }}>¡Lo hicieron juntos!</div>
      <div style={{ fontSize: "0.88rem", color: C.inkM, marginBottom: 16 }}>Sus pandas están muy felices de verlos crecer</div>
      <div style={{ background: C.gold, color: C.ink, borderRadius: 12, padding: "10px 24px", fontFamily: "'Fredoka One',cursive", fontSize: "1.15rem", display: "inline-block", marginBottom: 18, boxShadow: "0 3px 0 rgba(0,0,0,0.14)" }}>+{pts} bambú 🌿</div>
      <Btn onClick={onClose} variant="olive" style={{ width: "100%", fontSize: "1.05rem" }}>Reclamar recompensa</Btn>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 5 }}>{ex.emoji}</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.4rem", color: C.dark }}>{ex.title}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <Tag bg={C.cream} color={C.inkM}>{ex.tags}</Tag>
          <Tag bg={C.sandL} color={C.olive}>{ex.time}</Tag>
          <Tag bg="#fff8e0" color="#9a7020">+{ex.bamboo} 🌿</Tag>
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
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.95rem", color: C.dark }}>📋 Cómo hacerlo</div>
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

function Ejercicios({ exDone, onComplete, user, lessonsDone, onCompleteLesson }) {
  const { nameA, nameB } = getCoupleNames(user);
  const [openId, setOpenId] = useState(null);
  const [openLesson, setOpenLesson] = useState(null);
  const [ejTab, setEjTab] = useState("ejerc");
  const ex = EXERCISES.find(e => e.id === openId);

  return (
    <>
      <div style={{ background: C.sandL, minHeight: ejTab === "ejerc" ? "100vh" : "auto", paddingBottom: 90 }}>
        {/* Header with sub-tabs */}
        <div style={{ background: C.dark, padding:"44px 18px 0" }}>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.9rem", color:C.cream2, marginBottom:4 }}>Ejercicios ⭐</div>
          <div style={{ color:`${C.cream}88`, fontSize:"0.84rem", fontWeight:600, marginBottom:14 }}>Actividades y aprendizaje en pareja</div>
          <div style={{ display:"flex", gap:4 }}>
            {[["ejerc","🌿 Ejercicios"],["lecciones","📖 Lecciones"]].map(([id,label]) => (
              <div key={id} onClick={() => setEjTab(id)}
                style={{ flex:1, padding:"10px 0", textAlign:"center", fontFamily:"'Fredoka One',cursive",
                  fontSize:"0.9rem", cursor:"pointer", borderRadius:"12px 12px 0 0",
                  background: ejTab===id ? C.sandL : "transparent",
                  color: ejTab===id ? C.dark : `${C.cream}88`,
                  transition:"all 0.15s" }}>
                {label}
              </div>
            ))}
          </div>
        </div>
        {ejTab === "ejerc" && EXERCISES.map(e => {
          const count = exDone[e.id] || 0;
          return (
            <div key={e.id} onClick={() => setOpenId(e.id)}
              style={{ background: C.white, borderRadius: 20, padding: 18, margin: "10px 14px", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, cursor: "pointer", transition: "transform 0.13s" }}
              onMouseOver={ev => ev.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={ev => ev.currentTarget.style.transform = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", flexShrink: 0, border: `1.5px solid ${C.border}` }}>{e.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.dark }}>{e.title}</div>
                  <Tag bg={C.cream} color={C.inkM} style={{ marginTop: 3 }}>{e.tags}</Tag>
                </div>
                <div style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: i < count ? (count >= 3 ? C.gold : C.olive) : C.sand }} />)}</div>
              </div>
              <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.5, marginBottom: 12 }}>{e.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ background: C.olive, color: C.cream2, borderRadius: 8, padding: "4px 12px", fontWeight: 800, fontSize: "0.78rem" }}>+{e.bamboo} bambú</div>
                <span style={{ color: C.inkL, fontSize: "0.78rem", fontWeight: 700 }}>{e.time}</span>
              </div>
            </div>
          );
        })}
      </div>
      {ejTab === "lecciones" && (
      <div style={{ background: C.sandL, minHeight:"60vh", paddingBottom:14 }}>
        <div style={{ margin:"10px 14px 0" }}>
        <div style={{ background:"#e8f0ff", borderRadius:14, padding:"9px 14px", marginBottom:10, border:`1px solid #a8b8e830` }}>
          <div style={{ fontSize:"0.8rem", color:"#4050a0", lineHeight:1.5 }}>💡 Herramientas reales de psicología de pareja.</div>
        </div>
        {(() => {
          const dayOfYear = Math.floor((new Date()-new Date(new Date().getFullYear(),0,0))/86400000);
          const todayId = DAILY_LESSONS[dayOfYear % DAILY_LESSONS.length].id;
          return DAILY_LESSONS.map(lesson => {
            const doneData = lessonsDone?.[lesson.id] || {};
            const myKey = user?.isOwner !== false ? "owner" : "partner";
            const iDone = doneData[myKey] === true;
            const ownerDone = doneData.owner === true;
            const partnerDone = doneData.partner === true;
            const bothDone = ownerDone && partnerDone;
            const isToday = lesson.id === todayId;
            return (
              <div key={lesson.id} onClick={() => setOpenLesson(lesson)}
                style={{ background: isToday&&!iDone ? C.dark : C.white, borderRadius:16,
                  padding:"12px 15px", marginBottom:9, cursor:"pointer",
                  border:`1.5px solid ${isToday&&!iDone ? C.dark : bothDone ? C.olive+"50" : C.border}`,
                  boxShadow:`0 2px 0 ${isToday&&!iDone?"rgba(0,0,0,0.2)":C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ fontSize:"1.6rem" }}>{lesson.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.92rem", color:isToday&&!iDone?C.cream2:C.dark }}>{lesson.title}</div>
                    <div style={{ fontSize:"0.7rem", fontWeight:700, marginTop:2, color:isToday&&!iDone?`${C.cream}88`:C.inkL }}>{lesson.tag}{isToday?" · HOY":""}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                    {!iDone && <div style={{ background:isToday?C.olive:C.sandL, color:isToday?C.cream2:C.olive, borderRadius:7, padding:"3px 8px", fontSize:"0.68rem", fontWeight:800 }}>+10 🌿</div>}
                    <div style={{ display:"flex", gap:4 }}>
                      <div style={{ fontSize:"0.65rem", fontWeight:800, color: ownerDone ? C.olive : C.sand }}>🐼{ownerDone?"✓":"·"}</div>
                      <div style={{ fontSize:"0.65rem", fontWeight:800, color: partnerDone ? C.teal : C.sand }}>🐾{partnerDone?"✓":"·"}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* LESSON MODAL */}
      {openLesson && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.65)", zIndex:5000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) setOpenLesson(null); }}>
          <div style={{ background:C.sandL, borderRadius:"22px 22px 0 0", width:"100%", maxHeight:"92vh", overflowY:"auto", border:`1.5px solid ${C.border}` }}>
            <div style={{ background:C.dark, padding:"18px 18px 20px", borderRadius:"22px 22px 0 0", position:"relative" }}>
              <div style={{ width:34, height:5, background:"rgba(255,255,255,0.2)", borderRadius:50, margin:"0 auto 12px" }}/>
              <button onClick={() => setOpenLesson(null)} style={{ position:"absolute", right:16, top:14, background:C.sandL, border:`1.5px solid ${C.border}`, borderRadius:9, width:30, height:30, fontSize:"0.85rem", cursor:"pointer", color:C.inkM }}>✕</button>
              <div style={{ fontSize:"2rem", marginBottom:5 }}>{openLesson.emoji}</div>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.35rem", color:C.cream2, marginBottom:4 }}>{openLesson.title}</div>
              <span style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"3px 10px", fontSize:"0.68rem", fontWeight:800 }}>{openLesson.tag}</span>
            </div>
            <div style={{ padding:"14px 16px 80px" }}>
              <div style={{ background:"#e8f4e8", borderRadius:14, padding:14, marginBottom:14, border:`1px solid ${C.olive}30` }}>
                <div style={{ fontSize:"0.86rem", color:C.inkM, lineHeight:1.75, fontStyle:"italic" }}>"{openLesson.intro}"</div>
              </div>
              {openLesson.sections.map((s,i) => (
                <div key={i} style={{ background:C.white, borderRadius:14, padding:14, marginBottom:9, border:`1.5px solid ${C.border}` }}>
                  <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark, marginBottom:5 }}>{s.icon} {s.title}</div>
                  <div style={{ fontSize:"0.85rem", color:C.inkM, lineHeight:1.7 }}>{s.body}</div>
                </div>
              ))}
              <div style={{ background:"#fff8e0", borderRadius:14, padding:14, marginBottom:16, border:`1.5px solid #e8d840` }}>
                <div style={{ fontSize:"0.68rem", fontWeight:800, color:"#9a8020", marginBottom:5, letterSpacing:"0.6px" }}>🤔 REFLEXIONEN JUNTOS</div>
                <div style={{ fontSize:"0.88rem", color:C.ink, lineHeight:1.7, fontWeight:700 }}>{openLesson.reflect}</div>
              </div>
              {!(lessonsDone?.[openLesson.id]?.[user?.isOwner !== false ? "owner" : "partner"])
                ? <button onClick={() => { onCompleteLesson(openLesson.id); setOpenLesson(null); }}
                    style={{ width:"100%", background:C.olive, color:C.cream2, border:"none", borderRadius:14, padding:15, fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>
                    ✓ Leímos esto juntos · +10 bambú 🌿
                  </button>
                : <div style={{ textAlign:"center", background:C.cream, borderRadius:12, padding:12, border:`1.5px solid ${C.border}` }}>
                    <div style={{ fontFamily:"'Fredoka One',cursive", color:C.olive, marginBottom:6 }}>✓ Ya la completaste</div>
                    <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                      <div style={{ fontSize:"0.75rem", fontWeight:800, color: lessonsDone?.[openLesson?.id]?.owner ? C.olive : C.sand }}>🐼 {nameA} {lessonsDone?.[openLesson?.id]?.owner ? "✓" : "pendiente"}</div>
                      <div style={{ fontSize:"0.75rem", fontWeight:800, color: lessonsDone?.[openLesson?.id]?.partner ? C.teal : C.sand }}>🐾 {nameB} {lessonsDone?.[openLesson?.id]?.partner ? "✓" : "pendiente"}</div>
                    </div>
                  </div>}
            </div>
          </div>
        </div>
      )}

      </div>
      )}

      {openId && ex && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,15,0.65)", zIndex: 5000, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div style={{ background: C.white, borderRadius: "22px 22px 0 0", padding: "16px 18px 44px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto", border: `1.5px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ width:34, height:5, background:C.sand, borderRadius:50 }}/>
              <div onClick={()=>setOpenId(null)} style={{ width:30, height:30, borderRadius:"50%", background:C.sand, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:"1rem", color:C.inkM, fontWeight:800 }}>✕</div>
            </div>
            <button onClick={() => setOpenId(null)} style={{ position: "absolute", right: 16, top: 14, background: C.sandL, border: `1.5px solid ${C.border}`, borderRadius: 9, width: 30, height: 30, fontSize: "0.85rem", cursor: "pointer", color: C.inkM }}>✕</button>
            <ExModal ex={ex} onClose={() => setOpenId(null)} onComplete={(exercise, pts) => { onComplete(exercise, pts); }} user={user} nameA={nameA} nameB={nameB} />
          </div>
        </div>
      )}
    </>
  );
}


// CONOCETE
function Conocete({ conoce, onSave, user }) {
  const { nameA, nameB } = getCoupleNames(user);
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const myWho = myRole === "owner" ? "A" : "B";
  const myLabel = myRole === "owner" ? nameA : nameB;
  const partnerWho = myRole === "owner" ? "B" : "A";
  const partnerLabel = myRole === "owner" ? nameB : nameA;
  const [cat, setCat] = useState(null);
  const [qIdx, setQIdx] = useState(null);
  const [myAnswer, setMyAnswer] = useState("");
  const [saved, setSaved] = useState(false);

  const openQ = (c, i) => {
    setCat(c);
    setQIdx(i);
    setSaved(false);
    const ex = conoce[`${c}-${i}`] || {};
    setMyAnswer(ex[myRole] || "");
  };
  const saveQ = () => {
    const key = `${cat}-${qIdx}`;
    const clean = myAnswer.trim();
    if (!clean) return;
    const isNewMine = !conoce[key]?.[myRole];
    onSave(cat, qIdx, clean, null, isNewMine);
    setSaved(true);
    setQIdx(null);
  };

  if (qIdx !== null) return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse · +15 bambú cada una" />
      <div style={{ margin: 14 }}>
        <div style={{ background: C.white, borderRadius: 20, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.inkM, marginBottom: 8, letterSpacing: "0.5px" }}>{CONOCE_CATS[cat].emoji} {CONOCE_CATS[cat].label.toUpperCase()}</div>
          <div style={{ fontSize: "0.97rem", color: C.ink, lineHeight: 1.6, fontWeight: 700, marginBottom: 16 }}>{CONOCE_CATS[cat].preguntas[qIdx]}</div>
          <div style={{ marginBottom: 12 }}>
            <PBadge who={myWho} name={myLabel} />
            <TA value={myAnswer} onChange={setMyAnswer} placeholder="Tu respuesta..." rows={3} />
          </div>
          {!!conoce[`${cat}-${qIdx}`]?.[partnerRole] && (
            <div style={{ marginBottom: 12, background: C.cream, borderRadius: 12, padding: 11, border: `1.5px solid ${C.border}` }}>
              <PBadge who={partnerWho} name={partnerLabel} />
              <div style={{ fontSize: "0.86rem", color: C.inkM, lineHeight: 1.6, marginTop: 6 }}>
                {conoce[`${cat}-${qIdx}`][partnerRole]}
              </div>
            </div>
          )}
          {saved && <div style={{ textAlign: "center", fontSize: "0.82rem", fontWeight: 800, color: C.olive, marginBottom: 10, background: C.cream, borderRadius: 9, padding: "8px", border: `1.5px solid ${C.border}` }}>✓ Guardado — +15 bambú 🌿</div>}
          <div style={{ display: "flex", gap: 9 }}><Btn onClick={saveQ} style={{ flex: 1 }}>Guardar 🌿</Btn><Btn onClick={() => setQIdx(null)} variant="ghost" style={{ padding: "12px 14px" }}>✕</Btn></div>
        </div>
      </div>
    </div>
  );

  if (cat) return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse" />
      <div style={{ margin: 14 }}>
        <div style={{ background: C.white, borderRadius: 20, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.dark }}>{CONOCE_CATS[cat].emoji} {CONOCE_CATS[cat].label}</div>
            <button onClick={() => setCat(null)} style={{ background: C.sand, border: `1.5px solid ${C.border}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: "0.85rem", color: C.inkM }}>✕</button>
          </div>
          {CONOCE_CATS[cat].preguntas.map((q, i) => {
            const doneMine = !!conoce[`${cat}-${i}`]?.[myRole];
            const donePartner = !!conoce[`${cat}-${i}`]?.[partnerRole];
            return <div key={i} onClick={() => openQ(cat, i)} style={{ background: doneMine ? C.cream : C.sandL, borderRadius: 12, padding: 13, marginBottom: 8, cursor: "pointer", borderLeft: `4px solid ${doneMine ? C.olive : C.border}`, transition: "all 0.13s" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: C.ink }}>{q}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, color: doneMine ? C.olive : C.inkL }}>{myWho} {doneMine ? "✓" : "pendiente"}</div>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, color: donePartner ? C.teal : C.inkL }}>{partnerWho} {donePartner ? "✓" : "pendiente"}</div>
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse" />
      <div style={{ padding: "8px 14px 0", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Elige una categoría</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, padding: "10px 14px" }}>
        {Object.entries(CONOCE_CATS).map(([key, data]) => {
          const done = data.preguntas.filter((_, i) => !!conoce[`${key}-${i}`]?.[myRole]).length;
          return <div key={key} onClick={() => setCat(key)} style={{ background: data.bg, borderRadius: 18, padding: 18, textAlign: "center", cursor: "pointer", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, transition: "transform 0.13s" }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
            <div style={{ fontSize: "2.2rem", marginBottom: 7 }}>{data.emoji}</div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.97rem", color: C.dark }}>{data.label}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkM, fontWeight: 700, marginTop: 3 }}>{done} / {data.preguntas.length}</div>
            <ProgBar value={done} max={data.preguntas.length} color={C.olive} style={{ marginTop: 8 }} />
          </div>;
        })}
      </div>
      <div style={{ margin: "0 14px 0" }}>
        <Cuestionarios conoce={conoce} onSave={onSave} user={user} />
      </div>
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
  const [activeTab, setActiveTab] = useState("negociacion");
  const [newAgreementText, setNewAgreementText] = useState("");
  const [counterText, setCounterText] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);

  const allEntries = Object.entries(burbuja || {});
  const pendingEntries = allEntries.filter(([, v]) => v?.status === "pending" && v?.proposalText);
  const approvedEntries = allEntries.filter(([, v]) => v?.status === "approved");
  const pendingForMe = pendingEntries.filter(([, v]) => v?.proposalBy !== myRole);
  const pendingByMe = pendingEntries.filter(([, v]) => v?.proposalBy === myRole);

  const handlePropose = () => {
    const text = newAgreementText.trim();
    if (!text) return;
    const id = `acuerdo_${Date.now()}`;
    onPropose(id, text, false);
    setNewAgreementText("");
    setShowNewForm(false);
  };

  const handleCounter = (id) => {
    const text = (counterText[id] || "").trim();
    if (!text) return;
    onPropose(id, text, true);
    setCounterText(p => ({ ...p, [id]: "" }));
  };

  const getLabel = (v) => v?.approvedText || v?.proposalText || "";

  return (
    <div style={{ background:C.sandL, minHeight:"100vh", paddingBottom:90 }}>
      <div style={{ background:"linear-gradient(135deg, #6a3cbf 0%, #9c5cbf 100%)", padding:"48px 20px 24px", textAlign:"center" }}>
        <h1 style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.9rem", color:"#fff", margin:0 }}>La Burbuja 🫧</h1>
        <p style={{ color:"rgba(255,255,255,0.75)", fontSize:"0.86rem", fontWeight:600, margin:"4px 0 0" }}>El espacio seguro para negociar y acordar juntos</p>
      </div>

      {/* Intro */}
      <div style={{ margin:"14px 14px 0", background:C.white, borderRadius:18, padding:16, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:C.dark, marginBottom:8 }}>¿Cómo funciona?</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <div style={{ width:28, height:28, background:"#ede5ff", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:"0.9rem" }}>✍️</div>
            <div style={{ fontSize:"0.82rem", color:C.inkM, lineHeight:1.6 }}><b>Negociación:</b> Cualquiera propone un acuerdo con el formato "El acuerdo es…". Le llega al otro, quien puede aprobarlo o proponer un ajuste.</div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <div style={{ width:28, height:28, background:"#ede5ff", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:"0.9rem" }}>🤝</div>
            <div style={{ fontSize:"0.82rem", color:C.inkM, lineHeight:1.6 }}><b>Acuerdos:</b> Todo lo que ambos aprobaron. Su código de pareja, escrito por ustedes.</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", margin:"14px 14px 0", background:C.white, borderRadius:14, border:`1.5px solid ${C.border}`, overflow:"hidden" }}>
        {[["negociacion",`✍️ Negociación${pendingForMe.length ? ` (${pendingForMe.length})` : ""}`],["acuerdos",`🤝 Acuerdos (${approvedEntries.length})`]].map(([id,label]) => (
          <div key={id} onClick={() => setActiveTab(id)} style={{ flex:1, padding:"12px 0", textAlign:"center", fontFamily:"'Fredoka One',cursive", fontSize:"0.9rem", cursor:"pointer", background:activeTab===id ? "#6a3cbf" : "transparent", color:activeTab===id ? "#fff" : C.inkM, transition:"all 0.15s" }}>{label}</div>
        ))}
      </div>

      <div style={{ padding:"12px 14px 0" }}>

        {/* ── TAB: NEGOCIACIÓN ── */}
        {activeTab === "negociacion" && (
          <>
            {/* Nueva propuesta */}
            {!showNewForm ? (
              <button onClick={() => setShowNewForm(true)} style={{ width:"100%", background:"linear-gradient(135deg, #6a3cbf 0%, #9c5cbf 100%)", color:"#fff", border:"none", borderRadius:14, padding:"14px 0", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(100,60,180,0.3)", marginBottom:14 }}>
                + Proponer un acuerdo
              </button>
            ) : (
              <div style={{ background:C.white, borderRadius:18, padding:16, marginBottom:14, border:`1.5px solid ${C.border}`, boxShadow:`0 3px 0 ${C.border}` }}>
                <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark, marginBottom:12 }}>Nueva propuesta de acuerdo</div>
                <div style={{ background:C.sandL, borderRadius:10, padding:"10px 12px", marginBottom:10, border:`1px solid ${C.border}` }}>
                  <span style={{ fontWeight:800, color:C.olive, fontSize:"0.88rem" }}>El acuerdo es… </span>
                  <span style={{ fontSize:"0.78rem", color:C.inkL }}>(escribe el resto abajo)</span>
                </div>
                <TA value={newAgreementText} onChange={setNewAgreementText} placeholder="Ej: vernos al menos 1 vez a la semana · nunca dormir enojados · siempre avisarnos si llegamos tarde..." rows={3} style={{ marginBottom:10 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn onClick={handlePropose} style={{ flex:1, background:"#6a3cbf", color:"#fff" }}>Enviar a {partnerName} 🚀</Btn>
                  <Btn onClick={() => { setShowNewForm(false); setNewAgreementText(""); }} variant="ghost" style={{ padding:"10px 14px" }}>✕</Btn>
                </div>
              </div>
            )}

            {/* Propuestas que me esperan */}
            {pendingForMe.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.5px", marginBottom:8 }}>📬 ESPERANDO TU RESPUESTA ({pendingForMe.length})</div>
                {pendingForMe.map(([id, v]) => (
                  <div key={id} style={{ background:C.white, borderRadius:16, padding:14, marginBottom:10, border:`2px solid ${C.olive}`, boxShadow:`0 3px 0 rgba(100,70,180,0.15)` }}>
                    <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, marginBottom:6 }}>Propuesta de {partnerName}</div>
                    <div style={{ background:"#f0ebff", borderRadius:10, padding:"10px 12px", marginBottom:12, border:`1px solid ${C.border}` }}>
                      <span style={{ fontWeight:800, color:"#6a3cbf", fontSize:"0.84rem" }}>El acuerdo es… </span>
                      <span style={{ fontSize:"0.9rem", color:C.ink, fontWeight:700 }}>{getLabel(v)}</span>
                    </div>
                    <Btn onClick={() => onApprove(id)} style={{ width:"100%", background:"#6a3cbf", color:"#fff", marginBottom:8, fontSize:"0.88rem" }}>✅ Aprobar este acuerdo</Btn>
                    <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, marginBottom:6 }}>¿Quieres negociar?</div>
                    <TA value={counterText[id] || ""} onChange={v2 => setCounterText(p => ({ ...p, [id]: v2 }))} placeholder="El acuerdo es… (tu versión ajustada)" rows={2} style={{ marginBottom:8 }}/>
                    <Btn onClick={() => handleCounter(id)} variant="sand" style={{ width:"100%", fontSize:"0.84rem" }}>↔ Enviar contrapropuesta</Btn>
                  </div>
                ))}
              </div>
            )}

            {/* Propuestas enviadas por mí */}
            {pendingByMe.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, letterSpacing:"0.5px", marginBottom:8 }}>⏳ ESPERANDO A {partnerName.toUpperCase()} ({pendingByMe.length})</div>
                {pendingByMe.map(([id, v]) => (
                  <div key={id} style={{ background:C.white, borderRadius:14, padding:14, marginBottom:8, border:`1.5px solid ${C.border}`, opacity:0.85 }}>
                    <div style={{ background:C.sandL, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}` }}>
                      <span style={{ fontWeight:800, color:C.inkL, fontSize:"0.84rem" }}>El acuerdo es… </span>
                      <span style={{ fontSize:"0.88rem", color:C.inkM }}>{getLabel(v)}</span>
                    </div>
                    <div style={{ marginTop:8, fontSize:"0.72rem", color:C.inkL, fontWeight:700 }}>Enviado · esperando que {partnerName} responda...</div>
                  </div>
                ))}
              </div>
            )}

            {pendingForMe.length === 0 && pendingByMe.length === 0 && !showNewForm && (
              <div style={{ textAlign:"center", padding:"24px 0", color:C.inkL, fontSize:"0.86rem" }}>
                <div style={{ fontSize:"2rem", marginBottom:8 }}>🫧</div>
                No hay negociaciones activas.<br/>Propón el primer acuerdo arriba.
              </div>
            )}
          </>
        )}

        {/* ── TAB: ACUERDOS ── */}
        {activeTab === "acuerdos" && (
          <>
            {approvedEntries.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", color:C.inkL, fontSize:"0.86rem" }}>
                <div style={{ fontSize:"2.2rem", marginBottom:8 }}>🤝</div>
                Todavía no hay acuerdos aprobados.<br/>
                <span style={{ fontSize:"0.78rem" }}>Vayan a Negociación y cierren el primero juntos.</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.5px", marginBottom:10 }}>✅ {approvedEntries.length} ACUERDO{approvedEntries.length !== 1 ? "S" : ""} EN PIE</div>
                {approvedEntries.map(([id, v], i) => (
                  <div key={id} style={{ background:C.white, borderRadius:16, padding:16, marginBottom:10, border:`2px solid #b39ddb`, boxShadow:`0 3px 0 rgba(100,70,180,0.12)` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <div style={{ width:26, height:26, background:"#6a3cbf", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:"0.78rem", flexShrink:0 }}>{i+1}</div>
                      <div style={{ fontSize:"0.64rem", fontWeight:800, color:C.olive, letterSpacing:"0.4px" }}>ACUERDO DE {(nameA+" & "+nameB).toUpperCase()}</div>
                    </div>
                    <div style={{ background:"linear-gradient(135deg, #f0ebff 0%, #ede5ff 100%)", borderRadius:12, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                      <span style={{ fontWeight:800, color:"#6a3cbf", fontSize:"0.88rem" }}>El acuerdo es… </span>
                      <span style={{ fontSize:"0.92rem", color:C.ink, fontWeight:700, lineHeight:1.6 }}>{getLabel(v)}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

      </div>
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
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Racha de conexion diaria</div>
          <div style={{ fontSize: "0.76rem", color: C.inkL, fontWeight: 700 }}>Comuniquense con calidez cada dia para cuidar su vinculo</div>
        </div>
        <div style={{ background: todayDone ? C.mint : C.sandL, borderRadius: 999, padding: "6px 10px", fontSize: "0.68rem", fontWeight: 800, color: todayDone ? C.teal : C.inkL }}>
          {todayDone ? "Hoy completado" : "Hoy pendiente"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.cream, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 800 }}>Racha actual</div>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.45rem", color: C.dark }}>{current} dias</div>
        </div>
        <div style={{ background: C.cream, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "0.68rem", color: C.inkL, fontWeight: 800 }}>Mejor racha</div>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.45rem", color: C.dark }}>{longest} dias</div>
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
          <div style={{ width: `${streakInfo?.progressPct || 0}%`, height: "100%", background: "linear-gradient(90deg, #7ab848 0%, #4a9a8a 100%)", transition: "width 0.35s ease" }} />
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

function ConsejoDelDiaSection({ user, onEarn }) {
  const ownerKey = user?.code || user?.email || "guest";
  const earnKey = `mochi_consejo_earned_${ownerKey}`;
  const favKey = `mochi_consejos_fav_${ownerKey}`;
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [favs, setFavs] = useState(() => ls.get(favKey) || []);
  const [earnedToday, setEarnedToday] = useState(() => ls.get(earnKey) === getDateKeyLocal());
  const dayKey = getDateKeyLocal();

  useEffect(() => {
    setOffset(0);
    setEarnedToday(ls.get(earnKey) === dayKey);
  }, [dayKey, ownerKey]);

  useEffect(() => { ls.set(favKey, favs); }, [favKey, favs]);

  const dayNumber = getDayNumberLocal();
  const baseIndex = (dayNumber + hashSeed(ownerKey)) % CONSEJOS_DIARIOS.length;
  const idx = (baseIndex + offset) % CONSEJOS_DIARIOS.length;
  const consejo = CONSEJOS_DIARIOS[idx];
  const isFav = favs.includes(consejo.id);

  const fuenteColors = { TCC:"#5a7abf", DBT:"#7c5cbf", ACT:"#4a9a7a", Sistémica:"#bf7c5c", "Centrado en la persona":"#9a5cbf" };
  const fuenteColor = fuenteColors[consejo.fuente] || C.olive;

  const handleOpen = () => {
    setOpen(true);
    if (!earnedToday) {
      setEarnedToday(true);
      ls.set(earnKey, dayKey);
      onEarn?.();
    }
  };

  return (
    <div style={{ margin: "0 14px 12px" }}>
      <button onClick={handleOpen} style={{ width:"100%", background:`linear-gradient(135deg, #6a3cbf 0%, #9c5cbf 100%)`, color:"#fff", border:"none", borderRadius:16, padding:"14px 18px", fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(100,60,180,0.3)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <span>🧠 Consejo del Día</span>
        <span style={{ fontSize:"0.82rem", background:"rgba(255,255,255,0.2)", borderRadius:8, padding:"3px 10px" }}>{earnedToday ? "✓ +15 🌿" : "+15 🌿"}</span>
      </button>

      {open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(20,10,40,0.68)", zIndex:6000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) setOpen(false); }}>
          <div style={{ background:C.white, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"88vh", overflowY:"auto", border:`1.5px solid ${C.border}` }}>
            <div style={{ background:`linear-gradient(135deg, #6a3cbf 0%, #9c5cbf 100%)`, padding:"18px 18px 22px", borderRadius:"24px 24px 0 0", position:"relative" }}>
              <div style={{ width:34, height:5, background:"rgba(255,255,255,0.3)", borderRadius:50, margin:"0 auto 12px" }}/>
              <button onClick={() => setOpen(false)} style={{ position:"absolute", right:16, top:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:9, width:30, height:30, fontSize:"0.9rem", cursor:"pointer", color:"#fff" }}>✕</button>
              <div style={{ fontSize:"0.7rem", fontWeight:800, color:"rgba(255,255,255,0.7)", letterSpacing:"0.8px", marginBottom:4 }}>CONSEJO DEL DÍA · {consejo.fuente}</div>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff", lineHeight:1.3 }}>{consejo.titulo}</div>
              {earnedToday && <div style={{ marginTop:8, background:"rgba(255,255,255,0.18)", borderRadius:8, padding:"4px 10px", display:"inline-block", fontSize:"0.75rem", fontWeight:800, color:"#fff" }}>+15 bambú desbloqueado 🌿</div>}
            </div>

            <div style={{ padding:"18px 18px 32px" }}>
              <div style={{ background:`linear-gradient(135deg, #f0ebff 0%, #ede5ff 100%)`, borderRadius:16, padding:"16px 18px", marginBottom:16, border:`1.5px solid ${C.border}` }}>
                <div style={{ display:"inline-block", background:fuenteColor, color:"#fff", borderRadius:6, padding:"2px 9px", fontSize:"0.64rem", fontWeight:800, marginBottom:10 }}>{consejo.fuente}</div>
                <div style={{ fontSize:"0.96rem", color:C.ink, lineHeight:1.85, fontWeight:600 }}>{consejo.texto}</div>
              </div>

              <div style={{ background:C.sandL, borderRadius:12, padding:"12px 14px", border:`1px solid ${C.border}`, marginBottom:14 }}>
                <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, marginBottom:5, letterSpacing:"0.5px" }}>💭 PARA REFLEXIONAR HOY</div>
                <div style={{ fontSize:"0.84rem", color:C.inkM, lineHeight:1.7 }}>¿En qué situación de tu relación o de tu propio bienestar podrías aplicar esto hoy? Compártelo con tu pareja si quieres.</div>
              </div>

              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <Btn onClick={() => setOffset(v => (v + 1) % CONSEJOS_DIARIOS.length)} variant="sand" style={{ flex:1, fontSize:"0.82rem", padding:"11px 12px" }}>Ver otro 🔄</Btn>
                <Btn onClick={() => setFavs(prev => isFav ? prev.filter(id => id !== consejo.id) : [...prev, consejo.id])} variant={isFav ? "olive" : "cream"} style={{ flex:1, fontSize:"0.82rem", padding:"11px 12px" }}>{isFav ? "Guardado ✓" : "Guardar ⭐"}</Btn>
              </div>
              {favs.length > 0 && (
                <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700, textAlign:"center" }}>⭐ {favs.length} favorito{favs.length !== 1 ? "s" : ""} guardado{favs.length !== 1 ? "s" : ""}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PROFILE — Enhanced with more info fields
// ═══════════════════════════════════════════════
// DIARIO PERSONAL — técnicas ACT/DBT/CNV/TCC
// ═══════════════════════════════════════════════
const DIARIO_EJERCICIOS = [
  {
    id: "act_defusion",
    nombre: "Observador interior",
    subtitulo: "ACT · Defusión cognitiva",
    icono: "🧘",
    color: "#e0d4ff",
    descripcion: "A veces los pensamientos se sienten como hechos. Esta técnica te ayuda a dar un paso atrás y verlos como lo que son: solo pensamientos, no la realidad.",
    prompts: [
      "¿Qué pensamiento incómodo está dando vueltas en tu mente ahora mismo?",
      "Si ese pensamiento fuera una nube en el cielo, ¿cómo se vería? ¿Qué forma tiene?",
      "Imagina que lo ves pasar desde un banco en el parque. ¿Qué observas?",
      "¿Qué sientes en el cuerpo cuando estás 'dentro' de ese pensamiento?",
      "Ahora que lo observas desde afuera, ¿cambia algo? ¿Qué quieres hacer con eso?",
    ],
  },
  {
    id: "dbt_tipp",
    nombre: "Calma flash",
    subtitulo: "DBT · Regulación de emociones",
    icono: "❄️",
    color: "#d4eeff",
    descripcion: "Cuando las emociones se desbordan, tu cuerpo puede ser tu aliado. Esta técnica activa tu sistema nervioso para calmarte rápido.",
    prompts: [
      "¿Qué emoción intensa sientes en este momento? ¿Dónde la sientes en tu cuerpo?",
      "¿Qué tan fuerte está del 1 al 10?",
      "Hiciste o intentaste alguna de estas cosas: agua fría en la cara, respiración pausada (4-7-8), movimiento físico? ¿Cómo te fue?",
      "Después de calmarte un poco, ¿qué crees que desencadenó esto?",
      "¿Qué necesitas para seguir con tu día desde un lugar más tranquilo?",
    ],
  },
  {
    id: "cnv_4pasos",
    nombre: "Decirlo sin herir",
    subtitulo: "CNV · Comunicación No Violenta",
    icono: "💬",
    color: "#d4ffe4",
    descripcion: "Comunicar lo que sientes sin atacar ni guardar silencio. Cuatro pasos sencillos para decir lo que necesitas con claridad y afecto.",
    prompts: [
      "¿Qué situación específica pasó con tu pareja? Descríbela sin adjetivos ni juicios (solo los hechos).",
      "¿Qué sentiste cuando eso pasó? (no lo que 'te hicieron sentir', sino lo que sentiste tú)",
      "¿Qué necesidad tuya no se estaba cubriendo en ese momento?",
      "¿Qué le pedirías a tu pareja de forma concreta y amable?",
      "¿Cómo crees que podrías decirle esto en la próxima conversación?",
    ],
  },
  {
    id: "act_valores",
    nombre: "Brújula interna",
    subtitulo: "ACT · Clarificación de valores",
    icono: "🧭",
    color: "#fff4d4",
    descripcion: "Cuando todo se siente confuso, volver a lo que más te importa te ayuda a decidir cómo quieres actuar. Esto no es sobre lo que 'deberías' hacer, sino sobre lo que de verdad valoras.",
    prompts: [
      "¿Qué está pasando en tu relación o en ti que te generó querer reflexionar hoy?",
      "¿Qué tipo de pareja o persona quieres ser en esta relación?",
      "¿Cómo actuó la versión tuya que más admiras en situaciones difíciles?",
      "¿Qué valor (honestidad, presencia, ternura, etc.) quieres honrar esta semana?",
      "¿Qué pequeña acción concreta podrías hacer hoy que esté alineada con eso?",
    ],
  },
  {
    id: "dbt_dearman",
    nombre: "Pedir lo que necesito",
    subtitulo: "DBT · DEAR MAN",
    icono: "✋",
    color: "#ffdde4",
    descripcion: "Pedir algo importante puede dar miedo. DEAR MAN es una guía para hacerlo con firmeza y respeto, sin caer en el ataque ni en la rendición.",
    prompts: [
      "¿Qué es lo que necesitas pedir o plantear? Escríbelo en una frase.",
      "Describe la situación de forma neutral, sin interpretar intenciones.",
      "¿Cómo te sientes al respecto? ¿Por qué esto es importante para ti?",
      "¿Qué le pedirías exactamente? Escribe la petición como si se la dijeras en persona.",
      "¿Cómo podrías mantener tu postura con calma si hay resistencia? ¿Y qué estarías dispuesto/a a negociar?",
    ],
  },
  {
    id: "tcc_pensamientos",
    nombre: "Pensamientos vs. hechos",
    subtitulo: "TCC · Reestructuración cognitiva",
    icono: "🔍",
    color: "#ede5ff",
    descripcion: "No todo lo que pensamos es verdad. Esta técnica te ayuda a examinar esos pensamientos que duelen o que te frenan y ver qué tan reales son.",
    prompts: [
      "¿Qué pensamiento negativo sobre tu relación o sobre ti está apareciendo mucho?",
      "¿Cuánto crees que es verdad ese pensamiento del 0 al 100%?",
      "¿Qué evidencia tienes A FAVOR de ese pensamiento?",
      "¿Qué evidencia tienes EN CONTRA de ese pensamiento?",
      "Si una amiga te dijera esto de sí misma, ¿qué le responderías? ¿Cambia algo tu porcentaje de creencia?",
    ],
  },
];

function DiarioPersonal({ user }) {
  const [view, setView] = useState("home");
  const [entries, setEntries] = useState([]);
  const [selectedTech, setSelectedTech] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = fbListenDiario(uid, setEntries);
    return unsub;
  }, [uid]);

  const saveEntry = async () => {
    if (!uid || !selectedTech) return;
    setSaving(true);
    const entryId = Date.now().toString();
    try {
      await fbSaveDiarioEntry(uid, entryId, {
        techId: selectedTech.id,
        techNombre: selectedTech.nombre,
        techIcono: selectedTech.icono,
        answers,
        createdAt: new Date().toISOString(),
      });
      setView("home");
      setSelectedTech(null);
      setAnswers({});
    } catch (e) {
      console.error("Error saving diario entry:", e);
    }
    setSaving(false);
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
  };

  if (view === "selector") {
    return (
      <div style={{ padding: "0 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.inkM, padding: "2px 6px" }}>←</button>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>¿Qué quieres explorar?</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {DIARIO_EJERCICIOS.map(t => (
            <div key={t.id} onClick={() => { setSelectedTech(t); setAnswers({}); setView("form"); }}
              style={{ background: t.color, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "1.6rem", flexShrink: 0, marginTop: 2 }}>{t.icono}</div>
              <div>
                <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.93rem", color: C.dark }}>{t.nombre}</div>
                <div style={{ fontSize: "0.7rem", color: C.inkM, marginBottom: 3 }}>{t.subtitulo}</div>
                <div style={{ fontSize: "0.76rem", color: C.inkM, lineHeight: 1.4 }}>{t.descripcion}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "form" && selectedTech) {
    const allAnswered = selectedTech.prompts.every((_, i) => (answers[i] || "").trim().length > 0);
    return (
      <div style={{ padding: "0 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setView("selector")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.inkM, padding: "2px 6px" }}>←</button>
          <div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.95rem", color: C.dark }}>{selectedTech.icono} {selectedTech.nombre}</div>
            <div style={{ fontSize: "0.68rem", color: C.inkM }}>{selectedTech.subtitulo}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selectedTech.prompts.map((prompt, i) => (
            <div key={i}>
              <div style={{ fontSize: "0.8rem", color: C.dark, fontWeight: 700, marginBottom: 5, lineHeight: 1.4 }}>{i + 1}. {prompt}</div>
              <textarea
                value={answers[i] || ""}
                onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                placeholder="Escribe aquí con honestidad..."
                rows={3}
                style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "8px 10px", fontSize: "0.82rem", fontFamily: "inherit", color: C.ink, background: C.sandL, resize: "none", boxSizing: "border-box", outline: "none" }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={saveEntry}
          disabled={!allAnswered || saving}
          style={{ marginTop: 18, width: "100%", background: allAnswered ? C.olive : C.border, color: C.white, border: "none", borderRadius: 12, padding: "11px 0", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", cursor: allAnswered ? "pointer" : "default", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Guardando..." : "Guardar entrada"}
        </button>
      </div>
    );
  }

  if (view === "detail" && selectedEntry) {
    const tech = DIARIO_EJERCICIOS.find(t => t.id === selectedEntry.techId);
    return (
      <div style={{ padding: "0 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <button onClick={() => { setView("home"); setSelectedEntry(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.inkM, padding: "2px 6px" }}>←</button>
          <div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.95rem", color: C.dark }}>{selectedEntry.techIcono} {selectedEntry.techNombre}</div>
            <div style={{ fontSize: "0.68rem", color: C.inkM }}>{formatDate(selectedEntry.createdAt)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(tech?.prompts || []).map((prompt, i) => (
            <div key={i} style={{ background: C.sandL, borderRadius: 11, padding: "10px 12px", border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "0.72rem", color: C.inkM, fontWeight: 700, marginBottom: 4 }}>{prompt}</div>
              <div style={{ fontSize: "0.82rem", color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{selectedEntry.answers?.[i] || <span style={{ color: C.inkL, fontStyle: "italic" }}>Sin respuesta</span>}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Mi diario personal</div>
        <button onClick={() => setView("selector")}
          style={{ background: C.olive, color: C.white, border: "none", borderRadius: 20, padding: "6px 14px", fontFamily: "'Fredoka One',cursive", fontSize: "0.82rem", cursor: "pointer" }}>
          + Nueva entrada
        </button>
      </div>
      <div style={{ fontSize: "0.74rem", color: C.inkM, marginBottom: 10, lineHeight: 1.4 }}>
        Un espacio solo tuyo para explorar lo que sientes, aprender a comunicarlo y cuidarte. Nadie más puede ver esto.
      </div>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: C.inkL, fontSize: "0.82rem" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>📖</div>
          Aún no tienes entradas. Escribe tu primera hoy.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.slice(0, 10).map(e => (
            <div key={e.id} onClick={() => { setSelectedEntry(e); setView("detail"); }}
              style={{ background: C.sandL, borderRadius: 12, padding: "10px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${C.border}` }}>
              <div style={{ fontSize: "1.5rem" }}>{e.techIcono}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.85rem", color: C.dark }}>{e.techNombre}</div>
                <div style={{ fontSize: "0.68rem", color: C.inkM }}>{formatDate(e.createdAt)}</div>
              </div>
              <div style={{ color: C.inkL, fontSize: "0.9rem" }}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Perfil({ user, bamboo, garden, accessories, exDone, messages, burbuja, conoce, lessonsDone, coupleInfo, streakInfo, streakAnalytics, onUpdateStreakSettings, onSaveCoupleInfo, onSaveNames, onLogout, testScores, onRetakeTest, onDeleteAccount, gratitud, momentos, onAddGratitud, onAddMomento, onSendMessage, onConsejoEarn }) {
  const [editMode, setEditMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showLoveModal, setShowLoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalClosing, setDeleteModalClosing] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loveText, setLoveText] = useState("");
  const [quickLove, setQuickLove] = useState(null);
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [debugTapUntil, setDebugTapUntil] = useState(0);
  const [debugNotice, setDebugNotice] = useState("");
  const [manualDebugEnabled, setManualDebugEnabled] = useState(() => {
    try {
      return localStorage.getItem("mochi_debug_streak") === "1";
    } catch {
      return false;
    }
  });
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

  const totalEx = Object.values(exDone).reduce((a, b) => a + b, 0);
  const nameParts = String(user?.names || "").split("&").map(s => s.trim()).filter(Boolean);
  const nameA = nameParts[0] || "Panda A";
  const nameB = nameParts[1] || nameParts[0] || "Panda B";
  const myEmail = user?.email || "guest";
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const myMsgs = messages.filter(m => m.senderEmail === myEmail).length;
  const partnerMsgs = messages.filter(m => m.senderEmail !== myEmail);
  const latestPartnerMsg = partnerMsgs[0] || null;
  const ownerQuiz = getQuizAdviceFromConoce(conoce || {}, "owner");
  const partnerQuiz = getQuizAdviceFromConoce(conoce || {}, "partner");
  const approvedAgreements = Object.entries(burbuja || {})
    .filter(([, v]) => v?.status === "approved" && (v?.approvedText || v?.proposalText))
    .map(([id, v]) => ({
      id,
      text: v.approvedText || v.proposalText,
      question: v.question || BURBUJA_ITEM_MAP[id]?.question || "Acuerdo"
    }));
  const gardenPlacedCount = Object.values(garden || {}).filter(v => v === true).length;
  const outfitOwnedCount = Object.entries(accessories || {}).filter(([k, v]) => k.startsWith("outfit_") && (v === true || v === "owned")).length;
  const combosCount = gardenPlacedCount * outfitOwnedCount;
  const lessonsTogetherCount = Object.values(lessonsDone || {}).filter(v => v?.owner && v?.partner).length;
  const myConoceCount = Object.values(conoce || {}).filter(v => !!v?.[myRole]).length;

  const quizScaleScores = Object.entries(conoce || {}).reduce((arr, [k, v]) => {
    if (!k.startsWith("quizFortalezas-") && !k.startsWith("quizPersonalidad-")) return arr;
    const raw = Number(v?.[myRole]);
    if (!Number.isFinite(raw)) return arr;
    return [...arr, raw];
  }, []);
  const myQuiz = getQuizAdviceFromConoce(conoce || {}, myRole);
  const highQuizScore = quizScaleScores.length >= 10
    ? (quizScaleScores.reduce((s, n) => s + n, 0) / quizScaleScores.length) >= 4
    : false;

  const weeklyActivityDates = [
    ...messages.map(m => m?.time),
    ...gratitud.map(g => g?.createdAt),
    ...momentos.map(m => m?.createdAt),
  ];
  const weeklyActiveWeeks = new Set(
    weeklyActivityDates
      .map(toJsDate)
      .filter(Boolean)
      .map(d => getWeekStartUtc(d).getTime())
  ).size;
  const weeklyStreak = getWeeklyStreak(weeklyActivityDates);
  const debugByQuery = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("debug") === "1";
  const showDebugStreak = debugByQuery || manualDebugEnabled;

  const onTapLogros = () => {
    const now = Date.now();
    const withinWindow = now <= debugTapUntil;
    const nextCount = withinWindow ? debugTapCount + 1 : 1;
    setDebugTapCount(nextCount);
    setDebugTapUntil(now + 2200);

    if (nextCount >= 5) {
      const nextEnabled = !manualDebugEnabled;
      setManualDebugEnabled(nextEnabled);
      try {
        localStorage.setItem("mochi_debug_streak", nextEnabled ? "1" : "0");
      } catch {}
      setDebugTapCount(0);
      setDebugTapUntil(0);
      setDebugNotice(nextEnabled ? "Debug de racha activado" : "Debug de racha desactivado");
      setTimeout(() => setDebugNotice(""), 1800);
    }
  };
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

  const ACHS = [
    { icon: "🌳", name: "Maestro del Jardín", done: gardenPlacedCount >= 20 },
    { icon: "🧥", name: "Panda Estiloso", done: outfitOwnedCount >= 10 },
    { icon: "🎨", name: "Equipo Creativo", done: combosCount >= 5 },
    { icon: "⚡", name: "Dúo Dinámico", done: totalEx >= 15 },
    { icon: "📚", name: "Alumnos Estelares", done: lessonsTogetherCount >= 10 },
    { icon: "💞", name: "Constancia Amorosa", done: weeklyStreak >= 4 && lessonsTogetherCount >= 4 },
    { icon: "📝", name: "Poetas Digitales", done: myMsgs >= 20 },
    { icon: "🤝", name: "Equipo Comprometido", done: approvedAgreements.length >= 5 },
    { icon: "🔎", name: "Investigadores del Amor", done: myConoceCount >= 30 },
    { icon: "🏅", name: "Másters en Conexión", done: myQuiz.complete && highQuizScore },
  ];

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

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "38px 20px 28px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <CouplePandaSVG happy size={130} />
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.75rem", color: C.cream2 }}>{user?.names || "Nosotros"}</div>
        {coupleInfo.anniversary && <div style={{ color: C.gold, fontSize: "0.82rem", fontWeight: 700, marginTop: 4 }}>💑 {coupleInfo.anniversary}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 14px" }}>
        {[["Bambú 🌿", bamboo], ["Racha 🔥", streakInfo?.currentStreak ?? 0]].map(([l, v]) => (
          <div key={l} style={{ background: C.white, borderRadius: 16, padding: "14px 10px", textAlign: "center", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.7rem", color: C.dark }}>{v}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ margin:"0 14px 12px", background:C.white, borderRadius:18, padding:16, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.6px", marginBottom:10 }}>✨ INSPIRACIÓN</div>
        <button onClick={() => setShowLoveModal(true)} style={{ width:"100%", background:"#c05068", color:C.cream2, border:"none", borderRadius:12, padding:"12px 16px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)" }}>
          Manda un mensaje de amor
        </button>
        <div style={{ marginTop:12, background:C.cream, borderRadius:12, padding:12, border:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.88rem", color:C.dark, marginBottom:6 }}>💌 Último mensaje de tu pareja</div>
          {!latestPartnerMsg ? (
            <div style={{ fontSize:"0.8rem", color:C.inkL, lineHeight:1.6 }}>Aquí aparecerá el último mensajito que te enviaron. Lo que mandes desde aquí seguirá saliendo en los globos del jardín.</div>
          ) : (
            <>
              <div style={{ fontSize:"0.88rem", color:C.ink, lineHeight:1.65, fontWeight:700 }}>{latestPartnerMsg.text}</div>
              <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700, marginTop:6 }}>
                De {latestPartnerMsg.sender} · {new Date(latestPartnerMsg.time).toLocaleDateString("es", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
              </div>
            </>
          )}
        </div>
      </div>

      <ConsejoDelDiaSection user={user} onEarn={onConsejoEarn} />

            {/* ── BAÚL DE GRATITUD ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <BaulSection
          gratitud={gratitud} momentos={momentos}
          onAddGratitud={onAddGratitud} onAddMomento={onAddMomento}
          user={user}
        />
      </div>

      {/* ── DIARIO PERSONAL ── */}
      <div style={{ margin: "0 14px 16px", background: C.sandL, borderRadius: 16, padding: "14px 14px 10px", border: `1.5px solid ${C.border}` }}>
        <DiarioPersonal user={user} />
      </div>

      {/* Achievements */}
      <div onClick={onTapLogros} style={{ padding: "4px 14px 6px", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark, cursor: "pointer", userSelect: "none" }}>Logros</div>
      {debugNotice && <div style={{ padding: "0 14px 8px", fontSize: "0.72rem", color: C.inkL, fontWeight: 800 }}>{debugNotice}</div>}
      <div style={{ display: "flex", gap: 10, padding: "4px 14px 18px", overflowX: "auto" }}>
        {ACHS.map(a => <div key={a.name} style={{ background: a.done ? C.cream : C.sandL, borderRadius: 16, padding: "14px 11px", textAlign: "center", minWidth: 118, flexShrink: 0, opacity: a.done ? 1 : 0.4, boxShadow: `0 2px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "1.7rem", marginBottom: 5 }}>{a.icon}</div>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>{a.name}</div>
        </div>)}
      </div>
      {showDebugStreak && (
        <div style={{ margin: "0 14px 12px", background: "#fff8e8", border: "1.5px dashed #d4a843", borderRadius: 14, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.88rem", color: C.dark }}>Debug racha semanal</div>
            <button
              onClick={() => {
                setManualDebugEnabled(false);
                try {
                  localStorage.setItem("mochi_debug_streak", "0");
                } catch {}
                setDebugNotice("Debug de racha desactivado");
                setTimeout(() => setDebugNotice(""), 1800);
              }}
              style={{
                border: `1.5px solid ${C.border}`,
                background: C.white,
                color: C.ink,
                borderRadius: 9,
                padding: "4px 8px",
                fontSize: "0.68rem",
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              Reset debug
            </button>
          </div>
          <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6, fontWeight: 700 }}>
            weeklyStreak: {weeklyStreak} / 4 · weeksWithActivity: {weeklyActiveWeeks} · lessonsTogether: {lessonsTogetherCount}
          </div>
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
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.4rem", letterSpacing: 6, color: C.dark, background: C.cream, borderRadius: 10, padding: "8px 14px", flex: 1, textAlign: "center", border: `1.5px solid ${C.border}` }}>{user?.code || "----"}</div>
            <Btn onClick={() => { 
              const c = (user?.code || "").toUpperCase();
              if(navigator.clipboard) { navigator.clipboard.writeText(c).then(()=>alert("Código copiado: "+c)).catch(()=>alert("Tu código: "+c)); }
              else { alert("Tu código: "+c); }
            }} variant="sand" style={{ padding: "10px 14px", fontSize: "0.8rem" }}>Copiar</Btn>
          </div>
        </div>}

        {/* Test Initial Scores */}
        {testScores && (() => {
          const avgs = TEST_AREAS.map(a => { const s = testScores[a.id]||{}; return {...a, avg:((s.a||3)+(s.b||3))/2}; });
          const total = (avgs.reduce((s,a)=>s+a.avg,0)/avgs.length).toFixed(1);
          return (
            <div style={{ marginBottom:12, background:C.white, borderRadius:18, padding:18, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", color:C.dark }}>📊 Diagnóstico de pareja</div>
                <div style={{ background:C.olive, color:C.cream2, borderRadius:8, padding:"4px 12px", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem" }}>{total}/5</div>
              </div>
              {avgs.map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ fontSize:"1rem", minWidth:22 }}>{a.emoji}</div>
                  <div style={{ fontSize:"0.78rem", color:C.inkM, flex:1 }}>{a.label}</div>
                  <div style={{ display:"flex", gap:3 }}>{[1,2,3,4,5].map(i=>(
                    <div key={i} style={{ width:11, height:11, borderRadius:"50%", background:i<=Math.round(a.avg)?TEST_COLORS[Math.round(a.avg)-1]:C.sand }}/>
                  ))}</div>
                </div>
              ))}
              <Btn onClick={onRetakeTest} variant="sand" style={{ width:"100%", marginTop:10, fontSize:"0.82rem" }}>Repetir diagnóstico 🔄</Btn>
            </div>
          );
        })()}

        {/* ── CAMBIAR NOMBRE ── */}
        <div style={{ background: C.white, borderRadius: 16, padding: "16px", border: `1.5px solid ${C.border}`, marginBottom: 12, boxShadow: `0 2px 0 ${C.border}` }}>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.95rem", color: C.dark, marginBottom: 10 }}>✏️ Nombre de la pareja</div>
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
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.ink }}>
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
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.3rem", color:C.dark, marginBottom:2 }}>💌 Mensajito de amor</div>
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
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", color:"#8b2020", marginBottom:6 }}>Eliminar cuenta</div>
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
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f8f2e4; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes floatHappy { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-18px) rotate(1.5deg)} }
textarea:focus, input:focus { border-color: #4a6e30 !important; box-shadow: 0 0 0 3px rgba(74,110,48,0.15) !important; outline: none !important; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-thumb { background:#ede4cc; border-radius:50px; }
select { appearance: none; }
@keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOutOverlay { from { opacity: 1; } to { opacity: 0; } }
@keyframes popInCard { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes popOutCard { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.98); } }
`;

const OB = [
  { title: "Bienvenidos a Mochi", body: "Una app para que su amor florezca — basada en terapia real." },
  { title: "Su jardín crece con amor", body: "Completen ejercicios, envíen mensajes y respondan preguntas juntos para ganar bambú 🌿 y plantar cosas en el jardín." },
  { title: "¡Listos para empezar!", body: "Hagan su primer ejercicio y siembren la primera semilla." },
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

// ═══════════════════════════════════════════════
// DAILY LESSONS DATA
// ═══════════════════════════════════════════════
const DAILY_LESSONS = [
  { id:"love_languages", emoji:"💝", title:"Los 5 Lenguajes del Amor",
    tag:"Gary Chapman",
    intro:"Cada persona siente y expresa el amor de manera diferente. Cuando no hablas el idioma de tu pareja, el amor no llega aunque lo intentes mucho.",
    sections:[
      { title:"1. Palabras de Afirmación", icon:"💬", body:"Decir 'te amo', 'estás increíble hoy', 'gracias por existir'. Para esta persona, las palabras construyen o destruyen la relación entera." },
      { title:"2. Tiempo de Calidad", icon:"⏱", body:"Atención 100% sin teléfono, actividades juntos, conversaciones profundas. No es cantidad — es presencia real." },
      { title:"3. Regalos", icon:"🎁", body:"No es materialismo — es el simbolismo de 'pensé en ti'. Un café, una flor, un meme. El detalle importa más que el precio." },
      { title:"4. Actos de Servicio", icon:"🛠", body:"Hacer algo sin que te pidan: lavar los platos, preparar el desayuno, resolver algo que les preocupa. 'Te ayudo' es su 'te amo'." },
      { title:"5. Contacto Físico", icon:"🤝", body:"Abrazos, tomarse de la mano, un beso de buenos días. El cuerpo dice lo que las palabras no alcanzan." },
    ],
    reflect:"¿Cuál es tu lenguaje principal? ¿Y el de tu pareja? ¿Los han hablado?" },

  { id:"four_horsemen", emoji:"🌩", title:"Los 4 Jinetes del Apocalipsis",
    tag:"John Gottman",
    intro:"El Dr. Gottman puede predecir el divorcio con 90% de precisión. Estos 4 patrones son las señales de alarma más peligrosas en una relación.",
    sections:[
      { title:"1. Crítica", icon:"🗡", body:"Atacar a la persona, no al comportamiento. 'Siempre eres tan descuidado' vs 'Me molestó que no avisaras'. El antídoto: queja específica con 'yo'." },
      { title:"2. Desprecio", icon:"👀", body:"El más dañino. Burlarse, poner los ojos en blanco, sarcasmo hiriente. Comunica asco. El antídoto: construir cultura de aprecio." },
      { title:"3. Defensividad", icon:"🛡", body:"'Yo no soy el problema, tú eres el problema.' Victimizarse, contraatacar. El antídoto: asumir aunque sea el 5% de responsabilidad." },
      { title:"4. Evasión / Stonewalling", icon:"🧱", body:"Cerrarse, ignorar, apagar emocionalmente. El cuerpo entra en modo supervivencia. El antídoto: pausa de 20 min y volver con calma." },
    ],
    reflect:"¿Reconocen alguno de estos patrones en sus discusiones? ¿Cuál aparece más?" },

  { id:"repair_attempts", emoji:"🛠", title:"Cómo Reparar Después de una Pelea",
    tag:"Gottman · EFT",
    intro:"Todas las parejas pelean. La diferencia no está en no pelear — está en CÓMO reparan después. Las parejas felices aprenden a 'resetear'.",
    sections:[
      { title:"Pausa consciente", icon:"⏸", body:"Cuando sientan que el corazón va a más de 100 latidos/min, paren. No es huir — es regular el sistema nervioso. 20-30 minutos y vuelven." },
      { title:"Intento de reparación", icon:"🤍", body:"Una frase, un gesto, un toque. 'Perdón, me pasé.' 'Te escucho.' 'Hagamos una pausa.' Gottman llama a esto el gesto más importante en una relación." },
      { title:"Asumir responsabilidad", icon:"🪞", body:"Encontrar aunque sea el 10% de 'yo contribuí a esto'. No es admitir que tienes razón — es abrir la puerta." },
      { title:"Reconectarse", icon:"💞", body:"Después de resolver, reconectarse físicamente o emocionalmente. Un abrazo de 20 segundos libera oxitocina y reinicia el vínculo." },
    ],
    reflect:"¿Tienen algún ritual de reparación propio? ¿Qué funciona para ustedes?" },

  { id:"emotional_flooding", emoji:"🌊", title:"La Inundación Emocional",
    tag:"Neurociencia · Gottman",
    intro:"Cuando una pelea 'explota', no es falta de amor — es biología. El sistema nervioso se activa y el cerebro racional se apaga literalmente.",
    sections:[
      { title:"¿Qué pasa en el cuerpo?", icon:"🧠", body:"El corazón supera 100 lpm. El cortisol inunda el cerebro. La corteza prefrontal (razonamiento) se desactiva. En ese estado, no es posible escuchar bien ni hablar bien." },
      { title:"La trampa", icon:"🪤", body:"Si siguen discutiendo en ese estado, solo se hacen daño. Nada de lo que digan será procesado correctamente. Es como hablarle a una alarma de incendios." },
      { title:"La pausa como acto de amor", icon:"💛", body:"Pedir pausa NO es abandono — es responsabilidad. Digan: 'Necesito 20 minutos para calmarme y volver a hablar contigo bien.'" },
      { title:"Cómo regularse", icon:"🍃", body:"Respiración 4-7-8. Caminar. No revisar el teléfono. No seguir 'practicando argumentos' mentalmente. El objetivo es bajar la activación, no ganar." },
    ],
    reflect:"¿Saben cuándo están 'inundados'? ¿Tienen señal acordada para pedir pausa?" },

  { id:"bids_connection", emoji:"🎣", title:"Las 'Ofertas' de Conexión",
    tag:"John Gottman",
    intro:"Gottman descubrió que las parejas felices no se diferencian en ser más románticas — se diferencian en cómo responden a los pequeños momentos cotidianos.",
    sections:[
      { title:"¿Qué es una oferta?", icon:"🌱", body:"Cualquier intento de conectar: 'Mira este meme', 'Hoy fue difícil', 'Tengo hambre'. No siempre son dramáticas — son pequeñas invitaciones." },
      { title:"Girar hacia", icon:"✅", body:"Responder a la oferta: voltear, preguntar, escuchar, reír juntos. Las parejas estables giran hacia el 86% del tiempo." },
      { title:"Girar en contra", icon:"❌", body:"Criticar o atacar la oferta. 'Siempre interrumpes.' Daña el vínculo acumulativamente." },
      { title:"Girar lejos", icon:"😶", body:"Ignorar, no responder, seguir en el teléfono. El más común y el más silenciosamente dañino." },
    ],
    reflect:"¿Están girando hacia las ofertas del otro? ¿Cuándo fue la última vez que lo hicieron bien?" },

  { id:"attachment_styles", emoji:"🧩", title:"Estilos de Apego",
    tag:"Bowlby · Ainsworth",
    intro:"La forma en que aprendiste a conectar de niño con tus cuidadores programa cómo te relacionas en pareja. Entenderlo cambia todo.",
    sections:[
      { title:"Apego Seguro", icon:"🏠", body:"Cómodo con la intimidad y la independencia. Puede pedir y dar sin miedo. Se siente merecedor de amor. Resultado de haber tenido cuidadores consistentes." },
      { title:"Apego Ansioso", icon:"🌀", body:"Necesita mucha reassurance. Miedo al abandono. Lee señales donde no las hay. 'Si no responde rápido, algo está mal.' El amor se siente como urgencia." },
      { title:"Apego Evitativo", icon:"🚪", body:"Incomodo con la dependencia emocional. Se cierra cuando hay mucha cercanía. 'No necesito a nadie.' Aprendió que los otros no son confiables." },
      { title:"Apego Desorganizado", icon:"🌩", body:"Mezcla de ansioso y evitativo. Quiere conexión y le da terror al mismo tiempo. Común en personas que vivieron trauma en sus relaciones tempranas." },
    ],
    reflect:"¿Se reconocen en alguno? ¿Cómo interactúan sus estilos de apego entre sí?" },

  { id:"positive_sentiment", emoji:"☀️", title:"El Banco Emocional de la Pareja",
    tag:"Gottman",
    intro:"Gottman descubrió que para que una relación sea estable, necesita una proporción de 5:1 — 5 interacciones positivas por cada negativa.",
    sections:[
      { title:"El banco emocional", icon:"🏦", body:"Cada interacción positiva deposita. Cada negativa retira. Una pelea, una crítica, un comentario frío — todo retira. La pregunta no es 'pelean', sino '¿cuánto han depositado antes?'" },
      { title:"La proporción mágica", icon:"✨", body:"5 positivas por cada 1 negativa. No significa evitar conflictos — significa mantener el saldo positivo para que cuando llegue la tormenta, tengan reservas." },
      { title:"Cómo depositar", icon:"💰", body:"Pequeños momentos: agradecer, notar algo bonito, reír juntos, un mensaje de buenos días, recordar algo que dijeron. No tiene que ser grandioso." },
      { title:"El interés genuino", icon:"🔍", body:"Gottman llama a esto 'mapas del amor' — conocer el mundo interno de tu pareja: sus miedos, sueños, el nombre de su jefa, lo que le da ansiedad esta semana." },
    ],
    reflect:"¿Cómo está su banco emocional ahora? ¿Están depositando o retirando más?" },
  { id:"lesson8", emoji:"🌻", title:"La Regla de Oro: 5 actos al día",
  tag:"Gottman · Actos de bondad",
  intro:"John Gottman descubrió que las parejas más felices no son las que nunca pelean, sino las que tienen más interacciones positivas que negativas. La proporción mágica es 5:1.",
  sections:[
    { title:"¿Qué es la proporción 5:1?", body:"Por cada momento negativo (una crítica, un silencio frío, una discusión), las parejas que perduran tienen al menos 5 interacciones positivas. No significa evitar conflictos, sino construir un colchón de amor y buena voluntad." },
    { title:"Los niveles según Gottman", body:"0 a 5 interacciones positivas al día: zona de riesgo. 5 a 7: zona saludable. 7 a 12: parejas más unidas, su banco emocional está lleno." },
    { title:"¿Qué cuenta como interacción positiva?", body:"No hacen falta grandes gestos: un beso antes de salir, preguntar cómo estuvo el día y escuchar de verdad, un mensaje de 'te pienso', reírse juntos, decir gracias mirando a los ojos." },
    { title:"Cómo practicarlo hoy", body:"Pongan una alarma diaria llamada '5:1'. Cada vez que suene, busquen hacer una interacción positiva. No tiene que ser grandioso — los pequeños momentos son los más poderosos." },
  ],
  reflect:"¿Cuántas interacciones positivas creen que tienen al día? ¿Qué pequeño acto podrían agregar mañana?" }
];

// ═══════════════════════════════════════════════
// RELATIONSHIP TEST SCREEN
// ═══════════════════════════════════════════════
function RelTest({ user, onDone }) {
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
        <div style={{ fontFamily:"'Fredoka One',cursive", color:C.dark, fontSize:"1.2rem", marginBottom:8 }}>No pudimos cargar el test</div>
        <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, maxWidth:320 }}>Intenta salir y volver a entrar. Si sigue pasando, avísame y lo depuramos contigo paso a paso.</div>
      </div>
    );
  }

  // Results screen — both done
  const guestDone = isGuest && Object.keys(myScores).length === TEST_AREAS.length;

  if (bothDone || guestDone) {
    const ownerScores = isGuest ? myScores : (testData?.owner || {});
    const partnerScores = isGuest ? myScores : (testData?.partner || {});
    const avgs = TEST_AREAS.map(a => {
      const sA = ownerScores[a.id] || 3;
      const sB = partnerScores[a.id] || 3;
      const avg = (sA + sB) / 2;
      return { ...a, avg, sA, sB };
    });
    const total = avgs.reduce((s, a) => s + a.avg, 0) / avgs.length;

    let prognosis, progColor, progEmoji;
    if (total >= 4.2) { prognosis = "Su relación tiene bases muy sólidas. Mochi los acompañará a crecer aún más."; progColor = "#4a9a40"; progEmoji = "🌟"; }
    else if (total >= 3.2) { prognosis = "Tienen mucho amor y algunas áreas para trabajar juntos. ¡Están en el lugar correcto!"; progColor = "#7ab848"; progEmoji = "🌿"; }
    else if (total >= 2.2) { prognosis = "Su relación tiene potencial real. Las herramientas de Mochi pueden hacer una gran diferencia."; progColor = "#e8a030"; progEmoji = "🌱"; }
    else { prognosis = "Se necesita valentía para ser honestos. Mochi está aquí para acompañarlos paso a paso."; progColor = "#e86040"; progEmoji = "💪"; }

    // Build combined scores for onDone
    const combinedScores = {};
    TEST_AREAS.forEach(a => { combinedScores[a.id] = { a: ownerScores[a.id] || 3, b: partnerScores[a.id] || 3 }; });

    return (
      <div style={{ minHeight:"100vh", background:C.sandL, padding:"32px 20px 80px", fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:"3rem", marginBottom:8 }}>{progEmoji}</div>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.7rem", color:C.dark, marginBottom:6 }}>Su diagnóstico inicial</div>
          <div style={{ background:progColor, color:"white", borderRadius:50, padding:"6px 20px", display:"inline-block", fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", marginBottom:12 }}>
            {total.toFixed(1)} / 5.0
          </div>
          <div style={{ fontSize:"0.9rem", color:C.inkM, lineHeight:1.6, maxWidth:320, margin:"0 auto" }}>{prognosis}</div>
        </div>
        <div style={{ background:C.white, borderRadius:20, padding:18, marginBottom:16, border:`1.5px solid ${C.border}` }}>
          <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, letterSpacing:"0.6px", marginBottom:14 }}>RESULTADO POR ÁREA</div>
          {avgs.map(a => (
            <div key={a.id} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                <div style={{ fontWeight:800, fontSize:"0.85rem", color:C.ink }}>{a.emoji} {a.label}</div>
                <div style={{ fontSize:"0.75rem", color:C.inkL, fontWeight:700 }}>
                  Promedio: {a.avg.toFixed(1)} / 5
                </div>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ flex:1, height:8, borderRadius:50,
                    background: i <= a.avg ? TEST_COLORS[Math.round(a.avg)-1] : C.sand }}/>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:"#e8f4e8", borderRadius:16, padding:14, marginBottom:20, border:`1px solid ${C.olive}30` }}>
          <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.olive, marginBottom:6 }}>💡 ÁREAS PRIORITARIAS</div>
          {[...avgs].sort((a,b)=>a.avg-b.avg).slice(0,2).map(a => (
            <div key={a.id} style={{ fontSize:"0.84rem", color:C.inkM, marginBottom:4 }}>
              → {a.emoji} <strong>{a.label}</strong> — pueden crecer aquí con los ejercicios de Mochi
            </div>
          ))}
        </div>
        <button onClick={() => onDone(combinedScores)} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:16, fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>
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
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.5rem", color:C.dark, marginBottom:8, textAlign:"center" }}>
          ¡Ya contestaste! 🌿
        </div>
        <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, marginBottom:24, maxWidth:300 }}>
          Esperando a que <strong>{otherName}</strong> complete su parte...
        </div>
        <div style={{ background:C.white, borderRadius:18, padding:18, border:`1.5px solid ${C.border}`, width:"100%", maxWidth:340, textAlign:"center" }}>
          <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, letterSpacing:"0.6px", marginBottom:10 }}>COMPARTE ESTE CÓDIGO</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"2rem", letterSpacing:8, color:C.dark, marginBottom:10 }}>{safeCode || "----"}</div>
          <Btn onClick={() => { 
              const c = safeCode;
              if(navigator.clipboard) { navigator.clipboard.writeText(c).then(()=>alert("Código copiado: "+c)).catch(()=>alert("Tu código: "+c)); }
              else { alert("Tu código: "+c); }
            }} variant="sand" style={{ width:"100%" }}>Copiar código 📋</Btn>
        </div>
        <div style={{ fontSize:"0.75rem", color:C.inkL, marginTop:20, textAlign:"center" }}>
          La pantalla se actualizará automáticamente cuando {otherName} termine ✨
        </div>
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
        <div style={{ fontSize:"0.72rem", color:`${C.cream}88`, fontWeight:800, letterSpacing:"0.6px" }}>
          ÁREA {step+1} DE {TEST_AREAS.length} · {myName.toUpperCase()}
        </div>
      </div>

      <div style={{ flex:1, padding:"24px 20px" }}>
        <div style={{ background: isOwner ? "#fce8d8" : "#d8ece8", borderRadius:12, padding:"10px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:10, border:`1.5px solid ${isOwner ? "#e8907a40" : "#4a9a8a40"}` }}>
          <div style={{ fontSize:"1.4rem" }}>{isOwner ? "🐼" : "🐾"}</div>
          <div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark }}>Tus respuestas son privadas</div>
            <div style={{ fontSize:"0.72rem", color:C.inkL, fontWeight:700 }}>Solo verán el resultado combinado al final</div>
          </div>
        </div>

        <div style={{ fontSize:"1.8rem", textAlign:"center", marginBottom:10 }}>{area.emoji}</div>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.35rem", color:C.dark, textAlign:"center", marginBottom:6 }}>{area.label}</div>
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
            border:"none", borderRadius:14, padding:15, fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem",
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
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.5rem", color:C.cream2, marginBottom:4 }}>{open.title}</div>
          <span style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"3px 10px", fontSize:"0.72rem", fontWeight:800 }}>{open.tag}</span>
        </div>

        <div style={{ padding:"16px 16px 0" }}>
          <div style={{ background:"#e8f4e8", borderRadius:16, padding:16, marginBottom:16, border:`1px solid ${C.olive}30` }}>
            <div style={{ fontSize:"0.88rem", color:C.inkM, lineHeight:1.75, fontStyle:"italic" }}>"{open.intro}"</div>
          </div>

          {open.sections.map((s, i) => (
            <div key={i} style={{ background:C.white, borderRadius:16, padding:16, marginBottom:10, border:`1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:C.dark, marginBottom:6 }}>
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
                fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>
              ✓ Leímos esto juntos · +10 bambú 🌿
            </button>
          ) : (
            <div style={{ textAlign:"center", background:C.cream, borderRadius:14, padding:14, border:`1.5px solid ${C.border}` }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", color:C.olive, marginBottom:6 }}>✓ Ya la completaste</div>
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
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.9rem", color:C.cream2 }}>Lecciones</div>
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
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.15rem", color: todayDone ? C.ink : C.cream2 }}>{todayLesson.title}</div>
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
                  <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark }}>{lesson.title}</div>
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
  return (
    <div style={{ minHeight: "100vh", background: C.sandL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ animation: "float 3s ease-in-out infinite", marginBottom: 16 }}>
          <CouplePandaSVG size={170} happy />
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.85rem", color: C.dark, marginBottom: 8 }}>{OB[i].title}</div>
        <div style={{ color: C.inkM, lineHeight: 1.6, marginBottom: 24, fontFamily: "'Nunito',sans-serif" }}>{OB[i].body}</div>
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 24 }}>{OB.map((_, j) => <div key={j} style={{ width: j === i ? 24 : 8, height: 8, borderRadius: 50, background: j === i ? C.dark : C.sand, transition: "all 0.3s" }} />)}</div>
        {i < OB.length - 1 ? <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={onDone} style={{ background: "none", border: "none", color: C.inkL, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>Saltar</button>
          <button onClick={() => setI(i + 1)} style={{ background: C.white, border: `1.5px solid ${C.border}`, color: C.dark, borderRadius: 12, padding: "10px 22px", fontFamily: "'Fredoka One',cursive", cursor: "pointer", boxShadow: `0 3px 0 ${C.border}` }}>Siguiente →</button>
        </div> : <button onClick={onDone} style={{ width: "100%", background: C.dark, color: C.cream2, border: "none", borderRadius: 12, padding: "14px", fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>Comenzar juntos 🐼</button>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// GAMES HUB
// ════════════════════════════════════════════════════════════

function HangmanSVG({ wrong }) {
  return (
    <svg viewBox="0 0 110 130" width="110" height="130">
      <line x1="10" y1="120" x2="90" y2="120" stroke="#9e8dc2" strokeWidth="4" strokeLinecap="round"/>
      <line x1="30" y1="120" x2="30" y2="10"  stroke="#9e8dc2" strokeWidth="4" strokeLinecap="round"/>
      <line x1="30" y1="10"  x2="70" y2="10"  stroke="#9e8dc2" strokeWidth="4" strokeLinecap="round"/>
      <line x1="70" y1="10"  x2="70" y2="28"  stroke="#9e8dc2" strokeWidth="3" strokeLinecap="round"/>
      {wrong>=1 && <circle cx="70" cy="39" r="11" fill="none" stroke="#c05068" strokeWidth="3"/>}
      {wrong>=2 && <line x1="70" y1="50" x2="70" y2="82" stroke="#c05068" strokeWidth="3" strokeLinecap="round"/>}
      {wrong>=3 && <line x1="70" y1="60" x2="50" y2="74" stroke="#c05068" strokeWidth="3" strokeLinecap="round"/>}
      {wrong>=4 && <line x1="70" y1="60" x2="90" y2="74" stroke="#c05068" strokeWidth="3" strokeLinecap="round"/>}
      {wrong>=5 && <line x1="70" y1="82" x2="55" y2="100" stroke="#c05068" strokeWidth="3" strokeLinecap="round"/>}
      {wrong>=6 && <line x1="70" y1="82" x2="85" y2="100" stroke="#c05068" strokeWidth="3" strokeLinecap="round"/>}
    </svg>
  );
}

function GameQuiz({ user, onBack }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const myName = myRole === "owner" ? nameA : nameB;
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [gs, setGs] = useState(null);
  const [step, setStep] = useState(0);
  const [newQ, setNewQ] = useState("");
  useEffect(() => { if (!code) return; return fbListenGameState(code, "quiz", setGs); }, [code]);

  const customQs = gs?.customQs || [];
  const allQs = [...QUIZ_QS, ...customQs];
  const [answers, setAnswers] = useState(() => Array(allQs.length).fill(""));
  // Expand answers if questions grow
  const ensureAnswers = (len) => { if (answers.length < len) setAnswers(a => [...a, ...Array(len - a.length).fill("")]); };
  useEffect(() => { ensureAnswers(allQs.length); }, [allQs.length]);

  const phase = gs?.phase || "idle";
  const myDone = gs?.[`${myRole}Done`];
  const bothDone = gs?.ownerDone && gs?.partnerDone;

  const startPlaying = () => fbSaveGameState(code, "quiz", { phase: "playing", customQs });
  const addCustomQ = () => {
    if (!newQ.trim()) return;
    const nqs = [...customQs, newQ.trim()];
    fbSaveGameState(code, "quiz", { customQs: nqs });
    setNewQ("");
  };
  const submit = () => { if (!code) return; fbSaveGameState(code, "quiz", { [`${myRole}Answers`]: answers.slice(0, allQs.length), [`${myRole}Done`]: true }); };
  const reset = () => { fbSaveGameState(code, "quiz", { ownerDone:false, partnerDone:false, ownerAnswers:[], partnerAnswers:[], phase:"idle" }); setAnswers(Array(allQs.length).fill("")); setStep(0); };

  const hdr = { padding:"56px 18px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };
  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, overflowY:"auto", paddingBottom:40 }}>
      <div style={hdr}><button onClick={onBack} style={backBtn}>← Volver</button><div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>💭 ¿Cuánto me conoces?</div></div>
      <div style={{ padding:"0 16px" }}>
        {phase === "idle" && (
          <div style={{ background:C.white, borderRadius:20, padding:18 }}>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:C.dark, marginBottom:6 }}>Preguntas del juego</div>
            <div style={{ fontSize:"0.74rem", color:C.inkM, marginBottom:12, lineHeight:1.5 }}>Hay {QUIZ_QS.length} preguntas base. Puedes agregar las tuyas antes de empezar.</div>
            {customQs.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:"0.68rem", fontWeight:800, color:"#6a3cbf", marginBottom:6 }}>TUS PREGUNTAS ({customQs.length})</div>
                {customQs.map((q, i) => (
                  <div key={i} style={{ background:"#f0ebff", borderRadius:10, padding:"7px 10px", fontSize:"0.8rem", color:C.dark, marginBottom:5 }}>• {q}</div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input value={newQ} onChange={e=>setNewQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustomQ()} placeholder="+ Agregar tu propia pregunta..." style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"9px 12px", fontSize:"0.84rem", outline:"none", fontFamily:"inherit", color:C.ink }}/>
              <button onClick={addCustomQ} disabled={!newQ.trim()} style={{ background:"#6a3cbf", color:"#fff", border:"none", borderRadius:10, padding:"9px 14px", cursor:newQ.trim()?"pointer":"default", fontWeight:800, opacity:newQ.trim()?1:0.5 }}>+</button>
            </div>
            <button onClick={startPlaying} style={{ width:"100%", background:"#6a3cbf", color:"#fff", border:"none", borderRadius:14, padding:"13px 0", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer" }}>¡Empezar! ({allQs.length} preguntas)</button>
          </div>
        )}
        {phase === "playing" && !myDone && (
          <div style={{ background:C.white, borderRadius:20, padding:18 }}>
            <div style={{ fontSize:"0.68rem", fontWeight:800, color:C.olive, marginBottom:6, letterSpacing:"0.5px" }}>PREGUNTA {step+1} / {allQs.length}</div>
            <ProgBar value={step} max={allQs.length-1} color="#6a3cbf" height={6} style={{ marginBottom:14 }}/>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", color:C.dark, marginBottom:14, lineHeight:1.45 }}>🤔 {allQs[step]}</div>
            <div style={{ fontSize:"0.74rem", color:C.inkL, marginBottom:8 }}>¿Cómo crees que responde {partnerName}?</div>
            <TA value={answers[step]||""} onChange={v => setAnswers(p => { const a=[...p]; a[step]=v; return a; })} placeholder="Tu respuesta..." rows={2} style={{ marginBottom:12 }}/>
            <div style={{ display:"flex", gap:8 }}>
              {step > 0 && <Btn onClick={() => setStep(s=>s-1)} variant="ghost" style={{ padding:"11px 14px" }}>← Ant.</Btn>}
              {step < allQs.length-1
                ? <Btn onClick={() => setStep(s=>s+1)} style={{ flex:1 }}>Siguiente →</Btn>
                : <Btn onClick={submit} style={{ flex:1, background:"#6a3cbf", color:"#fff" }}>Enviar respuestas ✓</Btn>}
            </div>
          </div>
        )}
        {phase === "playing" && myDone && !bothDone && (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:12 }}>⏳</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.15rem", color:C.dark, marginBottom:8 }}>Esperando a {partnerName}...</div>
            <div style={{ fontSize:"0.84rem", color:C.inkM, lineHeight:1.6 }}>Ya enviaste tus respuestas. Cuando {partnerName} termine, verán los resultados juntos 💜</div>
          </div>
        )}
        {bothDone && (
          <>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.15rem", color:"#fff", marginBottom:14, textAlign:"center" }}>✨ ¡Resultados! ✨</div>
            {allQs.map((q, i) => (
              <div key={i} style={{ background:C.white, borderRadius:16, padding:14, marginBottom:10 }}>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.olive, marginBottom:8 }}>Pregunta {i+1}: {q}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ background:"#f0ebff", borderRadius:10, padding:"8px 10px" }}>
                    <div style={{ fontSize:"0.62rem", fontWeight:800, color:"#6a3cbf", marginBottom:4 }}>{myName} pensó:</div>
                    <div style={{ fontSize:"0.82rem", color:C.ink, lineHeight:1.5 }}>{gs?.[`${myRole}Answers`]?.[i] || "—"}</div>
                  </div>
                  <div style={{ background:"#ede5ff", borderRadius:10, padding:"8px 10px" }}>
                    <div style={{ fontSize:"0.62rem", fontWeight:800, color:"#9c5cbf", marginBottom:4 }}>{partnerName} pensó:</div>
                    <div style={{ fontSize:"0.82rem", color:C.ink, lineHeight:1.5 }}>{gs?.[`${partnerRole}Answers`]?.[i] || "—"}</div>
                  </div>
                </div>
              </div>
            ))}
            <Btn onClick={reset} style={{ width:"100%", background:"rgba(255,255,255,0.15)", color:"#fff", border:"1.5px solid rgba(255,255,255,0.3)", marginTop:4 }}>Jugar de nuevo 🔄</Btn>
          </>
        )}
      </div>
    </div>
  );
}

function GameAhorcado({ user, onBack }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [gs, setGs] = useState(null);
  const [wordInput, setWordInput] = useState(""); const [hintInput, setHintInput] = useState("");
  useEffect(() => { if (!code) return; return fbListenGameState(code, "ahorcado", setGs); }, [code]);
  const phase = gs?.phase || "idle";
  const isSetter = gs?.setterRole === myRole;
  const isGuesser = gs?.setterRole && gs.setterRole !== myRole;
  const isProposer = gs?.proposer === myRole;

  const proposeToSet = () => fbSaveGameState(code, "ahorcado", { phase:"proposing", proposer:myRole, word:null, hint:null, guessedLetters:[], wrongCount:0, result:null, setterRole:null });
  const word = gs?.word || ""; const guessed = gs?.guessedLetters || []; const wrong = gs?.wrongCount || 0;
  const masked = word.split("").map(l => guessed.includes(l) ? l : "_").join(" ");
  const startGame = async () => { const w = wordInput.trim().toUpperCase(); if (!w||w.length<2) return; await fbSaveGameState(code, "ahorcado", { phase:"guessing", setterRole:myRole, word:w, hint:hintInput.trim(), guessedLetters:[], wrongCount:0, result:null }); setWordInput(""); setHintInput(""); };
  const guess = async (letter) => { if (guessed.includes(letter)) return; const ng=[...guessed,letter]; const nw=(wrong)+(word.includes(letter)?0:1); const won=word.split("").every(l=>ng.includes(l)); const res=nw>=6?"lose":won?"win":null; await fbSaveGameState(code, "ahorcado", { guessedLetters:ng, wrongCount:nw, result:res, phase:res?"done":"guessing" }); };
  const reset = () => fbSaveGameState(code, "ahorcado", { phase:"idle", word:null, hint:null, guessedLetters:[], wrongCount:0, result:null, setterRole:null });
  const hdr = { padding:"56px 18px 20px", display:"flex", alignItems:"center", gap:12 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };
  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, overflowY:"auto", paddingBottom:40 }}>
      <div style={hdr}><button onClick={onBack} style={backBtn}>← Volver</button><div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>🔤 Adivina la Palabra</div></div>
      <div style={{ padding:"0 16px" }}>
        {phase==="idle" && (
          <div style={{ background:C.white, borderRadius:20, padding:24, textAlign:"center" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:12 }}>🔤</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark, marginBottom:8 }}>Adivina la Palabra</div>
            <div style={{ fontSize:"0.84rem", color:C.inkM, marginBottom:20, lineHeight:1.6 }}>Uno elige una palabra secreta, el otro la adivina letra a letra.</div>
            <button onClick={proposeToSet} style={{ width:"100%", background:"#6a3cbf", color:"#fff", border:"none", borderRadius:14, padding:"13px 0", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer" }}>Yo elijo la palabra 🤫</button>
          </div>
        )}
        {phase==="proposing" && !isProposer && (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:12 }}>⏳</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark, marginBottom:8 }}>{partnerName} está eligiendo una palabra...</div>
            <div style={{ fontSize:"0.84rem", color:C.inkM }}>Espera — no hagas trampa 👀</div>
          </div>
        )}
        {phase==="proposing" && isProposer && (
          <div style={{ background:C.white, borderRadius:20, padding:18 }}>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", color:C.dark, marginBottom:14 }}>Escoge una palabra para que {partnerName} adivine 🕵️</div>
            <input value={wordInput} onChange={e=>setWordInput(e.target.value.toUpperCase())} placeholder="LA PALABRA (solo tú la verás)" style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:12, padding:"12px 14px", fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", letterSpacing:5, outline:"none", color:C.ink, background:C.cream2, marginBottom:10, boxSizing:"border-box" }}/>
            <input value={hintInput} onChange={e=>setHintInput(e.target.value)} placeholder="Pista opcional: ej. 'Un lugar especial'" style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:12, padding:"11px 14px", outline:"none", color:C.ink, background:C.cream2, marginBottom:14, boxSizing:"border-box", fontFamily:"'Nunito',sans-serif", fontSize:"0.9rem" }}/>
            <Btn onClick={startGame} style={{ width:"100%", background:"#6a3cbf", color:"#fff" }}>Enviar a {partnerName} 🚀</Btn>
          </div>
        )}
        {phase==="guessing" && isSetter && (
          <div style={{ background:C.white, borderRadius:20, padding:24, textAlign:"center" }}>
            <div style={{ fontSize:"2rem", marginBottom:10 }}>⏳</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark, marginBottom:10 }}>¡{partnerName} está adivinando!</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.8rem", color:C.olive, letterSpacing:8, margin:"16px 0" }}>{masked}</div>
            <div style={{ fontSize:"0.82rem", color: wrong>=4?"#c05068":C.inkL, fontWeight:800 }}>Intentos fallados: {wrong}/6</div>
          </div>
        )}
        {phase==="guessing" && isGuesser && (
          <>
            <div style={{ background:C.white, borderRadius:20, padding:18, marginBottom:12, textAlign:"center" }}>
              {gs?.hint && <div style={{ background:"#f0ebff", borderRadius:10, padding:"8px 14px", display:"inline-block", fontSize:"0.84rem", fontWeight:700, color:"#6a3cbf", marginBottom:14 }}>💡 Pista: {gs.hint}</div>}
              <HangmanSVG wrong={wrong}/>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.8rem", color:C.dark, letterSpacing:10, margin:"14px 0", wordBreak:"break-all" }}>{masked}</div>
              <div style={{ fontSize:"0.78rem", fontWeight:800, color:wrong>=5?"#c05068":C.inkL }}>Intentos fallados: {wrong}/6</div>
            </div>
            <div style={{ background:C.white, borderRadius:20, padding:14 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, justifyContent:"center" }}>
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                  <button key={l} onClick={() => guess(l)} disabled={guessed.includes(l)} style={{ width:33, height:33, border:"none", borderRadius:8, cursor:guessed.includes(l)?"default":"pointer", fontFamily:"'Fredoka One',cursive", fontSize:"0.85rem", background:guessed.includes(l)?(word.includes(l)?"#6a3cbf":"#f0e8f8"):"#ede5ff", color:guessed.includes(l)?(word.includes(l)?"#fff":"#c8b8f0"):C.dark }}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {phase==="done" && (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>{gs?.result==="win"?"🎉":"😅"}</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:C.dark, marginBottom:14 }}>{gs?.result==="win"?"¡Adivinaste!":"¡Se acabaron los intentos!"}</div>
            <div style={{ background:"#f0ebff", borderRadius:14, padding:"14px 18px", marginBottom:16 }}>
              <div style={{ fontSize:"0.7rem", fontWeight:800, color:"#6a3cbf", marginBottom:6 }}>LA PALABRA ERA</div>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"2rem", color:C.dark, letterSpacing:8 }}>{word}</div>
            </div>
            <Btn onClick={reset} style={{ width:"100%", background:"#6a3cbf", color:"#fff" }}>Jugar de nuevo 🔄</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function GameWYR({ user, onBack }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [gs, setGs] = useState(null);
  useEffect(() => { if (!code) return; return fbListenGameState(code, "wyr", setGs); }, [code]);
  const qIdx = gs?.questionIndex ?? 0; const q = WYR_QS[qIdx % WYR_QS.length];
  const myChoice = gs?.[`${myRole}Choice`]; const partnerChoice = gs?.[`${partnerRole}Choice`];
  const bothAnswered = !!myChoice && !!partnerChoice; const match = myChoice === partnerChoice;
  const score = (gs?.history||[]).filter(h=>h.match).length; const total = (gs?.history||[]).length;
  const choose = (choice) => fbSaveGameState(code, "wyr", { [`${myRole}Choice`]: choice });
  const next = () => {
    const h = [...(gs?.history||[]), { q:qIdx, ownerChoice:gs?.ownerChoice, partnerChoice:gs?.partnerChoice, match:gs?.ownerChoice===gs?.partnerChoice }];
    fbSaveGameState(code, "wyr", { questionIndex:(qIdx+1)%WYR_QS.length, ownerChoice:null, partnerChoice:null, history:h.slice(-10) });
  };
  const hdr = { padding:"56px 18px 20px", display:"flex", alignItems:"center", gap:12 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };
  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, overflowY:"auto", paddingBottom:40 }}>
      <div style={hdr}>
        <button onClick={onBack} style={backBtn}>← Volver</button>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>🤔 ¿Qué preferirías?</div>
        {total > 0 && <div style={{ marginLeft:"auto", background:"rgba(255,255,255,0.2)", borderRadius:10, padding:"4px 10px", fontSize:"0.74rem", fontWeight:800, color:"#fff" }}>{score}/{total} iguales 💜</div>}
      </div>
      <div style={{ padding:"0 16px" }}>
        <div style={{ background:C.white, borderRadius:20, padding:18, marginBottom:12 }}>
          <div style={{ fontSize:"0.68rem", fontWeight:800, color:C.olive, letterSpacing:"0.5px", marginBottom:12 }}>¿QUÉ PREFERIRÍAS?</div>
          {["A","B"].map(opt => {
            const text = opt==="A" ? q.a : q.b;
            const isChosen = myChoice===opt; const partnerChose = bothAnswered && partnerChoice===opt;
            return (
              <div key={opt} onClick={() => !myChoice && choose(opt)} style={{ background:isChosen?"#6a3cbf":"#f5f0ff", border:isChosen?"none":`2px solid #c8b8f0`, borderRadius:16, padding:"16px 18px", cursor:myChoice?"default":"pointer", marginBottom:10, transition:"all 0.15s", position:"relative" }}>
                <div style={{ fontSize:"0.7rem", fontWeight:800, color:isChosen?"rgba(255,255,255,0.6)":C.olive, marginBottom:4 }}>Opción {opt}</div>
                <div style={{ fontSize:"0.96rem", fontWeight:700, color:isChosen?"#fff":C.dark, lineHeight:1.4 }}>{text}</div>
                {bothAnswered && partnerChose && <div style={{ position:"absolute", top:8, right:10, background:match?"#ffd700":"rgba(106,60,191,0.2)", borderRadius:8, padding:"2px 8px", fontSize:"0.64rem", fontWeight:800, color:match?"#5a4000":"#6a3cbf" }}>{partnerName} ✓</div>}
              </div>
            );
          })}
        </div>
        {myChoice && !bothAnswered && <div style={{ background:"rgba(255,255,255,0.1)", borderRadius:14, padding:14, textAlign:"center", color:"rgba(255,255,255,0.7)", fontSize:"0.84rem", fontWeight:700 }}>⏳ Esperando a {partnerName}...</div>}
        {bothAnswered && (
          <div style={{ background:match?"rgba(255,215,0,0.15)":"rgba(255,255,255,0.08)", borderRadius:16, padding:16, textAlign:"center", marginBottom:12 }}>
            <div style={{ fontSize:"2rem", marginBottom:6 }}>{match?"🎉":"🤷"}</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:"#fff", marginBottom:12 }}>{match?"¡Coincidieron! 💜":"¡Opciones distintas! Interesante..."}</div>
            <Btn onClick={next} style={{ background:"#6a3cbf", color:"#fff", width:"100%" }}>Siguiente pregunta →</Btn>
          </div>
        )}
        {(gs?.history||[]).length > 0 && (
          <div style={{ background:"rgba(255,255,255,0.07)", borderRadius:16, padding:14 }}>
            <div style={{ fontSize:"0.66rem", fontWeight:800, color:"rgba(255,255,255,0.45)", marginBottom:8, letterSpacing:"0.5px" }}>HISTORIAL</div>
            {[...(gs.history)].reverse().slice(0,5).map((h,i) => {
              const hq = WYR_QS[h.q % WYR_QS.length];
              return <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:5 }}>
                <div style={{ fontSize:"0.8rem" }}>{h.match?"🟣":"⚪"}</div>
                <div style={{ fontSize:"0.71rem", color:"rgba(255,255,255,0.55)", flex:1, lineHeight:1.4 }}>{h.ownerChoice==="A"?hq?.a:hq?.b} · {h.partnerChoice==="A"?hq?.a:hq?.b}</div>
              </div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GameCadena({ user, onBack }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const myName = myRole==="owner" ? nameA : nameB;
  const partnerRole = myRole==="owner" ? "partner" : "owner";
  const [gs, setGs] = useState(null);
  const [word, setWord] = useState("");
  const chainEndRef = useRef(null);
  useEffect(() => { if (!code) return; return fbListenGameState(code, "cadena", setGs); }, [code]);
  useEffect(() => { chainEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [gs?.chain?.length]);
  const chain = gs?.chain || [];
  const isMyTurn = chain.length===0 || chain[chain.length-1].role!==myRole;
  const addWord = async () => {
    const w = word.trim().toLowerCase(); if (!w) return;
    await fbSaveGameState(code, "cadena", { chain:[...chain,{word:w,role:myRole,name:myName}], active:true });
    setWord("");
  };
  const reset = () => fbSaveGameState(code, "cadena", { chain:[], active:true });
  const hdr = { padding:"56px 18px 16px", display:"flex", alignItems:"center", gap:12, flexShrink:0 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };
  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, display:"flex", flexDirection:"column" }}>
      <div style={hdr}>
        <button onClick={onBack} style={backBtn}>← Volver</button>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>🔗 Cadena de Palabras</div>
        {chain.length>0 && <div style={{ marginLeft:"auto", background:"rgba(255,255,255,0.18)", borderRadius:8, padding:"3px 10px", fontSize:"0.72rem", fontWeight:800, color:"#fff" }}>{chain.length} palabras</div>}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"4px 16px 8px" }}>
        {chain.length===0
          ? <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.45)" }}><div style={{ fontSize:"2.5rem", marginBottom:10 }}>🔗</div>{isMyTurn?"Escribe la primera palabra...":"Esperando que empiece tu pareja..."}</div>
          : <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingBottom:8, alignItems:"center" }}>
              {chain.map((item,i) => (
                <React.Fragment key={i}>
                  <div style={{ background:item.role===myRole?"#6a3cbf":"rgba(255,255,255,0.18)", borderRadius:12, padding:"8px 14px" }}>
                    <div style={{ fontSize:"0.6rem", fontWeight:800, color:item.role===myRole?"rgba(255,255,255,0.55)":"rgba(255,255,255,0.4)", marginBottom:2 }}>{item.name}</div>
                    <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:"#fff" }}>{item.word}</div>
                  </div>
                  {i < chain.length-1 && <div style={{ color:"rgba(255,255,255,0.25)", fontSize:"0.9rem" }}>→</div>}
                </React.Fragment>
              ))}
              <div ref={chainEndRef}/>
            </div>}
      </div>
      <div style={{ padding:"12px 16px 36px", background:"rgba(0,0,0,0.22)", flexShrink:0 }}>
        {isMyTurn
          ? <div style={{ display:"flex", gap:10 }}>
              <input value={word} onChange={e=>setWord(e.target.value.toLowerCase())} onKeyDown={e=>e.key==="Enter"&&addWord()} placeholder={chain.length===0?"Primera palabra...":` Relacionada con "${chain[chain.length-1]?.word}"...`} style={{ flex:1, border:"2px solid rgba(255,255,255,0.2)", borderRadius:14, padding:"13px 16px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", outline:"none", color:"#fff", background:"rgba(255,255,255,0.12)", caretColor:"#fff" }} autoComplete="off"/>
              <button onClick={addWord} style={{ background:"#6a3cbf", border:"none", borderRadius:14, padding:"0 20px", color:"#fff", fontSize:"1.4rem", cursor:"pointer" }}>→</button>
            </div>
          : <div style={{ textAlign:"center", color:"rgba(255,255,255,0.5)", fontSize:"0.84rem", padding:"10px 0" }}>⏳ Turno de tu pareja...</div>}
        {chain.length>=5 && <button onClick={reset} style={{ marginTop:10, width:"100%", background:"transparent", border:"1.5px solid rgba(255,255,255,0.18)", borderRadius:10, padding:"9px 0", color:"rgba(255,255,255,0.45)", fontSize:"0.78rem", cursor:"pointer", fontWeight:700 }}>Empezar cadena nueva 🔄</button>}
      </div>
    </div>
  );
}

function GameMemoria({ user, onBack }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const myName = myRole === "owner" ? nameA : nameB;
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [gs, setGs] = useState(null);
  useEffect(() => { if (!code) return; return fbListenGameState(code, "memoria", setGs); }, [code]);

  const cards = gs?.cards || [];
  const matched = gs?.matched || [];
  const selected = gs?.selected || [];
  const currentTurn = gs?.currentTurn || "owner";
  const scores = gs?.scores || { owner: 0, partner: 0 };
  const isMyTurn = currentTurn === myRole;
  const allDone = cards.length > 0 && matched.length === cards.length;

  const initGame = async () => {
    const all = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    await fbSaveGameState(code, "memoria", { cards: all, matched: [], selected: [], currentTurn: "owner", scores: { owner: 0, partner: 0 }, phase: "playing" });
  };

  const flipCard = async (idx) => {
    if (!isMyTurn) return;
    if (matched.includes(idx) || selected.includes(idx) || selected.length >= 2) return;
    const ns = [...selected, idx];
    if (ns.length < 2) { await fbSaveGameState(code, "memoria", { selected: ns }); return; }
    await fbSaveGameState(code, "memoria", { selected: ns });
    setTimeout(async () => {
      const [a, b] = ns;
      const hit = cards[a] === cards[b];
      const nm = hit ? [...matched, a, b] : matched;
      const sc = { ...scores, [myRole]: (scores[myRole] || 0) + (hit ? 1 : 0) };
      await fbSaveGameState(code, "memoria", { selected: [], matched: nm, scores: sc, currentTurn: hit ? myRole : partnerRole });
    }, 1300);
  };

  const hdr = { padding:"56px 18px 20px", display:"flex", alignItems:"center", gap:12 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };
  const myColor = myRole === "owner" ? "#6a3cbf" : "#e8607a";
  const partColor = myRole === "owner" ? "#e8607a" : "#6a3cbf";

  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, overflowY:"auto", paddingBottom:40 }}>
      <div style={hdr}>
        <button onClick={onBack} style={backBtn}>← Volver</button>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>🃏 Memoria</div>
        {cards.length > 0 && <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <div style={{ background:`${myColor}44`, borderRadius:10, padding:"4px 10px", fontSize:"0.74rem", fontWeight:800, color:"#fff" }}>{myName}: {scores[myRole]||0}</div>
          <div style={{ background:`${partColor}44`, borderRadius:10, padding:"4px 10px", fontSize:"0.74rem", fontWeight:800, color:"#fff" }}>{partnerName}: {scores[partnerRole]||0}</div>
        </div>}
      </div>
      <div style={{ padding:"0 16px" }}>
        {!gs || gs.phase === "idle" || cards.length === 0 ? (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>🃏</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark, marginBottom:8 }}>Memoria en pareja</div>
            <div style={{ fontSize:"0.84rem", color:C.inkM, marginBottom:20, lineHeight:1.6 }}>Voltea tarjetas de a dos. Si hacen pareja, se quedan descubiertas y sigues tú. Si no, vuelven y le toca a tu pareja. ¡El que encuentre más pares gana!</div>
            <button onClick={initGame} style={{ background:"#6a3cbf", color:"#fff", border:"none", borderRadius:14, padding:"13px 28px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer" }}>¡Jugar!</button>
          </div>
        ) : allDone ? (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:10 }}>{scores[myRole]>scores[partnerRole]?"🎉":scores[myRole]<scores[partnerRole]?"🥲":"🤝"}</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.3rem", color:C.dark, marginBottom:14 }}>
              {scores[myRole]>scores[partnerRole]? `¡${myName} ganó!` : scores[myRole]<scores[partnerRole]? `¡${partnerName} ganó!` : "¡Empate! 🐼"}
            </div>
            <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:18 }}>
              <div style={{ background:"#f0ebff", borderRadius:12, padding:"10px 18px" }}><div style={{ fontFamily:"'Fredoka One',cursive", color:"#6a3cbf" }}>{myName}</div><div style={{ fontSize:"1.8rem", fontWeight:800 }}>{scores[myRole]}</div></div>
              <div style={{ background:"#fff0f4", borderRadius:12, padding:"10px 18px" }}><div style={{ fontFamily:"'Fredoka One',cursive", color:"#e8607a" }}>{partnerName}</div><div style={{ fontSize:"1.8rem", fontWeight:800 }}>{scores[partnerRole]}</div></div>
            </div>
            <button onClick={initGame} style={{ background:"#6a3cbf", color:"#fff", border:"none", borderRadius:14, padding:"12px 26px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer" }}>Jugar de nuevo 🔄</button>
          </div>
        ) : (
          <>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:14, padding:"8px 12px", marginBottom:12, textAlign:"center", fontSize:"0.84rem", fontWeight:800, color:"#fff" }}>
              {isMyTurn ? "🎯 Tu turno — voltea dos cartas" : `⏳ Turno de ${partnerName}...`}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:6 }}>
              {cards.map((emoji, i) => {
                const isMatched = matched.includes(i);
                const isSel = selected.includes(i);
                const show = isMatched || isSel;
                return (
                  <div key={i} onClick={() => flipCard(i)} style={{ aspectRatio:"1", borderRadius:12, background: isMatched ? "#d4f0c4" : isSel ? "#f0ebff" : "#4a2c8a", border: isMatched ? "2px solid #6a9840" : isSel ? "2px solid #9a7cbf" : "2px solid #7a5caf", display:"flex", alignItems:"center", justifyContent:"center", fontSize:show?"1.6rem":"1.4rem", cursor:(!isMatched&&!isSel&&isMyTurn&&selected.length<2)?"pointer":"default", transition:"all 0.2s" }}>
                    {show ? emoji : "🟣"}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GameConecta4({ user, onBack }) {
  const ROWS = 6, COLS = 7;
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const code = user?.code;
  const { nameA, nameB } = getCoupleNames(user);
  const myName = myRole === "owner" ? nameA : nameB;
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [gs, setGs] = useState(null);
  useEffect(() => { if (!code) return; return fbListenGameState(code, "conecta4", setGs); }, [code]);

  const board = gs?.board || Array(ROWS * COLS).fill(null);
  const currentTurn = gs?.currentTurn || "owner";
  const winner = gs?.winner || null;
  const isDraw = !winner && board.every(Boolean);
  const isMyTurn = currentTurn === myRole && !winner && !isDraw;

  const initGame = () => fbSaveGameState(code, "conecta4", { board: Array(ROWS * COLS).fill(null), currentTurn: "owner", winner: null, phase: "playing" });

  const dropPiece = async (col) => {
    if (!isMyTurn) return;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) { if (!board[r * COLS + col]) { row = r; break; } }
    if (row === -1) return;
    const nb = [...board]; nb[row * COLS + col] = myRole;
    const win = checkC4Win(nb, row, col, ROWS, COLS, myRole);
    await fbSaveGameState(code, "conecta4", { board: nb, currentTurn: partnerRole, winner: win ? myRole : null, phase: win ? "done" : "playing" });
  };

  const myColor = myRole === "owner" ? "#6a3cbf" : "#e8607a";
  const partColor = myRole === "owner" ? "#e8607a" : "#6a3cbf";
  const hdr = { padding:"56px 18px 20px", display:"flex", alignItems:"center", gap:12 };
  const backBtn = { background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", cursor:"pointer", fontWeight:800, fontSize:"0.88rem" };

  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg, #2d1b4e 0%, #4a2c8a 100%)", zIndex:8000, overflowY:"auto", paddingBottom:40 }}>
      <div style={hdr}>
        <button onClick={onBack} style={backBtn}>← Volver</button>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.4rem", color:"#fff" }}>🔴 Conecta Corazones</div>
      </div>
      <div style={{ padding:"0 16px" }}>
        {!gs || !gs.board ? (
          <div style={{ background:C.white, borderRadius:20, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:"3rem", marginBottom:12 }}>🔴🟣</div>
            <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:C.dark, marginBottom:8 }}>Conecta Corazones</div>
            <div style={{ fontSize:"0.84rem", color:C.inkM, marginBottom:20, lineHeight:1.6 }}>Cada uno suelta fichas en el tablero. El primero en conectar 4 seguidas (en cualquier dirección) ¡gana! Alternan turnos automáticamente.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.84rem", fontWeight:700, color:C.inkM }}><div style={{ width:18, height:18, borderRadius:"50%", background:"#6a3cbf" }}/>{nameA}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.84rem", fontWeight:700, color:C.inkM }}><div style={{ width:18, height:18, borderRadius:"50%", background:"#e8607a" }}/>{nameB}</div>
            </div>
            <button onClick={initGame} style={{ background:"#6a3cbf", color:"#fff", border:"none", borderRadius:14, padding:"13px 28px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer" }}>¡Jugar!</button>
          </div>
        ) : (
          <>
            {(winner || isDraw) ? (
              <div style={{ background:C.white, borderRadius:16, padding:18, textAlign:"center", marginBottom:12 }}>
                <div style={{ fontSize:"2.5rem", marginBottom:8 }}>{isDraw?"🤝":winner===myRole?"🎉":"🥲"}</div>
                <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.2rem", color:C.dark, marginBottom:12 }}>
                  {isDraw ? "¡Empate!" : winner===myRole ? `¡${myName} ganó! 🎉` : `¡${partnerName} ganó!`}
                </div>
                <button onClick={initGame} style={{ background:"#6a3cbf", color:"#fff", border:"none", borderRadius:12, padding:"10px 22px", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer" }}>Revancha 🔄</button>
              </div>
            ) : (
              <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:12, padding:"8px 12px", marginBottom:10, textAlign:"center", fontSize:"0.84rem", fontWeight:800, color:"#fff" }}>
                <span style={{ color: isMyTurn ? "#f8e060" : "rgba(255,255,255,0.7)" }}>{isMyTurn ? `🎯 Tu turno (${myName})` : `⏳ Turno de ${partnerName}...`}</span>
              </div>
            )}
            <div style={{ background:"rgba(255,255,255,0.08)", borderRadius:16, padding:8 }}>
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${COLS}, 1fr)`, gap:4, marginBottom:6 }}>
                {Array(COLS).fill(0).map((_, col) => (
                  <button key={col} onClick={() => dropPiece(col)} disabled={!isMyTurn || !!winner || isDraw}
                    style={{ background:isMyTurn?"rgba(255,255,255,0.15)":"transparent", border:"none", borderRadius:8, padding:"6px 0", cursor:isMyTurn?"pointer":"default", color:"rgba(255,255,255,0.6)", fontSize:"1rem" }}>▼</button>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${COLS}, 1fr)`, gap:4 }}>
                {board.map((cell, i) => (
                  <div key={i} style={{ aspectRatio:"1", borderRadius:"50%", background: cell==="owner"?"#6a3cbf" : cell==="partner"?"#e8607a" : "rgba(255,255,255,0.1)", border:"2px solid rgba(255,255,255,0.12)", boxShadow: cell ? `0 2px 6px ${cell==="owner"?"#6a3cbf88":"#e8607a88"}` : "none", transition:"background 0.2s" }}/>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GamesHub({ user, onClose }) {
  const [activeGame, setActiveGame] = useState(null);
  const GAMES = [
    { id:"quiz",      emoji:"💭", name:"¿Cuánto me conoces?",  desc:"Respondan sobre el otro y comparen" },
    { id:"ahorcado",  emoji:"🔤", name:"Adivina la Palabra",   desc:"Uno elige, el otro adivina letra a letra" },
    { id:"wyr",       emoji:"🤔", name:"¿Qué preferirías?",    desc:"¿Coinciden en sus elecciones?" },
    { id:"cadena",    emoji:"🔗", name:"Cadena de Palabras",   desc:"Construyan una cadena asociada" },
    { id:"memoria",   emoji:"🃏", name:"Memoria",              desc:"Voltea pares de cartas por turnos" },
    { id:"conecta4",  emoji:"🔴", name:"Conecta Corazones",    desc:"Conecta 4 fichas seguidas para ganar" },
  ];
  if (activeGame==="quiz")      return <GameQuiz     user={user} onBack={() => setActiveGame(null)}/>;
  if (activeGame==="ahorcado")  return <GameAhorcado  user={user} onBack={() => setActiveGame(null)}/>;
  if (activeGame==="wyr")       return <GameWYR       user={user} onBack={() => setActiveGame(null)}/>;
  if (activeGame==="cadena")    return <GameCadena    user={user} onBack={() => setActiveGame(null)}/>;
  if (activeGame==="memoria")   return <GameMemoria   user={user} onBack={() => setActiveGame(null)}/>;
  if (activeGame==="conecta4")  return <GameConecta4  user={user} onBack={() => setActiveGame(null)}/>;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(20,10,40,0.88)", zIndex:8000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:C.white, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"88vh", overflowY:"auto" }}>
        <div style={{ background:"linear-gradient(135deg, #4a2c8a 0%, #7a4cbf 100%)", padding:"20px 18px 24px", borderRadius:"24px 24px 0 0", position:"relative" }}>
          <div style={{ width:34, height:5, background:"rgba(255,255,255,0.3)", borderRadius:50, margin:"0 auto 14px" }}/>
          <button onClick={onClose} style={{ position:"absolute", right:16, top:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:9, width:30, height:30, cursor:"pointer", color:"#fff", fontSize:"0.9rem" }}>✕</button>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.6rem", color:"#fff" }}>🎮 Juegos para dos</div>
          <div style={{ fontSize:"0.78rem", color:"rgba(255,255,255,0.65)", fontWeight:700, marginTop:4 }}>Jueguen juntos, cada quien desde su teléfono</div>
        </div>
        <div style={{ padding:"16px 16px 36px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {GAMES.map(g => (
            <div key={g.id} onClick={() => setActiveGame(g.id)} style={{ background:"linear-gradient(135deg, #f5f0ff 0%, #ede5ff 100%)", borderRadius:18, padding:"18px 14px 16px", cursor:"pointer", border:"2px solid #c8b8f0", textAlign:"center", transition:"transform 0.12s", userSelect:"none" }} onTouchStart={e=>e.currentTarget.style.transform="scale(0.95)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"} onMouseDown={e=>e.currentTarget.style.transform="scale(0.96)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
              <div style={{ fontSize:"2.2rem", marginBottom:8 }}>{g.emoji}</div>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:"#2d1b4e", marginBottom:6, lineHeight:1.3 }}>{g.name}</div>
              <div style={{ fontSize:"0.72rem", color:"#6b5a8a", lineHeight:1.5 }}>{g.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const NAV = [
  { id: "jardin", emoji: "🌿", label: "Jardín" },
  { id: "ejerc", emoji: "⭐", label: "Ejerc." },
  { id: "conocete", emoji: "💬", label: "Conócete" },
  { id: "burbuja", emoji: "🫧", label: "Burbuja" },
  { id: "perfil", emoji: "👤", label: "Nosotros" },
];

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
  const [messages, setMessages] = useState([]);
  const [conoce, setConoce] = useState({});
  const [burbuja, setBurbuja] = useState({});
  const [coupleInfo, setCoupleInfo] = useState({});
  const [notifs, setNotifs] = useState([]);
  const [pandaBubble, setPandaBubble] = useState(null); // {nameA, textA, nameB, textB}
  const [mochiHappy, setMochiHappy] = useState(false);
  const [lastVisit, setLastVisit] = useState(null);
  const [testScores, setTestScores] = useState(null);
  const [lessonsDone, setLessonsDone] = useState({});
  const [gratitud, setGratitud] = useState([]);
  const [momentos, setMomentos] = useState([]);
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
  const happyTimer = useRef(null);
  const screenRef = useRef("login");
  const streakAnalytics = useMemo(() => computeStreakAnalytics(streakInteractions), [streakInteractions]);
  const makeCode = () => "MO" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const saveKey = u => u?.email ? "mochi_prog_" + u.email : null;
  const toast = msg => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };
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
        if (s.conoce) setConoce(s.conoce);
        if (s.burbuja) setBurbuja(s.burbuja);
        if (s.coupleInfo) setCoupleInfo(s.coupleInfo);
        if (s.testScores) setTestScores(s.testScores);
        if (s.lessonsDone) setLessonsDone(s.lessonsDone);
        if (s.gratitud) setGratitud(s.gratitud);
        if (s.momentos) setMomentos(s.momentos);
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
    const hasCompletedTest = !!s?.testScores;
    if (!isNew && introFlowOpen) {
      setScreen(screenRef.current);
      return;
    }
    setScreen(isNew ? "onboarding" : (hasCompletedTest ? "main" : "reltest"));
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
          forUid: "partner",
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

  const buyItem = item => {
    try {
      if (!item?.id || typeof item?.cost !== "number") {
        toast("Este item no está disponible ahora");
        return;
      }
      const safeGarden = garden && typeof garden === "object" ? garden : {};
      const currentLoc = item.location || "garden";
      // Pond-dependent items require pond first
      const POND_DEPS = ["koi1", "koi2", "lotus_pad"];
      if (POND_DEPS.includes(item.id) && !safeGarden.pond && currentLoc === "garden") {
        toast("Necesitas el Estanque primero 🪷");
        return;
      }
      // Si el item ya está en el lugar actual, quitarlo
      if (safeGarden[item.id] === currentLoc) {
        const ng = { ...safeGarden };
        delete ng[item.id];
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        setGarden(ng);
        toast(`${item.name} quitado del ${currentLoc === "indoor" ? "cuarto" : "jardín"}`);
        save(null, { bamboo, happiness, water, garden: ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
        return;
      }
      // Si el item está en el otro lugar, moverlo
      if (safeGarden[item.id] && safeGarden[item.id] !== currentLoc) {
        const ng = { ...safeGarden, [item.id]: currentLoc };
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        setGarden(ng);
        toast(`${item.name} movido a ${currentLoc === "indoor" ? "cuarto" : "jardín"}`);
        save(null, { bamboo, happiness, water, garden: ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
        return;
      }
      // Si no está, comprarlo
      if (bamboo < item.cost) { toast("Necesitas más bambú — completa ejercicios"); return; }
      const nb = bamboo - item.cost, ng = { ...safeGarden, [item.id]: currentLoc }, nh = Math.min(100, happiness + 10);
      const nv = new Date().toISOString();
      if (user?.code && !user?.isGuest) {
        fbPurchaseGardenUpdate(user.code, item.cost, { garden: ng, accessories, water, happiness: nh })
          .then((newTotal) => {
            setBamboo(newTotal);
            setGarden(ng);
            setHappiness(nh);
            setLastVisit(nv);
            trigHappy();
            toast(`${item.name} puesto en ${currentLoc === "indoor" ? "cuarto" : "jardín"}`);
            save(null, { bamboo:newTotal, happiness:nh, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
          })
          .catch((e) => {
            if (String(e?.message || "").includes("INSUFFICIENT_BAMBOO")) {
              toast("Necesitas más bambú — completa ejercicios");
              return;
            }
            console.error("buyItem error:", e);
            toast("No se pudo comprar ese item");
          });
        return;
      }
      setBamboo(nb); setGarden(ng); setHappiness(nh); setLastVisit(nv); trigHappy();
      toast(`${item.name} puesto en ${currentLoc === "indoor" ? "cuarto" : "jardín"}`);
      save(null, { bamboo:nb, happiness:nh, water, garden:ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
    } catch (e) {
      console.error("buyItem error:", e);
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
            console.error("buyAccessory error:", e);
            toast("No se pudo comprar ese accesorio");
          });
        return;
      }
      setBamboo(nb); setAccessories(na); setHappiness(nh); setLastVisit(nv); trigHappy();
      toast(`${item.name} puesto ${item.emoji} +5 amor`);
      save(null, { bamboo:nb, happiness:nh, water, garden, accessories:na, exDone, messages, conoce, burbuja, coupleInfo, lastVisit:nv, testScores, lessonsDone, gratitud, momentos });
    } catch (e) {
      console.error("buyAccessory error:", e);
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

  const petMochiA = () => {
    trigHappy();
    const nameA = user?.names ? user.names.split("&")[0].trim() : "yo";
    const myEmail = user?.email || "guest";
    const received = [...messages].filter(m => m.senderEmail !== myEmail);
    const msg = received[0];
    const text = msg
      ? msg.text.slice(0, BUBBLE_PREVIEW_LENGTH) + (msg.text.length > BUBBLE_PREVIEW_LENGTH ? "..." : "")
      : "Aquí se verán los mensajes de amor que te manden 💌";
    setPandaBubble({ nameA: msg ? nameA : null, textA: text, textB: null, nameB: null });
    setTimeout(() => setPandaBubble(null), 5000);
    const nh = Math.min(100, happiness + 2);
    setHappiness(nh);
  };

  const petMochiB = () => {
    trigHappy();
    const nameB = user?.names ? (user.names.split("&")[1]?.trim() || "pareja") : "pareja";
    const myEmail = user?.email || "guest";
    const sent = [...messages].filter(m => m.senderEmail === myEmail);
    const msg = sent[0];
    const text = msg
      ? msg.text.slice(0, BUBBLE_PREVIEW_LENGTH) + (msg.text.length > BUBBLE_PREVIEW_LENGTH ? "..." : "")
      : "Aquí se verán los mensajes de amor que manden 💌";
    setPandaBubble({ nameB: msg ? nameB : null, textB: text, textA: null, nameA: null });
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
      fbSendNotif(user.code, { type:"leccion", msg:`${myName} leyó una lección — ¡léela tú también! 📖`, forUid:"partner", fromUid: user.uid }).catch(()=>{});
    } else {
      const nl = { ...lessonsDone, [lessonId]: { ...(lessonsDone[lessonId] || {}), [myKey]: true } };
      setLessonsDone(nl);
      const nb = bamboo + 10; setBamboo(nb); trigHappy();
      toast("Lección completada ✓ +10 bambú 🌿");
      trackDailyInteraction("exercise");
    }
  };

  const finishTest = (scores) => {
    setTestScores(scores);
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit, testScores:scores, lessonsDone, gratitud, momentos });
    setScreen("main");
  };

  const completeEx = async (ex, pts) => {
    const nd = { ...exDone, [ex.id]: (exDone[ex.id] || 0) + 1 };
    const bonus = nd[ex.id] === 3 ? 30 : 0;
    const total = pts + bonus;
    const nh = Math.min(100, happiness + 8);
    setHappiness(nh); setExDone(nd); trigHappy();
    const myName = getMyName(user, "Yo");
    if (user?.code && !user?.isGuest) {
      const nb = await fbIncrementBamboo(user.code, total).catch(() => bamboo + total);
      setBamboo(nb);
      trackDailyInteraction("exercise");
      fbSendNotif(user.code, { type:"ejercicio", msg:`${myName} completó un ejercicio — ¡complétalo tú también! 🌿`, forUid:"partner", fromUid: user.uid }).catch(()=>{});
    } else {
      setBamboo(b => b + total);
      trackDailyInteraction("exercise");
    }
    toast(bonus ? `¡Maestría! +${total} bambú 🌟` : `+${total} bambú 🌿`);
    save(null, { bamboo: bamboo + total, happiness:nh, water, garden, accessories, exDone:nd, messages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const earnConsejo = async () => {
    const nb = user?.code ? await fbIncrementBamboo(user.code, 15).catch(() => bamboo + 15) : bamboo + 15;
    setBamboo(nb); trigHappy();
    toast("+15 bambú por abrir el Consejo del Día 🌿");
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
      fbSendMessage(user.code, msg).catch(e => console.warn("Send failed:", e));
    } else {
      const key = user?.code ? "mochi_msgs_" + user.code : "mochi_msgs_guest";
      const prev = ls.get(key) || [];
      ls.set(key, [msg, ...prev]);
    }
    const nb = bamboo + 5; setBamboo(nb); trigHappy();
    toast("Mensajito enviado 💌 +5 bambú");
    trackDailyInteraction("message");
    save(null, { bamboo:nb, happiness, water, garden, accessories, exDone, messages:nextMessages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const saveConoce = async (cat, qIdx, myAnswer, _b, isNew) => {
    const key = `${cat}-${qIdx}`;
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const myName = getMyName(user, "Yo");
    if (user?.code && !user?.isGuest) {
      // Save my answer to Firebase (keyed by role)
      await fbSaveConoce(user.code, key, { [myRole]: myAnswer, updatedAt: new Date().toISOString() }).catch(() => {});
      // Check if partner already answered
      const existing = conoce[key] || {};
      const partnerRole = myRole === "owner" ? "partner" : "owner";
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
        fbSendNotif(user.code, { type:"conoce", msg:`${myName} respondió una pregunta — ¡tu turno! 🌿`, forUid:"partner", fromUid: user.uid }).catch(()=>{});
      }
    } else {
      // Local mode
      const nc = { ...conoce, [key]: { ...( conoce[key] || {}), [myRole]: myAnswer } };
      setConoce(nc);
      if (isNew) { setBamboo(b => b + 15); trigHappy(); toast("+15 bambú por conocerse más 🌿"); trackDailyInteraction("conoce"); }
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
    toast("Tu parte quedó guardada ✓");
    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
    }
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
  };

  const proposeBurbuja = async (id, text, isCounter = false) => {
    const clean = (text || "").trim();
    if (!clean) return;
    const myRole = user?.isOwner !== false ? "owner" : "partner";
    const prev = burbuja[id] || {};
    if (!prev.owner || !prev.partner) {
      toast("Primero ambos deben escribir su parte");
      return;
    }
    // Buscar la pregunta asociada
    let contextualText = clean;
    if (BURBUJA_ITEM_MAP && BURBUJA_ITEM_MAP[id] && BURBUJA_ITEM_MAP[id].question) {
      const q = BURBUJA_ITEM_MAP[id].question.toLowerCase();
      if (q.includes("prohibid")) {
        contextualText = `Está prohibido ${clean}`;
      } else if (q.includes("permitid")) {
        contextualText = `Está permitido ${clean}`;
      } else if (q.includes("necesit")) {
        contextualText = `Necesito ${clean}`;
      } else if (q.includes("quieres") || q.includes("quiero")) {
        contextualText = `Quiero ${clean}`;
      } else if (q.includes("definir") || q.includes("tipo de relación")) {
        contextualText = `Nuestra relación es ${clean}`;
      } // Puedes agregar más reglas aquí según las preguntas
    }
    const history = [...(prev.history || []), { id: Date.now(), type: isCounter ? "counter" : "proposal", by: myRole, text: contextualText, at: new Date().toISOString() }];
    const next = {
      ...prev,
      status: "pending",
      proposalText: contextualText,
      proposalBy: myRole,
      history,
      approvedText: null,
      approvedBy: null,
      approvedAt: null,
    };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);
    trigHappy();
    toast(isCounter ? "Contraoferta enviada ↔" : "Propuesta enviada ✉️");

    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type: "acuerdo",
          msg: isCounter ? `${me} envió una contraoferta de acuerdo ↔` : `${me} te envió una propuesta de acuerdo ✉️`,
          forUid: "partner",
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
    const wasApproved = prev.status === "approved";
    const history = [...(prev.history || []), { id: Date.now(), type: "approved", by: myRole, text: prev.proposalText, at: new Date().toISOString() }];
    const next = {
      ...prev,
      status: "approved",
      approvedText: prev.proposalText,
      approvedBy: myRole,
      approvedAt: new Date().toISOString(),
      history,
    };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);

    let nextBamboo = bamboo;
    if (!wasApproved) {
      if (user?.code && !user?.isGuest) {
        nextBamboo = await fbIncrementBamboo(user.code, 10).catch(() => bamboo + 10);
      } else {
        nextBamboo = bamboo + 10;
      }
      setBamboo(nextBamboo);
    }

    trigHappy();
    toast("Acuerdo aprobado ✓ +10 bambú 🌿");
    trackDailyInteraction("agreement");

    if (user?.code && !user?.isGuest) {
      await fbSaveBurbuja(user.code, id, next).catch(() => {});
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, {
          type: "acuerdo",
          msg: `${me} aprobó su acuerdo ✅`,
          forUid: "partner",
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
      if (user?.uid) fbSendNotif(user.code, { type:"gratitud", msg:`${myName} escribió algo de gratitud 💛`, forUid:"partner", fromUid: user.uid }).catch(()=>{});
    } else {
      const ng = [{ ...enriched, id: Date.now() }, ...gratitud];
      setGratitud(ng);
      setBamboo(b => b + 5);
      trackDailyInteraction("gratitude");
    }
    toast("💛 Guardado en el baúl de gratitud +5 bambú 🌿");
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
      if (user?.uid) fbSendNotif(user.code, { type:"momento", msg:`${myName} guardó un momento especial ✨`, forUid:"partner", fromUid: user.uid }).catch(()=>{});
    } else {
      const nm = [{ ...enriched, id: Date.now() }, ...momentos];
      setMomentos(nm);
      setBamboo(b => b + 5);
      trackDailyInteraction("moment");
    }
    toast("✨ Guardado en el baúl de momentos +5 bambú 🌿");
  };

  const logout = async () => {
    await fbLogout().catch(() => {});
    ls.set("mochi_last", null); setUser(null); setScreen("login");
    setBamboo(0); setHappiness(20); setWater(40); setGarden({});
    setAccessories({}); setExDone({}); setMessages([]); setConoce({}); setBurbuja({}); setCoupleInfo({});
    setGratitud([]); setMomentos([]);
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
      console.error("deleteAccount error:", e);
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
    toast("Cuenta eliminada correctamente");
    await logout();
  };

  if (screen === "login") return <><style>{STYLES}</style><Login onLogin={afterLogin}/></>;
  if (screen === "onboarding") return <><style>{STYLES}</style><Onboarding onDone={()=>setScreen("reltest")}/></>;
  const relTestFallback = (
    <div style={{ minHeight:"100vh", background:C.sandL, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px", fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ fontFamily:"'Fredoka One',cursive", color:C.dark, fontSize:"1.2rem", marginBottom:8 }}>Hubo un error en el test</div>
      <div style={{ fontSize:"0.9rem", color:C.inkM, textAlign:"center", lineHeight:1.6, maxWidth:320, marginBottom:14 }}>No te preocupes, tus datos siguen guardados. Puedes reintentar sin cerrar sesión.</div>
      <Btn onClick={() => setScreen("reltest")}>Reintentar test</Btn>
    </div>
  );

  if (screen === "reltest") return <><style>{STYLES}</style><SectionErrorBoundary fallback={relTestFallback}><RelTest user={user} onDone={finishTest}/></SectionErrorBoundary></>;
  if (user && !user?.isGuest && user?.code && !testScores) return <><style>{STYLES}</style><SectionErrorBoundary fallback={relTestFallback}><RelTest user={user} onDone={finishTest}/></SectionErrorBoundary></>;

  return (
    <div style={{ fontFamily:"'Nunito',sans-serif", maxWidth:480, margin:"0 auto", minHeight:"100vh", background:C.sandL, position:"relative" }}>
      <style>{STYLES}</style>
      <div style={{ paddingBottom:72 }}>
        {tab==="jardin" && <Jardin bamboo={bamboo} happiness={happiness} water={water} garden={garden} accessories={accessories} mochiHappy={mochiHappy} pandaBubble={pandaBubble} onPetA={petMochiA} onPetB={petMochiB} onBuy={buyItem} onWater={waterGarden} onBuyAccessory={buyAccessory} user={user}/>}
        {tab==="ejerc" && <Ejercicios exDone={exDone} onComplete={completeEx} user={user} lessonsDone={lessonsDone} onCompleteLesson={completeLesson}/>}
        {tab==="conocete" && <Conocete conoce={conoce} onSave={saveConoce} user={user}/>}
        {tab==="burbuja" && <Burbuja burbuja={burbuja} onSaveMine={saveBurbujaMine} onPropose={proposeBurbuja} onApprove={approveBurbuja} user={user}/>}
        {tab==="perfil" && <Perfil user={user} bamboo={bamboo} garden={garden} accessories={accessories} exDone={exDone} messages={messages} burbuja={burbuja} conoce={conoce} lessonsDone={lessonsDone} coupleInfo={coupleInfo} streakInfo={streakData} streakAnalytics={streakAnalytics} onUpdateStreakSettings={updateStreakSettings} onSaveCoupleInfo={saveCoupleInfo} onSaveNames={saveNames} onLogout={logout} testScores={testScores} onRetakeTest={()=>setScreen("reltest")} onDeleteAccount={deleteAccount} gratitud={gratitud} momentos={momentos} onAddGratitud={addGratitud} onAddMomento={addMomento} onSendMessage={sendMsg} onConsejoEarn={earnConsejo}/>} 
      </div>
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.white, borderTop:`1.5px solid ${C.border}`, display:"flex", zIndex:1000, boxShadow:`0 -3px 0 ${C.line}` }}>
        {NAV.map(n => {
          const active = tab === n.id;
          const notifTypes = { "ejerc":["ejercicio","leccion"], "conocete":["conoce"], "burbuja":["gratitud","momento","acuerdo"], "perfil":["racha"] };
          const nBadge = notifTypes[n.id] ? notifs.filter(x=>!x.read && x.forUid===user?.uid && notifTypes[n.id].includes(x.type)).length : 0;
          const badge = nBadge > 0 ? nBadge : null;
          return (
            <div key={n.id} onClick={()=>{
              setTab(n.id);
              // Mark related notifs as read
              notifs.filter(x=>!x.read && x.forUid===user?.uid).forEach(x=>fbMarkNotifRead(x.id).catch(()=>{}));
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
      <Toast msg={toastMsg}/>
    </div>
  );
}

// ═══════════════════════════════════════════════
// BAUL SECTION — embedded in Perfil
// ═══════════════════════════════════════════════
function BaulSection({ user, gratitud, momentos, onAddGratitud, onAddMomento }) {
  const [activeTab, setActiveTab] = useState("gratitud");
  const [showGForm, setShowGForm] = useState(false);
  const [showMForm, setShowMForm] = useState(false);
  const [showGHistory, setShowGHistory] = useState(false);
  const [showMHistory, setShowMHistory] = useState(false);
  const [gText, setGText] = useState("");
  const [mTitle, setMTitle] = useState(""); const [mText, setMText] = useState("");

  const submitG = () => { if (!gText.trim()) return; onAddGratitud({ text:gText.trim() }); setGText(""); setShowGForm(false); };
  const submitM = () => { if (!mTitle.trim()||!mText.trim()) return; onAddMomento({ title:mTitle.trim(), text:mText.trim() }); setMTitle(""); setMText(""); setShowMForm(false); };

  const last3G = [...gratitud].slice(-3).reverse();
  const last3M = [...momentos].slice(-3).reverse();

  const renderGEntry = (g, i) => (
    <div key={g.id||i} style={{ background:"#f5f0ff", borderRadius:12, padding:"10px 14px", marginBottom:8, border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.78rem", color:C.olive }}>💛 {g.authorName || g.name || "Tú"}</div>
        <div style={{ fontSize:"0.65rem", color:C.inkL, fontWeight:700 }}>{g.date}</div>
      </div>
      <div style={{ fontSize:"0.86rem", color:C.ink, lineHeight:1.6 }}>{g.text}</div>
    </div>
  );

  const renderMEntry = (m, i) => (
    <div key={m.id||i} style={{ background:"#ede5ff", borderRadius:12, padding:"10px 14px", marginBottom:8, border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.88rem", color:C.dark }}>✨ {m.title}</div>
        <div style={{ fontSize:"0.65rem", color:C.inkL, fontWeight:700 }}>{m.date}</div>
      </div>
      {m.authorName && <div style={{ fontSize:"0.68rem", color:C.olive, fontWeight:800, marginBottom:4 }}>Por {m.authorName}</div>}
      <div style={{ fontSize:"0.84rem", color:C.inkM, lineHeight:1.65 }}>{m.text}</div>
    </div>
  );

  return (
    <div style={{ background:C.white, borderRadius:20, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}`, overflow:"hidden" }}>
      <div style={{ display:"flex", background:C.sandL, borderBottom:`1.5px solid ${C.border}` }}>
        {[["gratitud","💛 Gratitud"],["momentos","✨ Momentos"]].map(([id,label]) => (
          <div key={id} onClick={() => setActiveTab(id)}
            style={{ flex:1, padding:"11px 0", textAlign:"center", fontFamily:"'Fredoka One',cursive", fontSize:"0.88rem", cursor:"pointer",
              background: activeTab===id ? C.white : "transparent", color: activeTab===id ? C.dark : C.inkL,
              borderBottom: activeTab===id ? `2.5px solid ${C.olive}` : "2.5px solid transparent", transition:"all 0.15s" }}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ padding:16 }}>
        {activeTab === "gratitud" && (
          <>
            {!showGForm
              ? <button onClick={() => setShowGForm(true)} style={{ width:"100%", background:C.olive, color:"#fff", border:"none", borderRadius:12, padding:"11px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(100,70,180,0.25)", marginBottom:12 }}>+ Anotar acto de bondad</button>
              : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
                  <TA value={gText} onChange={setGText} placeholder="¿Qué le agradeces a tu pareja hoy?" rows={2} style={{ marginBottom:10 }}/>
                  <div style={{ display:"flex", gap:8 }}><Btn onClick={submitG} style={{ flex:1 }}>Guardar 💛</Btn><Btn onClick={() => { setShowGForm(false); setGText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
                </div>}
            {gratitud.length === 0
              ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>💛 Todavía no hay entradas</div>
              : last3G.map(renderGEntry)}
            {gratitud.length > 3 && (
              <button onClick={() => setShowGHistory(true)} style={{ width:"100%", background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"9px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.82rem", color:C.olive, cursor:"pointer", marginTop:4 }}>
                Ver historia ({gratitud.length} entradas) →
              </button>
            )}
          </>
        )}

        {activeTab === "momentos" && (
          <>
            {!showMForm
              ? <button onClick={() => setShowMForm(true)} style={{ width:"100%", background:C.olive, color:"#fff", border:"none", borderRadius:12, padding:"11px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(100,70,180,0.25)", marginBottom:12 }}>+ Guardar un momento</button>
              : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
                  <input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Título del momento" style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:10, padding:"9px 12px", fontFamily:"'Nunito',sans-serif", fontSize:"0.88rem", outline:"none", color:C.ink, background:C.cream2, marginBottom:8, boxSizing:"border-box" }}/>
                  <TA value={mText} onChange={setMText} placeholder="¿Qué pasó? ¿Cómo se sintieron?" rows={3} style={{ marginBottom:10 }}/>
                  <div style={{ display:"flex", gap:8 }}><Btn onClick={submitM} style={{ flex:1 }}>Guardar ✨</Btn><Btn onClick={() => { setShowMForm(false); setMTitle(""); setMText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
                </div>}
            {momentos.length === 0
              ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>✨ Todavía no hay momentos guardados</div>
              : last3M.map(renderMEntry)}
            {momentos.length > 3 && (
              <button onClick={() => setShowMHistory(true)} style={{ width:"100%", background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"9px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.82rem", color:C.olive, cursor:"pointer", marginTop:4 }}>
                Ver historia ({momentos.length} momentos) →
              </button>
            )}
          </>
        )}
      </div>

      {/* Historia Gratitud Modal */}
      {showGHistory && (
        <div style={{ position:"fixed", inset:0, background:"rgba(20,10,40,0.68)", zIndex:7000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) setShowGHistory(false); }}>
          <div style={{ background:C.white, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"88vh", overflowY:"auto" }}>
            <div style={{ background:C.olive, padding:"16px 18px 20px", borderRadius:"24px 24px 0 0", position:"relative" }}>
              <div style={{ width:34, height:5, background:"rgba(255,255,255,0.3)", borderRadius:50, margin:"0 auto 12px" }}/>
              <button onClick={() => setShowGHistory(false)} style={{ position:"absolute", right:16, top:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:9, width:30, height:30, cursor:"pointer", color:"#fff" }}>✕</button>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.3rem", color:"#fff" }}>💛 Historia de Gratitud</div>
              <div style={{ fontSize:"0.74rem", color:"rgba(255,255,255,0.7)", fontWeight:700, marginTop:4 }}>{gratitud.length} entradas en total</div>
            </div>
            <div style={{ padding:"16px 18px 32px" }}>
              {[...gratitud].reverse().map(renderGEntry)}
            </div>
          </div>
        </div>
      )}

      {/* Historia Momentos Modal */}
      {showMHistory && (
        <div style={{ position:"fixed", inset:0, background:"rgba(20,10,40,0.68)", zIndex:7000, display:"flex", alignItems:"flex-end" }} onClick={e => { if(e.target===e.currentTarget) setShowMHistory(false); }}>
          <div style={{ background:C.white, borderRadius:"24px 24px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"88vh", overflowY:"auto" }}>
            <div style={{ background:"#6a3cbf", padding:"16px 18px 20px", borderRadius:"24px 24px 0 0", position:"relative" }}>
              <div style={{ width:34, height:5, background:"rgba(255,255,255,0.3)", borderRadius:50, margin:"0 auto 12px" }}/>
              <button onClick={() => setShowMHistory(false)} style={{ position:"absolute", right:16, top:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:9, width:30, height:30, cursor:"pointer", color:"#fff" }}>✕</button>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.3rem", color:"#fff" }}>✨ Historia de Momentos</div>
              <div style={{ fontSize:"0.74rem", color:"rgba(255,255,255,0.7)", fontWeight:700, marginTop:4 }}>{momentos.length} momentos en total</div>
            </div>
            <div style={{ padding:"16px 18px 32px" }}>
              {[...momentos].reverse().map(renderMEntry)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════
// BAÚL — Gratitud + Momentos
// ═══════════════════════════════════════════════
function Baul({ user, gratitud, momentos, onAddGratitud, onAddMomento }) {
  const nameA = user?.names ? user.names.split("&")[0].trim() : "Panda A";
  const nameB = user?.names ? user.names.split("&")[1]?.trim() || "Panda B" : "Panda B";
  const [activeTab, setActiveTab] = useState("gratitud");
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [who, setWho] = useState("A");
  const [momentoTitle, setMomentoTitle] = useState("");
  const [momentoText, setMomentoText] = useState("");
  const [showMomentoForm, setShowMomentoForm] = useState(false);

  const submitGratitud = () => {
    if (!text.trim()) return;
    onAddGratitud({ text: text.trim(), who, name: who === "A" ? nameA : nameB });
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
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.9rem", color:C.cream2, marginBottom:4 }}>Baúl 💝</div>
        <div style={{ color:`${C.cream}88`, fontSize:"0.84rem", fontWeight:600, marginBottom:14 }}>Gratitud y momentos hermosos</div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4 }}>
          {[["gratitud","💛 Gratitud"],["momentos","✨ Momentos"]].map(([id,label]) => (
            <div key={id} onClick={() => setActiveTab(id)}
              style={{ flex:1, padding:"10px 0", textAlign:"center", fontFamily:"'Fredoka One',cursive",
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
                💡 Anota algo lindo que tu pareja hizo hoy por ti. Ambos pueden verlo y agregar entradas.
              </div>
            </div>

            {/* Add button */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:14,
                  fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)", marginBottom:14 }}>
                + Añadir acto de bondad
              </button>
            ) : (
              <div style={{ background:C.white, borderRadius:18, padding:16, marginBottom:14, border:`1.5px solid ${C.border}`, boxShadow:`0 3px 0 ${C.border}` }}>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:10, letterSpacing:"0.6px" }}>¿QUIÉN LO HIZO?</div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  {[["A", nameA, "🐼"], ["B", nameB, "🐾"]].map(([w, name, emoji]) => (
                    <div key={w} onClick={() => setWho(w)}
                      style={{ flex:1, padding:"10px 0", textAlign:"center", borderRadius:12, cursor:"pointer",
                        background: who===w ? C.dark : C.sandL,
                        color: who===w ? C.cream2 : C.inkM,
                        border: `1.5px solid ${who===w ? C.dark : C.border}`,
                        fontFamily:"'Fredoka One',cursive", fontSize:"0.9rem",
                        boxShadow: who===w ? "0 3px 0 rgba(0,0,0,0.2)" : `0 2px 0 ${C.border}` }}>
                      {emoji} {name}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:"0.72rem", fontWeight:800, color:C.inkL, marginBottom:6, letterSpacing:"0.6px" }}>¿QUÉ HIZO?</div>
                <TA value={text} onChange={setText} placeholder={`Ej: Me preparó el desayuno sin que se lo pidiera...`} rows={3} style={{ marginBottom:12 }}/>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn onClick={submitGratitud} style={{ flex:1 }}>Guardar 💛</Btn>
                  <Btn onClick={() => { setShowForm(false); setText(""); }} variant="ghost" style={{ padding:"12px 14px" }}>✕</Btn>
                </div>
              </div>
            )}

            {/* Gratitud entries */}
            {gratitud.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.inkL }}>
                <div style={{ fontSize:"2.5rem", marginBottom:8 }}>💛</div>
                <div style={{ fontFamily:"'Fredoka One',cursive", color:C.inkM }}>Todavía no hay entradas</div>
                <div style={{ fontSize:"0.82rem", marginTop:6 }}>Empieza anotando algo lindo que hizo tu pareja hoy</div>
              </div>
            ) : gratitud.map((g, i) => (
              <div key={g.id || i} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
                border:`1.5px solid ${C.border}`, boxShadow:`0 2px 0 ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ background:"#fff0d0", borderRadius:8, padding:"3px 10px",
                    fontFamily:"'Fredoka One',cursive", fontSize:"0.82rem", color:C.dark }}>
                    🐼 {g.authorName || g.name || "Tú"}
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
            <div style={{ background:"#f0e8ff", borderRadius:16, padding:14, marginBottom:14, border:`1.5px solid #c8a8f8` }}>
              <div style={{ fontSize:"0.84rem", color:"#6840a0", lineHeight:1.6 }}>
                ✨ Guarden aquí los momentos que no quieren olvidar. Su historia de pareja, escrita por ustedes.
              </div>
            </div>

            {!showMomentoForm ? (
              <button onClick={() => setShowMomentoForm(true)}
                style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:14, padding:14,
                  fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)", marginBottom:14 }}>
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
                <div style={{ fontFamily:"'Fredoka One',cursive", color:C.inkM }}>Todavía no hay momentos</div>
                <div style={{ fontSize:"0.82rem", marginTop:6 }}>Guarden aquí sus recuerdos más lindos</div>
              </div>
            ) : momentos.map((m, i) => (
              <div key={m.id || i} style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10,
                border:`1.5px solid #c8a8f8`, boxShadow:`0 2px 0 #e8d8ff` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:C.dark, flex:1 }}>✨ {m.title}</div>
                  <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:700, marginLeft:8, whiteSpace:"nowrap" }}>{m.date}</div>
                </div>
                <div style={{ fontSize:"0.88rem", color:C.inkM, lineHeight:1.7 }}>{m.text}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
