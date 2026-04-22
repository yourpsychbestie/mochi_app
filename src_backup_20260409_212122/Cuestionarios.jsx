import React, { useMemo, useRef, useState } from "react";

const SCALE_OPTIONS = [
  { id: "1", label: "Casi nunca", color: "#f3ecff" },
  { id: "2", label: "A veces", color: "#eee2ff" },
  { id: "3", label: "Frecuente", color: "#e6d7ff" },
  { id: "4", label: "Casi siempre", color: "#dccbff" },
  { id: "5", label: "Siempre", color: "#d2bfff" },
];

const QUIZZES = [
  {
    id: "fortalezas",
    catKey: "quizFortalezas",
    title: "Fortalezas de pareja",
    emoji: "💪",
    subtitle: "Cómo se sostienen cuando la vida aprieta",
    type: "scale",
    questions: [
      { text: "Escucho de verdad antes de responder.", trait: "escucha" },
      { text: "Busco reparar rápido después de un malentendido.", trait: "reparacion" },
      { text: "Expreso cariño con acciones concretas.", trait: "afecto" },
      { text: "Pido apoyo sin atacar ni culpar.", trait: "vulnerabilidad" },
      { text: "Cuidamos espacios de calidad juntos.", trait: "presencia" },
    ],
  },
  {
    id: "valores",
    catKey: "quizValores",
    title: "Valores que guian su relacion",
    emoji: "🧭",
    subtitle: "Lo no negociable para construir confianza",
    type: "value",
    questions: [
      {
        text: "Cuando hay conflicto, priorizo...",
        options: [
          { id: "honestidad", label: "Decir la verdad aunque incomode" },
          { id: "calma", label: "Bajar intensidad y cuidar el tono" },
          { id: "justicia", label: "Que ambos se sientan tratados justamente" },
          { id: "union", label: "Recordar que somos equipo" },
        ],
      },
      {
        text: "En una relacion sana, para mi es clave...",
        options: [
          { id: "lealtad", label: "Lealtad en lo publico y en lo privado" },
          { id: "crecimiento", label: "Crecer juntos sin dejar de ser uno mismo" },
          { id: "respeto", label: "Respetar limites y diferencias" },
          { id: "ternura", label: "Ternura diaria en detalles pequenos" },
        ],
      },
      {
        text: "Cuando tomo decisiones de pareja, me mueve...",
        options: [
          { id: "proyecto", label: "Construir un proyecto compartido" },
          { id: "estabilidad", label: "Cuidar seguridad y estabilidad" },
          { id: "libertad", label: "Conservar libertad y autenticidad" },
          { id: "conexion", label: "Profundizar la conexion emocional" },
        ],
      },
    ],
  },
  {
    id: "sternberg",
    catKey: "quizSternberg",
    title: "Triangulo de Sternberg",
    emoji: "🔺",
    subtitle: "Intimidad, pasion y compromiso en su vinculo",
    type: "scale",
    questions: [
      { text: "Siento una conexión emocional profunda con mi pareja.", trait: "intimidad_1" },
      { text: "Puedo hablar de temas íntimos y vulnerables con mi pareja.", trait: "intimidad_2" },
      { text: "Mi pareja realmente me comprende como persona.", trait: "intimidad_3" },
      { text: "Siento atracción y deseo hacia mi pareja.", trait: "pasion_1" },
      { text: "Buscamos activamente momentos de cercanía romántica.", trait: "pasion_2" },
      { text: "La química entre nosotros se mantiene viva.", trait: "pasion_3" },
      { text: "Estoy comprometido/a a cuidar esta relación a largo plazo.", trait: "compromiso_1" },
      { text: "Cuando hay dificultades, sigo eligiendo construir juntos.", trait: "compromiso_2" },
      { text: "Siento que ambos protegemos este vínculo con decisiones concretas.", trait: "compromiso_3" },
    ],
  },
];

