import React, { useState, useRef, useEffect } from "react";

const C = {
  cream: "#ded0f2", cream2: "#f8f3fc", dark: "#3f2f5a",
  olive: "#8b6fc9", oliveL: "#b8a0e8", gold: "#d9a441",
  salmon: "#e8608c", sky: "#8b9fe0", sand: "#ddc9f0", sandL: "#f3ecfb",
  white: "#faf7fc", ink: "#3a2a52", inkM: "#6b5a87", inkL: "#9c8cb5",
  border: "rgba(58,42,82,0.16)", line: "rgba(58,42,82,0.09)",
  pink: "#e8c4f0", rose: "#c77fc2",
  mint: "#c8e8c0", teal: "#4f8a6e",
};

const buildSlides = (lesson) => [
  {
    type: "intro",
    title: `${lesson.emoji} Introducción`,
    body: lesson.intro,
    image: lesson.illustrations?.[0],
    emoji: lesson.emoji,
  },
  ...lesson.sections.map((s, i) => ({
    type: "section",
    title: `${s.icon || "🐼"} ${s.title}`,
    body: s.body,
    image: lesson.illustrations?.[i + 1],
    emoji: s.icon || "🐼",
  })),
  {
    type: "reflect",
    title: "🤔 Reflexionen juntos",
    body: lesson.reflect,
    image: lesson.illustrations?.[lesson.sections.length + 1],
    emoji: "🤔",
  },
];

export default function LessonCardWizard(props) {
  return props.lesson.fullCardImages ? <FullCardCarousel {...props} /> : <ClassicWizard {...props} />;
}

