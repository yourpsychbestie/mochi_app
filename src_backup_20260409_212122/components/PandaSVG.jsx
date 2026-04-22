import { C } from '../constants/colors';
import { PANDA_ACCESSORIES } from '../constants/gardenItems';

export function CouplePandaSVG({ happy = false, size = 160 }) {
  const s = size;
  // Redesigned pandas: soft, chubby, chibi-style with smooth shapes
  // Lots of gradients & soft shadows to avoid "geometric pieces" look
  // Left panda (she): slightly rounder, tiny flower behind ear, tilted head
  // Right panda (he): slightly taller, little cow-lick tuft, leaning in
  // Both sitting close, arms around each other
  return (
    <svg viewBox="0 0 260 220" width={s} height={s * 0.846} style={{ display: "block" }}>
      <defs>
        {/* Soft fur gradient for bodies */}
        <radialGradient id="bodyL" cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fdf9f0"/>
          <stop offset="100%" stopColor="#ede4d0"/>
        </radialGradient>
        <radialGradient id="bodyR" cx="55%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fdf9f0"/>
          <stop offset="100%" stopColor="#ede4d0"/>
        </radialGradient>
        <radialGradient id="patchL" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#2d3d2d"/>
          <stop offset="100%" stopColor="#1a261a"/>
        </radialGradient>
        <radialGradient id="patchR" cx="60%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#2d3d2d"/>
          <stop offset="100%" stopColor="#1a261a"/>
        </radialGradient>
        <radialGradient id="tummy" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fefcf6"/>
          <stop offset="100%" stopColor="#f5eede"/>
        </radialGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1a261a" floodOpacity="0.12"/>
        </filter>
        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f8d0e8" floodOpacity="0.6"/>
        </filter>
      </defs>

      {/* ══════════════════════════════════════ */}
      {/* LEFT PANDA — she, sitting, head tilted right */}
      {/* ══════════════════════════════════════ */}

      {/* Shadow under left panda */}
      <ellipse cx="82" cy="208" rx="42" ry="7" fill="#1a261a" opacity="0.08"/>

      {/* Body — chubby teardrop shape */}
      <path d="M52 205 C35 205 28 185 30 165 C32 145 42 132 62 128 C72 126 82 126 92 128 C112 132 122 145 122 165 C124 185 117 205 100 205 Z"
        fill="url(#bodyL)" filter="url(#softShadow)"/>

      {/* Tummy highlight — soft oval */}
      <ellipse cx="76" cy="168" rx="18" ry="22" fill="url(#tummy)" opacity="0.9"/>

      {/* Left arm (her right arm) — reaching toward right panda, around his shoulder */}
      <path d="M116 150 C128 142 142 140 150 145 C155 148 152 158 145 158 C138 158 130 155 120 158"
        fill="none" stroke="#1a261a" strokeWidth="16" strokeLinecap="round"/>
      <path d="M116 150 C128 142 142 140 150 145 C155 148 152 158 145 158"
        fill="none" stroke="#2d3d2d" strokeWidth="13" strokeLinecap="round"/>

      {/* Right arm (her left arm) — down at side */}
      <path d="M38 158 C28 165 24 178 28 188" fill="none" stroke="#1a261a" strokeWidth="15" strokeLinecap="round"/>
      <path d="M38 158 C28 165 24 178 28 188" fill="none" stroke="#2d3d2d" strokeWidth="12" strokeLinecap="round"/>

      {/* Legs — chubby, peeking out */}
      <ellipse cx="57" cy="198" rx="20" ry="12" fill="#1a261a"/>
      <ellipse cx="57" cy="196" rx="17" ry="10" fill="#2d3d2d"/>
      <ellipse cx="98" cy="198" rx="20" ry="12" fill="#1a261a"/>
      <ellipse cx="98" cy="196" rx="17" ry="10" fill="#2d3d2d"/>
      {/* Foot pads */}
      <ellipse cx="57" cy="205" rx="11" ry="6" fill="#f0e8d8" opacity="0.6"/>
      <ellipse cx="98" cy="205" rx="11" ry="6" fill="#f0e8d8" opacity="0.6"/>

      {/* HEAD — tilted, minimalist cute face */}
      <g transform="rotate(6, 76, 95)">
        {/* Head — slightly wider than tall, soft */}
        <ellipse cx="76" cy="88" rx="44" ry="42" fill="url(#bodyL)" filter="url(#softShadow)"/>

        {/* Ears — compact, not huge */}
        <circle cx="42" cy="54" r="16" fill="#1a261a"/>
        <circle cx="42" cy="54" r="10" fill="#2d3d2d"/>
        <circle cx="110" cy="54" r="16" fill="#1a261a"/>
        <circle cx="110" cy="54" r="10" fill="#2d3d2d"/>
        {/* Inner ear blush */}
        <circle cx="42" cy="54" r="6" fill="#d87888" opacity="0.25"/>
        <circle cx="110" cy="54" r="6" fill="#d87888" opacity="0.25"/>

        {/* Eye patches — smaller, almond-shaped, not too dominant */}
        <ellipse cx="60" cy="85" rx="13" ry="11" fill="url(#patchL)" transform="rotate(-10 60 85)"/>
        <ellipse cx="92" cy="85" rx="13" ry="11" fill="url(#patchR)" transform="rotate(10 92 85)"/>

        {/* Eyes — smaller, more almond/crescent, less bulgy */}
        {happy ? (
          <>
            {/* Happy — gentle curved crescents */}
            <path d="M53 85 Q60 92 67 85" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/>
            <path d="M85 85 Q92 92 99 85" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/>
          </>
        ) : (
          <>
            {/* Normal — almond-shaped, not round balls */}
            <ellipse cx="60" cy="86" rx="7" ry="6" fill="#fdf9f0"/>
            <ellipse cx="92" cy="86" rx="7" ry="6" fill="#fdf9f0"/>
            <ellipse cx="61" cy="87" rx="4.5" ry="4" fill="#1a1a2a"/>
            <ellipse cx="93" cy="87" rx="4.5" ry="4" fill="#1a1a2a"/>
            {/* Tiny shine — just one dot */}
            <circle cx="63" cy="85" r="1.6" fill="white"/>
            <circle cx="95" cy="85" r="1.6" fill="white"/>
          </>
        )}

        {/* Nose — small oval, simple */}
        <ellipse cx="76" cy="97" rx="4" ry="2.8" fill="#1a261a" opacity="0.7"/>

        {/* Mouth — small w-shape */}
        {happy
          ? <path d="M68 104 Q72 110 76 106 Q80 110 84 104" fill="none" stroke="#1a261a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M70 103 Q73 107 76 104 Q79 107 82 103" fill="none" stroke="#1a261a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        }

        {/* Blush — subtle small */}
        <ellipse cx="44" cy="98" rx="10" ry="6" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>
        <ellipse cx="108" cy="98" rx="10" ry="6" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>

        {/* Little flower behind ear */}
        <g transform="translate(106, 46)">
          {[0,60,120,180,240,300].map((a,i) => (
            <ellipse key={i}
              cx={Math.cos(a*Math.PI/180)*6} cy={Math.sin(a*Math.PI/180)*6}
              rx="3.5" ry="2.8"
              fill={["#f9b8cc","#f4d0e0","#fce8f0","#f9b8cc","#f4d0e0","#fce8f0"][i]}
              transform={`rotate(${a})`} opacity="0.95"/>
          ))}
          <circle cx="0" cy="0" r="3" fill="#f8e870"/>
        </g>
      </g>

      {/* ══════════════════════════════════════ */}
      {/* RIGHT PANDA — he, sitting upright */}
      {/* ══════════════════════════════════════ */}

      {/* Shadow */}
      <ellipse cx="182" cy="208" rx="44" ry="7" fill="#1a261a" opacity="0.08"/>

      {/* Body */}
      <path d="M148 205 C131 205 124 185 126 165 C128 144 138 131 160 128 C170 126 182 126 194 128 C214 131 224 145 224 165 C226 185 219 205 202 205 Z"
        fill="url(#bodyR)" filter="url(#softShadow)"/>

      {/* Tummy */}
      <ellipse cx="176" cy="168" rx="19" ry="23" fill="url(#tummy)" opacity="0.9"/>

      {/* Left arm (his right arm) — around her, coming from side */}
      <path d="M134 148 C126 140 118 138 112 142 C108 145 110 155 116 156"
        fill="none" stroke="#1a261a" strokeWidth="16" strokeLinecap="round"/>
      <path d="M134 148 C126 140 118 138 112 142 C108 145 110 155 116 156"
        fill="none" stroke="#2d3d2d" strokeWidth="13" strokeLinecap="round"/>

      {/* Right arm — down at side */}
      <path d="M218 158 C228 165 232 178 228 188" fill="none" stroke="#1a261a" strokeWidth="15" strokeLinecap="round"/>
      <path d="M218 158 C228 165 232 178 228 188" fill="none" stroke="#2d3d2d" strokeWidth="12" strokeLinecap="round"/>

      {/* Legs */}
      <ellipse cx="157" cy="198" rx="21" ry="12" fill="#1a261a"/>
      <ellipse cx="157" cy="196" rx="18" ry="10" fill="#2d3d2d"/>
      <ellipse cx="198" cy="198" rx="21" ry="12" fill="#1a261a"/>
      <ellipse cx="198" cy="196" rx="18" ry="10" fill="#2d3d2d"/>
      <ellipse cx="157" cy="205" rx="12" ry="6" fill="#f0e8d8" opacity="0.6"/>
      <ellipse cx="198" cy="205" rx="12" ry="6" fill="#f0e8d8" opacity="0.6"/>

      {/* HEAD — upright, compact */}
      <g transform="rotate(-4, 176, 90)">
        {/* Head — slightly wider than tall */}
        <ellipse cx="176" cy="88" rx="46" ry="44" fill="url(#bodyR)" filter="url(#softShadow)"/>

        {/* Ears — compact */}
        <circle cx="140" cy="52" r="17" fill="#1a261a"/>
        <circle cx="140" cy="52" r="11" fill="#2d3d2d"/>
        <circle cx="140" cy="52" r="6" fill="#d87888" opacity="0.25"/>

        <circle cx="212" cy="52" r="17" fill="#1a261a"/>
        <circle cx="212" cy="52" r="11" fill="#2d3d2d"/>
        <circle cx="212" cy="52" r="6" fill="#d87888" opacity="0.25"/>

        {/* Eye patches — smaller, almond */}
        <ellipse cx="162" cy="87" rx="14" ry="12" fill="url(#patchL)" transform="rotate(-8 162 87)"/>
        <ellipse cx="190" cy="87" rx="14" ry="12" fill="url(#patchR)" transform="rotate(8 190 87)"/>

        {/* Eyes — almond, not round balls */}
        {happy ? (
          <>
            <path d="M155 87 Q162 94 169 87" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/>
            <path d="M183 87 Q190 94 197 87" fill="none" stroke="#fdf9f0" strokeWidth="3" strokeLinecap="round"/>
          </>
        ) : (
          <>
            <ellipse cx="162" cy="88" rx="7" ry="6" fill="#fdf9f0"/>
            <ellipse cx="190" cy="88" rx="7" ry="6" fill="#fdf9f0"/>
            <ellipse cx="163" cy="89" rx="4.5" ry="4" fill="#1a1a2a"/>
            <ellipse cx="191" cy="89" rx="4.5" ry="4" fill="#1a1a2a"/>
            <circle cx="165" cy="87" r="1.6" fill="white"/>
            <circle cx="193" cy="87" r="1.6" fill="white"/>
          </>
        )}

        {/* Nose — small, simple */}
        <ellipse cx="176" cy="100" rx="4" ry="2.8" fill="#1a261a" opacity="0.7"/>

        {/* Mouth — w-shape */}
        {happy
          ? <path d="M168 107 Q172 113 176 109 Q180 113 184 107" fill="none" stroke="#1a261a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M170 106 Q173 110 176 107 Q179 110 182 106" fill="none" stroke="#1a261a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        }

        {/* Blush — subtle */}
        <ellipse cx="140" cy="102" rx="11" ry="7" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>
        <ellipse cx="212" cy="102" rx="11" ry="7" fill="#f0907a" opacity={happy ? "0.4" : "0.15"}/>

        {/* Cow-lick tuft — same but proportional */}
        <path d="M172 40 C170 30 168 22 172 16" fill="none" stroke="#1a261a" strokeWidth="4" strokeLinecap="round"/>
        <path d="M177 41 C179 31 182 24 178 18" fill="none" stroke="#1a261a" strokeWidth="3" strokeLinecap="round"/>
        <path d="M167 41 C163 33 161 27 163 21" fill="none" stroke="#1a261a" strokeWidth="2.5" strokeLinecap="round"/>
      </g>

      {/* ══ BETWEEN THEM ══ */}
      {happy && (
        <>
          {/* Floating heart */}
          <g filter="url(#softGlow)">
            <path d="M122 100 C122 95 126 93 130 97 C134 93 138 95 138 100 C138 106 130 115 130 115 C130 115 122 106 122 100Z"
              fill="#e8607a" opacity="0.95"/>
          </g>
          {/* Small hearts */}
          <path d="M106 78 C106 75 108 74 110 76 C112 74 114 75 114 78 C114 81 110 85 110 85 C110 85 106 81 106 78Z"
            fill="#f4a0b8" opacity="0.7"/>
          <path d="M144 72 C144 70 145.5 69 147 71 C148.5 69 150 70 150 72 C150 74.5 147 78 147 78 C147 78 144 74.5 144 72Z"
            fill="#f4a0b8" opacity="0.6"/>
          {/* Stars */}
          <path d="M12 38 L14 44 L20 44 L15 48 L17 54 L12 50 L7 54 L9 48 L4 44 L10 44Z" fill="#d4a843" opacity="0.85"/>
          <path d="M240 32 L241.5 37 L247 37 L242.5 40.5 L244 46 L240 43 L236 46 L237.5 40.5 L233 37 L238.5 37Z" fill="#d4a843" opacity="0.8"/>
          <circle cx="130" cy="142" r="3" fill="#f8e0a0" opacity="0.75"/>
          <circle cx="108" cy="130" r="2" fill="#f9b8cc" opacity="0.7"/>
          <circle cx="152" cy="128" r="2" fill="#f9b8cc" opacity="0.65"/>
        </>
      )}

      {/* Always-visible tiny sparkles */}
      <circle cx="20" cy="55" r="1.5" fill="#f8e8c0" opacity="0.5"/>
      <circle cx="240" cy="60" r="1.5" fill="#f8e8c0" opacity="0.5"/>
    </svg>
  );
}

// Small side-view single panda for login
export function SinglePandaSVG({ size = 100 }) {
  return (
    <svg viewBox="0 0 160 200" width={size} height={size * 1.25} style={{ display: "block" }}>
      <defs>
        <radialGradient id="sb" cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fdf9f0"/><stop offset="100%" stopColor="#ede4d0"/>
        </radialGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="80" cy="196" rx="38" ry="6" fill="#1a261a" opacity="0.1"/>
      {/* Body */}
      <path d="M42 195 C28 195 22 175 24 155 C26 138 38 126 58 122 C66 120 80 120 94 122 C114 126 126 138 128 155 C130 175 124 195 110 195Z" fill="url(#sb)"/>
      {/* Tummy */}
      <ellipse cx="76" cy="162" rx="20" ry="24" fill="#fefcf6" opacity="0.85"/>
      {/* Legs */}
      <ellipse cx="57" cy="190" rx="18" ry="10" fill="#1a261a"/>
      <ellipse cx="97" cy="190" rx="18" ry="10" fill="#1a261a"/>
      <ellipse cx="57" cy="196" rx="12" ry="5" fill="#f0e8d8" opacity="0.5"/>
      <ellipse cx="97" cy="196" rx="12" ry="5" fill="#f0e8d8" opacity="0.5"/>
      {/* Arms */}
      <path d="M34 150 C24 158 20 172 24 180" fill="none" stroke="#1a261a" strokeWidth="13" strokeLinecap="round"/>
      <path d="M34 150 C24 158 20 172 24 180" fill="none" stroke="#2d3d2d" strokeWidth="10" strokeLinecap="round"/>
      <path d="M118 150 C128 158 132 172 128 180" fill="none" stroke="#1a261a" strokeWidth="13" strokeLinecap="round"/>
      <path d="M118 150 C128 158 132 172 128 180" fill="none" stroke="#2d3d2d" strokeWidth="10" strokeLinecap="round"/>
      {/* Head */}
      <circle cx="80" cy="76" r="50" fill="url(#sb)"/>
      {/* Ears */}
      <circle cx="42" cy="38" r="22" fill="#1a261a"/>
      <circle cx="42" cy="38" r="14" fill="#2d3d2d"/>
      <circle cx="42" cy="38" r="7" fill="#3d4d3d" opacity="0.4"/>
      <circle cx="118" cy="38" r="22" fill="#1a261a"/>
      <circle cx="118" cy="38" r="14" fill="#2d3d2d"/>
      <circle cx="118" cy="38" r="7" fill="#3d4d3d" opacity="0.4"/>
      {/* Eye patches */}
      <ellipse cx="62" cy="76" rx="19" ry="18" fill="#1a261a" transform="rotate(-8 62 76)"/>
      <ellipse cx="98" cy="76" rx="19" ry="18" fill="#1a261a" transform="rotate(8 98 76)"/>
      {/* Eyes */}
      <circle cx="62" cy="77" r="11" fill="#fdf9f0"/>
      <circle cx="98" cy="77" r="11" fill="#fdf9f0"/>
      <circle cx="64" cy="78" r="7" fill="#1a1a2a"/>
      <circle cx="100" cy="78" r="7" fill="#1a1a2a"/>
      <circle cx="66" cy="75" r="2.8" fill="white"/>
      <circle cx="102" cy="75" r="2.8" fill="white"/>
      {/* Nose */}
      <path d="M76 94 C76 91 78 90 80 92 C82 90 84 91 84 94 C84 97 80 100 80 100 C80 100 76 97 76 94Z" fill="#1a261a" opacity="0.85"/>
      {/* Mouth */}
      <path d="M72 103 Q80 112 88 103" fill="none" stroke="#1a261a" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Blush */}
      <ellipse cx="40" cy="92" rx="14" ry="8" fill="#f0907a" opacity="0.3"/>
      <ellipse cx="120" cy="92" rx="14" ry="8" fill="#f0907a" opacity="0.3"/>
      {/* Flower behind ear */}
      <g transform="translate(112, 42)">
        {[0,72,144,216,288].map((a,i) => (
          <ellipse key={i} cx={Math.cos(a*Math.PI/180)*6} cy={Math.sin(a*Math.PI/180)*6}
            rx="4" ry="2.5" fill={["#ffb8cc","#f4d0e0","#fce8f0","#ffb8cc","#f4d0e0"][i]}
            transform={`rotate(${a})`} opacity="0.9"/>
        ))}
        <circle cx="0" cy="0" r="3.5" fill="#fff8d0"/>
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

function Inp({ value, onChange, placeholder, type = "text", style = {} }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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
  return <div style={{ background: bg || "linear-gradient(120deg, #2d1f46 0%, #3a2a5e 62%, #2f6c47 100%)", padding: "48px 20px 24px", textAlign: "center" }}>
    <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0, letterSpacing: "0.5px" }}>{title}</h1>
    {sub && <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>{sub}</p>}
  </div>;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 24px)", maxWidth: 456, background: C.dark, color: C.cream2, padding: "11px 14px", borderRadius: 12, fontFamily: "'Nunito',sans-serif", fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45, textAlign: "center", whiteSpace: "normal", wordBreak: "break-word", zIndex: 9999, boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>{msg}</div>;
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
    sun: (<svg viewBox="0 0 48 48" width={s} height={s}>{[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(<line key={a} x1={24+Math.cos(a*Math.PI/180)*16} y1={24+Math.sin(a*Math.PI/180)*16} x2={24+Math.cos(a*Math.PI/180)*23} y2={24+Math.sin(a*Math.PI/180)*23} stroke="#e8a030" strokeWidth="2.5" strokeLinecap="round"/>))}<circle cx="24" cy="24" r="13" fill="#e8a030"/><circle cx="24" cy="24" r="9" fill="#f0bc50"/></svg>),
    rainbow: (<svg viewBox="0 0 52 30" width={s} height={s*0.58}>{[["#e87878",0],["#e8a858",6],["#e8d860",12],["#8ac868",18],["#5ab8c8",24]].map(([c,o],i)=><path key={i} d={`M${4+o/2} 28 Q26 ${4+o} ${48-o/2} 28`} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" opacity="0.8"/>)}</svg>),
    swallow1: (<svg viewBox="0 0 44 38" width={s} height={s*0.86}>
      {/* Cute round bird sitting on branch */}
      {/* Branch */}
      <path d="M4 30 Q22 28 40 30" fill="none" stroke="#8a6838" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Tail */}
      <path d="M12 22 Q8 28 6 32 M12 22 Q10 29 10 33" fill="none" stroke="#2a3a5a" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Body — fat teardrop */}
      <ellipse cx="22" cy="20" rx="11" ry="10" fill="#2a3a5a"/>
      {/* Tummy */}
      <ellipse cx="23" cy="22" rx="6" ry="7" fill="#f5e8d0"/>
      {/* Wing hint */}
      <path d="M14 18 Q10 14 13 11 Q18 15 22 16" fill="#1a2a4a"/>
      {/* Head */}
      <circle cx="28" cy="13" r="8" fill="#2a3a5a"/>
      {/* Cheek patch */}
      <ellipse cx="31" cy="15" rx="4" ry="3" fill="#e87060" opacity="0.7"/>
      {/* Eye */}
      <circle cx="30" cy="12" r="3.5" fill="white"/>
      <circle cx="30.5" cy="12" r="2" fill="#1a1a2a"/>
      <circle cx="31.5" cy="11" r="0.8" fill="white"/>
      {/* Beak */}
      <path d="M35 13 L39 14 L35 15Z" fill="#e8a830"/>
      {/* Feet */}
      <line x1="20" y1="29" x2="18" y2="32" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="32" x2="15" y2="33" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="32" x2="18" y2="34" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="24" y1="29" x2="26" y2="32" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="26" y1="32" x2="29" y2="33" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="26" y1="32" x2="26" y2="34" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>),
    swallow2: (<svg viewBox="0 0 56 40" width={s} height={s*0.71}>
      <path d="M2 32 Q28 30 54 32" fill="none" stroke="#8a6838" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M10 24 Q7 29 5 33 M10 24 Q9 30 9 34" fill="none" stroke="#2a3a5a" strokeWidth="2" strokeLinecap="round"/>
      <ellipse cx="16" cy="21" rx="8" ry="8" fill="#2a3a5a"/>
      <ellipse cx="17" cy="23" rx="4.5" ry="5.5" fill="#f5e8d0"/>
      <circle cx="21" cy="14" r="6.5" fill="#2a3a5a"/>
      <ellipse cx="23" cy="16" rx="3" ry="2.5" fill="#e87060" opacity="0.7"/>
      <circle cx="22" cy="13" r="2.8" fill="white"/>
      <circle cx="22.5" cy="13" r="1.6" fill="#1a1a2a"/>
      <circle cx="23" cy="12.2" r="0.6" fill="white"/>
      <path d="M26 13.5 L29 14.5 L26 15.5Z" fill="#e8a830"/>
      <line x1="14" y1="30" x2="12" y2="33" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="30" x2="20" y2="33" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <ellipse cx="41" cy="20" rx="8" ry="7.5" fill="#3a5a2a"/>
      <ellipse cx="42" cy="22" rx="4.5" ry="5" fill="#f5e8d0"/>
      <circle cx="46" cy="13" r="6" fill="#3a5a2a"/>
      <ellipse cx="48" cy="15" rx="2.8" ry="2.2" fill="#e87060" opacity="0.7"/>
      <circle cx="47" cy="12" r="2.6" fill="white"/>
      <circle cx="47.5" cy="12" r="1.5" fill="#1a1a2a"/>
      <path d="M44 13 L41 14 L44 15Z" fill="#e8a830"/>
      <line x1="39" y1="29" x2="37" y2="32" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="43" y1="29" x2="45" y2="32" stroke="#8a6030" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M29 10 C29 8.5 30 8 31 9 C32 8 33 8.5 33 10 C33 12 31 14 31 14 C31 14 29 12 29 10Z" fill="#e87080" opacity="0.85"/>
    </svg>),
    clouds: (<svg viewBox="0 0 52 30" width={s} height={s*0.58}><ellipse cx="28" cy="18" rx="20" ry="10" fill="white" opacity="0.9"/><ellipse cx="18" cy="20" rx="14" ry="8" fill="white" opacity="0.85"/><ellipse cx="28" cy="12" rx="12" ry="8" fill="white" opacity="0.9"/><ellipse cx="38" cy="16" rx="10" ry="7" fill="white" opacity="0.8"/></svg>),
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


export function PandaAccessoryLayer({ accessories, pandaSize = 160 }) {
  const owned = accessories || {};
  const isEquipped = (id) => owned[id] === true || owned[id] === "true" || owned[id] === 1 || owned[id] === "equipped";
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
      {isEquipped("hat_flower") && (
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
      {isEquipped("hat_crown") && (
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
      {isEquipped("hat_straw") && (
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

      {/* GLASSES: HEART */}
      {isEquipped("glasses_heart") && (
        <g transform="rotate(6, 76, 88) translate(76, 88)">
          {/* Left lens */}
          <path d="M-28 -4 C-28 -9 -24 -11 -20 -7 C-16 -11 -12 -9 -12 -4 C-12 2 -20 8 -20 8 C-20 8 -28 2 -28 -4Z"
            fill="#ff7090" opacity="0.75"/>
          <path d="M-28 -4 C-28 -9 -24 -11 -20 -7 C-16 -11 -12 -9 -12 -4 C-12 2 -20 8 -20 8 C-20 8 -28 2 -28 -4Z"
            fill="none" stroke="#d04060" strokeWidth="1.5"/>
          {/* Right lens */}
          <path d="M12 -4 C12 -9 16 -11 20 -7 C24 -11 28 -9 28 -4 C28 2 20 8 20 8 C20 8 12 2 12 -4Z"
            fill="#ff7090" opacity="0.75"/>
          <path d="M12 -4 C12 -9 16 -11 20 -7 C24 -11 28 -9 28 -4 C28 2 20 8 20 8 C20 8 12 2 12 -4Z"
            fill="none" stroke="#d04060" strokeWidth="1.5"/>
          {/* Bridge */}
          <path d="M-12 -2 C-6 -6 6 -6 12 -2" fill="none" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Arms */}
          <line x1="-28" y1="-2" x2="-40" y2="-4" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="28" y1="-2" x2="40" y2="-4" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Shine */}
          <ellipse cx="-22" cy="-5" rx="3" ry="2" fill="white" opacity="0.5" transform="rotate(-20 -22 -5)"/>
          <ellipse cx="18" cy="-5" rx="3" ry="2" fill="white" opacity="0.5" transform="rotate(-20 18 -5)"/>
        </g>
      )}

      {/* GLASSES: SUNGLASSES */}
      {isEquipped("glasses_sun") && (
        <g transform="rotate(6, 76, 88) translate(76, 88)">
          <rect x="-32" y="-8" width="20" height="14" rx="7" fill="#1a3050" opacity="0.88"/>
          <rect x="12" y="-8" width="20" height="14" rx="7" fill="#1a3050" opacity="0.88"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="-32" y1="-2" x2="-44" y2="-5" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="32" y1="-2" x2="44" y2="-5" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <rect x="-30" y="-6" width="8" height="5" rx="3" fill="white" opacity="0.12"/>
          <rect x="14" y="-6" width="8" height="5" rx="3" fill="white" opacity="0.12"/>
        </g>
      )}

      {/* ACC: BOW */}
      {isEquipped("acc_bow") && (
        <g transform="rotate(6, 76, 88) translate(106, 60)">
          <path d="M-12 0 C-18 -8 -24 -10 -20 -2 C-16 6 -6 4 0 0Z" fill="#ffb8d0"/>
          <path d="M12 0 C18 -8 24 -10 20 -2 C16 6 6 4 0 0Z" fill="#ff90b8"/>
          <circle cx="0" cy="0" r="5" fill="#ffcce0"/>
          <circle cx="0" cy="0" r="2.5" fill="#ff80b0"/>
        </g>
      )}

      {/* ACC: SCARF — proper wraparound scarf */}
      {isEquipped("acc_scarf") && (
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
      {isEquipped("outfit_kimono") && (
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

      {/* ══════════ RIGHT PANDA — same accessories mirrored ══════════ */}

      {isEquipped("hat_flower") && (
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

      {isEquipped("hat_crown") && (
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

      {isEquipped("hat_straw") && (
        <g transform="rotate(-4, 176, 88) translate(176, 46)">
          <ellipse cx="0" cy="2" rx="40" ry="9" fill="#d4a840" opacity="0.95"/>
          <ellipse cx="0" cy="2" rx="40" ry="9" fill="none" stroke="#b88820" strokeWidth="1.5"/>
          <path d="M-20 2 C-20 -16 20 -16 20 2" fill="#e8bc50"/>
          <ellipse cx="0" cy="2" rx="20" ry="4" fill="#d4a840"/>
          <path d="M-20 2 C-10 -2 10 -2 20 2" fill="none" stroke="#e86858" strokeWidth="3.5" strokeLinecap="round"/>
        </g>
      )}

      {isEquipped("glasses_heart") && (
        <g transform="rotate(-4, 176, 88) translate(176, 88)">
          <path d="M-28 -4 C-28 -9 -24 -11 -20 -7 C-16 -11 -12 -9 -12 -4 C-12 2 -20 8 -20 8 C-20 8 -28 2 -28 -4Z"
            fill="#ff7090" opacity="0.75"/>
          <path d="M-28 -4 C-28 -9 -24 -11 -20 -7 C-16 -11 -12 -9 -12 -4 C-12 2 -20 8 -20 8 C-20 8 -28 2 -28 -4Z"
            fill="none" stroke="#d04060" strokeWidth="1.5"/>
          <path d="M12 -4 C12 -9 16 -11 20 -7 C24 -11 28 -9 28 -4 C28 2 20 8 20 8 C20 8 12 2 12 -4Z"
            fill="#ff7090" opacity="0.75"/>
          <path d="M12 -4 C12 -9 16 -11 20 -7 C24 -11 28 -9 28 -4 C28 2 20 8 20 8 C20 8 12 2 12 -4Z"
            fill="none" stroke="#d04060" strokeWidth="1.5"/>
          <path d="M-12 -2 C-6 -6 6 -6 12 -2" fill="none" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="-28" y1="-2" x2="-44" y2="-4" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="28" y1="-2" x2="44" y2="-4" stroke="#d04060" strokeWidth="2.5" strokeLinecap="round"/>
          <ellipse cx="-22" cy="-5" rx="3" ry="2" fill="white" opacity="0.5" transform="rotate(-20 -22 -5)"/>
          <ellipse cx="18" cy="-5" rx="3" ry="2" fill="white" opacity="0.5" transform="rotate(-20 18 -5)"/>
        </g>
      )}

      {isEquipped("glasses_sun") && (
        <g transform="rotate(-4, 176, 88) translate(176, 88)">
          <rect x="-34" y="-8" width="22" height="14" rx="7" fill="#1a3050" opacity="0.88"/>
          <rect x="12" y="-8" width="22" height="14" rx="7" fill="#1a3050" opacity="0.88"/>
          <line x1="-12" y1="-1" x2="12" y2="-1" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="-34" y1="-2" x2="-48" y2="-5" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="34" y1="-2" x2="48" y2="-5" stroke="#8a7030" strokeWidth="2.5" strokeLinecap="round"/>
          <rect x="-32" y="-6" width="8" height="5" rx="3" fill="white" opacity="0.12"/>
          <rect x="14" y="-6" width="8" height="5" rx="3" fill="white" opacity="0.12"/>
        </g>
      )}

      {isEquipped("acc_bow") && (
        <g transform="rotate(-4, 176, 88) translate(206, 58)">
          <path d="M-12 0 C-18 -8 -24 -10 -20 -2 C-16 6 -6 4 0 0Z" fill="#a8c8f8"/>
          <path d="M12 0 C18 -8 24 -10 20 -2 C16 6 6 4 0 0Z" fill="#80aaf4"/>
          <circle cx="0" cy="0" r="5" fill="#c8dcfc"/>
          <circle cx="0" cy="0" r="2.5" fill="#80aaf4"/>
        </g>
      )}

      {/* OUTFIT: SAILOR */}
      {isEquipped("outfit_sailor") && (
        <g>
          {/* Sailor body - left */}
          <path d="M46 138 C42 152 40 174 42 196 C52 201 100 201 110 196 C112 174 110 152 106 138 C94 130 86 128 76 128 C66 128 58 130 46 138Z" fill="white" opacity="0.92"/>
          {/* Navy V-collar - left */}
          <path d="M54 126 L76 158 L98 126 C96 120 88 116 76 116 C64 116 56 120 54 126Z" fill="#1a3a6a" opacity="0.9"/>
          <path d="M54 126 L76 158 L98 126" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M58 122 C70 118 82 118 94 122" fill="none" stroke="white" strokeWidth="1.5" opacity="0.7"/>
          {/* Sailor hat - left */}
          <g transform="rotate(6, 76, 88) translate(76, 52)">
            <ellipse cx="0" cy="5" rx="32" ry="8" fill="white"/>
            <ellipse cx="0" cy="5" rx="32" ry="8" fill="none" stroke="#1a3a6a" strokeWidth="1.5"/>
            <rect x="-20" y="-14" width="40" height="19" rx="3" fill="white"/>
            <rect x="-20" y="-14" width="40" height="19" rx="3" fill="none" stroke="#1a3a6a" strokeWidth="1.5"/>
            <rect x="-20" y="1" width="40" height="4" fill="#1a3a6a" opacity="0.9"/>
            <circle cx="0" cy="-7" r="3.5" fill="#f8c040" opacity="0.9"/>
            <circle cx="0" cy="-7" r="2" fill="#c89020"/>
          </g>
          {/* Sailor body - right */}
          <path d="M146 138 C142 152 140 174 142 196 C152 201 200 201 210 196 C212 174 210 152 206 138 C194 130 186 128 176 128 C166 128 158 130 146 138Z" fill="white" opacity="0.92"/>
          {/* Navy V-collar - right */}
          <path d="M154 126 L176 158 L198 126 C196 120 188 116 176 116 C164 116 156 120 154 126Z" fill="#1a3a6a" opacity="0.9"/>
          <path d="M154 126 L176 158 L198 126" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M158 122 C170 118 182 118 194 122" fill="none" stroke="white" strokeWidth="1.5" opacity="0.7"/>
          {/* Sailor hat - right */}
          <g transform="rotate(-4, 176, 88) translate(176, 50)">
            <ellipse cx="0" cy="5" rx="32" ry="8" fill="white"/>
            <ellipse cx="0" cy="5" rx="32" ry="8" fill="none" stroke="#1a3a6a" strokeWidth="1.5"/>
            <rect x="-20" y="-14" width="40" height="19" rx="3" fill="white"/>
            <rect x="-20" y="-14" width="40" height="19" rx="3" fill="none" stroke="#1a3a6a" strokeWidth="1.5"/>
            <rect x="-20" y="1" width="40" height="4" fill="#1a3a6a" opacity="0.9"/>
            <circle cx="0" cy="-7" r="3.5" fill="#f8c040" opacity="0.9"/>
            <circle cx="0" cy="-7" r="2" fill="#c89020"/>
          </g>
        </g>
      )}

      {/* OUTFIT: WITCH */}
      {isEquipped("outfit_witch") && (
        <g>
          {/* Cape - left */}
          <path d="M40 134 C36 150 34 175 36 200 C50 206 100 206 116 200 C118 175 116 150 112 134 C100 126 88 124 76 124 C64 124 52 126 40 134Z" fill="#2a1060" opacity="0.85"/>
          <circle cx="76" cy="133" r="6" fill="#8050d0" opacity="0.9"/>
          <circle cx="76" cy="133" r="3.5" fill="#b080f0"/>
          {/* Witch hat - left */}
          <g transform="rotate(6, 76, 88) translate(76, 50)">
            <ellipse cx="0" cy="7" rx="38" ry="9" fill="#1a1228" opacity="0.97"/>
            <ellipse cx="0" cy="7" rx="38" ry="9" fill="none" stroke="#6040b0" strokeWidth="1.5"/>
            <path d="M-14 7 C-8 -8 -3 -24 0 -40 C3 -24 8 -8 14 7Z" fill="#1a1228" opacity="0.97"/>
            <path d="M-14 7 C-8 -8 -3 -24 0 -40 C3 -24 8 -8 14 7Z" fill="none" stroke="#6040b0" strokeWidth="1.5"/>
            <path d="M-14 7 C-6 3 6 3 14 7" fill="none" stroke="#a070e0" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="-4" cy="-20" r="1.8" fill="#d4a0f8" opacity="0.85"/>
            <circle cx="5" cy="-30" r="1.2" fill="#e8c0ff" opacity="0.8"/>
            <circle cx="6" cy="-12" r="1" fill="#d4a0f8" opacity="0.75"/>
          </g>
          {/* Cape - right */}
          <path d="M140 134 C136 150 134 175 136 200 C150 206 200 206 216 200 C218 175 216 150 212 134 C200 126 188 124 176 124 C164 124 152 126 140 134Z" fill="#2a1060" opacity="0.85"/>
          <circle cx="176" cy="133" r="6" fill="#8050d0" opacity="0.9"/>
          <circle cx="176" cy="133" r="3.5" fill="#b080f0"/>
          {/* Witch hat - right */}
          <g transform="rotate(-4, 176, 88) translate(176, 48)">
            <ellipse cx="0" cy="7" rx="38" ry="9" fill="#1a1228" opacity="0.97"/>
            <ellipse cx="0" cy="7" rx="38" ry="9" fill="none" stroke="#6040b0" strokeWidth="1.5"/>
            <path d="M-14 7 C-8 -8 -3 -24 0 -40 C3 -24 8 -8 14 7Z" fill="#1a1228" opacity="0.97"/>
            <path d="M-14 7 C-8 -8 -3 -24 0 -40 C3 -24 8 -8 14 7Z" fill="none" stroke="#6040b0" strokeWidth="1.5"/>
            <path d="M-14 7 C-6 3 6 3 14 7" fill="none" stroke="#a070e0" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="-4" cy="-20" r="1.8" fill="#d4a0f8" opacity="0.85"/>
            <circle cx="5" cy="-30" r="1.2" fill="#e8c0ff" opacity="0.8"/>
            <circle cx="6" cy="-12" r="1" fill="#d4a0f8" opacity="0.75"/>
          </g>
        </g>
      )}

      {/* OUTFIT: ANGEL */}
      {isEquipped("outfit_angel") && (
        <g>
          {/* Wings left of left panda */}
          <path d="M28 158 C10 144 4 122 18 110 C32 104 48 118 46 140Z" fill="white" opacity="0.9"/>
          <path d="M28 158 C10 144 4 122 18 110 C32 104 48 118 46 140Z" fill="none" stroke="#e8d898" strokeWidth="1.5"/>
          <path d="M30 170 C14 160 8 142 18 130 C28 120 40 130 40 150Z" fill="white" opacity="0.65"/>
          {/* Wings right of left panda */}
          <path d="M124 158 C142 144 148 122 134 110 C120 104 104 118 106 140Z" fill="white" opacity="0.9"/>
          <path d="M124 158 C142 144 148 122 134 110 C120 104 104 118 106 140Z" fill="none" stroke="#e8d898" strokeWidth="1.5"/>
          <path d="M122 170 C138 160 144 142 134 130 C124 120 112 130 112 150Z" fill="white" opacity="0.65"/>
          {/* White robe - left */}
          <path d="M46 136 C42 150 40 172 42 196 C52 201 100 201 110 196 C112 172 110 150 106 136 C94 128 86 126 76 126 C66 126 58 128 46 136Z" fill="white" opacity="0.88"/>
          <path d="M42 196 C52 201 100 201 110 196" fill="none" stroke="#d4a020" strokeWidth="3" strokeLinecap="round"/>
          <path d="M46 160 C58 156 68 154 76 154 C84 154 94 156 106 160" fill="none" stroke="#d4a020" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Halo - left */}
          <g transform="rotate(6, 76, 88) translate(76, 50)">
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="#c89020" strokeWidth="5" opacity="0.95"/>
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="#f8e878" strokeWidth="2.5" opacity="0.7"/>
          </g>
          {/* Wings left of right panda */}
          <path d="M128 158 C110 144 104 122 118 110 C132 104 148 118 146 140Z" fill="white" opacity="0.9"/>
          <path d="M128 158 C110 144 104 122 118 110 C132 104 148 118 146 140Z" fill="none" stroke="#e8d898" strokeWidth="1.5"/>
          <path d="M130 170 C114 160 108 142 118 130 C128 120 140 130 140 150Z" fill="white" opacity="0.65"/>
          {/* Wings right of right panda */}
          <path d="M224 158 C242 144 248 122 234 110 C220 104 204 118 206 140Z" fill="white" opacity="0.9"/>
          <path d="M224 158 C242 144 248 122 234 110 C220 104 204 118 206 140Z" fill="none" stroke="#e8d898" strokeWidth="1.5"/>
          <path d="M222 170 C238 160 244 142 234 130 C224 120 212 130 212 150Z" fill="white" opacity="0.65"/>
          {/* White robe - right */}
          <path d="M146 136 C142 150 140 172 142 196 C152 201 200 201 210 196 C212 172 210 150 206 136 C194 128 186 126 176 126 C166 126 158 128 146 136Z" fill="white" opacity="0.88"/>
          <path d="M142 196 C152 201 200 201 210 196" fill="none" stroke="#d4a020" strokeWidth="3" strokeLinecap="round"/>
          <path d="M146 160 C158 156 168 154 176 154 C184 154 194 156 206 160" fill="none" stroke="#d4a020" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Halo - right */}
          <g transform="rotate(-4, 176, 88) translate(176, 48)">
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="#c89020" strokeWidth="5" opacity="0.95"/>
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="#f8e878" strokeWidth="2.5" opacity="0.7"/>
          </g>
        </g>
      )}

    </svg>
  );
}



// ═══════════════════════════════════════════════
// NEW GARDEN SCENE — koi/lotus watercolor aesthetic
