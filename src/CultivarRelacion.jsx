import React, { useState } from "react";
import Ejercicios from "./Ejercicios";
import Conocete from "./Conocete";
import Burbuja from "./Burbuja";

const SUBTABS = [
  { id: "ejerc", label: "🌱 Ejercicios" },
  { id: "lecciones", label: "📚 Aprender algo nuevo" },
  { id: "burbuja", label: "🤝 Acuerdos de pareja" },
  { id: "conocete", label: "💬 Conocernos más" },
];

export default function CultivarRelacion({
  exDone, onCompleteEx, user, lessonsDone, onCompleteLesson,
  conoce, onSaveConoce, burbuja, onSaveMine, onPropose, onApprove
}) {
  const [subtab, setSubtab] = useState("ejerc");
  return (
    <div style={{ minHeight: "100vh", background: "#f8f2e4", paddingBottom: 90 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "18px 0 10px" }}>
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
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
