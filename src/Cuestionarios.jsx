import React, { useMemo, useRef, useState } from "react";

const SCALE_OPTIONS = [
  { id: "1", label: "Casi nunca", color: "#f3ecff" },
  { id: "2", label: "A veces", color: "#eee2ff" },
  { id: "3", label: "Frecuente", color: "#e6d7ff" },
  { id: "4", label: "Casi siempre", color: "#dccbff" },
  { id: "5", label: "Siempre", color: "#d2bfff" },
];

// ─── PERSONALITY TESTS DATA ───────────────────────────────────────────

const BIGFIVE_QUESTIONS = [
  // Extraversion (E) — directo
  { text: "Soy alguien que disfruta estar rodeado/a de gente.", domain: "E", key: "direct" },
  { text: "En reuniones sociales suelo ser el alma de la fiesta.", domain: "E", key: "direct" },
  { text: "Me cuesta iniciar conversaciones con desconocidos.", domain: "E", key: "reverse" },
  { text: "Prefiero actividades tranquilas en casa a eventos grandes.", domain: "E", key: "reverse" },
  { text: "Me siento con energía después de pasar tiempo con otros.", domain: "E", key: "direct" },
  // Agreeableness (A) — directo
  { text: "Me preocupo por los sentimientos de los demás.", domain: "A", key: "direct" },
  { text: "Tengo empatía cuando alguien me cuenta un problema.", domain: "A", key: "direct" },
  { text: "A veces me cuesta confiar en las intenciones de otros.", domain: "A", key: "reverse" },
  { text: "Me gusta cooperar más que competir.", domain: "A", key: "direct" },
  { text: "Suelo ser directo/a aunque eso moleste a alguien.", domain: "A", key: "reverse" },
  // Conscientiousness (C) — directo
  { text: "Me gusta tener las cosas ordenadas y planificadas.", domain: "C", key: "direct" },
  { text: "Cumplo con mis compromisos aunque cueste.", domain: "C", key: "direct" },
  { text: "A veces dejo tareas para después sin querer.", domain: "C", key: "reverse" },
  { text: "Presto atención a los detalles.", domain: "C", key: "direct" },
  { text: "Sigo una rutina que me ayuda a sentirme estable.", domain: "C", key: "direct" },
  // Neuroticism (N) — directo
  { text: "Me estreso con facilidad cuando hay mucho en juego.", domain: "N", key: "direct" },
  { text: "A veces mi mente se queda dando vueltas por preocupaciones.", domain: "N", key: "direct" },
  { text: "Suelo mantener la calma bajo presión.", domain: "N", key: "reverse" },
  { text: "Me afectan más las críticas de lo que me gustaría.", domain: "N", key: "direct" },
  { text: "Tiendo a ver primero lo que podría salir mal.", domain: "N", key: "direct" },
  // Openness (O) — directo
  { text: "Me gusta probar cosas nuevas y diferentes.", domain: "O", key: "direct" },
  { text: "Disfruto reflexionar sobre ideas abstractas o creativas.", domain: "O", key: "direct" },
  { text: "Prefiero lo práctico y concreto a lo imaginativo.", domain: "O", key: "reverse" },
  { text: "Me interesa explorar nuevas formas de ver el mundo.", domain: "O", key: "direct" },
  { text: "La rutina me da más seguridad que la novedad.", domain: "O", key: "reverse" },
];