// ─── FULL CARD MODE (diseños de la usuaria) ─────────────────────────
// Carrusel horizontal. Si las tarjetas traen sus propios puntitos (cardsHaveDots), no se dibujan aquí.
function FullCardCarousel({ lesson, onComplete, onClose, completed }) {
  const slides = buildSlides(lesson);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState({});
  const containerRef = useRef(null);

  const isFirst = idx === 0;
  const isLast = idx === slides.length - 1;

  const go = (delta) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: (idx + delta) * el.clientWidth, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const newIdx = Math.round(el.scrollLeft / el.clientWidth);
    if (newIdx !== idx) setIdx(newIdx);
  };

  return (
    <div style={fullStyles.wrap}>
      <button onClick={onClose} style={fullStyles.closeBtn}>✕</button>

      <div ref={containerRef} style={fullStyles.scroller} onScroll={handleScroll}>
        {slides.map((slide, i) => (
          <div key={i} style={fullStyles.slide}>
            {slide.image && !failed[i] ? (
              <img
                src={slide.image}
                alt={slide.title}
                draggable={false}
                style={fullStyles.cardImage}
                onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              />
            ) : (
              <div style={fullStyles.fallbackCard}>
                <div style={fullStyles.fallbackEmoji}>{slide.emoji}</div>
                <div style={fullStyles.fallbackTitle}>{slide.title}</div>
                <div style={fullStyles.fallbackBody}>{slide.body}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!lesson.cardsHaveDots && (
        <div style={fullStyles.dotsRow}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i - idx)}
              style={{
                ...fullStyles.dot,
                background: i === idx ? C.olive : C.sand,
                transform: i === idx ? "scale(1.25)" : "scale(1)",
              }}
              aria-label={`Ir a tarjeta ${i + 1}`}
            />
          ))}
        </div>
      )}

      <div style={fullStyles.footer}>
        <button
          onClick={() => go(-1)}
          disabled={isFirst}
          style={isFirst ? { ...fullStyles.navBtn, ...fullStyles.navBtnDisabled } : fullStyles.navBtn}
        >
          ← Anterior
        </button>

        {isLast ? (
          completed ? (
            <div style={fullStyles.completedMini}>✓ Completada</div>
          ) : (
            <button onClick={onComplete} style={{ ...fullStyles.navBtn, ...fullStyles.navBtnPrimary }}>
              ✓ Completar · +10 🌿
            </button>
          )
        ) : (
          <button onClick={() => go(1)} style={{ ...fullStyles.navBtn, ...fullStyles.navBtnPrimary }}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── CLASSIC CARD MODE (placeholders / ilustraciones normales) ──────
function ClassicWizard({
  lesson,
  onComplete,
  onClose,
  completed,
  partnerStatus,
  nameA = "Persona A",
  nameB = "Persona B",
}) {
  const slides = buildSlides(lesson);

  const [idx, setIdx] = useState(0);
  const [imgError, setImgError] = useState(false);

  const isFirst = idx === 0;
  const isLast = idx === slides.length - 1;

  useEffect(() => {
    setImgError(false);
  }, [idx, lesson.id]);

  const [direction, setDirection] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const current = slides[idx];
  const showPlaceholder = imgError || !current.image;

  const goClassic = (delta) => {
    if (isAnimating) return;
    const next = idx + delta;
    if (next < 0 || next >= slides.length) return;
    setDirection(delta);
    setIsAnimating(true);
    setTimeout(() => {
      setIdx(next);
      setIsAnimating(false);
    }, 180);
  };

  const handleTouchStartX = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMoveX = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEndX = () => {
    if (touchStartX.current == null || touchEndX.current == null) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goClassic(1);
      else goClassic(-1);
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.counter}>{idx + 1} de {slides.length}</div>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      <div style={styles.dotsRow}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goClassic(i - idx)}
            style={{
              ...styles.dot,
              background: i === idx ? C.olive : C.sand,
              transform: i === idx ? "scale(1.25)" : "scale(1)",
            }}
            aria-label={`Ir a tarjeta ${i + 1}`}
          />
        ))}
      </div>

      <div
        style={styles.cardWrapper}
        onTouchStart={handleTouchStartX}
        onTouchMove={handleTouchMoveX}
        onTouchEnd={handleTouchEndX}
      >
        <div
          style={{
            ...styles.card,
            transform: isAnimating
              ? `translateX(${direction * -30}px)`
              : "translateX(0)",
            opacity: isAnimating ? 0.7 : 1,
          }}
        >
          <div style={styles.imageArea}>
            {!showPlaceholder && (
              <img
                src={current.image}
                alt={current.title}
                style={styles.image}
                onError={() => setImgError(true)}
              />
            )}
            {showPlaceholder && (
              <div style={styles.placeholder}>
                <div style={styles.placeholderEmoji}>{current.emoji}</div>
                <div style={styles.placeholderLabel}>Ilustración pendiente 🎨</div>
              </div>
            )}
          </div>

          <div style={styles.textArea}>
            <div style={styles.title}>{current.title}</div>
            <div style={styles.body}>{current.body}</div>
          </div>
        </div>
      </div>

      <div style={styles.nav}>
        <button
          onClick={() => goClassic(-1)}
          disabled={isFirst}
          style={isFirst ? { ...styles.btn, ...styles.btnDisabled } : { ...styles.btn, ...styles.btnSecondary }}
        >
          ← Anterior
        </button>

        {isLast ? (
          completed ? (
            <div style={styles.completedBadge}>✓ Ya completaste esta lección</div>
          ) : (
            <button onClick={onComplete} style={{ ...styles.btn, ...styles.btnPrimary }}>
              ✓ Completar · +10 🌿
            </button>
          )
        ) : (
          <button onClick={() => goClassic(1)} style={{ ...styles.btn, ...styles.btnPrimary }}>
            Siguiente →
          </button>
        )}
      </div>

      {isLast && partnerStatus && (
        <div style={styles.partnerRow}>
          <span style={{ ...styles.partnerBadge, color: partnerStatus.owner ? C.olive : C.inkL }}>
            🐼 {nameA} {partnerStatus.owner ? "✓" : "pendiente"}
          </span>
          <span style={{ ...styles.partnerBadge, color: partnerStatus.partner ? C.teal : C.inkL }}>
            🐾 {nameB} {partnerStatus.partner ? "✓" : "pendiente"}
          </span>
        </div>
      )}
    </div>
  );
}

