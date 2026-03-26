import React, { useState, useEffect } from "react";

// Consejos diarios (puedes importar o definir aquí)
const CONSEJOS_DIARIOS = [
  { id: 1, texto: "Panda tip terapéutico 🐼: hagan una pregunta curiosa en vez de asumir." },
  { id: 2, texto: "Nombrar emociones baja la intensidad del conflicto: digan 'me siento...' antes de discutir." },
  { id: 3, texto: "Una reparación rápida (perdón, abrazo o broma suave) vale oro después de un roce." },
  { id: 4, texto: "Cinco interacciones positivas por cada negativa fortalecen el vínculo." },
  { id: 5, texto: "Validar no es estar de acuerdo: es reconocer la experiencia del otro." },
  { id: 6, texto: "Agradezcan algo pequeño del día. Lo cotidiano también construye amor." },
  { id: 7, texto: "Escucha activa: repite con tus palabras lo que entendiste antes de responder." },
  { id: 8, texto: "Antes de corregir, conecta: una frase cálida abre mejor la conversación." },
  { id: 9, texto: "Hagan micro-pausas cuando suba el tono: respirar 20 segundos ayuda." },
  { id: 10, texto: "Elijan un ritual diario de conexión de 5 minutos sin pantallas." },
];

const BAMBU_RECOMPENSA = 5;
const MS_24H = 24 * 60 * 60 * 1000;

function ConsejoDelDiaSection({ user }) {
  const [show, setShow] = useState(false);
  const [consejo, setConsejo] = useState(null);
  const [lastTime, setLastTime] = useState(null);
  const [bambuMsg, setBambuMsg] = useState("");

  // Cargar consejo del día y última vez
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("mochi_consejo")) || {};
    setLastTime(stored.time || null);
    setConsejo(stored.consejo || getRandomConsejo());
    // Mostrar si nunca se mostró o si pasaron 24h
    if (!stored.time || Date.now() - stored.time > MS_24H) {
      setShow(true);
    }
  }, []);

  // Elegir consejo aleatorio
  function getRandomConsejo() {
    const idx = Math.floor(Math.random() * CONSEJOS_DIARIOS.length);
    return CONSEJOS_DIARIOS[idx];
  }

  // Al cerrar, guardar timestamp y consejo
  function handleClose() {
    setShow(false);
    localStorage.setItem("mochi_consejo", JSON.stringify({
      time: Date.now(),
      consejo,
    }));
    // Sumar bambú si corresponde
    if (!lastTime || Date.now() - lastTime > MS_24H) {
      setBambuMsg(`+${BAMBU_RECOMPENSA} bambú 🌿`);
      // Aquí deberías llamar a fbIncrementBamboo si tienes user.code
      // Ejemplo:
      // if (user?.code && !user?.isGuest) fbIncrementBamboo(user.code, BAMBU_RECOMPENSA);
    }
  }

  // Permitir forzar mostrar para debug
  // window.showConsejo = () => setShow(true);

  if (!show || !consejo) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(60,40,80,0.38)", zIndex: 4000,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#fff8f0", borderRadius: 24, padding: "32px 28px 24px", maxWidth: 340, width: "90%",
        boxShadow: "0 8px 32px rgba(80,40,120,0.18)", border: "2.5px solid #e6d6f7", textAlign: "center"
      }}>
        <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>🐼</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.25rem", color: "#7a4fa0", marginBottom: 10 }}>
          Consejo del día
        </div>
        <div style={{ fontSize: "1.05rem", color: "#4a3a60", marginBottom: 18, fontWeight: 700, lineHeight: 1.6 }}>
          {consejo.texto}
        </div>
        <div style={{ fontSize: "0.92rem", color: "#4a6e30", fontWeight: 800, marginBottom: 10 }}>
          ¡+{BAMBU_RECOMPENSA} bambú por leer!
        </div>
        {bambuMsg && <div style={{ color: "#4a6e30", fontWeight: 800, marginBottom: 8 }}>{bambuMsg}</div>}
        <button onClick={handleClose} style={{
          background: "#e6d6f7", color: "#7a4fa0", border: "none", borderRadius: 12, padding: "12px 24px",
          fontFamily: "'Fredoka One',cursive", fontSize: "1rem", cursor: "pointer", fontWeight: 700,
          boxShadow: "0 3px 0 #cbb6e0"
        }}>
          ¡Listo!
        </button>
      </div>
    </div>
  );
}

export default ConsejoDelDiaSection;
