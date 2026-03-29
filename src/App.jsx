// GLOBAL STYLES — debe ir antes de cualquier uso
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

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fbRegister, fbLogin, fbLogout, fbOnAuthChange,
  fbDeleteCurrentUser,
  fbCleanupBeforeAccountDelete,
  fbSaveUser, fbGetUser,
  fbGetCode, fbCreateCodeOwner, fbClaimPartnerCode, fbFindCodeByUid,
	fbSaveProgress, fbGetProgress,
} from "./firebase";

// Hitos de racha para recompensas o logros
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100];

// ───────────────────────────────────────────────
// Login component moved up to avoid ReferenceError
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

  // ...existing code for doReg, doJoin, etc...
  // (omitted for brevity, unchanged)

  // ...existing code for return JSX...
  // (omitted for brevity, unchanged)
}

// Analiza los streaks del usuario y retorna estadísticas básicas
function computeStreakAnalytics(streakInteractions) {
  // streakInteractions debe ser un array de fechas o marcas de actividad
  if (!Array.isArray(streakInteractions) || streakInteractions.length === 0) {
    return {
      total: 0,
      currentStreak: 0,
      longestStreak: 0,
      daysActive: [],
    };
  }
  // Suponiendo que streakInteractions son strings de fecha tipo 'YYYY-MM-DD'
  const days = [...new Set(streakInteractions)].sort();
  let currentStreak = 1, longestStreak = 1, prev = null;
  for (let i = 0; i < days.length; i++) {
    if (i > 0) {
      const prevDate = new Date(days[i - 1]);
      const currDate = new Date(days[i]);
      const diff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        currentStreak++;
        if (currentStreak > longestStreak) longestStreak = currentStreak;
      } else {
        currentStreak = 1;
      }
    }
  }
  return {
    total: days.length,
    currentStreak,
    longestStreak,
    daysActive: days,
  };
}

// ═══════════════════════════════════════════════
// GARDEN ITEMS — multiple quantities, koi/lotus aesthetic
// ═══════════════════════════════════════════════
const GARDEN_ITEMS = [
  // ... (aquí van los objetos de items del jardín, que ya existen en el archivo)
];

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

