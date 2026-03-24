import React from "react";

export default function IntroModal({ open, onClose, title, description }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(30,43,30,0.18)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 32, maxWidth: 340, boxShadow: "0 8px 32px #0002", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.3rem", color: "#4a6e30", marginBottom: 12 }}>{title}</h2>
        <p style={{ color: "#5a6a4a", fontSize: "1.02rem", marginBottom: 24 }}>{description}</p>
        <button onClick={onClose} style={{ background: "#4a6e30", color: "#fff", border: "none", borderRadius: 10, padding: "10px 28px", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>Entendido</button>
      </div>
    </div>
  );
}
