import React, { useEffect, useMemo, useState } from "react";
import {
  fbCreateDailyQuestion,
  fbGetDailyQuestion,
  fbListenDailyQuestion,
  fbSaveDailyAnswer,
} from "./firebase";
import {
  DAILY_SEED_BAMBOO_REWARD,
  getDailySeedForCouple,
  getDateKeyLocal,
} from "./dailySeed";

const C = {
  cream: "#ded0f2",
  cream2: "#f8f3fc",
  dark: "#3f2f5a",
  olive: "#8b6fc9",
  white: "#faf7fc",
  ink: "#3a2a52",
  inkM: "#6b5a87",
  inkL: "#9c8cb5",
  border: "rgba(58,42,82,0.16)",
};

function getMyRole(user) {
  return user?.isOwner !== false ? "owner" : "partner";
}

function getPartnerRole(role) {
  return role === "owner" ? "partner" : "owner";
}

// Hook that loads/creates today's daily seed question and listens for real-time updates.
export function useDailySeed(user) {
  const [dailySeed, setDailySeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const dateKey = useMemo(() => getDateKeyLocal(), []);

  const coupleCode = user?.code;
  const role = getMyRole(user);

  useEffect(() => {
    if (!coupleCode) {
      setDailySeed(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const seedQuestion = getDailySeedForCouple(coupleCode, dateKey);

    const makeLocalSeed = () => ({
      coupleCode,
      date: dateKey,
      questionId: seedQuestion.id,
      questionText: seedQuestion.text,
      category: seedQuestion.category,
      answers: {},
      bambooEarned: DAILY_SEED_BAMBOO_REWARD,
    });

    const normalize = (data) => ({
      ...makeLocalSeed(),
      ...data,
      // Prefer local computed questionText if server copy is missing or empty.
      questionText: data?.questionText || seedQuestion.text,
      questionId: data?.questionId || seedQuestion.id,
      category: data?.category || seedQuestion.category,
    });

    // Ensure the document exists, then listen for live updates.
    fbGetDailyQuestion(coupleCode, dateKey)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          const merged = normalize(existing);
          setDailySeed(merged);
          setLoading(false);
          return;
        }
        return fbCreateDailyQuestion(coupleCode, dateKey, {
          questionId: seedQuestion.id,
          questionText: seedQuestion.text,
          category: seedQuestion.category,
        }).then((created) => {
          if (!cancelled) {
            setDailySeed(normalize(created));
            setLoading(false);
          }
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDailySeed(makeLocalSeed());
        setLoading(false);
      });

    const unsubscribe = fbListenDailyQuestion(coupleCode, dateKey, (data) => {
      if (!cancelled) {
        setDailySeed(normalize(data));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [coupleCode, dateKey, role, user?.uid]);

  const hasAnswered = !!dailySeed?.answers?.[role]?.text;
  const partnerAnswer = dailySeed?.answers?.[getPartnerRole(role)]?.text;

  return { dailySeed, loading, dateKey, role, hasAnswered, partnerAnswer };
}

export default function DailySeedModal({
  user,
  streakInfo,
  onAnswer,
  onClose,
}) {
  const { dailySeed, loading, dateKey, role, hasAnswered, partnerAnswer } = useDailySeed(user);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (hasAnswered) {
      setSubmitted(true);
      setText(dailySeed?.answers?.[role]?.text || "");
    }
  }, [hasAnswered, dailySeed, role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !dailySeed || hasAnswered) return;

    const coupleCode = user?.code;
    if (!coupleCode) return;

    setSubmitted(true);

    // Persist answer.
    await fbSaveDailyAnswer(coupleCode, dateKey, user?.uid || "guest", role, clean).catch(() => {});

    onAnswer?.({
      dateKey,
      questionId: dailySeed.questionId,
      text: clean,
      role,
      reward: DAILY_SEED_BAMBOO_REWARD,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(44,38,58,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Nunito',sans-serif",
        backdropFilter: "blur(4px)",
      }}
    >
      <style>{`
        @keyframes seedModalIn { from { opacity:0; transform:translateY(18px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes seedFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
      `}</style>
      <div
        style={{
          position: "relative",
          background: "#FFFBF5",
          borderRadius: 28,
          padding: "28px 26px 26px",
          maxWidth: 380,
          width: "100%",
          boxShadow: "0 24px 60px rgba(44,38,58,0.25), 0 8px 20px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,0,0,0.06)",
          textAlign: "center",
          animation: "seedModalIn 0.45s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <span style={{ fontSize: "2.6rem", animation: "seedFloat 2.5s ease-in-out infinite" }}>🌱</span>
        </div>

        {loading ? (
          <div style={{ color: C.inkM, fontSize: "0.9rem", padding: "20px 0" }}>Cargando tu semilla del día...</div>
        ) : (
          <>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: "1.35rem", color: C.dark, lineHeight: 1.25, marginBottom: 6 }}>
              Semilla del día
            </div>
            <div style={{ fontSize: "0.95rem", color: C.inkM, lineHeight: 1.5, marginBottom: 18, minHeight: 44 }}>
              {dailySeed?.questionText}
            </div>

            {streakInfo?.currentStreak > 0 && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#e8f5e4",
                  color: "#3a7a2e",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  marginBottom: 16,
                }}
              >
                🔥 Racha actual: {streakInfo.currentStreak} día{streakInfo.currentStreak !== 1 ? "s" : ""}
              </div>
            )}

            {!submitted ? (
              <form onSubmit={handleSubmit}>
                <div style={{ position: "relative", marginBottom: 14 }}>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    rows={4}
                    maxLength={280}
                    autoFocus
                    style={{
                      width: "100%",
                      borderRadius: 18,
                      border: `1.5px solid ${C.border}`,
                      padding: "14px 16px 28px",
                      fontFamily: "'Nunito',sans-serif",
                      fontSize: "1rem",
                      resize: "none",
                      boxSizing: "border-box",
                      background: C.white,
                      color: C.ink,
                      lineHeight: 1.5,
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#9dc983";
                      e.target.style.boxShadow = "0 0 0 3px rgba(125,176,105,0.12), inset 0 1px 3px rgba(0,0,0,0.04)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = C.border;
                      e.target.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.04)";
                    }}
                  />
                  <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>
                    {text.length}/280
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!text.trim()}
                  style={{
                    width: "100%",
                    background: text.trim() ? "linear-gradient(180deg, #7fb069 0%, #5f8a4e 100%)" : "#d8c5ca",
                    color: C.white,
                    border: "none",
                    borderRadius: 16,
                    padding: "14px 18px",
                    fontFamily: "'Baloo 2',sans-serif",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: text.trim() ? "pointer" : "not-allowed",
                    boxShadow: text.trim() ? "0 4px 0 #3e5c32, 0 6px 16px rgba(127,176,105,0.28)" : "none",
                    transition: "all 0.15s",
                    marginBottom: 12,
                  }}
                >
                  Guardar respuesta (+{DAILY_SEED_BAMBOO_REWARD} 🌿)
                </button>
              </form>
            ) : (
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(127,176,105,0.1)",
                    color: "#3e5c32",
                    padding: "10px 16px",
                    borderRadius: 20,
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    marginBottom: 16,
                  }}
                >
                  ✅ ¡Gracias! +{DAILY_SEED_BAMBOO_REWARD} bambú
                </div>
                {partnerAnswer && (
                  <div style={{ background: C.white, borderRadius: 14, padding: 14, border: `1.5px solid ${C.border}`, textAlign: "left", marginBottom: 16 }}>
                    <div style={{ fontSize: "0.75rem", color: C.inkL, fontWeight: 800, marginBottom: 6 }}>Tu pareja respondió:</div>
                    <div style={{ fontSize: "0.9rem", color: C.ink, lineHeight: 1.5 }}>{partnerAnswer}</div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: C.inkL, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", padding: "8px 12px", borderRadius: 10 }}
            >
              {submitted ? "Cerrar" : "Hoy no, gracias"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