// ─── Panda drawing helper ────────────────────────────────────────────────────
// Origin = body center. Head at (0,-56). Total bbox ≈ x:−70..70 y:−112..90
// KEY: ENTIRE outer body is gray; only belly & face are white.
function PandaBody({ happy = false }) {
  const OL = "#2e1a0e";
  const GR = "#5e5e5e";   // panda gray
  const WH = "#ffffff";
  const PK = "#f5a89a";
  return (
    <g>
      {/* ── LEGS (wide, chubby) ── */}
      <path d="M-34 52 C-38 52 -44 54 -44 68 C-44 80 -36 88 -22 88 C-12 88 -8 82 -8 72 C-8 60 -14 52 -22 52 Z"
        fill={GR} stroke={OL} strokeWidth="2.4"/>
      <path d="M  8 52 C  4 52 -2 54 -2 68 C -2 80  6 88 20 88 C 30 88 36 82 36 72 C 36 60 30 52 22 52 Z"
        fill={GR} stroke={OL} strokeWidth="2.4"/>
      {/* Toe lines */}
      <path d="M-40 85 Q-33 91 -26 85" fill="none" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M  4 85 Q 13 91  22 85" fill="none" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>

      {/* ── OUTER BODY — all gray ── */}
      <ellipse cx="0" cy="14" rx="46" ry="48" fill={GR} stroke={OL} strokeWidth="2.6"/>

      {/* ── WHITE BELLY PATCH ── */}
      <path d="M0 -38 C34 -28 38 12 32 44 Q16 58 0 58 Q-16 58 -32 44 C-38 12 -34 -28 0 -38Z"
        fill={WH} opacity="0.95"/>

      {/* ── LEFT ARM ── */}
      <path d="M-44 -6 C-60 -6 -66 20 -60 42 C-56 54 -44 56 -38 48 C-32 42 -32 26 -34 12 C-36 0 -38 -6 -44 -6Z"
        fill={GR} stroke={OL} strokeWidth="2.4"/>

      {/* ── RIGHT ARM ── */}
      <path d="M 44 -6 C 60 -6 66 20 60 42 C 56 54 44 56 38 48 C 32 42 32 26 34 12 C 36 0 38 -6 44 -6Z"
        fill={GR} stroke={OL} strokeWidth="2.4"/>

      {/* ── HEAD ── white circle */}
      <circle cx="0" cy="-56" r="46" fill={WH} stroke={OL} strokeWidth="2.8"/>

      {/* Ears — gray, slightly inset */}
      <circle cx="-34" cy="-94" r="22" fill={GR} stroke={OL} strokeWidth="2.4"/>
      <circle cx=" 34" cy="-94" r="22" fill={GR} stroke={OL} strokeWidth="2.4"/>
      {/* Ear inner shadow */}
      <circle cx="-34" cy="-94" r="12" fill="#4a4a4a" opacity="0.45"/>
      <circle cx=" 34" cy="-94" r="12" fill="#4a4a4a" opacity="0.45"/>

      {/* Eye patches — large, soft gray ovals */}
      <ellipse cx="-16" cy="-58" rx="19" ry="18" fill={GR} stroke={OL} strokeWidth="1.6"
        transform="rotate(-10 -16 -58)"/>
      <ellipse cx=" 16" cy="-58" rx="19" ry="18" fill={GR} stroke={OL} strokeWidth="1.6"
        transform="rotate( 10  16 -58)"/>


      {acc.outfit_sailor && (() => {
        const [tx, ty] = H(0, 22);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc * f},${sc})`}>
            <path d="M-32-6 C-36 10-36 32-34 56 C-22 62 22 62 34 56 C36 32 36 10 32-6 C18-12 8-14 0-14 C-8-14-18-12-32-6Z"
              fill="#f0f4fc" stroke={OL} strokeWidth="2"/>
            <path d="M-14-14 L0 12 L14-14" fill="none" stroke="#9ab0d8" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="-34" y="28" width="68" height="11" rx="5.5" fill="#9ab0d8" stroke={OL} strokeWidth="1.4"/>
            <circle cx="0" cy="16" r="5" fill="#f8b8c8" stroke={OL} strokeWidth="1"/>
          </g>
        );
      })()}

      {acc.outfit_witch && (() => {
        const [tx, ty] = H(0, 22);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc * f},${sc})`}>
            <path d="M-34-6 C-38 10-38 32-36 56 C-24 62 24 62 36 56 C38 32 38 10 34-6 C20-12 8-14 0-14 C-8-14-20-12-34-6Z"
              fill="#ccc0e8" stroke={OL} strokeWidth="2"/>
            <path d="M-32-6 C-20 4-9 8 0 8 C9 8 20 4 32-6" fill="none" stroke="#d8c870" strokeWidth="2.4" strokeLinecap="round"/>
            <ellipse cx="0" cy="32" rx="8" ry="7" fill="#b0a0d8" stroke={OL} strokeWidth="1" opacity="0.8"/>
          </g>
        );
      })()}

      {acc.outfit_angel && (() => {
        const [tx, ty] = H(0, 22);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc * f},${sc})`}>
            <path d="M-32-6 C-36 10-36 32-34 56 C-22 62 22 62 34 56 C36 32 36 10 32-6 C18-12 8-14 0-14 C-8-14-18-12-32-6Z"
              fill="#fdf8f0" stroke={OL} strokeWidth="2"/>
            <ellipse cx="-46" cy="18" rx="14" ry="22" fill="#f0f8ff" stroke={OL} strokeWidth="1.1" opacity="0.75"/>
            <ellipse cx=" 46" cy="18" rx="14" ry="22" fill="#f0f8ff" stroke={OL} strokeWidth="1.1" opacity="0.75"/>
          </g>
        );
      })()}
    </g>
  );

// ...existing code...

// ─── Accessories rendered in the same coordinate space as PandaBody ──────────
// hx,hy = head center in parent SVG coords; sc = scale applied to the panda
function PandaAcc({ acc = {}, hx, hy, sc, flip = false }) {
  if (!acc) return null;
  const OL = "#2e1a0e";
  const f = flip ? -1 : 1; // mirror X for right panda
  // shortcuts – all coords are in parent-SVG space already
  const H = (dx, dy) => [hx + dx * sc * f, hy + dy * sc]; // head-relative
  const [ex, ey] = H(0, 0);   // eye patch center ≈ head center

  return (
    <g>
      {/* ── HATS ── */}
      {acc.hat_flower && (() => {
        const [tx, ty] = H(0, -48);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-32 4 C-20-2-8-4 0-4 C8-4 20-2 32 4" fill="none" stroke="#7a9850" strokeWidth="2.8" strokeLinecap="round"/>
            <ellipse cx="-20" cy="0" rx="8" ry="4.5" fill="#a8c878" stroke={OL} strokeWidth="0.8" transform="rotate(-30 -20 0)"/>
            <ellipse cx=" 20" cy="0" rx="8" ry="4.5" fill="#a8c878" stroke={OL} strokeWidth="0.8" transform="rotate( 30  20 0)"/>
            {[[-28,0],[-10,-8],[10,-9],[28,0]].map(([x,y],i)=>(
              <g key={i} transform={`translate(${x},${y})`}>
                {[0,72,144,216,288].map((a,j)=>(
                  <ellipse key={j} cx={Math.cos(a*Math.PI/180)*5.5} cy={Math.sin(a*Math.PI/180)*5.5}
                    rx="4.5" ry="3"
                    fill={[["#f5c0cc","#fde0ea"],["#fce0b0","#fff5d0"],["#d8c0f8","#ece0ff"],["#f5c0cc","#fde0ea"]][i][j%2]}
                    stroke={OL} strokeWidth="0.5" transform={`rotate(${a})`} opacity="0.92"/>
                ))}
                <circle cx="0" cy="0" r="3.5" fill="#fffce8" stroke={OL} strokeWidth="0.4"/>
              </g>
            ))}
          </g>
        );
      })()}

      {acc.hat_crown && (() => {
        const [tx, ty] = H(0, -50);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-28 6 L-30-10 L-16 0 L0-18 L16 0 L30-10 L28 6Z" fill="#faecc0" stroke={OL} strokeWidth="1.6" strokeLinejoin="round"/>
            <line x1="-28" y1="6" x2="28" y2="6" stroke={OL} strokeWidth="1.2" opacity="0.6"/>
            <circle cx="0" cy="-16" r="4.5" fill="#f5a0b8" stroke={OL} strokeWidth="0.8"/>
            <circle cx="-16" cy="-1"  r="3.5" fill="#90d0f0" stroke={OL} strokeWidth="0.7"/>
            <circle cx=" 16" cy="-1"  r="3.5" fill="#90d0f0" stroke={OL} strokeWidth="0.7"/>
          </g>
        );
      })()}

      {acc.hat_straw && (() => {
        const [tx, ty] = H(0, -46);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <ellipse cx="0" cy="4" rx="42" ry="10" fill="#e8d898" stroke={OL} strokeWidth="1.6"/>
            <path d="M-20 4 C-20-16 20-16 20 4" fill="#f0e0b0" stroke={OL} strokeWidth="1.6"/>
            <ellipse cx="0" cy="4" rx="20" ry="5" fill="#e8d898"/>
            <path d="M-20 3 Q-8-2 8-2 Q16-1 20 3" fill="none" stroke="#d89080" strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
          </g>
        );
      })()}

      {acc.hat_beret && (() => {
        const [tx, ty] = H(-4, -48);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <ellipse cx="-4" cy="-4" rx="26" ry="12" fill="#e8b8c8" stroke={OL} strokeWidth="1.6"/>
            <circle cx="12" cy="-14" r="4" fill="#f8d0dc" stroke={OL} strokeWidth="0.8"/>
            <rect x="-20" y="4" width="28" height="6" rx="3" fill="#d890a8" stroke={OL} strokeWidth="0.8" opacity="0.75"/>
          </g>
        );
      })()}

      {acc.hat_beanie && (() => {
        const [tx, ty] = H(0, -48);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-24 4 C-24-14-14-22 0-22 C14-22 24-14 24 4" fill="#a8d8f0" stroke={OL} strokeWidth="1.6"/>
            <rect x="-26" y="2" width="52" height="9" rx="4.5" fill="#80b8d8" stroke={OL} strokeWidth="1.4"/>
            <circle cx="0" cy="-25" r="6" fill="#e8f4ff" stroke={OL} strokeWidth="0.8"/>
          </g>
        );
      })()}

      {acc.hat_frog && (() => {
        const [tx, ty] = H(0, -47);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <ellipse cx="0" cy="2" rx="28" ry="11" fill="#a8d898" stroke={OL} strokeWidth="1.6"/>
            <ellipse cx="-12" cy="-9" rx="6" ry="6" fill="#c0eeac" stroke={OL} strokeWidth="1.4"/>
            <ellipse cx=" 12" cy="-9" rx="6" ry="6" fill="#c0eeac" stroke={OL} strokeWidth="1.4"/>
            <circle cx="-12" cy="-9" r="2" fill={OL} opacity="0.8"/>
            <circle cx=" 12" cy="-9" r="2" fill={OL} opacity="0.8"/>
          </g>
        );
      })()}

      {/* ── GLASSES ── */}
      {acc.glasses_heart && (() => {
        const [tx, ty] = H(0, 2);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-22 0 C-22-5-18-7-14-4 C-10-7-6-5-6 0 C-6 5-14 11-14 11 C-14 11-22 5-22 0Z" fill="#f8c0cc" stroke={OL} strokeWidth="1.4"/>
            <path d="M  6 0 C  6-5 10-7 14-4 C 18-7 22-5 22 0 C 22 5 14 11 14 11 C 14 11  6 5  6 0Z" fill="#f8c0cc" stroke={OL} strokeWidth="1.4"/>
            <line x1="-6" y1="1" x2="6" y2="1" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="-22" y1="1" x2="-32" y2="-1" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
            <line x1=" 22" y1="1" x2=" 32" y2="-1" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
          </g>
        );
      })()}

      {acc.glasses_sun && (() => {
        const [tx, ty] = H(0, 2);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <rect x="-26" y="-7" width="18" height="12" rx="6" fill="#b0c8e0" stroke={OL} strokeWidth="1.4" opacity="0.82"/>
            <rect x="  8" y="-7" width="18" height="12" rx="6" fill="#b0c8e0" stroke={OL} strokeWidth="1.4" opacity="0.82"/>
            <line x1="-8" y1="0" x2="8" y2="0" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="-26" y1="-1" x2="-34" y2="-2" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
            <line x1=" 26" y1="-1" x2=" 34" y2="-2" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
            <rect x="-23" y="-5" width="6" height="4" rx="2" fill="white" opacity="0.28"/>
          </g>
        );
      })()}

      {acc.glasses_round && (() => {
        const [tx, ty] = H(0, 2);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <circle cx="-14" cy="0" r="9" fill="#e8f2f8" stroke={OL} strokeWidth="1.8" opacity="0.75"/>
            <circle cx=" 14" cy="0" r="9" fill="#e8f2f8" stroke={OL} strokeWidth="1.8" opacity="0.75"/>
            <line x1="-5" y1="0" x2="5" y2="0" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="-23" y1="-1" x2="-31" y2="-2" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
            <line x1=" 23" y1="-1" x2=" 31" y2="-2" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
          </g>
        );
      })()}

      {acc.glasses_clear && (() => {
        const [tx, ty] = H(0, 2);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <rect x="-24" y="-7" width="16" height="12" rx="4" fill="#d8eef8" stroke={OL} strokeWidth="1.5" opacity="0.55"/>
            <rect x="  8" y="-7" width="16" height="12" rx="4" fill="#d8eef8" stroke={OL} strokeWidth="1.5" opacity="0.55"/>
            <line x1="-8" y1="0" x2="8" y2="0" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="-24" y1="-1" x2="-32" y2="-2" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
            <line x1=" 24" y1="-1" x2=" 32" y2="-2" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
          </g>
        );
      })()}

      {acc.glasses_star && (() => {
        const [tx, ty] = H(0, 2);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-14-9 L-12-3 L-6-3 L-11 1 L-9 7 L-14 3 L-19 7 L-17 1 L-22-3 L-16-3Z" fill="#fce8b0" stroke={OL} strokeWidth="1.2"/>
            <path d="M 14-9 L 12-3 L  6-3 L 11 1 L  9 7 L 14 3 L 19 7 L 17 1 L 22-3 L 16-3Z" fill="#fce8b0" stroke={OL} strokeWidth="1.2"/>
            <line x1="-6" y1="0" x2="6" y2="0" stroke={OL} strokeWidth="1.6" strokeLinecap="round"/>
          </g>
        );
      })()}

      {/* ── BOW ── */}
      {acc.acc_bow && (() => {
        const [tx, ty] = H(28, -30);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc},${sc})`}>
            <path d="M-12 0 C-18-9-24-11-20-2 C-16 7-6 4 0 0Z" fill="#f8c0d0" stroke={OL} strokeWidth="1.2"/>
            <path d="M 12 0 C 18-9 24-11 20-2 C 16 7  6 4 0 0Z" fill="#e8b0e0" stroke={OL} strokeWidth="1.2"/>
            <circle cx="0" cy="0" r="5" fill="#fde8f0" stroke={OL} strokeWidth="0.8"/>
          </g>
        );
      })()}

      {/* ── SCARF ── */}
      {acc.acc_scarf && (() => {
        const [tx, ty] = H(0, 14);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-30-2 C-20-8-8-10 0-10 C8-10 20-8 30-2 C32 2 30 8 26 9 C20 10 12 7 0 7 C-12 7-20 10-26 9 C-30 8-32 2-30-2Z"
              fill="#f8c0c8" stroke={OL} strokeWidth="1.5"/>
            <path d="M22 7 C28 14 30 24 24 28 C20 32 14 29 12 22"
              fill="none" stroke="#f0a8b8" strokeWidth="7" strokeLinecap="round"/>
            <path d="M-22 6 Q-10 5 0 5 Q10 5 22 6" fill="none" stroke="white" strokeWidth="1.2" opacity="0.4" strokeLinecap="round"/>
          </g>
        );
      })()}

      {/* ── OUTFITS ── */}
      {acc.outfit_kimono && (() => {
        const [tx, ty] = H(0, 20);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-30-6 C-34 8-34 28-32 50 C-22 55 22 55 32 50 C34 28 34 8 30-6 C18-12 8-14 0-14 C-8-14-18-12-30-6Z"
              fill="#f0c8d8" stroke={OL} strokeWidth="1.8"/>
            <path d="M-14-14 L0 12 L14-14" fill="none" stroke="#fdf0f8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="-32" y="22" width="64" height="13" rx="5" fill="#d890b0" stroke={OL} strokeWidth="1.3"/>
            <ellipse cx="0" cy="28" rx="11" ry="7" fill="#e8a0c0" stroke={OL} strokeWidth="0.9"/>
            {[[-18,8],[14,8],[-10,36],[10,36]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="2.2" fill="#fde0f0" opacity="0.6"/>
            ))}
          </g>
        );
      })()}

      {acc.outfit_sailor && (() => {
        const [tx, ty] = H(0, 20);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-28-4 C-32 10-32 30-30 50 C-20 56 20 56 30 50 C32 30 32 10 28-4 C16-10 6-12 0-12 C-6-12-16-10-28-4Z"
              fill="#f0f4fc" stroke={OL} strokeWidth="1.8"/>
            <path d="M-12-12 L0 10 L12-12" fill="none" stroke="#9ab0d8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="-30" y="24" width="60" height="10" rx="5" fill="#9ab0d8" stroke={OL} strokeWidth="1.3"/>
            <circle cx="0" cy="14" r="4" fill="#f8b8c8" stroke={OL} strokeWidth="0.9"/>
          </g>
        );
      })()}

      {acc.outfit_witch && (() => {
        const [tx, ty] = H(0, 18);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-30-4 C-34 10-34 30-32 50 C-22 56 22 56 32 50 C34 30 34 10 30-4 C18-10 6-12 0-12 C-6-12-18-10-30-4Z"
              fill="#ccc0e8" stroke={OL} strokeWidth="1.8"/>
            <path d="M-28-4 C-18 4-8 8 0 8 C8 8 18 4 28-4" fill="none" stroke="#d8c870" strokeWidth="2.2" strokeLinecap="round"/>
            <ellipse cx="0" cy="28" rx="7" ry="6" fill="#b0a0d8" stroke={OL} strokeWidth="0.9" opacity="0.75"/>
          </g>
        );
      })()}

      {acc.outfit_angel && (() => {
        const [tx, ty] = H(0, 18);
        return (
          <g transform={`translate(${tx},${ty}) scale(${sc*f},${sc})`}>
            <path d="M-28-4 C-32 10-32 30-30 50 C-20 56 20 56 30 50 C32 30 32 10 28-4 C16-10 6-12 0-12 C-6-12-16-10-28-4Z"
              fill="#fdf8f0" stroke={OL} strokeWidth="1.8"/>
            <ellipse cx="-40" cy="16" rx="12" ry="20" fill="#f0f8ff" stroke={OL} strokeWidth="1" opacity="0.72"/>
            <ellipse cx=" 40" cy="16" rx="12" ry="20" fill="#f0f8ff" stroke={OL} strokeWidth="1" opacity="0.72"/>
          </g>
        );
      })()}
    </g>
  );
}

