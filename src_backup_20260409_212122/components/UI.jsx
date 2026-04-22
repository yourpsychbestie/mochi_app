import { useState } from "react";
import { C } from "../constants/colors";
import { ls } from "../constants/ls";

export function Btn({ children, onClick, disabled, variant = "dark", style = {} }) {
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

export function TA({ value, onChange, placeholder, rows = 2, style = {} }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px 13px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", resize: "none", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", lineHeight: 1.5, ...style }} />;
}

export function Inp({ value, onChange, placeholder, type = "text", style = {} }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", ...style }} />;
}

export function Tag({ children, bg = C.sand, color = C.inkM }) {
  return <span style={{ background: bg, color, borderRadius: 6, padding: "3px 9px", fontSize: "0.7rem", fontWeight: 800, display: "inline-block", letterSpacing: "0.4px" }}>{children}</span>;
}

export function ProgBar({ value, max = 100, color = C.olive, height = 6, style = {} }) {
  return <div style={{ height, background: C.sand, borderRadius: 50, overflow: "hidden", ...style }}><div style={{ height: "100%", width: `${Math.min(100, (value / max) * 100)}%`, background: color, borderRadius: 50, transition: "width 0.5s" }} /></div>;
}

export function PBadge({ who = "A", name }) {
  const label = name || (who === "A" ? "Persona A" : "Persona B");
  return <div style={{ display: "inline-block", background: who === "A" ? C.cream : "#d4e8c4", color: C.ink, borderRadius: 7, padding: "2px 11px", fontSize: "0.72rem", fontWeight: 800, marginBottom: 6, letterSpacing: "0.4px" }}>{label}</div>;
}

export function ScreenTop({ title, sub, bg }) {
  return <div style={{ background: bg || "linear-gradient(120deg, #2d1f46 0%, #3a2a5e 62%, #2f6c47 100%)", padding: "48px 20px 24px", textAlign: "center" }}>
    <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0, letterSpacing: "0.5px" }}>{title}</h1>
    {sub && <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>{sub}</p>}
  </div>;
}

export function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 24px)", maxWidth: 456, background: C.dark, color: C.cream2, padding: "11px 14px", borderRadius: 12, fontFamily: "'Nunito',sans-serif", fontWeight: 700, fontSize: "0.86rem", lineHeight: 1.45, textAlign: "center", whiteSpace: "normal", wordBreak: "break-word", zIndex: 9999, boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>{msg}</div>;
}

export function IntroBanner({ storeKey, title, lines, color }) {
  const [visible, setVisible] = useState(() => !ls.get("intro_dismissed_" + storeKey));
  if (!visible) return null;
  const bg = color || "#f0ebff";
  const border = color ? color + "66" : "#c8a8f8";
  return (
    <div style={{ margin:"12px 14px 0", background:bg, borderRadius:16, padding:"13px 14px 13px 16px", border:`1.5px solid ${border}`, display:"flex", gap:10, alignItems:"flex-start" }}>
      <div style={{ flex:1 }}>
        {title && <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark, marginBottom:5 }}>{title}</div>}
        {lines.map((l,i) => <div key={i} style={{ fontSize:"0.82rem", color:C.inkM, lineHeight:1.65, marginBottom: i < lines.length-1 ? 4 : 0 }}>{l}</div>)}
      </div>
      <button onClick={() => { ls.set("intro_dismissed_" + storeKey, true); setVisible(false); }}
        style={{ background:"none", border:"none", color:C.inkL, fontSize:"1.1rem", cursor:"pointer", lineHeight:1, padding:"2px 0 0", flexShrink:0 }}>✕</button>
    </div>
  );
}
