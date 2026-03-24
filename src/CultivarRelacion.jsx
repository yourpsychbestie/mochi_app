import React, { useState } from "react";
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
  return (
    <div style={{ minHeight: "100vh", background: "#f8f2e4", paddingBottom: 90 }}>
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
          <Ejercicios exDone={exDone} onComplete={onCompleteEx} user={user} lessonsDone={lessonsDone} onCompleteLesson={onCompleteLesson} />
        )}
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