function CouplePandaSVG({ happy = false, size = 160, accessories }) {
  // Pandas placed in a 280×210 viewBox
  // Left panda: translate(72,162) scale(0.82) → head center ≈ (72, 119)
  // Right panda: translate(202,166) scale(0.80) → head center ≈ (202, 124)
  const acc = accessories || {};
  const LSC = 0.82, RSC = 0.80;
  const LX = 72,  LY = 162;
  const RX = 202, RY = 166;
  // head center y = translateY + headOffsetInBody * scale = translateY + (-52)*scale
  const LHY = LY + (-52) * LSC;  // ≈ 119
  const RHY = RY + (-52) * RSC;  // ≈ 124
  return (
    <svg viewBox="0 0 280 210" width={size} style={{ display: "block", overflow: "visible" }}>
      {/* Left panda */}
      <g transform={`translate(${LX},${LY}) scale(${LSC},${LSC})`}>
        <PandaBody happy={happy}/>
      </g>
      <PandaAcc acc={acc} hx={LX} hy={LHY} sc={LSC} flip={false}/>

      {/* Right panda (mirrored) */}
      <g transform={`translate(${RX},${RY}) scale(${-RSC},${RSC})`}>
        <PandaBody happy={happy}/>
      </g>
      <PandaAcc acc={acc} hx={RX} hy={RHY} sc={RSC} flip={true}/>
    </svg>
  );
}

