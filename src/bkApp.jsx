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
  fbSendNotif, fbListenNotifs, fbMarkNotifRead,
  fbSaveStreakInteraction, fbListenStreakInteractions,
  fbSaveStreakProfile, fbListenStreakProfile,
} from "./firebase";
import Cuestionarios, { getQuizAdviceFromConoce } from "./Cuestionarios";

// Prevents the fbOnAuthChange listener from calling afterLogin while doReg/doJoin
// is actively handling a fresh registration (avoids race conditions on new sign-ups).
let _pendingLocalAuth = false;

const C = {
  cream:"#efe6ff", cream2:"#f8f3ff", dark:"#3f2f63",
  olive:"#6f56b8", oliveL:"#9a7cff", gold:"#c7a35a",
  salmon:"#d88ec8", sky:"#a89de8", sand:"#dfd0ff", sandL:"#f3ecff",
  white:"#ffffff", ink:"#32264a", inkM:"#5f4d7f", inkL:"#8e7aad",
  border:"rgba(63,47,99,0.16)", line:"rgba(63,47,99,0.09)",
  pink:"#efb7e8", rose:"#d26ab3",
  mint:"#d6c9ff", teal:"#7761be",
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
  { id: 1, texto: "TCC (Aaron Beck): identifiquen el pensamiento automático en discusión (ej. 'no le importo') y sométanlo a evidencia. Reescriban juntos una cognición más equilibrada: 'sí le importo, hoy ambos estamos cansados'. Esta reestructuración cognitiva reduce personalización y catastrofismo." },
  { id: 2, texto: "DBT (Marsha Linehan): usen la habilidad STOP antes de responder: S = Stop, T = Take a step back, O = Observe, P = Proceed mindfully. Pausen 90 segundos, nombren emoción + intensidad (0-10) y retomen con tono bajo. Esto previene escaladas impulsivas." },
  { id: 3, texto: "ACT (Steven Hayes): cuando aparezca una historia mental rígida ('siempre hacemos lo mismo'), practiquen defusión verbal: 'estoy teniendo el pensamiento de que...'. Al separarse del pensamiento, recuperan flexibilidad psicológica para elegir conductas valiosas." },
  { id: 4, texto: "Terapia de esquemas (Jeffrey Young): detecten si se activó un modo vulnerable (abandono, crítica, exigencia). En vez de contraatacar, ofrezcan 'reparentalización limitada': validación + seguridad + límite claro. Ejemplo: 'entiendo que te dolió, y quiero resolverlo contigo'." },
  { id: 5, texto: "Gottman: apliquen reparación temprana en los primeros 3 minutos del conflicto. Usen una frase de desescalada ('estamos en el mismo equipo') y cambien de acusación a necesidad concreta. La calidad del inicio predice la calidad del cierre." },
  { id: 6, texto: "ACT orientada a valores: definan hoy un valor relacional central (cuidado, honestidad, lealtad, ternura) y conviértanlo en una micro-acción observable de 5 minutos. En tercera generación, actuar por valores pesa más que 'ganar' la discusión." },
  { id: 7, texto: "TCC conductual: hagan una 'prueba de realidad' sobre intenciones. Antes de concluir, formulen 2 hipótesis alternativas no hostiles y pregunten con curiosidad. Esto reduce sesgo de confirmación y lectura mental negativa en pareja." },
  { id: 8, texto: "DBT regulación emocional: si la activación está alta, practiquen TIPP breve (temperatura fría en rostro, respiración diafragmática, relajar músculos). Luego usen DEAR MAN para pedir algo sin atacar: Describe, Express, Assert, Reinforce, Mindful, Appear confident, Negotiate." },
  { id: 9, texto: "Compasión focalizada (CFT, Paul Gilbert): distingan sistema de amenaza vs sistema de calma. Hablen desde voz compasiva, más lenta y cálida, y validen primero la emoción del otro. Bajar amenaza fisiológica abre cooperación real." },
  { id: 10, texto: "EFT de pareja (Sue Johnson): detrás de la protesta suele haber necesidad de apego. Reformulen el conflicto en clave de vínculo: 'cuando te alejas me siento sola/o y necesito cercanía'. Vulnerabilidad segura genera respuestas más amorosas que la crítica." },
];