const LOVE_STYLES_QUESTIONS = [
  // Eros (pasión romántica)
  { text: "Siento que mi pareja y yo nos conectamos desde el primer momento.", style: "eros" },
  { text: "Para mí el amor incluye mucha intensidad emocional y física.", style: "eros" },
  { text: "Me gusta que la relación tenga magia y química constante.", style: "eros" },
  { text: "Cuando elijo pareja, me guío mucho por la atracción y la conexión inmediata.", style: "eros" },
  // Ludus (juego)
  { text: "Prefiero mantener cierta libertad incluso en una relación.", style: "ludus" },
  { text: "Me cuesta planear a largo plazo en el amor.", style: "ludus" },
  { text: "A veces disfruto el coqueteo y la incertidumbre.", style: "ludus" },
  { text: "Me incomoda sentirme atrapado/a en la relación.", style: "ludus" },
  // Storge (amistad)
  { text: "Para mí lo mejor de la relación es la amistad profunda.", style: "storge" },
  { text: "Quiero que mi pareja sea también mi mejor amigo/a.", style: "storge" },
  { text: "El amor crece con el tiempo y la confianza.", style: "storge" },
  { text: "Valoro más la compañía constante que los gestos dramáticos.", style: "storge" },
  // Pragma (práctico)
  { text: "Busco en una pareja que encaje bien en mi proyecto de vida.", style: "pragma" },
  { text: "Pienso en metas, valores y estilo de vida antes de enamorarme.", style: "pragma" },
  { text: "Me gusta que la relación sea estable y predecible.", style: "pragma" },
  { text: "La lógica y la compatibilidad práctica son importantes para mí.", style: "pragma" },
  // Mania (obsesivo)
  { text: "Cuando estoy enamorado/a, pienso en la persona todo el tiempo.", style: "mania" },
  { text: "Necesito mucha seguridad de que mi pareja siente lo mismo.", style: "mania" },
  { text: "El amor me hace sentir altos y bajos muy intensos.", style: "mania" },
  { text: "Me cuesta calmarme si siento distancia emocional.", style: "mania" },
  // Agape (desinteresado)
  { text: "Amo sin esperar nada a cambio.", style: "agape" },
  { text: "El bienestar de mi pareja me importa tanto como el mío.", style: "agape" },
  { text: "Me gusta cuidar y apoyar, aunque no sea correspondido al instante.", style: "agape" },
  { text: "Creo que el amor verdadero es dar, no solo recibir.", style: "agape" },
];

const ATTACHMENT_QUESTIONS = [
  // Ansiedad
  { text: "Me preocupa que mi pareja deje de quererme.", dim: "anxiety", key: "direct" },
  { text: "Necesito mucha seguridad de que todo está bien en la relación.", dim: "anxiety", key: "direct" },
  { text: "Si mi pareja está distante, siento que hice algo mal.", dim: "anxiety", key: "direct" },
  { text: "Me siento tranquilo/a cuando sé que mi pareja está ahí para mí.", dim: "anxiety", key: "reverse" },
  { text: "Me cuesta sentirme realmente querido/a aunque me lo digan.", dim: "anxiety", key: "direct" },
  // Evitación
  { text: "Prefiero no depender emocionalmente de mi pareja.", dim: "avoidance", key: "direct" },
  { text: "Me incomoda hablar mucho de mis sentimientos íntimos.", dim: "avoidance", key: "direct" },
  { text: "Necesito mi espacio personal para sentirme bien en la relación.", dim: "avoidance", key: "direct" },
  { text: "Me gusta poder contar con mi pareja cuando lo necesito.", dim: "avoidance", key: "reverse" },
  { text: "Suelo procesar mis emociones solo/a antes de compartirlas.", dim: "avoidance", key: "direct" },
];

const BIGFIVE_LABELS = {
  E: "Extraversión",
  A: "Amabilidad",
  C: "Responsabilidad",
  N: "Neuroticismo",
  O: "Apertura",
};

const LOVE_STYLE_LABELS = {
  eros: "Eros (pasión)",
  ludus: "Ludus (juego/libertad)",
  storge: "Storge (amistad)",
  pragma: "Pragma (práctico)",
  mania: "Mania (intenso)",
  agape: "Agape (entrega)",
};

const ATTACHMENT_STYLES = [
  {
    key: "secure",
    label: "Seguro",
    emoji: "🌿",
    desc: "Te sientes cómodo/a con la cercanía y también con la independencia. Confías en que la relación está bien.",
  },
  {
    key: "anxious",
    label: "Ansioso",
    emoji: "🌧️",
    desc: "Buscas mucha cercanía y seguridad. A veces la distancia se siente como abandono.",
  },
  {
    key: "avoidant",
    label: "Evitativo",
    emoji: "🛡️",
    desc: "Valoras tu autonomía. La cercanía intensa puede hacerte sentir expuesto/a.",
  },
  {
    key: "fearful",
    label: "Temeroso",
    emoji: "🌊",
    desc: "Deseas cercanía pero también te da miedo. Puedes sentirte atrapado/a entre ambas necesidades.",
  },
];

const QUIZZES = [
  {
    id: "bigfive",
    catKey: "quizBigFive",
    title: "Big Five",
    emoji: "🌊",
    subtitle: "Tus 5 dimensiones de personalidad",
    type: "scale",
    questions: BIGFIVE_QUESTIONS,
  },
  {
    id: "lovestyles",
    catKey: "quizLoveStyles",
    title: "Estilos de amor",
    emoji: "💖",
    subtitle: "Cómo das y recibes cariño",
    type: "scale",
    questions: LOVE_STYLES_QUESTIONS,
  },
  {
    id: "attachment",
    catKey: "quizAttachment",
    title: "Apego en pareja",
    emoji: "🫂",
    subtitle: "Cómo vives la cercanía",
    type: "scale",
    questions: ATTACHMENT_QUESTIONS,
    disclaimer: "Inspirado en la teoría del apego adulto (Bowlby, Ainsworth, Hazan & Shaver). No es el ECR-R ni un instrumento clínico.",
  },
];