const TRAIT_LABELS = {
  escucha: "escucha empatica",
  reparacion: "capacidad de reparacion",
  afecto: "demostracion de afecto",
  vulnerabilidad: "vulnerabilidad sana",
  presencia: "presencia de calidad",
  intimidad_1: "intimidad emocional",
  intimidad_2: "vulnerabilidad compartida",
  intimidad_3: "comprension mutua",
  pasion_1: "deseo",
  pasion_2: "cercania romantica",
  pasion_3: "quimica",
  compromiso_1: "compromiso",
  compromiso_2: "eleccion mutua",
  compromiso_3: "proteccion del vinculo",
};

function parseScale(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calculateFortalezas(respuestas) {
  const entries = Object.entries(respuestas).filter(([, score]) => Number.isFinite(score));
  if (!entries.length) return { avg: 0, top: [] };
  const avg = entries.reduce((acc, [, score]) => acc + score, 0) / entries.length;
  const top = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([trait]) => TRAIT_LABELS[trait] || trait);
  return { avg, top };
}

function calculateValores(respuestas) {
  const tally = Object.values(respuestas).reduce((acc, valueId) => {
    if (!valueId) return acc;
    acc[valueId] = (acc[valueId] || 0) + 1;
    return acc;
  }, {});
  const topValues = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => key);
  return { topValues };
}

function calculatePersonalidad(respuestas) {
  const entries = Object.entries(respuestas).filter(([, score]) => Number.isFinite(score));
  if (!entries.length) return { avg: 0, top: [] };
  const avg = entries.reduce((acc, [, score]) => acc + score, 0) / entries.length;
  const top = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([trait]) => TRAIT_LABELS[trait] || trait);
  return { avg, top };
}

function normalizeValueLabel(valueId) {
  const map = {
    honestidad: "honestidad",
    calma: "calma",
    justicia: "justicia",
    union: "union",
    lealtad: "lealtad",
    crecimiento: "crecimiento",
    respeto: "respeto",
    ternura: "ternura",
    proyecto: "proyecto compartido",
    estabilidad: "estabilidad",
    libertad: "libertad",
    conexion: "conexion emocional",
  };
  return map[valueId] || valueId || "";
}

function generateAdvice(fortalezas, valores, personalidad, complete) {
  if (!complete) return [];
  const fTop = fortalezas.top[0] || "cuidado mutuo";
  const pTop = personalidad.top[0] || "estilo personal";
  const vTop = normalizeValueLabel(valores.topValues[0]);
  const vSecond = normalizeValueLabel(valores.topValues[1]);

  return [
    `Conviertan su ${fTop} en ritual semanal: 20 minutos sin pantallas para escucharse.`,
    `Si su valor central es ${vTop}, definan una regla pequena que lo aterrice esta semana.`,
    `Aprovechen su ${pTop}: usenlo como fortaleza durante conversaciones dificiles.`,
    `Antes de discutir, acuerden una frase de pausa y retorno para cuidar el tono.`,
    `Elijan una micro-meta de 7 dias que combine ${vTop}${vSecond ? ` y ${vSecond}` : ""}.`,
  ];
}

function getQuizRoleAnswers(conoce, role) {
  const fort = {};
  const val = {};
  const pers = {};

  QUIZZES.forEach((quiz) => {
    quiz.questions.forEach((q, idx) => {
      const key = `${quiz.catKey}-${idx}`;
      const raw = conoce?.[key]?.[role];
      if (raw == null) return;

      if (quiz.id === "fortalezas") {
        const score = parseScale(raw);
        if (score != null) fort[q.trait] = score;
      }
      if (quiz.id === "valores") {
        val[`q${idx}`] = String(raw);
      }
      if (quiz.id === "sternberg") {
        const score = parseScale(raw);
        if (score != null) pers[q.trait] = score;
      }
    });
  });

  return { fort, val, pers };
}

