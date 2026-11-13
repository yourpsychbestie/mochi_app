import { useId, useLayoutEffect, useRef, useState } from 'react';

// Mochi character system: one shape, split vertically. Each half carries one eye,
// one cheek and half the smile, so joining both halves forms the full face.
export const MOCHI_COLORS = {
  lavanda: "#D9C8F0",
  verde: "#A8CF8E",
  rosa: "#F6C6D4",
};

const INK = "#3D2A55";
const CHEEK = "#F4A9B8";
const HEART = "#E8708F";
const DASH = "#A49BB5";
const SW = 5;

const BODY = "M100 12 C150 12 186 58 190 108 C193 142 172 158 100 158 C28 158 7 142 10 108 C14 58 50 12 100 12 Z";
const HALF_L = "M100 12 C50 12 14 58 10 108 C7 142 28 158 100 158 Z";
const HALF_R = "M100 12 C150 12 186 58 190 108 C193 142 172 158 100 158 Z";
const GAP = 8;

function Eye({ x, expression }) {
  if (expression === "feliz") {
    return <path d={`M${x - 9} 103 Q${x} 92 ${x + 9} 103`} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />;
  }
  if (expression === "enamorado") {
    return (
      <path d={`M${x} 108 C${x - 12} 100 ${x - 9} 89 ${x} 95 C${x + 9} 89 ${x + 12} 100 ${x} 108 Z`}
        fill={HEART} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
    );
  }
  return (
    <g>
      <circle cx={x} cy={100} r={7.5} fill={INK} />
      <circle cx={x + 2.2} cy={97.3} r={2.6} fill="#fff" />
    </g>
  );
}

function Face({ expression }) {
  return (
    <g>
      <ellipse cx={51} cy={117} rx={10.5} ry={5.5} fill={CHEEK} />
      <ellipse cx={149} cy={117} rx={10.5} ry={5.5} fill={CHEEK} />
      <Eye x={70} expression={expression} />
      <Eye x={130} expression={expression} />
      {expression === "sorprendido"
        ? <ellipse cx={100} cy={117} rx={4} ry={5.5} fill={INK} />
        : <path d="M88 110 Q100 126 112 110" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />}
    </g>
  );
}

function Filled({ fill, expression, sw }) {
  return (
    <g>
      <path d={BODY} fill={fill} />
      <ellipse cx={53} cy={58} rx={12} ry={6.5} fill="#fff" opacity={0.5} transform="rotate(-32 53 58)" />
      <Face expression={expression} />
      <path d={BODY} fill="none" stroke={INK} strokeWidth={sw} />
    </g>
  );
}

function Dashed({ d, sw }) {
  return <path d={d} fill="#fff" fillOpacity={0.55} stroke={DASH} strokeWidth={sw * 0.8} strokeDasharray="13 9" strokeLinecap="round" strokeLinejoin="round" />;
}

function Half({ side, filled, fill, expression, clipId, sw, showMissing }) {
  if (!filled) return showMissing ? <Dashed d={side === "left" ? HALF_L : HALF_R} sw={sw} /> : null;
  return (
    <g>
      <g clipPath={`url(#${clipId}-${side})`}>
        <Filled fill={fill} expression={expression} sw={sw} />
      </g>
      <line x1={100} y1={12} x2={100} y2={158} stroke={INK} strokeWidth={sw} />
    </g>
  );
}

/**
 * left / right: whether each partner has filled their half.
 *  - both false → dashed outline (vacío)
 *  - one true   → split halves, the missing one dashed (esperando)
 *  - both true  → full mochi; if it was split before, the halves slide together and it pops
 * color: "lavanda" | "verde" | "rosa" or any CSS color.
 * expression: "contento" | "feliz" | "sorprendido" | "enamorado".
 * showMissing: false draws a lone half without the dashed outline of the other one (avatars).
 * weight: outline width in drawing units; raise it for small sizes (the default reads well from ~120px).
 */
export function MochiSVG({ left = true, right = true, color = "lavanda", expression = "contento", size = 120, weight = SW, showMissing = true, title }) {
  const fill = MOCHI_COLORS[color] || color;
  const clipId = "mochi" + useId().replace(/:/g, "");
  const complete = left && right;

  const wasComplete = useRef(complete);
  const [phase, setPhase] = useState("idle");
  useLayoutEffect(() => {
    const before = wasComplete.current;
    wasComplete.current = complete;
    if (complete && !before) {
      setPhase("joining");
      const t1 = setTimeout(() => setPhase("pop"), 380);
      const t2 = setTimeout(() => setPhase("idle"), 900);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    setPhase("idle");
  }, [complete]);

  const joining = complete && phase === "joining";
  const split = !complete || joining;

  return (
    <svg viewBox="-6 6 212 158" width={size} height={size * 158 / 212} style={{ display: "block", overflow: "visible" }}
      role="img" aria-label={title || (complete ? "Mochi completo" : left || right ? "Medio mochi" : "Mochi vacío")}>
      <defs>
        <clipPath id={`${clipId}-left`}><rect x={-10} y={0} width={110 + weight / 2} height={170} /></clipPath>
        <clipPath id={`${clipId}-right`}><rect x={100 - weight / 2} y={0} width={110} height={170} /></clipPath>
        <style>{`
          @keyframes mochiJoinL { from { transform: translateX(-${GAP}px); } to { transform: translateX(0); } }
          @keyframes mochiJoinR { from { transform: translateX(${GAP}px); } to { transform: translateX(0); } }
          @keyframes mochiPop { 0% { transform: scale(1, 1); } 35% { transform: scale(1.08, 0.9); } 65% { transform: scale(0.96, 1.05); } 100% { transform: scale(1, 1); } }
        `}</style>
      </defs>

      {!left && !right ? (
        <Dashed d={BODY} sw={weight} />
      ) : split ? (
        <g>
          <g style={joining ? { animation: "mochiJoinL 380ms cubic-bezier(.5,0,.6,1.4) both" } : { transform: `translateX(-${GAP}px)` }}>
            <Half side="left" filled={left} fill={fill} expression={expression} clipId={clipId} sw={weight} showMissing={showMissing} />
          </g>
          <g style={joining ? { animation: "mochiJoinR 380ms cubic-bezier(.5,0,.6,1.4) both" } : { transform: `translateX(${GAP}px)` }}>
            <Half side="right" filled={right} fill={fill} expression={expression} clipId={clipId} sw={weight} showMissing={showMissing} />
          </g>
        </g>
      ) : (
        <g style={{ transformOrigin: "100px 158px", animation: phase === "pop" ? "mochiPop 520ms ease-out" : "none" }}>
          <Filled fill={fill} expression={expression} sw={weight} />
        </g>
      )}
    </svg>
  );
}