function CouplePandaSVG({ happy = false, size = 160 }) {
  const s = size;
  return (
    <svg viewBox="0 0 260 220" width={s} height={s * 0.846} style={{ display: "block" }}>
      <defs>
        <radialGradient id="bodyL" cx="45%" cy="35%" r="60%"><stop offset="0%" stopColor="#fdf9f0"/><stop offset="100%" stopColor="#ede4d0"/></radialGradient>
        <radialGradient id="bodyR" cx="55%" cy="35%" r="60%"><stop offset="0%" stopColor="#fdf9f0"/><stop offset="100%" stopColor="#ede4d0"/></radialGradient>
        <radialGradient id="patchL" cx="40%" cy="30%" r="65%"><stop offset="0%" stopColor="#2d3d2d"/><stop offset="100%" stopColor="#1a261a"/></radialGradient>
        <radialGradient id="patchR" cx="60%" cy="30%" r="65%"><stop offset="0%" stopColor="#2d3d2d"/><stop offset="100%" stopColor="#1a261a"/></radialGradient>
        <radialGradient id="tummy" cx="50%" cy="40%" r="55%"><stop offset="0%" stopColor="#fefcf6"/><stop offset="100%" stopColor="#f5eede"/></radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1a261a" floodOpacity="0.12"/></filter>
        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f8d0e8" floodOpacity="0.6"/></filter>
      </defs>

      <ellipse cx="82" cy="208" rx="42" ry="7" fill="#1a261a" opacity="0.08"/>
      <path d="M52 205 C35 205 28 185 30 165 C32 145 42 132 62 128 C72 126 82 126 92 128 C112 132 122 145 122 165 C124 185 117 205 100 205 Z" fill="url(#bodyL)" filter="url(#softShadow)"/>
      <ellipse cx="76" cy="168" rx="18" ry="22" fill="url(#tummy)" opacity="0.9"/>
      <path d="M116 150 C128 142 142 140 150 145 C155 148 152 158 145 158 C138 158 130 155 120 158" fill="none" stroke="#1a261a" strokeWidth="16" strokeLinecap="round"/>
      <path d="M116 150 C128 142 142 140 150 145 C155 148 152 158 145 158" fill="none" stroke="#2d3d2d" strokeWidth="13" strokeLinecap="round"/>
      <path d="M38 158 C28 165 24 178 28 188" fill="none" stroke="#1a261a" strokeWidth="15" strokeLinecap="round"/>
      <path d="M38 158 C28 165 24 178 28 188" fill="none" stroke="#2d3d2d" strokeWidth="12" strokeLinecap="round"/>
      <ellipse cx="57" cy="198" rx="20" ry="12" fill="#1a261a"/>
      <ellipse cx="57" cy="196" rx="17" ry="10" fill="#2d3d2d"/>
      <ellipse cx="98" cy="198" rx="20" ry="12" fill="#1a261a"/>
      <ellipse cx="98" cy="196" rx="17" ry="10" fill="#2d3d2d"/>
      <ellipse cx="57" cy="205" rx="11" ry="6" fill="#f0e8d8" opacity="0.6"/>
      <ellipse cx="98" cy="205" rx="11" ry="6" fill="#f0e8d8" opacity="0.6"/>

      <g transform="rotate(6, 76, 95)">
        <ellipse cx="76" cy="88" rx="44" ry="42" fill="url(#bodyL)" filter="url(#softShadow)"/>
        <circle cx="42" cy="54" r="16" fill="#1a261a"/>
        <circle cx="42" cy="54" r="10" fill="#2d3d2d"/>
        <circle cx="110" cy="54" r="16" fill="#1a261a"/>
        <circle cx="110" cy="54" r="10" fill="#2d3d2d"/>
        <circle cx="42" cy="54" r="6" fill="#d87888" opacity="0.25"/>
        <circle cx="110" cy="54" r="6" fill="#d87888" opacity="0.25"/>
        <ellipse cx="60" cy="85" rx="13" ry="11" fill="url(#patchL)" transform="rotate(-10 60 85)"/>
        <ellipse cx="92" cy="85" rx="13" ry="11" fill="url(#patchR)" transform="rotate(10 92 85)"/>
        {happy ? <><path d="M53 85 Q60 92 67 85" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/><path d="M85 85 Q92 92 99 85" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/></> : <><ellipse cx="60" cy="86" rx="7" ry="6" fill="#fdf9f0"/><ellipse cx="92" cy="86" rx="7" ry="6" fill="#fdf9f0"/><ellipse cx="61" cy="87" rx="4.5" ry="4" fill="#1a1a2a"/><ellipse cx="93" cy="87" rx="4.5" ry="4" fill="#1a1a2a"/><circle cx="63" cy="85" r="1.6" fill="white"/><circle cx="95" cy="85" r="1.6" fill="white"/></>}
        <ellipse cx="76" cy="97" rx="4" ry="2.8" fill="#1a261a" opacity="0.7"/>
        {happy ? <path d="M68 104 Q72 110 76 106 Q80 110 84 104" fill="none" stroke="#1a261a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M70 103 Q73 107 76 104 Q79 107 82 103" fill="none" stroke="#1a261a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
        <ellipse cx="44" cy="98" rx="10" ry="6" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>
        <ellipse cx="108" cy="98" rx="10" ry="6" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>
      </g>

      <ellipse cx="182" cy="208" rx="44" ry="7" fill="#1a261a" opacity="0.08"/>
      <path d="M148 205 C131 205 124 185 126 165 C128 144 138 131 160 128 C170 126 182 126 194 128 C214 131 224 145 224 165 C226 185 219 205 202 205 Z" fill="url(#bodyR)" filter="url(#softShadow)"/>
      <ellipse cx="176" cy="168" rx="19" ry="23" fill="url(#tummy)" opacity="0.9"/>
      <path d="M134 148 C126 140 118 138 112 142 C108 145 110 155 116 156" fill="none" stroke="#1a261a" strokeWidth="16" strokeLinecap="round"/>
      <path d="M134 148 C126 140 118 138 112 142 C108 145 110 155 116 156" fill="none" stroke="#2d3d2d" strokeWidth="13" strokeLinecap="round"/>
      <path d="M218 158 C228 165 232 178 228 188" fill="none" stroke="#1a261a" strokeWidth="15" strokeLinecap="round"/>
      <path d="M218 158 C228 165 232 178 228 188" fill="none" stroke="#2d3d2d" strokeWidth="12" strokeLinecap="round"/>
      <ellipse cx="157" cy="198" rx="21" ry="12" fill="#1a261a"/>
      <ellipse cx="157" cy="196" rx="18" ry="10" fill="#2d3d2d"/>
      <ellipse cx="198" cy="198" rx="21" ry="12" fill="#1a261a"/>
      <ellipse cx="198" cy="196" rx="18" ry="10" fill="#2d3d2d"/>
      <ellipse cx="157" cy="205" rx="12" ry="6" fill="#f0e8d8" opacity="0.6"/>
      <ellipse cx="198" cy="205" rx="12" ry="6" fill="#f0e8d8" opacity="0.6"/>

      <g transform="rotate(-4, 176, 90)">
        <ellipse cx="176" cy="88" rx="46" ry="44" fill="url(#bodyR)" filter="url(#softShadow)"/>
        <circle cx="140" cy="52" r="17" fill="#1a261a"/>
        <circle cx="140" cy="52" r="11" fill="#2d3d2d"/>
        <circle cx="212" cy="52" r="17" fill="#1a261a"/>
        <circle cx="212" cy="52" r="11" fill="#2d3d2d"/>
        <ellipse cx="162" cy="87" rx="14" ry="12" fill="url(#patchL)" transform="rotate(-8 162 87)"/>
        <ellipse cx="190" cy="87" rx="14" ry="12" fill="url(#patchR)" transform="rotate(8 190 87)"/>
        {happy ? <><path d="M155 87 Q162 94 169 87" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/><path d="M183 87 Q190 94 197 87" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/></> : <><ellipse cx="162" cy="88" rx="7" ry="6" fill="#fdf9f0"/><ellipse cx="190" cy="88" rx="7" ry="6" fill="#fdf9f0"/><ellipse cx="163" cy="89" rx="4.5" ry="4" fill="#1a1a2a"/><ellipse cx="191" cy="89" rx="4.5" ry="4" fill="#1a1a2a"/><circle cx="165" cy="87" r="1.6" fill="white"/><circle cx="193" cy="87" r="1.6" fill="white"/></>}
        <ellipse cx="176" cy="100" rx="4" ry="2.8" fill="#1a261a" opacity="0.7"/>
        {happy ? <path d="M168 107 Q172 113 176 109 Q180 113 184 107" fill="none" stroke="#1a261a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M170 106 Q173 110 176 107 Q179 110 182 106" fill="none" stroke="#1a261a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
      </g>

      {happy && (
        <>
          <g filter="url(#softGlow)"><path d="M122 100 C122 95 126 93 130 97 C134 93 138 95 138 100 C138 106 130 115 130 115 C130 115 122 106 122 100Z" fill="#e8607a" opacity="0.95"/></g>
          <path d="M106 78 C106 75 108 74 110 76 C112 74 114 75 114 78 C114 81 110 85 110 85 C110 85 106 81 106 78Z" fill="#f4a0b8" opacity="0.7"/>
          <path d="M144 72 C144 70 145.5 69 147 71 C148.5 69 150 70 150 72 C150 74.5 147 78 147 78 C147 78 144 74.5 144 72Z" fill="#f4a0b8" opacity="0.6"/>
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
    // Especiales
    firefly: (<svg viewBox="0 0 48 48" width={s} height={s}><circle cx="24" cy="24" r="20" fill="#1a2a1a" opacity="0.2"/>{[[12,15],[30,10],[8,30],[36,28],[20,36],[38,18],[16,22],[28,34]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2.5" fill="#f8e840" opacity="0.9"/><circle cx={x} cy={y} r="4" fill="#f8e840" opacity="0.25"/></g>)}</svg>),
    moongate: (<svg viewBox="0 0 52 52" width={s} height={s}><circle cx="26" cy="22" r="20" fill="none" stroke="#f8e0a0" strokeWidth="3"/><path d="M6 40 L6 22 A20 20 0 0 1 46 22 L46 40" fill="#f8e0a0" opacity="0.1" stroke="#f8e0a0" strokeWidth="2"/><circle cx="26" cy="22" r="16" fill="#1a2a3a" opacity="0.5"/><circle cx="26" cy="22" r="15" fill="none"/>{[5,4,3,2].map((r,i)=><circle key={i} cx={26-r} cy={18+r} r={r} fill="#f8e0a0" opacity={0.4-i*0.08}/>)}<path d="M6 42 L6 52 L46 52 L46 42" fill="#7ab848" opacity="0.8"/></svg>),
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
function Jardin({ bamboo, happiness, water, garden, accessories, mochiHappy, pandaBubble, onPet, onBuy, onWater, onBuyAccessory }) {
  const [shopTab, setShopTab] = useState("plantas");
  const cats = [{id:"plantas",label:"🌿 Plantas"},{id:"agua",label:"🐟 Agua"},{id:"cielo",label:"☁️ Cielo"},{id:"deco",label:"🏮 Deco"},{id:"especial",label:"✨ Especiales"},{id:"accesorios",label:"🐼 Pandas"}];
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

      {/* Water button */}
      <div style={{ textAlign:"center", padding:"22px 14px 6px" }}>
        <button onClick={onWater} style={{ background: dry?"#e86030":C.sky, color:C.white, border:"none", borderRadius:12,
          padding:"10px 22px", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer",
          boxShadow:"0 3px 0 rgba(0,0,0,0.18)" }}>💧 Regar el jardín</button>
      </div>

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
          <div style={{ background: C.cream, borderRadius: 12, padding: "9px 14px", marginBottom: 10, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6 }}>
              🌱 <strong>¿Eres el primero?</strong> Crea la cuenta y le mandas tu código a tu pareja para que se una.
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
  const [open, setOpen] = useState({});
  const [tmp, setTmp] = useState({});
  const [editingApproved, setEditingApproved] = useState({});
  const [burbujaTab, setBurbujaTab] = useState("negociacion");

  const get = (id, f) => tmp[id]?.[f] ?? burbuja[id]?.[f] ?? "";
  const set_ = (id, f, v) => setTmp(p => ({ ...p, [id]: { ...p[id], [f]: v } }));
  const approvedCount = Object.values(burbuja).filter(v => v?.status === "approved").length;
  const total = BURBUJA_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const approvedItems = BURBUJA_SECTIONS.flatMap(sec =>
    sec.items
      .filter(item => burbuja[item.id]?.status === "approved")
      .map(item => ({ item, entry: burbuja[item.id] || {} }))
  );

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.olive, padding: "48px 20px 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0 }}>La Burbuja</h1>
        <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>Sus reglas, acuerdos y mundo compartido · +10 bambú c/u</p>
      </div>
      <div style={{ background: C.cream, borderRadius: 18, margin: "14px 14px 8px", padding: 16, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.dark, marginBottom: 5 }}>¿Qué es la burbuja?</div>
        <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.7 }}>Su relación tiene sus propias reglas — únicas para ustedes. Este es el espacio para definirlas juntos, sin juicios.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <ProgBar value={approvedCount} max={total} color={C.olive} height={7} style={{ flex: 1 }} />
          <div style={{ fontSize: "0.76rem", fontWeight: 800, color: C.olive, whiteSpace: "nowrap" }}>{approvedCount} / {total}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "0 14px 10px" }}>
        {[ ["negociacion", "Negociación"], ["acuerdos", "Acuerdos hechos"] ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setBurbujaTab(id)}
            style={{
              flex: 1,
              borderRadius: 12,
              padding: "10px 12px",
              border: `1.5px solid ${burbujaTab === id ? C.dark : C.border}`,
              background: burbujaTab === id ? C.dark : C.white,
              color: burbujaTab === id ? C.cream2 : C.ink,
              fontFamily: "'Fredoka One',cursive",
              fontSize: "0.82rem",
              cursor: "pointer",
              boxShadow: burbujaTab === id ? "0 2px 0 rgba(0,0,0,0.18)" : `0 2px 0 ${C.border}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {burbujaTab === "negociacion" && BURBUJA_SECTIONS.map(sec => {
        const pendingItems = sec.items.filter(item => {
          const entry = burbuja[item.id] || {};
          return entry.status !== "approved";
        });
        if (!pendingItems.length) return null;

        return (
        <div key={sec.id} style={{ background: C.white, borderRadius: 18, margin: "0 14px 10px", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
          <div onClick={() => setOpen(p => ({ ...p, [sec.id]: !p[sec.id] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, cursor: "pointer" }}>
            <div style={{ width: 44, height: 44, background: sec.itemBg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", flexShrink: 0 }}>{sec.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.dark }}>{sec.title}</div>
              <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 700 }}>{sec.sub}</div>
            </div>
            <div style={{ color: C.inkL, transition: "transform 0.25s", transform: open[sec.id] ? "rotate(180deg)" : "none" }}>▼</div>
          </div>
          {open[sec.id] && <div style={{ padding: "0 16px 16px" }}>
            {pendingItems.map(item => {
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
                      <Btn onClick={() => onPropose(item.id, proposalText, false)} variant="olive" style={{ padding:"9px 12px", fontSize:"0.82rem" }}>Enviar propuesta</Btn>
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
                          <Btn onClick={() => onApprove(item.id)} variant="olive" style={{ flex:1, fontSize:"0.82rem", padding:"10px 12px" }}>Aprobar ✅</Btn>
                        </div>
                        <div style={{ marginTop:8 }}>
                          <TA value={proposalText} onChange={v => set_(item.id, "proposalText", v)} placeholder="Si no te convence, propone ajuste para negociar..." rows={2} />
                          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
                            <Btn onClick={() => onPropose(item.id, proposalText, true)} variant="sand" style={{ padding:"9px 12px", fontSize:"0.82rem" }}>Negociar ↔</Btn>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

              </div>;
            })}
          </div>}
        </div>
      )})}

      {burbujaTab === "negociacion" && !BURBUJA_SECTIONS.some(sec => sec.items.some(item => (burbuja[item.id] || {}).status !== "approved")) && (
        <div style={{ margin: "0 14px 10px", background: C.white, borderRadius: 16, padding: 14, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.82rem", color: C.inkM, fontWeight: 700, lineHeight: 1.6 }}>
            No hay acuerdos pendientes de negociación. Revisa la pestaña de acuerdos hechos.
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
                      Editar acuerdo
                    </Btn>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
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
                          onPropose(item.id, proposalText, true);
                          setEditingApproved(p => ({ ...p, [item.id]: false }));
                        }}
                        variant="olive"
                        style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                      >
                        Enviar edición
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

function ConsejoDelDiaSection({ user, onClaimReward }) {
  const ownerKey = user?.code || user?.email || "guest";
  const favKey = `mochi_consejos_fav_${ownerKey}`;
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState(() => ls.get(favKey) || []);
  const dayKey = getDateKeyLocal();

  useEffect(() => {
    setOffset(0);
    setOpen(false);
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

  const handleToggleOpen = () => {
    setOpen(v => {
      const next = !v;
      if (next) onClaimReward?.();
      return next;
    });
  };

  return (
    <div style={{ margin: "0 14px 12px" }}>
      <button
        onClick={handleToggleOpen}
        style={{
          width: "100%",
          background: C.white,
          color: C.dark,
          border: `1.5px solid ${C.border}`,
          borderRadius: 14,
          padding: "12px 14px",
          fontFamily: "'Fredoka One',cursive",
          fontSize: "0.98rem",
          cursor: "pointer",
          boxShadow: `0 3px 0 ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Consejo del Día 🐼 · +15 bambú</span>
        <span style={{ fontSize: "0.86rem", color: C.inkL }}>{open ? "Cerrar" : "Abrir"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, background: C.white, borderRadius: 18, padding: 16, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Consejo del Día</div>
            <div style={{ background: C.cream, borderRadius: 999, padding: "5px 10px", fontSize: "0.68rem", fontWeight: 800, color: C.inkL }}>
              #{consejo.id}
            </div>
          </div>

          <div style={{ background: "linear-gradient(130deg, #f7f1ff 0%, #eee3ff 100%)", borderRadius: 12, padding: "11px 12px", border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ fontSize: "0.88rem", color: C.ink, lineHeight: 1.75, fontWeight: 700 }}>{consejo.texto}</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={() => setOffset(v => (v + 1) % CONSEJOS_DIARIOS.length)} variant="sand" style={{ flex: 1, padding: "10px 12px", fontSize: "0.82rem" }}>
              Ver otro consejo
            </Btn>
            <Btn onClick={toggleFav} variant={isFav ? "olive" : "cream"} style={{ flex: 1, padding: "10px 12px", fontSize: "0.82rem" }}>
              {isFav ? "Guardado ✓" : "Guardar favorito"}
            </Btn>
          </div>

          <div style={{ marginTop: 8, fontSize: "0.68rem", color: C.inkL, fontWeight: 700 }}>
            Favoritos guardados: {favs.length} · Marco clínico: TCC, DBT, ACT y terapias contextuales.
          </div>
        </div>
      )}
    </div>
  );
}

// PROFILE — Enhanced with more info fields
function Perfil({ user, bamboo, garden, accessories, exDone, messages, burbuja, conoce, lessonsDone, coupleInfo, streakInfo, onSaveCoupleInfo, onSaveNames, onLogout, testScores, onRetakeTest, onDeleteAccount, gratitud, momentos, onAddGratitud, onAddMomento, onSendMessage, onClaimDailyTip }) {
  const [editMode, setEditMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showLoveModal, setShowLoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalClosing, setDeleteModalClosing] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loveText, setLoveText] = useState("");
  const [quickLove, setQuickLove] = useState(null);
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
  const approvedAgreements = Object.entries(burbuja || {})
    .filter(([, v]) => v?.status === "approved" && (v?.approvedText || v?.proposalText))
    .map(([id, v]) => ({
      id,
      text: v.approvedText || v.proposalText,
      question: v.question || BURBUJA_ITEM_MAP[id]?.question || "Acuerdo"
    }));
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

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "38px 20px 28px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <CouplePandaSVG happy size={130} />
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.75rem", color: C.cream2 }}>{user?.names || "Nosotros"}</div>
        <div style={{ color: `${C.cream}88`, fontSize: "0.85rem", fontWeight: 700, marginTop: 3 }}>{user?.since || ""}</div>
        {coupleInfo.anniversary && <div style={{ color: C.gold, fontSize: "0.82rem", fontWeight: 700, marginTop: 4 }}>💑 {coupleInfo.anniversary}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 14px" }}>
        {[["Bambú 🌿", bamboo], ["Días de racha 🔥", streakInfo?.currentStreak || 0]].map(([l, v]) => (
          <div key={l} style={{ background: C.white, borderRadius: 16, padding: "14px 10px", textAlign: "center", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.7rem", color: C.dark }}>{v}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ margin:"0 14px 12px", background:C.white, borderRadius:18, padding:16, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}` }}>
        <button onClick={() => setShowLoveModal(true)} style={{ width:"100%", background:"#c05068", color:C.cream2, border:"none", borderRadius:12, padding:"12px 16px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)" }}>
          Manda un mensaje de amor
        </button>
        <div style={{ marginTop:12, background:C.cream, borderRadius:12, padding:12, border:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.88rem", color:C.dark, marginBottom:6 }}>💌 Últimos 3 mensajes de tu pareja</div>
          {!recentPartnerMsgs.length ? (
            <div style={{ fontSize:"0.8rem", color:C.inkL, lineHeight:1.6 }}>Aquí aparecerán los últimos mensajitos que te enviaron. Lo que mandes desde aquí seguirá saliendo en los globos del jardín.</div>
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

      <ConsejoDelDiaSection user={user} onClaimReward={onClaimDailyTip} />

            {/* ── BAÚL DE GRATITUD ── */}
      <div style={{ margin:"0 14px 12px" }}>
        <BaulSection
          gratitud={gratitud} momentos={momentos}
          onAddGratitud={onAddGratitud} onAddMomento={onAddMomento}
          user={user}
        />
      </div>

      {/* ── ACUERDOS HECHOS ── */}
      <div style={{ margin:"0 14px 12px", background:C.white, borderRadius:18, padding:16, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}` }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1rem", color:C.dark, marginBottom:8 }}>🤝 Acuerdos hechos</div>
        {!approvedAgreements.length ? (
          <div style={{ fontSize:"0.82rem", color:C.inkL, lineHeight:1.6 }}>Todavía no tienen acuerdos aprobados. Vayan a Burbuja y cierren su primer acuerdo juntos.</div>
        ) : approvedAgreements.slice(0, 20).map(a => (
          <div key={a.id} style={{ background:C.cream, borderRadius:10, padding:10, marginBottom:8, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:"0.7rem", color:C.inkL, fontWeight:800, marginBottom:4 }}>{a.question}</div>
            <div style={{ fontSize:"0.84rem", color:C.ink, fontWeight:700, lineHeight:1.6 }}>{a.text}</div>
          </div>
        ))}
      </div>

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
body { background: #f3ecff; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes floatHappy { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-18px) rotate(1.5deg)} }
textarea:focus, input:focus { border-color: #6f56b8 !important; box-shadow: 0 0 0 3px rgba(111,86,184,0.18) !important; outline: none !important; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-thumb { background:#dfd0ff; border-radius:50px; }
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

  { id:"four_horsemen", emoji:"🌩", title:"Los 4 Jinetes que dañan la relación",
    tag:"John Gottman",
    intro:"El Dr. Gottman puede predecir el divorcio con 90% de precisión. Estos 4 patrones son las señales de alarma más peligrosas en una relación.",
    sections:[
      { title:"1. Crítica", icon:"🗡", body:"Atacar a la persona, no al comportamiento. 'Siempre eres tan descuidado' vs 'Me molestó que no avisaras'. El antídoto: queja específica con 'yo'." },
      { title:"2. Desprecio", icon:"👀", body:"El más dañino. Burlarse, poner los ojos en blanco, sarcasmo hiriente. Comunica asco. El antídoto: construir cultura de aprecio." },
      { title:"3. Defensividad", icon:"🛡", body:"'Yo no soy el problema, tú eres el problema.' Victimizarse, contraatacar. El antídoto: asumir aunque sea el 5% de responsabilidad." },
      { title:"4. Evasión o bloqueo emocional", icon:"🧱", body:"Cerrarse, ignorar o desconectarse emocionalmente. El cuerpo entra en modo supervivencia. El antídoto: pausa de 20 min y volver con calma." },
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
      { title:"Apego Ansioso", icon:"🌀", body:"Necesita mucha reafirmación y seguridad. Miedo al abandono. Lee señales donde no las hay. 'Si no responde rápido, algo está mal.' El amor se siente como urgencia." },
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
            console.error("buyItem error:", e);
            toast("No se pudo comprar ese item");
          });
        return;
      }
      setBamboo(nb); setGarden(ng); setHappiness(nh); setLastVisit(nv); trigHappy();
      toast(`${item.name} plantado 🌿`);
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
      fbSendNotif(user.code, { type:"ejercicio", msg:`${myName} completó un ejercicio — ¡complétalo tú también! 🌿`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
    } else {
      setBamboo(b => b + total);
      trackDailyInteraction("exercise");
    }
    toast(bonus ? `¡Maestría! +${total} bambú 🌟` : `+${total} bambú 🌿`);
    save(null, { bamboo: bamboo + total, happiness:nh, water, garden, accessories, exDone:nd, messages, conoce, burbuja, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
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
        fbSendNotif(user.code, { type:"conoce", msg:`${myName} respondió una pregunta — ¡tu turno! 🌿`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
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
      if (user?.uid) {
        const me = getMyName(user, "Tu pareja");
        fbSendNotif(user.code, { type:"acuerdo", msg:`${me} actualizó su parte de un acuerdo 🫧`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
      }
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
    const history = [...(prev.history || []), { id: Date.now(), type: isCounter ? "counter" : "proposal", by: myRole, text: clean, at: new Date().toISOString() }];
    const next = {
      ...prev,
      status: "pending",
      proposalText: clean,
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
      if (user?.uid) fbSendNotif(user.code, { type:"momento", msg:`${myName} guardó un momento especial ✨`, forUid:user?.isOwner !== false ? "partner" : "owner", fromUid: user.uid }).catch(()=>{});
    } else {
      const nm = [{ ...enriched, id: Date.now() }, ...momentos];
      setMomentos(nm);
      setBamboo(b => b + 5);
      trackDailyInteraction("moment");
    }
    toast("✨ Guardado en el baúl de momentos +5 bambú 🌿");
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
        {tab==="jardin" && <Jardin bamboo={bamboo} happiness={happiness} water={water} garden={garden} accessories={accessories} mochiHappy={mochiHappy} pandaBubble={pandaBubble} onPet={petMochi} onBuy={buyItem} onWater={waterGarden} onBuyAccessory={buyAccessory}/>}
        {tab==="ejerc" && <Ejercicios exDone={exDone} onComplete={completeEx} user={user} lessonsDone={lessonsDone} onCompleteLesson={completeLesson}/>}
        {tab==="conocete" && <Conocete conoce={conoce} onSave={saveConoce} user={user}/>}
        {tab==="burbuja" && <Burbuja burbuja={burbuja} onSaveMine={saveBurbujaMine} onPropose={proposeBurbuja} onApprove={approveBurbuja} user={user}/>}
        {tab==="perfil" && <Perfil user={user} bamboo={bamboo} garden={garden} accessories={accessories} exDone={exDone} messages={messages} burbuja={burbuja} conoce={conoce} lessonsDone={lessonsDone} coupleInfo={coupleInfo} streakInfo={streakData} onSaveCoupleInfo={saveCoupleInfo} onSaveNames={saveNames} onLogout={logout} testScores={testScores} onRetakeTest={()=>setScreen("reltest")} onDeleteAccount={deleteAccount} gratitud={gratitud} momentos={momentos} onAddGratitud={addGratitud} onAddMomento={addMomento} onSendMessage={sendMsg} onClaimDailyTip={claimDailyTip}/>} 
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
      <Toast msg={toastMsg}/>
    </div>
  );
}

// ═══════════════════════════════════════════════
// BAUL SECTION — embedded in Perfil
// ═══════════════════════════════════════════════
function BaulSection({ user, gratitud, momentos, onAddGratitud, onAddMomento }) {
  const nameA = user?.names ? user.names.split("&")[0].trim() : "Panda A";
  const nameB = user?.names ? user.names.split("&")[1]?.trim() || "Panda B" : "Panda B";
  const [activeTab, setActiveTab] = useState("gratitud");
  const [showGForm, setShowGForm] = useState(false);
  const [showMForm, setShowMForm] = useState(false);
  const [gText, setGText] = useState(""); const [gWho, setGWho] = useState("A");
  const [mTitle, setMTitle] = useState(""); const [mText, setMText] = useState("");

  const getEntryTime = (entry) => {
    if (entry?.createdAt?.toDate) return entry.createdAt.toDate().getTime();
    if (entry?.createdAt?.seconds) return entry.createdAt.seconds * 1000;
    if (entry?.time) return new Date(entry.time).getTime();
    return 0;
  };
  const recentGratitud = [...gratitud].sort((a, b) => getEntryTime(b) - getEntryTime(a)).slice(0, 3);
  const recentMomentos = [...momentos].sort((a, b) => getEntryTime(b) - getEntryTime(a)).slice(0, 3);

  const submitG = () => { if (!gText.trim()) return; onAddGratitud({ text:gText.trim() }); setGText(""); setShowGForm(false); };
  const submitM = () => { if (!mTitle.trim()||!mText.trim()) return; onAddMomento({ title:mTitle.trim(), text:mText.trim() }); setMTitle(""); setMText(""); setShowMForm(false); };

  return (
    <div style={{ background:C.white, borderRadius:20, boxShadow:`0 3px 0 ${C.border}`, border:`1.5px solid ${C.border}`, overflow:"hidden" }}>
      {/* Tab bar */}
      <div style={{ display:"flex", background:C.sandL, borderBottom:`1.5px solid ${C.border}` }}>
        {[["gratitud","💛 Gratitud"],["momentos","✨ Momentos"]].map(([id,label]) => (
          <div key={id} onClick={() => setActiveTab(id)}
            style={{ flex:1, padding:"11px 0", textAlign:"center", fontFamily:"'Fredoka One',cursive",
              fontSize:"0.88rem", cursor:"pointer",
              background: activeTab===id ? C.white : "transparent",
              color: activeTab===id ? C.dark : C.inkL,
              borderBottom: activeTab===id ? `2.5px solid ${C.dark}` : "2.5px solid transparent",
              transition:"all 0.15s" }}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ padding:16 }}>
        {activeTab === "gratitud" && (
          <>
            {!showGForm
              ? <button onClick={() => setShowGForm(true)} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:12, padding:"11px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)", marginBottom:12 }}>+ Anotar acto de bondad</button>
              : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
                  <TA value={gText} onChange={setGText} placeholder="¿Qué le agradeces a tu pareja hoy?" rows={2} style={{ marginBottom:10 }}/>
                  <div style={{ display:"flex", gap:8 }}><Btn onClick={submitG} style={{ flex:1 }}>Guardar 💛</Btn><Btn onClick={() => { setShowGForm(false); setGText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
                </div>}
            {gratitud.length === 0
              ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>💛 Todavía no hay entradas</div>
              : recentGratitud.map((g,i) => (
                <div key={g.id||i} style={{ background:"#fffde8", borderRadius:12, padding:"10px 14px", marginBottom:8, border:"1px solid #e8d84030" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.8rem", color:C.dark }}>🐼 {g.authorName || g.name || "Tú"}</div>
                    <div style={{ fontSize:"0.68rem", color:C.inkL, fontWeight:700 }}>{g.date}</div>
                  </div>
                  <div style={{ fontSize:"0.86rem", color:C.inkM, lineHeight:1.6 }}>{g.text}</div>
                </div>
              ))}
            {gratitud.length > 3 && <div style={{ textAlign:"center", fontSize:"0.78rem", color:C.inkL, fontWeight:700, marginTop:4 }}>+{gratitud.length-3} más</div>}
          </>
        )}

        {activeTab === "momentos" && (
          <>
            {!showMForm
              ? <button onClick={() => setShowMForm(true)} style={{ width:"100%", background:C.dark, color:C.cream2, border:"none", borderRadius:12, padding:"11px 0", fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 3px 0 rgba(0,0,0,0.18)", marginBottom:12 }}>+ Guardar un momento</button>
              : <div style={{ background:C.sandL, borderRadius:14, padding:14, marginBottom:12, border:`1.5px solid ${C.border}` }}>
                  <input value={mTitle} onChange={e => setMTitle(e.target.value)} placeholder="Título del momento" style={{ width:"100%", border:`2px solid ${C.border}`, borderRadius:10, padding:"9px 12px", fontFamily:"'Nunito',sans-serif", fontSize:"0.88rem", outline:"none", color:C.ink, background:C.cream2, marginBottom:8, boxSizing:"border-box" }}/>
                  <TA value={mText} onChange={setMText} placeholder="¿Qué pasó? ¿Cómo se sintieron?" rows={3} style={{ marginBottom:10 }}/>
                  <div style={{ display:"flex", gap:8 }}><Btn onClick={submitM} style={{ flex:1 }}>Guardar ✨</Btn><Btn onClick={() => { setShowMForm(false); setMTitle(""); setMText(""); }} variant="ghost" style={{ padding:"10px 12px" }}>✕</Btn></div>
                </div>}
            {momentos.length === 0
              ? <div style={{ textAlign:"center", padding:"20px 0", color:C.inkL, fontSize:"0.84rem" }}>✨ Todavía no hay momentos guardados</div>
              : recentMomentos.map((m,i) => (
                <div key={m.id||i} style={{ background:"#f8f0ff", borderRadius:12, padding:"10px 14px", marginBottom:8, border:`1px solid #c8a8f830` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.88rem", color:C.dark }}>✨ {m.title}</div>
                    <div style={{ fontSize:"0.68rem", color:C.inkL, fontWeight:700 }}>{m.date}</div>
                  </div>
                  <div style={{ fontSize:"0.85rem", color:C.inkM, lineHeight:1.65 }}>{m.text}</div>
                </div>
              ))}
            {momentos.length > 3 && <div style={{ textAlign:"center", fontSize:"0.78rem", color:C.inkL, fontWeight:700, marginTop:4 }}>+{momentos.length-3} más</div>}
          </>
        )}
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