export function getQuizAdviceFromConoce(conoce, role) {
  const { fort, val, pers } = getQuizRoleAnswers(conoce || {}, role);
  const fortalezas = calculateFortalezas(fort);
  const valores = calculateValores(val);
  const personalidad = calculatePersonalidad(pers);
  const totalAnswered = Object.keys(fort).length + Object.keys(val).length + Object.keys(pers).length;
  const totalNeeded = QUIZZES.reduce((acc, q) => acc + q.questions.length, 0);
  const complete = totalAnswered === totalNeeded;
  const tips = generateAdvice(fortalezas, valores, personalidad, complete);
  return { complete, tips, progress: { answered: totalAnswered, total: totalNeeded } };
}

export default function Cuestionarios({ conoce, onSave, onQuizComplete, user }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const nameParts = String(user?.names || "").split("&").map((s) => s.trim()).filter(Boolean);
  const ownerName = nameParts[0] || "Panda A";
  const partnerName = nameParts[1] || nameParts[0] || "Panda B";
  const myName = myRole === "owner" ? ownerName : partnerName;
  const otherName = myRole === "owner" ? partnerName : ownerName;
  const [openQuiz, setOpenQuiz] = useState(null);
  const [quizNoticeById, setQuizNoticeById] = useState({});
  const rewardedByQuizRef = useRef({});

  const progressByQuiz = useMemo(() => {
    const map = {};
    QUIZZES.forEach((quiz) => {
      let answered = 0;
      quiz.questions.forEach((_, idx) => {
        const key = `${quiz.catKey}-${idx}`;
        if (conoce?.[key]?.[myRole]) answered += 1;
      });
      map[quiz.id] = { answered, total: quiz.questions.length };
    });
    return map;
  }, [conoce, myRole]);

  const myAdvice = useMemo(() => getQuizAdviceFromConoce(conoce || {}, myRole), [conoce, myRole]);
  const partnerAdvice = useMemo(() => getQuizAdviceFromConoce(conoce || {}, partnerRole), [conoce, partnerRole]);

  const saveResponse = (quiz, idx, value, alreadyAnswered, answeredBefore) => {
    const key = `${quiz.catKey}-${idx}`;
    const isNewMine = !conoce?.[key]?.[myRole];
    onSave(quiz.catKey, idx, String(value), null, isNewMine);

    const nextAnswered = answeredBefore + (alreadyAnswered ? 0 : 1);
    const completedNow = answeredBefore < quiz.questions.length && nextAnswered === quiz.questions.length;
    if (completedNow && !rewardedByQuizRef.current[quiz.id]) {
      rewardedByQuizRef.current[quiz.id] = true;
      setQuizNoticeById((prev) => ({ ...prev, [quiz.id]: `✅ ${quiz.title} completado. +15 bambú.` }));
      onQuizComplete?.(quiz.title);
    }
  };

  return (
    <div style={{ background: "#ffffff", borderRadius: 18, padding: 14, border: "1.5px solid rgba(63,47,99,0.16)", marginTop: 12 }}>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: "#3f2f63", marginBottom: 4 }}>
        3 test para conocerse mejor
      </div>
      <div style={{ fontSize: "0.78rem", color: "#5f4d7f", marginBottom: 10, lineHeight: 1.55 }}>
        Respondan individualmente y luego comparen resultados. Mochi les sugiere 5 consejos personalizados cuando terminen los tres.
      </div>

      {QUIZZES.map((quiz) => {
        const prog = progressByQuiz[quiz.id] || { answered: 0, total: quiz.questions.length };
        const isOpen = openQuiz === quiz.id;
        return (
          <div key={quiz.id} style={{ background: "#f3ecff", borderRadius: 14, padding: 12, border: "1px solid rgba(63,47,99,0.12)", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: "#3f2f63", fontSize: "0.88rem" }}>
                  {quiz.emoji} {quiz.title}
                </div>
                <div style={{ color: "#5f4d7f", fontSize: "0.72rem" }}>{quiz.subtitle}</div>
                <div style={{ marginTop: 4, fontSize: "0.68rem", fontWeight: 800, color: "#6f56b8" }}>
                  {prog.answered} / {prog.total}
                </div>
              </div>
              <button
                onClick={() => setOpenQuiz(isOpen ? null : quiz.id)}
                style={{
                  border: "none",
                  background: "#6f56b8",
                  color: "#f8f3ff",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {isOpen ? "Cerrar" : "Abrir"}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                {quiz.questions.map((q, idx) => {
                  const key = `${quiz.catKey}-${idx}`;
                  const selected = conoce?.[key]?.[myRole];
                  const alreadyAnswered = !!selected;
                  const answeredBefore = prog.answered;
                  return (
                    <div key={idx} style={{ background: "#fff", borderRadius: 12, padding: 10, marginBottom: 8, border: "1px solid rgba(63,47,99,0.12)" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#3f2f63", marginBottom: 8 }}>
                        {idx + 1}. {q.text}
                      </div>

                      {quiz.type === "scale" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {SCALE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => saveResponse(quiz, idx, opt.id, alreadyAnswered, answeredBefore)}
                              style={{
                                border: selected === opt.id ? "2px solid #6f56b8" : "1px solid rgba(63,47,99,0.15)",
                                background: opt.color,
                                borderRadius: 9,
                                padding: "7px 8px",
                                fontSize: "0.72rem",
                                fontWeight: 800,
                                color: "#32264a",
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {quiz.type === "value" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                          {q.options.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => saveResponse(quiz, idx, opt.id, alreadyAnswered, answeredBefore)}
                              style={{
                                border: selected === opt.id ? "2px solid #6f56b8" : "1px solid rgba(63,47,99,0.15)",
                                background: selected === opt.id ? "#efe6ff" : "#fff",
                                borderRadius: 9,
                                padding: "8px 10px",
                                textAlign: "left",
                                fontSize: "0.76rem",
                                fontWeight: 700,
                                color: "#32264a",
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {prog.answered === prog.total && (
                  <div style={{ background: "#efe6ff", border: "1px solid rgba(111,86,184,0.28)", color: "#4b3b75", borderRadius: 10, padding: "8px 10px", fontSize: "0.74rem", fontWeight: 800, marginTop: 8 }}>
                    ✅ Ya completaste este cuestionario.
                  </div>
                )}
                {quizNoticeById[quiz.id] && (
                  <div style={{ background: "#f3ecff", border: "1px solid rgba(111,86,184,0.22)", color: "#4b3b75", borderRadius: 10, padding: "8px 10px", fontSize: "0.74rem", fontWeight: 800, marginTop: 8 }}>
                    {quizNoticeById[quiz.id]}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ background: "#f3ecff", borderRadius: 14, padding: 12, border: "1px solid rgba(63,47,99,0.12)", marginTop: 10 }}>
        <div style={{ fontWeight: 800, color: "#3f2f63", fontSize: "0.9rem", marginBottom: 8 }}>
          📊 Resultados de tests
        </div>

        {[{ name: myName, advice: myAdvice }, { name: otherName, advice: partnerAdvice }].map((p) => (
          <div key={p.name} style={{ background: "#fff", borderRadius: 11, padding: 10, border: "1px solid rgba(63,47,99,0.12)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#3f2f63" }}>🐼 {p.name}</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 800, color: p.advice.complete ? "#6f56b8" : "#5f4d7f" }}>
                {p.advice.progress.answered}/{p.advice.progress.total}
              </div>
            </div>

            {!p.advice.complete ? (
              <div style={{ fontSize: "0.74rem", color: "#5f4d7f", lineHeight: 1.6 }}>
                Aún faltan respuestas para generar los consejos de Mochi.
              </div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18, color: "#32264a" }}>
                {p.advice.tips.map((tip, idx) => (
                  <li key={idx} style={{ fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.55, marginBottom: 3 }}>{tip}</li>
                ))}
              </ol>
            )}
          </div>
        ))}

        <div style={{ fontSize: "0.72rem", color: "#5f4d7f" }}>
          Aquí se muestran los resultados y consejos de los tests, dentro de Conócete.
        </div>
      </div>
    </div>
  );
}