function SinglePandaSVG({ size = 100 }) {
  return (
    <svg viewBox="0 0 120 180" width={size} style={{ display: "block" }}>
      <g transform="translate(60,145) scale(0.9,0.9)">
        <PandaBody happy={false}/>
      </g>
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
  const OL = "#4a4a4a"; // dark gray outline for all accessories
  return (
    <svg viewBox="0 0 260 220" width={pandaSize} height={pandaSize * 0.846}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      <defs>
        <filter id="wc" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.065" numOctaves="2" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <radialGradient id="kimonoL" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f5c8d8"/>
          <stop offset="100%" stopColor="#e8a8c0"/>
        </radialGradient>
        <radialGradient id="kimonoR" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#c8d8f5"/>
          <stop offset="100%" stopColor="#a8c0e8"/>
        </radialGradient>
        <radialGradient id="bataL" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e8f0fa"/>
          <stop offset="100%" stopColor="#d0e4f5"/>
        </radialGradient>
        <radialGradient id="bataR" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#faf0e8"/>
          <stop offset="100%" stopColor="#f5e0d0"/>
        </radialGradient>
      </defs>

      {/* ══ LEFT PANDA ACCESSORIES ══ */}

      {/* HAT: FLOWER CROWN */}
      {owned.hat_flower && (
        <g transform="rotate(6, 76, 88) translate(76, 44)" filter="url(#wc)">
          <path d="M-36 0 C-24 -6 -10 -8 0 -8 C10 -8 24 -6 36 0" fill="none" stroke="#8aaa70" strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
          <ellipse cx="-22" cy="-4" rx="7" ry="4" fill="#b8d8a0" stroke={OL} strokeWidth="0.8" transform="rotate(-30 -22 -4)" opacity="0.85"/>
          <ellipse cx="22" cy="-4" rx="7" ry="4" fill="#b8d8a0" stroke={OL} strokeWidth="0.8" transform="rotate(30 22 -4)" opacity="0.85"/>
          {[[-30,-2],[-10,-9],[12,-10],[32,-2]].map(([x,y],i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              {[0,72,144,216,288].map((a,j) => (
                <ellipse key={j} cx={Math.cos(a*Math.PI/180)*5} cy={Math.sin(a*Math.PI/180)*5}
                  rx="4" ry="2.5"
                  fill={[["#f5c8d8","#fde8f0"],["#fde8c0","#fff5d8"],["#d8c8f5","#ece4ff"],["#f5c8d8","#fde8f0"]][i][j%2]}
                  stroke={OL} strokeWidth="0.6" transform={`rotate(${a})`} opacity="0.88"/>
              ))}
              <circle cx="0" cy="0" r="3.5" fill="#fffaea" stroke={OL} strokeWidth="0.5"/>
            </g>
          ))}
        </g>
      )}

      {/* HAT: CROWN */}
      {owned.hat_crown && (
        <g transform="rotate(6, 76, 88) translate(76, 46)" filter="url(#wc)">
          <path d="M-26 6 L-28 -8 L-16 0 L0 -16 L16 0 L28 -8 L26 6 Z" fill="#faecc8" stroke={OL} strokeWidth="1.5" strokeLinejoin="round" opacity="0.92"/>
          <path d="M-26 6 L26 6" fill="none" stroke={OL} strokeWidth="1.5" opacity="0.6"/>
          <circle cx="0" cy="-14" r="4" fill="#f5b8c8" stroke={OL} strokeWidth="0.8"/>
          <circle cx="-16" cy="-2" r="3" fill="#b8e0f0" stroke={OL} strokeWidth="0.8"/>
          <circle cx="16" cy="-2" r="3" fill="#b8e0f0" stroke={OL} strokeWidth="0.8"/>
        </g>
      )}

      {/* HAT: STRAW HAT */}
      {owned.hat_straw && (
        <g transform="rotate(6, 76, 88) translate(76, 48)" filter="url(#wc)">
          <ellipse cx="0" cy="2" rx="38" ry="9" fill="#e8d8a8" stroke={OL} strokeWidth="1.5" opacity="0.9"/>
          <path d="M-18 2 C-18 -16 18 -16 18 2" fill="#f0e0b8" stroke={OL} strokeWidth="1.5" opacity="0.9"/>
          <ellipse cx="0" cy="2" rx="18" ry="4" fill="#e8d8a8" opacity="0.9"/>
          <path d="M-18 2 C-10 -2 10 -2 18 2" fill="none" stroke="#e0a8a0" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
          {[-10,0,10].map(x => <line key={x} x1={x} y1="-14" x2={x+2} y2="2" stroke={OL} strokeWidth="0.8" opacity="0.25"/>)}
        </g>
      )}

      {owned.hat_beret && (
        <g transform="rotate(6, 76, 88) translate(76, 46)" filter="url(#wc)">
          <ellipse cx="-6" cy="-4" rx="23" ry="11" fill="#e8c0d0" stroke={OL} strokeWidth="1.5" opacity="0.88"/>
          <circle cx="9" cy="-12" r="3.5" fill="#f5d8e0" stroke={OL} strokeWidth="0.8"/>
          <rect x="-18" y="2" width="24" height="5" rx="2.5" fill="#d8a8b8" stroke={OL} strokeWidth="0.8" opacity="0.7"/>
        </g>
      )}

      {owned.hat_beanie && (
        <g transform="rotate(6, 76, 88) translate(76, 46)" filter="url(#wc)">
          <path d="M-22 4 C-22 -12 -12 -20 0 -20 C12 -20 22 -12 22 4" fill="#c8e0f0" stroke={OL} strokeWidth="1.5" opacity="0.88"/>
          <rect x="-24" y="2" width="48" height="8" rx="4" fill="#a8c8e0" stroke={OL} strokeWidth="1.2" opacity="0.85"/>
          <circle cx="0" cy="-23" r="5" fill="#e8f4ff" stroke={OL} strokeWidth="0.8"/>
        </g>
      )}

      {owned.hat_frog && (
        <g transform="rotate(6, 76, 88) translate(76, 45)" filter="url(#wc)">
          <ellipse cx="0" cy="0" rx="26" ry="10" fill="#b8e0a8" stroke={OL} strokeWidth="1.5" opacity="0.88"/>
          <ellipse cx="-11" cy="-8" rx="5" ry="5" fill="#c8eebc" stroke={OL} strokeWidth="1.2"/>
          <ellipse cx="11" cy="-8" rx="5" ry="5" fill="#c8eebc" stroke={OL} strokeWidth="1.2"/>
          <circle cx="-11" cy="-8" r="1.5" fill={OL} opacity="0.8"/>
          <circle cx="11" cy="-8" r="1.5" fill={OL} opacity="0.8"/>
        </g>
      )}

      {/* GLASSES: HEART */}
      {owned.glasses_heart && (
        <g transform="rotate(6, 76, 88) translate(76, 84)" filter="url(#wc)">
          <path d="M-20 -1 C-20 -5 -17 -7 -14 -4 C-11 -7 -8 -5 -8 -1 C-8 3 -14 8 -14 8 C-14 8 -20 3 -20 -1Z" fill="#f5c8d8" stroke={OL} strokeWidth="1.5" opacity="0.88"/>
          <path d="M8 -1 C8 -5 11 -7 14 -4 C17 -7 20 -5 20 -1 C20 3 14 8 14 8 C14 8 8 3 8 -1Z" fill="#f5c8d8" stroke={OL} strokeWidth="1.5" opacity="0.88"/>
          <line x1="-8" y1="0" x2="8" y2="0" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <line x1="-20" y1="0" x2="-29" y2="-2" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <line x1="20" y1="0" x2="29" y2="-2" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
        </g>
      )}

      {/* GLASSES: SUN */}
      {owned.glasses_sun && (
        <g transform="rotate(6, 76, 88) translate(76, 84)" filter="url(#wc)">
          <rect x="-24" y="-7" width="16" height="11" rx="5.5" fill="#c8d8e8" stroke={OL} strokeWidth="1.5" opacity="0.75"/>
          <rect x="8" y="-7" width="16" height="11" rx="5.5" fill="#c8d8e8" stroke={OL} strokeWidth="1.5" opacity="0.75"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <line x1="-24" y1="-2" x2="-32" y2="-3" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <line x1="24" y1="-2" x2="32" y2="-3" stroke={OL} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <rect x="-21" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.3"/>
          <rect x="11" y="-5" width="5" height="3" rx="1.5" fill="#ffffff" opacity="0.3"/>
        </g>
      )}

      {owned.glasses_round && (
        <g transform="rotate(6, 76, 88) translate(76, 84)" filter="url(#wc)">
          <circle cx="-12" cy="-1" r="7.2" fill="#e8f0f8" stroke={OL} strokeWidth="1.8" opacity="0.7"/>
          <circle cx="12" cy="-1" r="7.2" fill="#e8f0f8" stroke={OL} strokeWidth="1.8" opacity="0.7"/>
          <line x1="-4.8" y1="-1" x2="4.8" y2="-1" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
          <line x1="-19" y1="-2" x2="-27" y2="-3" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
          <line x1="19" y1="-2" x2="27" y2="-3" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
        </g>
      )}

      {owned.glasses_clear && (
        <g transform="rotate(6, 76, 88) translate(76, 84)" filter="url(#wc)">
          <rect x="-22" y="-7" width="14" height="11" rx="4" fill="#e0f0f8" stroke={OL} strokeWidth="1.5" opacity="0.55"/>
          <rect x="8" y="-7" width="14" height="11" rx="4" fill="#e0f0f8" stroke={OL} strokeWidth="1.5" opacity="0.55"/>
          <line x1="-8" y1="-1" x2="8" y2="-1" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.65"/>
          <line x1="-22" y1="-2" x2="-30" y2="-3" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.65"/>
          <line x1="22" y1="-2" x2="30" y2="-3" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.65"/>
        </g>
      )}

      {owned.glasses_star && (
        <g transform="rotate(6, 76, 88) translate(76, 84)" filter="url(#wc)">
          <path d="M-13 -8 L-11 -3 L-6 -3 L-10 -0.5 L-8.5 4.5 L-13 2 L-17.5 4.5 L-16 -0.5 L-20 -3 L-15 -3Z" fill="#fdecc8" stroke={OL} strokeWidth="1.2" opacity="0.88"/>
          <path d="M13 -8 L15 -3 L20 -3 L16 -0.5 L17.5 4.5 L13 2 L8.5 4.5 L10 -0.5 L6 -3 L11 -3Z" fill="#fdecc8" stroke={OL} strokeWidth="1.2" opacity="0.88"/>
          <line x1="-6" y1="-1" x2="6" y2="-1" stroke={OL} strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
        </g>
      )}

      {/* ACC: BOW */}
      {owned.acc_bow && (
        <g transform="rotate(6, 76, 88) translate(106, 60)" filter="url(#wc)">
          <path d="M-12 0 C-18 -8 -24 -10 -20 -2 C-16 6 -6 4 0 0Z" fill="#f5c8d8" stroke={OL} strokeWidth="1.2" opacity="0.88"/>
          <path d="M12 0 C18 -8 24 -10 20 -2 C16 6 6 4 0 0Z" fill="#edd8f0" stroke={OL} strokeWidth="1.2" opacity="0.88"/>
          <circle cx="0" cy="0" r="4.5" fill="#fde8f0" stroke={OL} strokeWidth="0.8"/>
        </g>
      )}

      {/* ACC: SCARF */}
      {owned.acc_scarf && (
        <g filter="url(#wc)">
          <path d="M40 135 C46 128 60 124 76 124 C92 124 106 128 112 135 C114 138 112 145 108 146 C104 147 96 144 76 144 C56 144 48 147 44 146 C40 145 38 138 40 135Z"
            fill="#f5c8d8" stroke={OL} strokeWidth="1.5" opacity="0.85"/>
          <path d="M100 142 C108 148 112 158 106 164 C102 168 96 165 94 158"
            fill="none" stroke="#f0b8c8" strokeWidth="7" strokeLinecap="round" opacity="0.8"/>
          <path d="M44 140 C56 138 66 137 76 137 C86 137 96 138 108 140"
            fill="none" stroke="white" strokeWidth="1.2" opacity="0.35" strokeLinecap="round"/>
          <path d="M140 135 C146 128 160 124 176 124 C192 124 206 128 212 135 C214 138 212 145 208 146 C204 147 196 144 176 144 C156 144 148 147 144 146 C140 145 138 138 140 135Z"
            fill="#c8d8f5" stroke={OL} strokeWidth="1.5" opacity="0.85"/>
          <path d="M148 142 C140 148 136 158 142 164 C146 168 152 165 154 158"
            fill="none" stroke="#b8c8f0" strokeWidth="7" strokeLinecap="round" opacity="0.8"/>
          <path d="M144 140 C156 138 166 137 176 137 C186 137 196 138 208 140"
            fill="none" stroke="white" strokeWidth="1.2" opacity="0.35" strokeLinecap="round"/>
        </g>
      )}

      {/* OUTFIT: KIMONO */}
      {owned.outfit_kimono && (
        <g filter="url(#wc)">
          <path d="M38 140 C34 150 32 170 34 195 C40 200 70 202 114 195 C116 170 114 150 110 140 C100 132 88 130 76 130 C64 130 52 132 38 140Z"
            fill="url(#kimonoL)" stroke={OL} strokeWidth="1.8" opacity="0.88"/>
          <path d="M60 130 L76 155 L92 130" fill="none" stroke="#faeef5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
          <rect x="40" y="160" width="72" height="13" rx="5" fill="#e8a8c0" stroke={OL} strokeWidth="1.2" opacity="0.82"/>
          <ellipse cx="76" cy="167" rx="10" ry="6.5" fill="#f0c0d4" stroke={OL} strokeWidth="0.8"/>
          {[[52,148],[88,148],[60,172],[92,172]].map(([x,y],i) => (
            <ellipse key={i} cx={x} cy={y} rx="6" ry="3.5" fill="white" opacity="0.8" />
          ))}
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
      <path d="M0 310 Q100 290 200 305 Q300 320 390 298 L390 420 L0 420Z" fill="url(#groundGrad)" filter="url(#watercolor)"/>

      {/* Watercolor ground texture overlay */}
      <path d="M0 310 Q100 290 200 305 Q300 320 390 298 L390 420 L0 420Z" fill={MIST[lvl]} opacity="0.08"/>

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
          const y0 = 308 - (i%4)*4 + 8;
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
      </g>)}

      {/* ── STYLE: warm cartoon, dark brown outlines, pastel muted palette ── */}

      {/* Willow tree */}
      {showIn("willow") && <g>
        <ellipse cx="344" cy="232" rx="18" ry="5" fill="#5a3218" opacity="0.12"/>
        <path d="M340 232 C340 200 342 170 344 100" fill="none" stroke="#8a6030" strokeWidth="9" strokeLinecap="round"/>
        <path d="M340 232 C340 200 342 170 344 100" fill="none" stroke="#b08048" strokeWidth="6" strokeLinecap="round"/>
        {[[-28,8],[-22,16],[-14,10],[-6,18],[4,12],[12,16],[20,9],[26,6]].map(([dx,dy],i)=>(
          <path key={i} d={`M344 ${110+i*12} Q${344+dx} ${138+i*12+dy} ${344+dx*1.6} ${172+i*12+dy*2}`}
            fill="none" stroke={withering?"#b0a848":"#7aaa50"} strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>
        ))}
        <ellipse cx="344" cy="100" rx="22" ry="14" fill={withering?"#c8b848":"#90b858"} stroke="#5a3218" strokeWidth="1.5" opacity="0.92"/>
        <ellipse cx="332" cy="108" rx="14" ry="10" fill={withering?"#b8aa40":"#7aaa50"} stroke="#5a3218" strokeWidth="1.2" opacity="0.8"/>
        <ellipse cx="356" cy="107" rx="13" ry="9" fill={withering?"#beb040":"#88b858"} stroke="#5a3218" strokeWidth="1.2" opacity="0.8"/>
      </g>}

      {/* Bamboo */}
      {showIn("bamboo1") && <g>
        <ellipse cx="27" cy="232" rx="16" ry="5" fill="#5a3218" opacity="0.10"/>
        <rect x="20" y="82" width="11" height="148" rx="5" fill={withering?"#a8a838":"#5a8a38"} stroke="#5a3218" strokeWidth="1.5"/>
        <rect x="20" y="82" width="5" height="148" rx="3" fill={withering?"#c0be50":"#78a850"} opacity="0.5"/>
        {[102,128,155,180].map((y,i)=><rect key={i} x="18" y={y} width="15" height="5" rx="2" fill={withering?"#8a8828":"#3a6820"} stroke="#5a3218" strokeWidth="0.8"/>)}
        <ellipse cx="10" cy="96" rx="18" ry="6" fill={withering?"#a0a830":"#6a9a40"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-32 10 96)" opacity="0.9"/>
        <ellipse cx="38" cy="88" rx="15" ry="5" fill={withering?"#a8ae38":"#78aa48"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(25 38 88)" opacity="0.9"/>
        <ellipse cx="8" cy="138" rx="14" ry="5" fill={withering?"#9ea028":"#609838"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-28 8 138)" opacity="0.85"/>
      </g>}
      {showIn("bamboo2") && <g>
        <rect x="50" y="95" width="10" height="135" rx="5" fill={withering?"#b0b040":"#628c40"} stroke="#5a3218" strokeWidth="1.5"/>
        <rect x="50" y="95" width="4" height="135" rx="2.5" fill={withering?"#c8c058":"#80a858"} opacity="0.5"/>
        {[118,145,170].map((y,i)=><rect key={i} x="48" y={y} width="14" height="5" rx="2" fill={withering?"#8a8828":"#3a6820"} stroke="#5a3218" strokeWidth="0.8"/>)}
        <rect x="65" y="100" width="8" height="130" rx="4" fill={withering?"#a8a838":"#5a8840"} stroke="#5a3218" strokeWidth="1.2"/>
        {[120,148,174].map((y,i)=><rect key={i} x="63" y={y} width="12" height="4" rx="2" fill={withering?"#888020":"#386020"} stroke="#5a3218" strokeWidth="0.7"/>)}
        <ellipse cx="74" cy="108" rx="13" ry="5" fill={withering?"#a0a028":"#60982e"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(28 74 108)" opacity="0.88"/>
        <ellipse cx="42" cy="118" rx="12" ry="4.5" fill={withering?"#a8a830":"#6a9a38"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-22 42 118)" opacity="0.85"/>
      </g>}

      {/* Cherry tree */}
      {showIn("cherry") && <g>
        <ellipse cx="284" cy="232" rx="20" ry="5" fill="#5a3218" opacity="0.12"/>
        <path d="M280 230 C280 210 282 185 284 150" fill="none" stroke="#8a6030" strokeWidth="11" strokeLinecap="round"/>
        <path d="M280 230 C280 210 282 185 284 150" fill="none" stroke="#b08048" strokeWidth="7" strokeLinecap="round"/>
        <path d="M283 175 Q268 165 260 150" fill="none" stroke="#9a7038" strokeWidth="7" strokeLinecap="round"/>
        <path d="M283 175 Q268 165 260 150" fill="none" stroke="#b08848" strokeWidth="4" strokeLinecap="round"/>
        <path d="M283 168 Q298 158 305 145" fill="none" stroke="#9a7038" strokeWidth="6" strokeLinecap="round"/>
        <circle cx="284" cy="130" r="30" fill={dry?"#d8c080":"#f0b0c0"} stroke="#5a3218" strokeWidth="1.8" opacity="0.88"/>
        <circle cx="262" cy="142" r="22" fill={dry?"#d0b878":"#f4b8c8"} stroke="#5a3218" strokeWidth="1.5" opacity="0.85"/>
        <circle cx="306" cy="140" r="24" fill={dry?"#ccc070":"#eaa8b8"} stroke="#5a3218" strokeWidth="1.5" opacity="0.82"/>
        <circle cx="272" cy="120" r="18" fill={dry?"#d4c878":"#f8c0ce"} stroke="#5a3218" strokeWidth="1.2" opacity="0.8"/>
        {!dry && [[280,118],[265,132],[298,128],[284,108],[308,138],[260,148]].map(([x,y],i)=>(
          <circle key={i} cx={x} cy={y} r="3" fill="#fff0f4" opacity="0.7"/>
        ))}
      </g>}

      {/* Pond */}
      {showIn("pond") && <g>
        {[[120,258,18,10],[145,272,14,8],[168,278,16,9],[195,280,18,9],[222,276,15,8],[248,270,16,9],[268,260,14,8],[258,252,13,8],[235,248,15,8],[210,246,16,8],[185,248,14,8],[160,252,13,8],[138,254,12,8]].map(([cx,cy,rx,ry],i)=>(
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="#b8b098" stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
        ))}
        <ellipse cx="197" cy="262" rx="72" ry="16" fill={dry?"#c8b870":"#a8c8d8"} opacity="0.85"/>
        <ellipse cx="197" cy="259" rx="58" ry="10" fill={dry?"#d0c070":"#b8d8e8"} opacity="0.7"/>
        {!dry && [[175,258],[205,255],[220,262]].map(([x,y],i)=>(
          <ellipse key={i} cx={x} cy={y} rx="8" ry="2.5" fill="white" opacity="0.3"/>
        ))}
        {showIn("koi1") && <g>
          <ellipse cx="183" cy="262" rx="16" ry="6" fill="#d86040" stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
          <path d="M167 262 Q162 256 159 262 Q162 268 167 262Z" fill="#c04828" stroke="#5a3218" strokeWidth="0.8" opacity="0.9"/>
          <circle cx="194" cy="259" r="2.5" fill="white" opacity="0.9"/>
          <circle cx="195" cy="259" r="1.2" fill="#2a1808" opacity="0.8"/>
        </g>}
        {showIn("koi2") && <g>
          <ellipse cx="215" cy="265" rx="14" ry="5.5" fill="#c8a030" stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
          <path d="M229 265 Q234 259 237 265 Q234 271 229 265Z" fill="#b08820" stroke="#5a3218" strokeWidth="0.8" opacity="0.9"/>
          <circle cx="207" cy="263" r="2" fill="white" opacity="0.9"/>
        </g>}
        {showIn("lotus_pad") && <g>
          <ellipse cx="172" cy="256" rx="16" ry="9" fill="#6a9840" stroke="#5a3218" strokeWidth="1.2" opacity="0.88"/>
          <path d="M172 247 L172 256" fill="none" stroke="#5a3218" strokeWidth="0.8" opacity="0.5"/>
          <ellipse cx="220" cy="260" rx="13" ry="7" fill="#7aaa48" stroke="#5a3218" strokeWidth="1.2" opacity="0.85"/>
        </g>}
      </g>}

      {/* Lotus flowers */}
      {showIn("lotus1") && <g>
        <rect x="107" y="210" width="5" height="15" rx="2.5" fill="#6a9848" stroke="#5a3218" strokeWidth="0.8"/>
        <ellipse cx="97" cy="214" rx="9" ry="12" fill={dry?"#c8a860":"#f0a8b8"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(20 97 214)" opacity="0.85"/>
        <ellipse cx="122" cy="214" rx="9" ry="12" fill={dry?"#c8a860":"#ecaab8"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-20 122 214)" opacity="0.85"/>
        <ellipse cx="109" cy="206" rx="10" ry="13" fill={dry?"#d8b870":"#f8b8c8"} stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
        <ellipse cx="109" cy="210" rx="7" ry="9" fill={dry?"#e0c080":"#ffd0dc"} stroke="#5a3218" strokeWidth="1" opacity="0.9"/>
        <circle cx="109" cy="208" r="4" fill={dry?"#f0d090":"#fff0b0"} stroke="#5a3218" strokeWidth="0.8"/>
      </g>}
      {showIn("lotus2") && <g>
        <rect x="139" y="212" width="5" height="18" rx="2.5" fill="#6a9848" stroke="#5a3218" strokeWidth="0.8"/>
        <ellipse cx="131" cy="214" rx="8" ry="11" fill={dry?"#d0c8a0":"#f0f0ee"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(22 131 214)" opacity="0.88"/>
        <ellipse cx="149" cy="214" rx="8" ry="11" fill={dry?"#ccc898":"#eeeee8"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-22 149 214)" opacity="0.88"/>
        <ellipse cx="141" cy="209" rx="10" ry="13" fill={dry?"#d8d0a8":"#f8f8f4"} stroke="#5a3218" strokeWidth="1.2" opacity="0.92"/>
        <ellipse cx="141" cy="211" rx="6" ry="8" fill={dry?"#e0d8b0":"#fffff8"} opacity="0.9"/>
        <circle cx="141" cy="209" r="3.5" fill="#f8e060" stroke="#5a3218" strokeWidth="0.6"/>
      </g>}

      {/* Lily */}
      {showIn("lily") && <g>
        <rect x="165" y="216" width="5" height="16" rx="2.5" fill="#6a8840" stroke="#5a3218" strokeWidth="0.8"/>
        {[0,60,120,180,240,300].map((a,i)=>(
          <ellipse key={i} cx={168+Math.cos(a*Math.PI/180)*10} cy={215+Math.sin(a*Math.PI/180)*8}
            rx="6" ry="10" fill={dry?"#a0a8c0":i%2===0?"#98c0e0":"#b0d0ee"}
            stroke="#5a3218" strokeWidth="1"
            transform={`rotate(${a} ${168+Math.cos(a*Math.PI/180)*10} ${215+Math.sin(a*Math.PI/180)*8})`} opacity="0.88"/>
        ))}
        <circle cx="168" cy="215" r="5" fill="#f8e060" stroke="#5a3218" strokeWidth="0.8"/>
      </g>}

      {/* Peony */}
      {showIn("peony") && <g>
        <rect x="247" y="215" width="5" height="14" rx="2.5" fill="#6a9848" stroke="#5a3218" strokeWidth="0.8"/>
        <ellipse cx="238" cy="214" rx="8" ry="10" fill={dry?"#c0a098":"#c898cc"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(18 238 214)" opacity="0.82"/>
        <ellipse cx="262" cy="214" rx="8" ry="10" fill={dry?"#c0a098":"#c090c4"} stroke="#5a3218" strokeWidth="1.2" transform="rotate(-18 262 214)" opacity="0.82"/>
        <ellipse cx="250" cy="205" rx="13" ry="12" fill={dry?"#c8a8a0":"#d8a8dc"} stroke="#5a3218" strokeWidth="1.5" opacity="0.9"/>
        <ellipse cx="250" cy="207" rx="9" ry="9" fill={dry?"#d8b8b0":"#e8c0ec"} stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
        <ellipse cx="250" cy="209" rx="5.5" ry="5.5" fill={dry?"#e0c8c0":"#f4d8f8"} opacity="0.9"/>
        <circle cx="250" cy="209" r="3" fill="#f8e898" stroke="#5a3218" strokeWidth="0.6"/>
      </g>}

      {/* Swallows */}
      {showIn("swallow1") && <g transform="translate(164,68)">
        <path d="M0 0 C-6 -10 -18 -14 -28 -10 C-20 -7 -12 -2 -7 3 C-14 1 -20 4 -26 9 C-16 9 -8 6 0 0Z" fill="#5a6878" stroke="#5a3218" strokeWidth="0.8" opacity="0.9"/>
        <path d="M0 0 C6 -10 18 -14 28 -10 C20 -7 12 -2 7 3 C14 1 20 4 26 9 C16 9 8 6 0 0Z" fill="#5a6878" stroke="#5a3218" strokeWidth="0.8" opacity="0.9"/>
        <ellipse cx="0" cy="2" rx="5" ry="3" fill="#4a5868"/>
        <path d="M-1 5 L-6 12 L-2 10 L0 14 L2 10 L6 12 L1 5Z" fill="#4a5868"/>
      </g>}
      {showIn("swallow2") && <g>
        <g transform="translate(130,54) scale(0.85)">
          <path d="M0 0 C-6 -10 -18 -14 -28 -10 C-20 -7 -12 -2 -7 3 C-14 1 -20 4 -26 9 C-16 9 -8 6 0 0Z" fill="#5a6878" stroke="#5a3218" strokeWidth="0.9" opacity="0.88"/>
          <path d="M0 0 C6 -10 18 -14 28 -10 C20 -7 12 -2 7 3 C14 1 20 4 26 9 C16 9 8 6 0 0Z" fill="#5a6878" stroke="#5a3218" strokeWidth="0.9" opacity="0.88"/>
          <ellipse cx="0" cy="2" rx="5" ry="3" fill="#4a5868"/>
          <path d="M-1 5 L-6 12 L-2 10 L0 14 L2 10 L6 12 L1 5Z" fill="#4a5868"/>
        </g>
        <g transform="translate(226,76) scale(0.7) rotate(8)">
          <path d="M0 0 C-6 -10 -18 -14 -28 -10 C-20 -7 -12 -2 -7 3 C-14 1 -20 4 -26 9 C-16 9 -8 6 0 0Z" fill="#707888" opacity="0.85"/>
          <path d="M0 0 C6 -10 18 -14 28 -10 C20 -7 12 -2 7 3 C14 1 20 4 26 9 C16 9 8 6 0 0Z" fill="#707888" opacity="0.85"/>
          <ellipse cx="0" cy="2" rx="5" ry="3" fill="#5a6878"/>
          <path d="M-1 5 L-6 12 L-2 10 L0 14 L2 10 L6 12 L1 5Z" fill="#5a6878"/>
        </g>
      </g>}

      {/* Heart */}
      {showIn("heart") && <g>
        <path d="M195 92 C195 92 181 79 181 70 C181 63 186 60 190 62 C193 64 195 67 195 67 C195 67 197 64 200 62 C204 60 209 63 209 70 C209 79 195 92 195 92Z" fill="#f0788a" stroke="#5a3218" strokeWidth="2" opacity="0.9"/>
        <path d="M189 66 C190 63 192 62 194 63" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </g>}

      {/* Bridge */}
      {showIn("bridge") && <g>
        {[100,118,136,154,172,190,208,226,244,262,280].map((x,i)=>(
          <rect key={i} x={x} y={248+(x-190)**2/2200} width="20" height="8" rx="3" fill="#c89858" stroke="#5a3218" strokeWidth="1.2" opacity="0.92"/>
        ))}
        <path d="M100 248 Q195 222 290 248" fill="none" stroke="#a07840" strokeWidth="5" strokeLinecap="round"/>
        <path d="M100 248 Q195 222 290 248" fill="none" stroke="#c89858" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
        {[108,195,282].map((x,i)=>(
          <rect key={i} x={x-3} y={244+(x-195)**2/2400} width="6" height="26" rx="3" fill="#a07840" stroke="#5a3218" strokeWidth="1"/>
        ))}
        <path d="M100 270 Q195 258 290 270" fill="none" stroke="#a07840" strokeWidth="3.5" strokeLinecap="round"/>
      </g>}

      {/* Pagoda */}
      {showIn("pagoda") && <g>
        <ellipse cx="328" cy="235" rx="22" ry="5" fill="#5a3218" opacity="0.10"/>
        <rect x="308" y="220" width="40" height="14" rx="3" fill={dry?"#c8a060":"#d4a870"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M300 220 L328 204 L356 220Z" fill={dry?"#b88848":"#c89848"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M300 220 L356 220" fill="none" stroke="#5a3218" strokeWidth="1" opacity="0.3"/>
        <path d="M302 220 Q328 218 354 220" fill="none" stroke="#e0c080" strokeWidth="1.5" opacity="0.6"/>
        <rect x="312" y="204" width="32" height="16" rx="3" fill={dry?"#c8a060":"#d4a870"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M306 204 L328 188 L350 204Z" fill={dry?"#b88848":"#c89848"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M308 204 Q328 202 348 204" fill="none" stroke="#e0c080" strokeWidth="1.5" opacity="0.6"/>
        <rect x="316" y="188" width="24" height="16" rx="3" fill={dry?"#c8a060":"#d4a870"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M310 188 L328 172 L346 188Z" fill={dry?"#b88848":"#c89848"} stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M312 188 Q328 186 344 188" fill="none" stroke="#e0c080" strokeWidth="1.5" opacity="0.6"/>
        <rect x="325" y="164" width="6" height="9" rx="2" fill="#e8b840" stroke="#5a3218" strokeWidth="1"/>
        <circle cx="328" cy="162" r="4" fill="#f0c848" stroke="#5a3218" strokeWidth="0.8"/>
        <rect x="320" y="210" width="8" height="8" rx="2" fill="#e8d8a8" stroke="#5a3218" strokeWidth="0.8"/>
        <rect x="334" y="210" width="8" height="8" rx="2" fill="#e8d8a8" stroke="#5a3218" strokeWidth="0.8"/>
      </g>}

      {/* Lanterns */}
      {showIn("lantern") && <g>
        <rect x="22" y="185" width="7" height="42" rx="3.5" fill="#a07838" stroke="#5a3218" strokeWidth="1.2"/>
        <rect x="23" y="185" width="2.5" height="42" rx="1.5" fill="#c09850" opacity="0.5"/>
        <path d="M14 227 Q25.5 222 37 227" fill="#8a6028" stroke="#5a3218" strokeWidth="1.2"/>
        <ellipse cx="25.5" cy="226" rx="12" ry="4" fill="#a07838" stroke="#5a3218" strokeWidth="1.2"/>
        <rect x="14" y="226" width="23" height="30" rx="10" fill="#e86830" stroke="#5a3218" strokeWidth="1.5"/>
        <rect x="16" y="226" width="9" height="30" rx="5" fill="#f08050" opacity="0.35"/>
        <ellipse cx="25.5" cy="256" rx="12" ry="4" fill="#a07838" stroke="#5a3218" strokeWidth="1.2"/>
        <circle cx="25.5" cy="241" r="7" fill="#f8e060" opacity="0.45"/>
        <line x1="25.5" y1="260" x2="25.5" y2="268" stroke="#c8a030" strokeWidth="2" strokeLinecap="round"/>
      </g>}
      {showIn("lantern2") && <g>
        <path d="M18 172 Q55 180 98 172" fill="none" stroke="#a07838" strokeWidth="1.8"/>
        {[28,55,82].map((x,i)=>(
          <g key={i}>
            <line x1={x} y1="172" x2={x} y2="185" stroke="#a07838" strokeWidth="1.5"/>
            <ellipse cx={x} cy="184" rx="9" ry="3.5" fill="#8a6028" stroke="#5a3218" strokeWidth="1"/>
            <rect x={x-8} y="184" width="16" height="22" rx="7" fill={["#e86830","#d84880","#e8c030"][i]} stroke="#5a3218" strokeWidth="1.5"/>
            <rect x={x-6} y="184" width="6" height="22" rx="4" fill="white" opacity="0.18"/>
            <ellipse cx={x} cy="206" rx="9" ry="3.5" fill="#8a6028" stroke="#5a3218" strokeWidth="1"/>
            <circle cx={x} cy="195" r="5" fill="#f8e060" opacity="0.4"/>
            <line x1={x} y1="209.5" x2={x} y2="216" stroke="#c8a030" strokeWidth="1.8" strokeLinecap="round"/>
          </g>
        ))}
      </g>}

      {/* Fireflies */}
      {showIn("firefly") && <g>
        {[[45,190],[380,140],[200,185],[350,200],[80,160],[170,170],[310,185],[240,195],[130,180]].map(([x,y],i)=>(
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill="#f0e848" stroke="#c8b820" strokeWidth="0.6" opacity="0.95"/>
            <circle cx={x} cy={y} r="7" fill="#f8f060" opacity="0.18"/>
          </g>
        ))}
      </g>}

      {/* Moon gate */}
      {showIn("moongate") && <g>
        <rect x="143" y="155" width="10" height="75" rx="4" fill="#9a7848" stroke="#5a3218" strokeWidth="1.5"/>
        <rect x="237" y="155" width="10" height="75" rx="4" fill="#9a7848" stroke="#5a3218" strokeWidth="1.5"/>
        <circle cx="195" cy="165" r="52" fill="none" stroke="#c8a860" strokeWidth="7" opacity="0.85"/>
        <path d="M145 180 Q148 168 152 156" fill="none" stroke="#7a9848" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
        <ellipse cx="149" cy="170" rx="8" ry="5" fill="#90aa58" stroke="#5a3218" strokeWidth="0.8" transform="rotate(-30 149 170)" opacity="0.8"/>
        <path d="M244 178 Q240 166 236 155" fill="none" stroke="#7a9848" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
        <ellipse cx="241" cy="168" rx="8" ry="5" fill="#90aa58" stroke="#5a3218" strokeWidth="0.8" transform="rotate(30 241 168)" opacity="0.8"/>
        <circle cx="188" cy="156" r="8" fill="#f8e8a8" opacity="0.55"/>
        <circle cx="193" cy="153" r="5" fill="#f8e8a8" opacity="0.4"/>
      </g>}

      {/* ── INDOOR ITEMS ── only visible in cuarto view */}

      {/* Rug */}
      {showIn("rug") && <g>
        <rect x="82" y="242" width="226" height="44" rx="8" fill="#d4b880" stroke="#5a3218" strokeWidth="1.8" opacity="0.92"/>
        <rect x="88" y="247" width="214" height="34" rx="5" fill="#e8c898" opacity="0.6"/>
        {[0,1,2,3,4,5,6,7,8,9].map(i=>(
          <rect key={i} x={90+i*22} y="249" width="10" height="8" rx="2" fill="#c89848" opacity="0.5"/>
        ))}
        <path d="M195 250 L210 264 L195 278 L180 264Z" fill="none" stroke="#a07830" strokeWidth="1.5" opacity="0.6"/>
        <circle cx="195" cy="264" r="6" fill="#c07838" opacity="0.45"/>
        {[88,106,124,142,160,178,196,214,232,250,268,286,304].map((x,i)=>(
          <line key={i} x1={x} y1="286" x2={x+2} y2="293" stroke="#a07838" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        ))}
        {[88,106,124,142,160,178,196,214,232,250,268,286,304].map((x,i)=>(
          <line key={i} x1={x} y1="242" x2={x+2} y2="235" stroke="#a07838" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        ))}
      </g>}

      {/* Fairy lights */}
      {showIn("fairy_lights") && <g>
        <path d="M0 30 Q50 38 100 30 Q150 38 200 30 Q250 38 300 30 Q350 38 390 30" fill="none" stroke="#c8a840" strokeWidth="1.5" opacity="0.8"/>
        {[15,42,68,95,122,148,175,202,228,255,280,308,335,362].map((x,i)=>(
          <g key={i}>
            <path d={`M${x} ${30+Math.sin(i)*3} L${x-4} ${38+Math.sin(i)*3} L${x+4} ${38+Math.sin(i)*3}Z`}
              fill={["#f8e048","#f8a0b0","#98d0f0","#b0e8a8"][i%4]} stroke="#5a3218" strokeWidth="0.8" opacity="0.92"/>
            <circle cx={x} cy={30+Math.sin(i)*3} r="2.5" fill="#c8a840" stroke="#5a3218" strokeWidth="0.6"/>
            <circle cx={x} cy={40+Math.sin(i)*3} r="7" fill={["#f8e048","#f8a0b0","#98d0f0","#b0e8a8"][i%4]} opacity="0.15"/>
          </g>
        ))}
      </g>}

      {/* Shelf */}
      {showIn("shelf") && <g>
        <rect x="8" y="98" width="70" height="95" rx="5" fill="#c8a070" stroke="#5a3218" strokeWidth="2"/>
        <rect x="8" y="98" width="24" height="95" rx="3" fill="#b88c58" opacity="0.4"/>
        {[98,140,178].map((y,i)=>(
          <rect key={i} x="6" y={y} width="74" height="7" rx="3" fill="#9a7038" stroke="#5a3218" strokeWidth="1.5"/>
        ))}
        {[{x:12,h:26,w:8,c:"#c87858"},{x:21,h:22,w:7,c:"#8898d0"},{x:29,h:28,w:9,c:"#88b870"},{x:39,h:24,w:8,c:"#e8c060"},{x:48,h:26,w:9,c:"#c080c8"},{x:58,h:20,w:9,c:"#e88060"}].map((b,i)=>(
          <g key={i}>
            <rect x={b.x} y={139-b.h} width={b.w} height={b.h} rx="1.5" fill={b.c} stroke="#5a3218" strokeWidth="0.8"/>
            <rect x={b.x} y={139-b.h} width={b.w} height="4" rx="1" fill="white" opacity="0.25"/>
          </g>
        ))}
        {[{x:12,h:20,w:8,c:"#d09050"},{x:21,h:24,w:8,c:"#7888d8"},{x:30,h:18,w:9,c:"#d06858"},{x:40,h:22,w:8,c:"#58c0a0"},{x:49,h:18,w:10,c:"#f0a0b8"}].map((b,i)=>(
          <g key={i}>
            <rect x={b.x} y={177-b.h} width={b.w} height={b.h} rx="1.5" fill={b.c} stroke="#5a3218" strokeWidth="0.8"/>
            <rect x={b.x} y={177-b.h} width={b.w} height="4" rx="1" fill="white" opacity="0.25"/>
          </g>
        ))}
        <rect x="62" y="88" width="10" height="10" rx="3" fill="#e8c878" stroke="#5a3218" strokeWidth="1"/>
        <circle cx="67" cy="84" r="5" fill="#d8a858" stroke="#5a3218" strokeWidth="1"/>
        <rect x="6" y="98" width="4" height="95" rx="2" fill="#a07038" stroke="#5a3218" strokeWidth="1"/>
        <rect x="74" y="98" width="4" height="95" rx="2" fill="#a07038" stroke="#5a3218" strokeWidth="1"/>
      </g>}

      {/* Lamp */}
      {showIn("lamp") && <g>
        <ellipse cx="322" cy="274" rx="22" ry="7" fill="#9a7848" stroke="#5a3218" strokeWidth="1.5"/>
        <ellipse cx="322" cy="271" rx="16" ry="5" fill="#b09060" opacity="0.6"/>
        <rect x="319" y="170" width="7" height="104" rx="3.5" fill="#b09060" stroke="#5a3218" strokeWidth="1.5"/>
        <rect x="320" y="170" width="2.5" height="104" rx="1.5" fill="#d0b080" opacity="0.5"/>
        <path d="M298 172 Q322 142 346 172Z" fill="#f0e8c0" stroke="#5a3218" strokeWidth="1.8"/>
        <path d="M299 172 L345 172" fill="none" stroke="#5a3218" strokeWidth="1.5"/>
        <path d="M304 166 Q322 148 340 166" fill="none" stroke="#d4b870" strokeWidth="1" opacity="0.6"/>
        <circle cx="322" cy="168" r="8" fill="#f8e878" opacity="0.6"/>
        <ellipse cx="322" cy="190" rx="34" ry="16" fill="#f8e878" opacity="0.12"/>
      </g>}

      {/* Cushions */}
      {showIn("cushions") && <g>
        <rect x="122" y="242" width="58" height="36" rx="12" fill="#f0c0c8" stroke="#5a3218" strokeWidth="1.8"/>
        <rect x="126" y="246" width="50" height="28" rx="9" fill="#f8d0d8" opacity="0.6"/>
        <circle cx="151" cy="260" r="4" fill="#e0a8b0" stroke="#5a3218" strokeWidth="0.8"/>
        <rect x="190" y="240" width="62" height="38" rx="12" fill="#b8c898" stroke="#5a3218" strokeWidth="1.8"/>
        <rect x="194" y="244" width="54" height="30" rx="9" fill="#c8d8a8" opacity="0.6"/>
        <circle cx="221" cy="259" r="4" fill="#98a878" stroke="#5a3218" strokeWidth="0.8"/>
        <circle cx="268" cy="258" r="16" fill="#d8b880" stroke="#5a3218" strokeWidth="1.5"/>
        <circle cx="268" cy="258" r="10" fill="#e8c890" opacity="0.7"/>
        <circle cx="268" cy="258" r="4" fill="#c8a060" stroke="#5a3218" strokeWidth="0.8"/>
      </g>}

      {/* Indoor plant */}
      {showIn("indoor_plant") && <g>
        <ellipse cx="362" cy="278" rx="18" ry="5" fill="#5a3218" opacity="0.10"/>
        <path d="M346 270 L348 280 Q362 285 376 280 L378 270Z" fill="#c87848" stroke="#5a3218" strokeWidth="1.8"/>
        <path d="M346 270 L348 280 Q362 285 376 280 L378 270Z" fill="#e89060" opacity="0.4"/>
        <ellipse cx="362" cy="270" rx="16" ry="6" fill="#d88858" stroke="#5a3218" strokeWidth="1.5"/>
        <ellipse cx="362" cy="268" rx="12" ry="4" fill="#e89868" opacity="0.6"/>
        <ellipse cx="362" cy="270" rx="12" ry="3.5" fill="#8a6030" opacity="0.8"/>
        <rect x="360" y="248" width="4" height="22" rx="2" fill="#7a9840" stroke="#5a3218" strokeWidth="0.8"/>
        <path d="M362 258 C362 258 345 242 340 228 C348 236 356 248 362 255Z" fill="#6a9840" stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
        <path d="M362 255 C362 255 379 239 384 225 C376 234 368 246 362 253Z" fill="#78aa50" stroke="#5a3218" strokeWidth="1.2" opacity="0.9"/>
        <path d="M362 264 C362 264 348 252 344 240 C350 246 358 256 362 262Z" fill="#7aaa58" stroke="#5a3218" strokeWidth="1" opacity="0.82"/>
        <path d="M349 237 L352 243" fill="none" stroke="#5a3218" strokeWidth="0.8" opacity="0.5"/>
        <path d="M374 234 L371 240" fill="none" stroke="#5a3218" strokeWidth="0.8" opacity="0.5"/>
      </g>}

      {/* Dryness crack overlay */}
      {dry && <g>
        <path d="M50 250 L60 265 L55 275" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.4"/>
        <path d="M180 255 L170 268 L178 278" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.35"/>
        <path d="M300 248 L308 260 L302 270" fill="none" stroke="#a08030" strokeWidth="1.5" opacity="0.4"/>
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
              <CouplePandaSVG happy={mochiHappy} size={140} accessories={accessories}/>
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
            const val = shopTab === "accesorios" ? accessories?.[item.id] : garden?.[item.id];
            const currentLoc = indoor ? "indoor" : "garden";
            const placedHere = val === currentLoc || val === true;
            const ownedElsewhere = val && val !== currentLoc && val !== "owned" && val !== true;
            const ownedNotPlaced = val === "owned";
            const owned = val && val !== false;
            const POND_DEPS = ["koi1", "koi2", "lotus_pad"];
            const locked = shopTab !== "accesorios" && POND_DEPS.includes(item.id) && !garden?.pond && !owned;
            return (
              <div key={item.id} onClick={() => shopTab==="accesorios" ? onBuyAccessory(item) : onBuy({...item, location: currentLoc})}
                style={{ background:placedHere?"#d4e8c4":ownedNotPlaced||ownedElsewhere?"#f0e8f8":locked?"#f0ede8":C.sandL,
                  border:`2px solid ${placedHere?C.olive:ownedNotPlaced||ownedElsewhere?"#c0a0d8":locked?C.sand:C.border}`,
                  borderRadius:16, padding:"12px 10px", textAlign:"center", cursor:locked?"default":"pointer",
                  minWidth:84, flexShrink:0, opacity:locked?0.6:1,
                  boxShadow:owned?`0 3px 0 ${placedHere?C.olive:"#c0a0d8"}50`:`0 2px 0 ${C.border}`,
                  transition:"all 0.15s" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:4 }}>
                  {shopTab === "accesorios"
                    ? <div style={{ fontSize:"1.8rem" }}>{item.emoji}</div>
                    : <GardenItemIcon id={item.id} size={38}/>}
                </div>
                <div style={{ fontSize:"0.67rem", fontWeight:800, color:C.ink, marginBottom:2, lineHeight:1.2 }}>{item.name}</div>
                <div style={{ fontSize:"0.62rem", color:C.inkL, marginBottom:5, lineHeight:1.2 }}>{locked ? "🔒 Requiere Estanque" : item.desc}</div>
                {placedHere
                  ? <div style={{ background:C.olive, color:C.cream2, borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>✓ puesto</div>
                  : ownedNotPlaced
                  ? <div style={{ background:"#b080d8", color:"#fff", borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>+ poner</div>
                  : ownedElsewhere
                  ? <div style={{ background:"#b080d8", color:"#fff", borderRadius:6, padding:"2px 7px", fontSize:"0.65rem", fontWeight:800 }}>↗ mover aquí</div>
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
function Burbuja({ burbuja, onSaveMine, onPropose, onApprove, onDelete, onEdit, user }) {
  const { nameA, nameB } = getCoupleNames(user);
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const myName = myRole === "owner" ? nameA : nameB;
  const partnerName = myRole === "owner" ? nameB : nameA;
  const [activeTab, setActiveTab] = useState("negociacion");
  const [newAgreementText, setNewAgreementText] = useState("");
  const [prefix, setPrefix] = useState("El acuerdo es…");
  const [counterText, setCounterText] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const PREFIXES = [
    "El acuerdo es…",
    "Prometemos…",
    "Queda prohibido…",
    "Siempre vamos a…",
    "En caso de pelea…",
    "Cuando alguno de los dos…",
    "Los dos acordamos…",
  ];

  const allEntries = Object.entries(burbuja || {});
  const pendingEntries = allEntries.filter(([, v]) => v?.status === "pending" && v?.proposalText);
  const approvedEntries = allEntries.filter(([, v]) => v?.status === "approved");
  const pendingForMe = pendingEntries.filter(([, v]) => v?.proposalBy !== myRole);
  const pendingByMe = pendingEntries.filter(([, v]) => v?.proposalBy === myRole);

  const handlePropose = () => {
    const text = newAgreementText.trim();
    if (!text) return;
    const id = `acuerdo_${Date.now()}`;
    onPropose(id, text, false, prefix);
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
  const getPrefix = (v) => v?.prefix || "El acuerdo es…";

  const startEdit = (id, v) => {
    setEditingId(id);
    setEditText(getLabel(v));
  };

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
            <div style={{ fontSize:"0.82rem", color:C.inkM, lineHeight:1.6 }}><b>Negociación:</b> Cualquiera propone un acuerdo con el formato que elijas. Le llega al otro, quien puede aprobarlo o proponer un ajuste.</div>
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
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, marginBottom:6 }}>¿Cómo empieza?</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {PREFIXES.map(p => (
                      <div key={p} onClick={() => setPrefix(p)}
                        style={{ padding:"5px 10px", borderRadius:20, fontSize:"0.72rem", fontWeight:700, cursor:"pointer",
                          background:prefix===p?"#6a3cbf":C.sandL, color:prefix===p?"#fff":C.inkM,
                          border:`1.5px solid ${prefix===p?"#6a3cbf":C.border}`, transition:"all 0.15s" }}>
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background:C.sandL, borderRadius:10, padding:"10px 12px", marginBottom:10, border:`1px solid ${C.border}` }}>
                  <span style={{ fontWeight:800, color:C.olive, fontSize:"0.88rem" }}>{prefix} </span>
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
                      <span style={{ fontWeight:800, color:"#6a3cbf", fontSize:"0.84rem" }}>{getPrefix(v)} </span>
                      <span style={{ fontSize:"0.9rem", color:C.ink, fontWeight:700 }}>{getLabel(v)}</span>
                    </div>
                    <Btn onClick={() => onApprove(id)} style={{ width:"100%", background:"#6a3cbf", color:"#fff", marginBottom:8, fontSize:"0.88rem" }}>✅ Aprobar este acuerdo</Btn>
                    <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, marginBottom:6 }}>¿Quieres negociar?</div>
                    <TA value={counterText[id] || ""} onChange={v2 => setCounterText(p => ({ ...p, [id]: v2 }))} placeholder="Escribe tu versión ajustada..." rows={2} style={{ marginBottom:8 }}/>
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
                      <span style={{ fontWeight:800, color:C.inkL, fontSize:"0.84rem" }}>{getPrefix(v)} </span>
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
                      <div style={{ fontSize:"0.64rem", fontWeight:800, color:C.olive, letterSpacing:"0.4px", flex:1 }}>ACUERDO DE {(nameA+" & "+nameB).toUpperCase()}</div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => startEdit(id, v)}
                          style={{ background:"#ede5ff", border:"none", borderRadius:8, padding:"4px 8px", fontSize:"0.7rem", cursor:"pointer", color:"#6a3cbf", fontWeight:700 }}>✏️ Editar</button>
                        <button onClick={() => { if(window.confirm("¿Eliminar este acuerdo?")) onDelete(id); }}
                          style={{ background:"#ffeded", border:"none", borderRadius:8, padding:"4px 8px", fontSize:"0.7rem", cursor:"pointer", color:"#c05050", fontWeight:700 }}>🗑</button>
                      </div>
                    </div>
                    {editingId === id ? (
                      <div>
                        <TA value={editText} onChange={setEditText} rows={3} style={{ marginBottom:8 }}/>
                        <div style={{ display:"flex", gap:8 }}>
                          <Btn onClick={() => { onEdit(id, editText.trim()); setEditingId(null); }} style={{ flex:1, background:"#6a3cbf", color:"#fff", fontSize:"0.84rem" }}>Guardar</Btn>
                          <Btn onClick={() => setEditingId(null)} variant="ghost" style={{ padding:"10px 14px" }}>✕</Btn>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background:"linear-gradient(135deg, #f0ebff 0%, #ede5ff 100%)", borderRadius:12, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                        <span style={{ fontWeight:800, color:"#6a3cbf", fontSize:"0.88rem" }}>{getPrefix(v)} </span>
                        <span style={{ fontSize:"0.92rem", color:C.ink, fontWeight:700, lineHeight:1.6 }}>{getLabel(v)}</span>
                      </div>
                    )}
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
];}

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
      if (POND_DEPS.includes(item.id) && !safeGarden.pond && !safeGarden[item.id]) {
        toast("Necesitas el Estanque primero 🪷");
        return;
      }
      const currentVal = safeGarden[item.id];
      // Si el item ya está colocado en ESTE lugar → quitar (pasa a "owned")
      if (currentVal === currentLoc) {
        const ng = { ...safeGarden, [item.id]: "owned" };
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        setGarden(ng);
        toast(`${item.name} quitado`);
        save(null, { bamboo, happiness, water, garden: ng, accessories, exDone, messages, conoce, burbuja, coupleInfo, lastVisit: new Date().toISOString(), testScores, lessonsDone, gratitud, momentos });
        return;
      }
      // Si el item ya es "owned" o está en otro lugar → ponerlo en lugar actual (sin costo)
      if (currentVal === "owned" || (currentVal && currentVal !== currentLoc)) {
        const ng = { ...safeGarden, [item.id]: currentLoc };
        if (user?.code && !user?.isGuest) {
          fbSaveGardenState(user.code, { garden: ng, accessories, water, happiness }).catch(() => {});
        }
        setGarden(ng);
        toast(`${item.name} puesto en ${currentLoc === "indoor" ? "cuarto" : "jardín"}`);
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

  const proposeBurbuja = async (id, text, isCounter = false, prefix = "El acuerdo es…") => {
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
      prefix: isCounter ? (prev.prefix || prefix) : prefix,
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

  const deleteBurbuja = async (id) => {
    const map = { ...burbuja };
    delete map[id];
    setBurbuja(map);
    if (user?.code && !user?.isGuest) {
      fbDeleteBurbuja(user.code, id).catch(() => {});
    }
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
    toast("Acuerdo eliminado");
  };

  const editBurbuja = async (id, newText) => {
    const prev = burbuja[id] || {};
    const next = { ...prev, approvedText: newText };
    const map = { ...burbuja, [id]: next };
    setBurbuja(map);
    if (user?.code && !user?.isGuest) {
      fbSaveBurbuja(user.code, id, next).catch(() => {});
    }
    save(null, { bamboo, happiness, water, garden, accessories, exDone, messages, conoce, burbuja:map, coupleInfo, lastVisit, testScores, lessonsDone, gratitud, momentos });
    toast("Acuerdo actualizado ✓");
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
        {tab==="burbuja" && <Burbuja burbuja={burbuja} onSaveMine={saveBurbujaMine} onPropose={proposeBurbuja} onApprove={approveBurbuja} onDelete={deleteBurbuja} onEdit={editBurbuja} user={user}/>}
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

