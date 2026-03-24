// Barra de progreso simple
function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background: '#ede4cc', borderRadius: 8, height: 16, margin: '18px 18px 0 18px', boxShadow: '0 2px 0 #b8d8a0', overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: pct + '%', background: '#4a6e30', height: '100%', borderRadius: 8, transition: 'width 0.4s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: pct > 50 ? '#fff' : '#4a6e30', fontSize: '0.92rem', letterSpacing: 1 }}>{value} / {max} completados</div>
    </div>
  );
}
import React, { useState, useRef } from "react";
// Utilidad para obtener la fecha local en formato YYYY-MM-DD
function getTodayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
// Confetti simple (canvas)
function Confetti({ trigger }) {
  const ref = useRef();
  React.useEffect(() => {
    if (!trigger) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth, H = 220;
    canvas.width = W; canvas.height = H;
    let running = true;
    const colors = ["#f4a8c0","#e8907a","#b8e8d8","#4a6e30","#d4a843","#e8607a","#88b8c8"];
    const confs = Array.from({length: 32}, () => ({
      x: Math.random()*W, y: Math.random()*-H, r: 7+Math.random()*7, c: colors[Math.floor(Math.random()*colors.length)], v: 2+Math.random()*2, a: Math.random()*Math.PI*2
    }));
    function draw() {
      ctx.clearRect(0,0,W,H);
      confs.forEach(cf => {
        ctx.save();
        ctx.translate(cf.x, cf.y);
        ctx.rotate(cf.a);
        ctx.fillStyle = cf.c;
        ctx.beginPath();
        ctx.arc(0,0,cf.r,0,Math.PI*2);
        ctx.fill();
        ctx.restore();
        cf.y += cf.v;
        cf.x += Math.sin(cf.a)*2;
        cf.a += 0.03;
        if (cf.y > H) { cf.y = Math.random()*-H; cf.x = Math.random()*W; }
      });
      if (running) requestAnimationFrame(draw);
    }
    draw();
    return () => { running = false; };
  }, [trigger]);
  return <canvas ref={ref} style={{position:"absolute",top:0,left:0,width:"100%",height:220,pointerEvents:"none",zIndex:20}} />;
}
import IntroModal from "./IntroModal";
import Ejercicios from "./Ejercicios";
import Conocete from "./Conocete";
import Burbuja from "./Burbuja";

const SUBTABS = [
  { id: "ejerc", label: "🌱 Ejercicios" },
  { id: "lecciones", label: "📚 Aprender algo nuevo" },
  { id: "burbuja", label: "🤝 Acuerdos de pareja" },
  { id: "conocete", label: "💬 Conocernos más" },
];

const INTRO_TEXTS = {
  ejerc: {
    title: "Ejercicios en pareja",
    description: "Aquí encontrarás ejercicios prácticos para fortalecer la conexión, la comunicación y el crecimiento en pareja. Hazlos juntos y comparte lo que sientes." },
  lecciones: {
    title: "Aprender algo nuevo",
    description: "Explora lecciones y recursos para entender mejor el amor, la convivencia y el bienestar en pareja. Aprende y reflexiona en conjunto." },
  burbuja: {
    title: "Acuerdos de pareja",
    description: "Esta sección es para crear acuerdos y límites claros en pareja. Aquí pueden definir reglas, expectativas y compromisos para fortalecer su relación." },
  conocete: {
    title: "Conocernos más",
    description: "Responde preguntas profundas y divertidas para descubrir más sobre ti y tu pareja. Ideal para conversaciones significativas y autoconocimiento." },
};

export default function CultivarRelacion({
  exDone, onCompleteEx, user, lessonsDone, onCompleteLesson,
  conoce, onSaveConoce, burbuja, onSaveMine, onPropose, onApprove
}) {
  const [subtab, setSubtab] = useState("ejerc");
  const [showIntro, setShowIntro] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: "#f8f2e4", paddingBottom: 90, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "18px 0 10px" }}>
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setSubtab(t.id);
              setShowIntro(true);
            }}
            style={{
              background: subtab === t.id ? "#4a6e30" : "#ede4cc",
              color: subtab === t.id ? "#fff" : "#4a6e30",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: subtab === t.id ? "0 2px 0 #b8d8a0" : "none"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <IntroModal
          open={showIntro}
          onClose={() => setShowIntro(false)}
          title={INTRO_TEXTS[subtab].title}
          description={INTRO_TEXTS[subtab].description}
        />
        {subtab === "ejerc" && (
          <>
            <Confetti trigger={showConfetti} />
            {/* Reto del día */}
            <RetoDelDia exDone={exDone} onComplete={onCompleteEx} />
            <ProgressBar value={exDone?.length || 0} max={10} />
            <Ejercicios
              exDone={exDone}
              onComplete={(...args) => {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 1800);
                onCompleteEx && onCompleteEx(...args);
              }}
              user={user}
              lessonsDone={lessonsDone}
              onCompleteLesson={onCompleteLesson}
            />
          </>
        )}

        // Componente Reto del Día
        function RetoDelDia({ exDone, onComplete }) {
          // Para demo: el reto es el ejercicio #1
          const retoIdx = 0;
          const todayKey = getTodayKey();
          const completadoHoy = (exDone || []).some(e => e.idx === retoIdx && e.date === todayKey);
          return (
            <div style={{
              background: completadoHoy ? '#b8e8d8' : '#fffbe8',
              border: '2px solid #4a6e30',
              borderRadius: 14,
              margin: '18px 18px 0 18px',
              padding: 18,
              boxShadow: '0 2px 0 #b8d8a0',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <span style={{ fontSize: '2.1rem', marginRight: 8 }}>🔥</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1.08rem', color: '#4a6e30', marginBottom: 2 }}>Reto del día</div>
                <div style={{ fontSize: '0.97rem', color: '#4a6e30', fontWeight: 600 }}>¡Completa el ejercicio destacado hoy y gana doble bambú!</div>
                {completadoHoy && <div style={{ marginTop: 7, fontWeight: 700, color: '#1e2b1e', fontSize: '0.95rem' }}>¡Reto completado! 🎉 Doble recompensa 🌿🌿</div>}
              </div>
              {!completadoHoy && (
                <button
                  style={{ background: '#4a6e30', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 2px 0 #b8d8a0' }}
                  onClick={() => { onComplete && onComplete({ idx: retoIdx, date: todayKey, doble: true }); }}
                >¡Hacer ahora!</button>
              )}
              {completadoHoy && <span style={{ position: 'absolute', right: 18, top: 18, fontSize: '1.5rem' }}>🌿🌿</span>}
            </div>
          );
        }
        {subtab === "lecciones" && (
          <Ejercicios exDone={exDone} onComplete={onCompleteEx} user={user} lessonsDone={lessonsDone} onCompleteLesson={onCompleteLesson} showLessonsOnly />
        )}
        {subtab === "burbuja" && (
          <Burbuja burbuja={burbuja} onSaveMine={onSaveMine} onPropose={onPropose} onApprove={onApprove} user={user} />
        )}
        {subtab === "conocete" && (
          <Conocete conoce={conoce} onSave={onSaveConoce} user={user} />
        )}
      </div>
    </div>
  );
}