const fullStyles = {
  wrap: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#efe9f8",
    display: "flex",
    flexDirection: "column",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    background: "rgba(255,255,255,0.85)",
    border: "none",
    borderRadius: 999,
    width: 38,
    height: 38,
    fontSize: "1.1rem",
    cursor: "pointer",
    color: C.inkM,
    boxShadow: "0 2px 8px rgba(58,42,82,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  scroller: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    overflowX: "auto",
    overflowY: "hidden",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorX: "contain",
    scrollbarWidth: "none",
  },
  slide: {
    flex: "0 0 100%",
    scrollSnapAlign: "center",
    scrollSnapStop: "always",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    boxSizing: "border-box",
    position: "relative",
  },
  cardImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    userSelect: "none",
  },
  fallbackCard: {
    width: "100%",
    maxWidth: 420,
    background: C.white,
    borderRadius: 24,
    padding: "28px 22px",
    textAlign: "center",
    boxShadow: "0 8px 24px rgba(58,42,82,0.10)",
  },
  fallbackEmoji: { fontSize: "3rem", marginBottom: 10 },
  fallbackTitle: {
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "1.1rem",
    color: C.dark,
    fontWeight: 700,
    marginBottom: 8,
  },
  fallbackBody: {
    fontSize: "0.95rem",
    color: C.inkM,
    lineHeight: 1.55,
  },
  dotsRow: {
    display: "flex",
    justifyContent: "center",
    gap: 7,
    paddingTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    border: "none",
    padding: 0,
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  footer: {
    display: "flex",
    gap: 10,
    width: "100%",
    maxWidth: 452,
    margin: "0 auto",
    padding: "10px 16px calc(14px + env(safe-area-inset-bottom))",
    boxSizing: "border-box",
  },
  navBtn: {
    flex: 1,
    border: "none",
    borderRadius: 14,
    padding: "12px 10px",
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
    background: "rgba(255,255,255,0.95)",
    color: C.ink,
    boxShadow: "0 2px 8px rgba(58,42,82,0.15)",
  },
  navBtnPrimary: {
    background: C.olive,
    color: C.cream2,
  },
  navBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  completedMini: {
    flex: 1,
    textAlign: "center",
    borderRadius: 14,
    padding: "13px 10px",
    background: C.mint,
    color: C.dark,
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.95rem",
    fontWeight: 700,
  },
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 420,
    maxHeight: "70vh",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 4px",
  },
  counter: {
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.85rem",
    color: C.inkM,
    fontWeight: 700,
  },
  closeBtn: {
    background: C.sandL,
    border: `1.5px solid ${C.border}`,
    borderRadius: 9,
    width: 32,
    height: 32,
    fontSize: "0.9rem",
    cursor: "pointer",
    color: C.inkM,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    display: "flex",
    justifyContent: "center",
    gap: 7,
    padding: "6px 0 12px",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    border: "none",
    padding: 0,
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  cardWrapper: {
    flex: 1,
    overflow: "hidden",
    padding: "0 16px",
    touchAction: "pan-y",
  },
  card: {
    background: C.white,
    borderRadius: 20,
    border: `1.5px solid ${C.border}`,
    boxShadow: "0 6px 18px rgba(58,42,82,0.08)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.18s ease, opacity 0.18s ease",
    overflow: "hidden",
  },
  imageArea: {
    height: 200,
    minHeight: 180,
    background: C.sandL,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: 8,
  },
  placeholderEmoji: {
    fontSize: "4.5rem",
    lineHeight: 1,
  },
  placeholderLabel: {
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.75rem",
    color: C.inkL,
    fontWeight: 700,
    letterSpacing: "0.4px",
  },
  textArea: {
    padding: "18px 18px 10px",
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  title: {
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "1.05rem",
    color: C.dark,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  body: {
    fontSize: "0.9rem",
    color: C.inkM,
    lineHeight: 1.65,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px 18px",
  },
  btn: {
    flex: 1,
    border: "none",
    borderRadius: 14,
    padding: "14px 10px",
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 0.1s ease, opacity 0.15s ease",
  },
  btnPrimary: {
    background: C.olive,
    color: C.cream2,
    boxShadow: "0 4px 0 rgba(63,47,90,0.25)",
  },
  btnSecondary: {
    background: C.sandL,
    color: C.ink,
    border: `1.5px solid ${C.border}`,
  },
  btnDisabled: {
    background: C.line,
    color: C.inkL,
    cursor: "not-allowed",
    opacity: 0.7,
  },
  completedBadge: {
    flex: 1,
    textAlign: "center",
    background: C.mint,
    color: C.dark,
    borderRadius: 14,
    padding: "14px 10px",
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "0.95rem",
    fontWeight: 700,
  },
  partnerRow: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    padding: "0 16px 16px",
  },
  partnerBadge: {
    fontSize: "0.78rem",
    fontWeight: 800,
    background: C.cream2,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1.5px solid ${C.border}`,
  },
};