function parseScale(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calculateBigFive(respuestas) {
  const sums = { E: 0, A: 0, C: 0, N: 0, O: 0 };
  const counts = { E: 0, A: 0, C: 0, N: 0, O: 0 };
  QUIZZES.find((q) => q.id === "bigfive").questions.forEach((q, idx) => {
    const raw = parseScale(respuestas[idx]);
    if (raw == null) return;
    const val = q.key === "reverse" ? 6 - raw : raw; // 1->5, 5->1
    sums[q.domain] += val;
    counts[q.domain] += 1;
  });
  const scores = {};
  Object.keys(sums).forEach((k) => {
    const raw = counts[k] ? sums[k] / counts[k] : 0; // 1-5
    scores[k] = {
      score: Math.round(((raw - 1) / 4) * 100),
      level: raw >= 3.6 ? "alto" : raw <= 2.4 ? "bajo" : "medio",
      raw,
    };
  });
  return scores;
}

function calculateLoveStyles(respuestas) {
  const sums = { eros: 0, ludus: 0, storge: 0, pragma: 0, mania: 0, agape: 0 };
  const counts = { eros: 0, ludus: 0, storge: 0, pragma: 0, mania: 0, agape: 0 };
  QUIZZES.find((q) => q.id === "lovestyles").questions.forEach((q, idx) => {
    const raw = parseScale(respuestas[idx]);
    if (raw == null) return;
    sums[q.style] += raw;
    counts[q.style] += 1;
  });
  const styles = Object.entries(sums)
    .map(([key, total]) => ({ key, score: counts[key] ? total / counts[key] : 0, total, count: counts[key] }))
    .sort((a, b) => b.score - a.score);
  const primary = styles[0]?.key;
  const secondary = styles[1]?.key;
  return { styles, primary, secondary };
}

function calculateAttachment(respuestas) {
  const dims = { anxiety: { sum: 0, count: 0 }, avoidance: { sum: 0, count: 0 } };
  QUIZZES.find((q) => q.id === "attachment").questions.forEach((q, idx) => {
    const raw = parseScale(respuestas[idx]);
    if (raw == null) return;
    const val = q.key === "reverse" ? 6 - raw : raw;
    dims[q.dim].sum += val;
    dims[q.dim].count += 1;
  });
  const anxiety = dims.anxiety.count ? dims.anxiety.sum / dims.anxiety.count : 0;
  const avoidance = dims.avoidance.count ? dims.avoidance.sum / dims.avoidance.count : 0;
  let style = "secure";
  if (anxiety >= 3.6 && avoidance < 3.6) style = "anxious";
  else if (anxiety < 3.6 && avoidance >= 3.6) style = "avoidant";
  else if (anxiety >= 3.6 && avoidance >= 3.6) style = "fearful";
  return { anxiety: Math.round(((anxiety - 1) / 4) * 100), avoidance: Math.round(((avoidance - 1) / 4) * 100), style };
}

function getQuizRoleAnswers(conoce, role) {
  const bigfive = {};
  const lovestyles = {};
  const attachment = {};

  QUIZZES.forEach((quiz) => {
    quiz.questions.forEach((_, idx) => {
      const key = `${quiz.catKey}-${idx}`;
      const raw = conoce?.[key]?.[role];
      if (raw == null) return;
      if (quiz.id === "bigfive") bigfive[idx] = Number(raw);
      if (quiz.id === "lovestyles") lovestyles[idx] = Number(raw);
      if (quiz.id === "attachment") attachment[idx] = Number(raw);
    });
  });

  return { bigfive, lovestyles, attachment };
}

function generateComparison(me, partner) {
  const tips = [];
  if (!me || !partner) return tips;

  // Big Five tips
  const bfMe = calculateBigFive(me.bigfive || {});
  const bfPartner = calculateBigFive(partner.bigfive || {});
  if (bfMe.N && bfPartner.N) {
    const diff = bfMe.N.score - bfPartner.N.score;
    if (Math.abs(diff) > 25) {
      tips.push(
        `Uno de ustedes vive el estrés más intenso que el otro. Acuerden una señal de "necesito pausa" para no sobrecargarse.`
      );
    }
  }
  if (bfMe.E && bfPartner.E) {
    const diff = bfMe.E.score - bfPartner.E.score;
    if (Math.abs(diff) > 25) {
      tips.push(
        `Tienen niveles de energía social distintos. Negocien cuántos planes compartidos al mes se sienten bien para ambos.`
      );
    }
  }

  // Love styles tips
  const lsMe = calculateLoveStyles(me.lovestyles || {});
  const lsPartner = calculateLoveStyles(partner.lovestyles || {});
  if (lsMe.primary && lsPartner.primary && lsMe.primary !== lsPartner.primary) {
    const myPrimary = LOVE_STYLE_LABELS[lsMe.primary].split(" (")[0];
    const theirPrimary = LOVE_STYLE_LABELS[lsPartner.primary].split(" (")[0];
    tips.push(
      `Tus estilos de amor principales son ${myPrimary} y ${theirPrimary}. Lo que a uno le dice "te quiero" puede no ser lo mismo para el otro: pregúntense "¿cómo te sientes amado/a hoy?".`
    );
  }

  // Attachment tips
  const atMe = calculateAttachment(me.attachment || {});
  const atPartner = calculateAttachment(partner.attachment || {});
  if (atMe.style === "secure" && atPartner.style !== "secure") {
    tips.push(
      `Uno tiene un apego más seguro. Esa calma puede ser un ancla para el otro: ofrezcan seguridad sin presionar.`
    );
  } else if (atMe.style !== "secure" && atPartner.style !== "secure") {
    tips.push(
      `Ambos tienen inquietudes en la cercanía. Acuerden pequeños rituales de conexión diarios para construir confianza poco a poco.`
    );
  }
  if ((atMe.style === "anxious" && atPartner.style === "avoidant") || (atMe.style === "avoidant" && atPartner.style === "anxious")) {
    tips.push(
      `Uno busca cercanía y el otro espacio: esto puede crear un ciclo de persecución-distancia. Pídanse lo que necesitan en lugar de exigirlo.`
    );
  }

  return tips.slice(0, 5);
}

export function getQuizResultsFromConoce(conoce, role) {
  const { bigfive, lovestyles, attachment } = getQuizRoleAnswers(conoce || {}, role);
  const bigfiveComplete = Object.keys(bigfive).length === BIGFIVE_QUESTIONS.length;
  const lovestylesComplete = Object.keys(lovestyles).length === LOVE_STYLES_QUESTIONS.length;
  const attachmentComplete = Object.keys(attachment).length === ATTACHMENT_QUESTIONS.length;
  const complete = bigfiveComplete && lovestylesComplete && attachmentComplete;
  const progress = {
    answered: Object.keys(bigfive).length + Object.keys(lovestyles).length + Object.keys(attachment).length,
    total: BIGFIVE_QUESTIONS.length + LOVE_STYLES_QUESTIONS.length + ATTACHMENT_QUESTIONS.length,
  };
  if (!complete) return { complete, progress };
  return {
    complete,
    progress,
    bigfive: calculateBigFive(bigfive),
    lovestyles: calculateLoveStyles(lovestyles),
    attachment: calculateAttachment(attachment),
  };
}

export function getCoupleComparison(conoce) {
  const owner = getQuizResultsFromConoce(conoce, "owner");
  const partner = getQuizResultsFromConoce(conoce, "partner");
  if (!owner.complete || !partner.complete) return null;
  const raw = getQuizRoleAnswers(conoce, "owner");
  const rawPartner = getQuizRoleAnswers(conoce, "partner");
  return {
    owner,
    partner,
    tips: generateComparison(raw, rawPartner),
  };
}

export default function Cuestionarios({ conoce, onSave, onQuizComplete, onReset, user }) {
  const myRole = user?.isOwner !== false ? "owner" : "partner";
  const partnerRole = myRole === "owner" ? "partner" : "owner";
  const nameParts = String(user?.names || "").split("&").map((s) => s.trim()).filter(Boolean);
  const ownerName = nameParts[0] || "Panda A";
  const partnerName = nameParts[1] || nameParts[0] || "Panda B";
  const myName = myRole === "owner" ? ownerName : partnerName;
  const otherName = myRole === "owner" ? partnerName : ownerName;
  const [openQuiz, setOpenQuiz] = useState(null);
  const [quizNoticeById, setQuizNoticeById] = useState({});
  const [showResults, setShowResults] = useState(false);
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

  const myResults = useMemo(() => getQuizResultsFromConoce(conoce || {}, myRole), [conoce, myRole]);
  const partnerResults = useMemo(() => getQuizResultsFromConoce(conoce || {}, partnerRole), [conoce, partnerRole]);
  const comparison = useMemo(() => getCoupleComparison(conoce || {}), [conoce]);

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
        Respondan individualmente y luego comparen resultados. Mochi les sugiere consejos personalizados cuando ambos terminen.
      </div>

      {QUIZZES.map((quiz) => {
        const prog = progressByQuiz[quiz.id] || { answered: 0, total: quiz.questions.length };
        const isOpen = openQuiz === quiz.id;
        return (
          <div key={quiz.id} style={{ background: "#f3ecff", borderRadius: 14, padding: 12, border: "1px solid rgba(63,47,99,0.12)", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
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
                {quiz.disclaimer && (
                  <div style={{ fontSize: "0.68rem", color: "#6b5a8a", background: "#f8f6ff", borderRadius: 8, padding: 8, marginBottom: 10, lineHeight: 1.5 }}>
                    ℹ️ {quiz.disclaimer}
                  </div>
                )}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, color: "#3f2f63", fontSize: "0.9rem" }}>📊 Resultados</div>
          {comparison && (
            <button
              onClick={() => setShowResults((s) => !s)}
              style={{ border: "none", background: "#6f56b8", color: "#f8f3ff", borderRadius: 8, padding: "5px 10px", fontSize: "0.7rem", fontWeight: 800, cursor: "pointer" }}
            >
              {showResults ? "Ocultar" : "Ver"}
            </button>
          )}
        </div>

        {[{ name: myName, results: myResults, who: "yo" }, { name: otherName, results: partnerResults, who: "pareja" }].map((p) => (
          <div key={p.who} style={{ background: "#fff", borderRadius: 11, padding: 10, border: "1px solid rgba(63,47,99,0.12)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#3f2f63" }}>🐼 {p.name}</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 800, color: p.results.complete ? "#6f56b8" : "#5f4d7f" }}>
                {p.results.progress.answered}/{p.results.progress.total}
              </div>
            </div>

            {!p.results.complete ? (
              <div style={{ fontSize: "0.74rem", color: "#5f4d7f", lineHeight: 1.6 }}>
                Aún faltan respuestas para ver los resultados completos.
              </div>
            ) : showResults ? (
              <div style={{ fontSize: "0.74rem", color: "#32264a", lineHeight: 1.55 }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Big Five:</strong>{" "}
                  {Object.entries(p.results.bigfive).map(([k, v]) => `${BIGFIVE_LABELS[k]} ${v.score}%`).join(" · ")}
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Amor:</strong>{" "}
                  {LOVE_STYLE_LABELS[p.results.lovestyles.primary]} y {LOVE_STYLE_LABELS[p.results.lovestyles.secondary]}
                </div>
                <div>
                  <strong>Apego:</strong>{" "}
                  {ATTACHMENT_STYLES.find((s) => s.key === p.results.attachment.style)?.emoji}{" "}
                  {ATTACHMENT_STYLES.find((s) => s.key === p.results.attachment.style)?.label}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "0.74rem", color: "#5f4d7f", lineHeight: 1.6 }}>
                Resultados listos. Presiona "Ver" para descubrirlos juntos.
              </div>
            )}
          </div>
        ))}

        {comparison && showResults && (
          <div style={{ background: "#fff", borderRadius: 11, padding: 10, border: "1px solid rgba(63,47,99,0.12)", marginBottom: 8 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#3f2f63", marginBottom: 6 }}>💡 Consejos de Mochi</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: "#32264a" }}>
              {comparison.tips.map((tip, idx) => (
                <li key={idx} style={{ fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.55, marginBottom: 4 }}>{tip}</li>
              ))}
            </ol>
          </div>
        )}

        <button
          onClick={() => {
            if (confirm("¿Quieren rehacer los tests? Se borrarán las respuestas actuales.")) {
              onReset?.();
            }
          }}
          style={{
            width: "100%",
            marginTop: 8,
            background: "#6f56b8",
            color: "#f8f3ff",
            border: "none",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: "0.8rem",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          🔄 Rehacer tests
        </button>

        <div style={{ fontSize: "0.72rem", color: "#5f4d7f", marginTop: 8 }}>
          Estos tests son para auto-conocimiento. No sustituyen evaluación psicológica profesional.
        </div>
      </div>
    </div>
  );
}
