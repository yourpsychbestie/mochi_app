import { useId } from 'react';

// Tienda: catálogo, dibujos y ropa puesta en los pandas.
// Cada dibujo vive en una caja de 100×100 con la base apoyada en y≈94, así el mismo
// dibujo sirve de ícono en la tienda y de objeto colocado en el jardín.

const INK = "#3d2b1f";
const GRAY = "#6c6c76";
const SW = 3;

const o = (fill, s = SW) => ({ fill, stroke: INK, strokeWidth: s, strokeLinejoin: "round", strokeLinecap: "round" });
const ln = (s = SW, stroke = INK) => ({ fill: "none", stroke, strokeWidth: s, strokeLinecap: "round", strokeLinejoin: "round" });

const G = {
  leaf: "#8fd07a", leafD: "#5fae68", bamboo: "#a3d67c", bambooL: "#d9eeb0",
  trunk: "#b47a4e", pink: "#f6a3bd", pinkL: "#f9cddc", red: "#ee6b6b", yellow: "#f8d35e",
  gold: "#f8c94a", orange: "#f6a04e", lilac: "#c9b3ea", lilacD: "#b49be0", blue: "#8fb8e8",
  sky: "#9cc7ee", cream: "#fdf4dc", white: "#fffdf8", brown: "#4a3a32",
};

function Leaf({ x, y, len = 18, w = 6, rot = 0, fill = G.leaf, s = 2.2 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={`M0 0 Q${len / 2} ${-w} ${len} 0 Q${len / 2} ${w} 0 0Z`} {...o(fill, s)} />
      <path d={`M2 0 L${len - 4} 0`} {...ln(s * 0.55)} opacity="0.55" />
    </g>
  );
}

function Flor({ x, y, r = 6, fill = G.pink, center = G.gold, s = 1.8 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map(a => (
        <circle key={a} cx={Math.cos((a - 90) * Math.PI / 180) * r * 0.85} cy={Math.sin((a - 90) * Math.PI / 180) * r * 0.85} r={r * 0.6} {...o(fill, s)} />
      ))}
      <circle r={r * 0.42} {...o(center, s)} />
    </g>
  );
}

function Tallo({ d, w = 3.5, fill = "#6cbf68" }) {
  return <g><path d={d} {...ln(w + 3)} /><path d={d} {...ln(w, fill)} /></g>;
}

function Maceta({ fill, top = 66, w = 40, h = 28, rim = 8 }) {
  const x = 50 - w / 2;
  return (
    <g>
      <path d={`M${x + 3} ${top + rim} L${x + w - 3} ${top + rim} L${x + w - 8} ${top + h} L${x + 8} ${top + h}Z`} {...o(fill)} />
      <rect x={x - 2} y={top} width={w + 4} height={rim} rx="3" {...o(fill)} />
    </g>
  );
}

function Carita({ x, y, k = 1, dormida = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {dormida
        ? <><path d="M-10 -1 Q-7 2 -4 -1" {...ln(2)} /><path d="M4 -1 Q7 2 10 -1" {...ln(2)} /></>
        : <><circle cx="-7" cy="-1" r="2" fill={INK} /><circle cx="7" cy="-1" r="2" fill={INK} /></>}
      <path d="M-3 3 Q-1.5 5 0 3 Q1.5 5 3 3" {...ln(1.6)} />
      <ellipse cx="-12" cy="4" rx="3.5" ry="2" fill="#f4a9b8" opacity="0.8" />
      <ellipse cx="12" cy="4" rx="3.5" ry="2" fill="#f4a9b8" opacity="0.8" />
    </g>
  );
}

const NUBE = "M22 72 C9 72 8 55 20 52 C18 38 34 31 43 39 C47 27 67 25 71 39 C83 35 93 47 87 57 C95 61 91 73 80 72 Z";
const COPA = "M26 66 C12 66 10 46 22 42 C20 26 36 16 50 22 C62 12 82 20 80 36 C92 40 92 62 76 66 Z";
const destello = (x, y, r) => `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`;

function Tronco() {
  return <path d="M43 94 C45 84 45 70 44 58 L56 58 C55 70 55 84 57 94Z" {...o(G.trunk)} />;
}
function Marquitas({ pts }) {
  return <g>{pts.map(([x, y], i) => <path key={i} d={`M${x - 4} ${y} Q${x} ${y - 4} ${x + 4} ${y}`} {...ln(2)} opacity="0.7" />)}</g>;
}
function Brillo({ x, y, rx = 7, ry = 4 }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" opacity="0.45" transform={`rotate(-30 ${x} ${y})`} />;
}

// ═══════════════════════════════════════════════
// DIBUJOS (caja 100×100). Cada uno recibe el grosor de línea para poder escalarse.
// ═══════════════════════════════════════════════
export const ART = {
  // ── Bambú
  bambu_tallo: () => (
    <g>
      <Leaf x={56} y={22} len={24} rot={-28} />
      <Leaf x={56} y={30} len={18} rot={12} />
      <Leaf x={45} y={66} len={18} rot={205} />
      <rect x="44" y="8" width="12" height="86" rx="6" {...o(G.bamboo)} />
      {[30, 52, 74].map(y => <path key={y} d={`M44 ${y} L56 ${y}`} {...ln(2.4)} />)}
      <path d="M48 13 L48 25" {...ln(2.2, "#fff")} opacity="0.7" />
    </g>
  ),
  bambu_trio: () => (
    <g>
      <ellipse cx="50" cy="88" rx="42" ry="8" {...o(G.bamboo)} />
      <Leaf x={33} y={32} len={18} rot={-150} />
      <Leaf x={77} y={30} len={18} rot={-25} />
      <Leaf x={55} y={20} len={16} rot={-40} />
      {[[22, 30, 10], [44, 12, 11], [67, 24, 10]].map(([x, y, w]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={88 - y} rx={w / 2} {...o(G.bamboo)} />
          {[y + 20, y + 40].filter(n => n < 82).map(n => <path key={n} d={`M${x} ${n} L${x + w} ${n}`} {...ln(2.2)} />)}
          <path d={`M${x + 3.5} ${y + 5} L${x + 3.5} ${y + 15}`} {...ln(2, "#fff")} opacity="0.7" />
        </g>
      ))}
    </g>
  ),
  bambu_brote: () => (
    <g>
      <ellipse cx="50" cy="88" rx="30" ry="7" {...o("#b07f52")} />
      <Leaf x={50} y={14} len={11} w={4} rot={-62} />
      <path d="M50 12 C60 28 70 56 68 86 L32 86 C30 56 40 28 50 12Z" {...o("#cfe39a")} />
      <path d="M50 14 C48 42 44 64 38 86" {...ln(2)} opacity="0.7" />
      <path d="M53 34 C57 54 60 70 61 86" {...ln(2)} opacity="0.7" />
      <path d="M44 34 C42 44 40 54 40 62" {...ln(2.2, "#fff")} opacity="0.6" />
    </g>
  ),
  bambu_ramita: () => (
    <g>
      <Leaf x={66} y={26} len={20} rot={-10} />
      <Leaf x={62} y={34} len={20} rot={160} />
      <Leaf x={50} y={54} len={20} rot={20} />
      <Leaf x={45} y={60} len={18} rot={190} />
      <Leaf x={72} y={16} len={14} rot={-60} />
      <path d="M28 90 L76 12" {...ln(9)} />
      <path d="M28 90 L76 12" {...ln(4.5, G.bamboo)} />
      {[[40, 70], [53, 49], [65, 30]].map(([x, y]) => <path key={x} d={`M${x - 4} ${y - 2.5} L${x + 4} ${y + 2.5}`} {...ln(2)} />)}
    </g>
  ),
  bambu_maceta: () => (
    <g>
      <Leaf x={47} y={24} len={16} rot={-160} />
      <Leaf x={62} y={34} len={16} rot={-20} />
      <rect x="37" y="16" width="10" height="54" rx="5" {...o(G.bamboo)} />
      <rect x="53" y="28" width="10" height="42" rx="5" {...o(G.bamboo)} />
      <path d="M37 40 L47 40 M53 50 L63 50" {...ln(2.2)} />
      <Maceta fill="#a9d0ec" top={64} w={48} h={30} rim={9} />
    </g>
  ),
  bambu_snack: () => (
    <g>
      <Leaf x={28} y={46} len={16} rot={-150} />
      <Leaf x={30} y={44} len={14} rot={-110} />
      <rect x="12" y="64" width="64" height="18" rx="9" {...o(G.bamboo)} />
      <ellipse cx="76" cy="73" rx="5" ry="9" {...o(G.bambooL)} />
      <rect x="24" y="46" width="58" height="18" rx="9" {...o(G.bamboo)} />
      <ellipse cx="82" cy="55" rx="5" ry="9" {...o(G.bambooL)} />
      <path d="M30 64 L30 82 M60 46 L60 64" {...ln(2)} />
      <rect x="44" y="44" width="9" height="40" rx="2" {...o(G.pink, 2.4)} />
      <path d="M48 44 C38 30 32 40 46 44 M49 44 C60 30 66 40 51 44" {...o(G.pink, 2.4)} />
      <circle cx="48.5" cy="44" r="3.5" {...o(G.pink, 2.2)} />
    </g>
  ),

  // ── Árboles
  arbol_redondo: () => (
    <g><Tronco /><path d={COPA} {...o(G.leaf)} /><Brillo x={33} y={34} /><Marquitas pts={[[40, 48], [62, 40], [56, 56], [72, 52]]} /></g>
  ),
  arbol_pino: () => (
    <g>
      <rect x="44" y="80" width="12" height="14" rx="2" {...o(G.trunk)} />
      <path d="M50 34 L82 82 L18 82Z" {...o("#5fae68")} />
      <path d="M50 20 L74 58 L26 58Z" {...o("#6dbf72")} />
      <path d="M50 6 L67 38 L33 38Z" {...o("#7ccc7c")} />
      <path d="M46 16 L40 30" {...ln(2.4, "#fff")} opacity="0.55" />
    </g>
  ),
  arbol_cerezo: () => (
    <g>
      <Tronco /><path d={COPA} {...o("#f8c8da")} />
      {[[34, 40], [52, 30], [66, 44], [44, 54], [74, 30], [26, 54]].map(([x, y], i) => <Flor key={i} x={x} y={y} r={4.2} fill={i % 2 ? "#fff" : "#f49cb6"} center="#f8d860" s={1.3} />)}
      {[[30, 80], [70, 86], [64, 74]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="2.5" ry="1.6" fill="#f49cb6" stroke={INK} strokeWidth="1" transform={`rotate(${i * 40} ${x} ${y})`} />)}
    </g>
  ),
  arbol_manzano: () => (
    <g>
      <Tronco /><path d={COPA} {...o(G.leaf)} /><Brillo x={33} y={34} />
      {[[36, 46], [54, 32], [68, 48], [50, 56], [28, 56], [74, 36]].map(([x, y], i) => (
        <g key={i}><path d={`M${x} ${y - 4} L${x + 1} ${y - 7}`} {...ln(1.6)} /><circle cx={x} cy={y} r="4.2" {...o("#e9606a", 1.8)} /></g>
      ))}
    </g>
  ),
  arbol_otono: () => (
    <g>
      <Tronco /><path d={COPA} {...o("#f6b65c")} /><Brillo x={33} y={34} />
      <Marquitas pts={[[40, 48], [64, 40], [56, 56]]} />
      {[[28, 80], [74, 84], [66, 72]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="3.2" ry="1.8" fill="#c27a3e" stroke={INK} strokeWidth="1" transform={`rotate(${i * 50 - 20} ${x} ${y})`} />)}
    </g>
  ),
  arbol_palmera: () => (
    <g>
      <ellipse cx="50" cy="90" rx="24" ry="5" {...o("#f3dca0")} />
      <path d="M43 90 C45 70 50 50 58 30 L65 32 C58 52 54 72 55 90Z" {...o("#c08a55")} />
      {[78, 64, 50, 40].map((y, i) => <path key={y} d={`M${45 + i * 2.5} ${y} L${54 + i * 2.8} ${y + 1}`} {...ln(1.8)} />)}
      {[-170, -130, -55, -15, 25, 150].map(r => <Leaf key={r} x={61} y={28} len={r === 25 || r === 150 ? 20 : 27} w={7} rot={r} fill="#7cc47a" />)}
      <circle cx="57" cy="33" r="4" {...o("#8a5a34", 2)} /><circle cx="65" cy="34" r="4" {...o("#8a5a34", 2)} />
    </g>
  ),
  arbusto: () => (
    <g>
      <path d="M16 88 C6 88 6 68 18 66 C18 52 34 46 44 52 C50 42 68 44 70 54 C84 50 94 64 88 74 C96 80 92 90 84 88 Z" {...o(G.leaf)} />
      <Brillo x={30} y={62} />
      {[[30, 76, "#c9b3ea"], [46, 62, "#fff"], [58, 78, G.gold], [70, 64, "#f6a3bd"], [80, 78, "#c9b3ea"]].map(([x, y, c], i) => <Flor key={i} x={x} y={y} r={4.4} fill={c} s={1.3} />)}
    </g>
  ),

  // ── Plantas
  planta_monstera: () => (
    <g>
      <path d="M50 68 L30 34 M50 68 L50 22 M50 68 L70 36" {...ln(3)} />
      {[[28, 34, -30], [50, 22, 0], [72, 36, 30]].map(([x, y, r]) => (
        <g key={x} transform={`translate(${x} ${y}) rotate(${r})`}>
          <circle r="15" {...o("#5fae68")} />
          <path d="M0 -12 L0 12" {...ln(1.8)} opacity="0.6" />
          {[-8, 0, 8].map(n => <g key={n}><path d={`M-15 ${n} L-8 ${n * 0.6}`} {...ln(1.8)} /><path d={`M15 ${n} L8 ${n * 0.6}`} {...ln(1.8)} /></g>)}
        </g>
      ))}
      <Maceta fill="#f8c3d3" />
    </g>
  ),
  planta_cactus: () => (
    <g>
      <rect x="27" y="30" width="10" height="22" rx="5" {...o("#7cc47a")} />
      <rect x="63" y="38" width="10" height="18" rx="5" {...o("#7cc47a")} />
      <path d="M31 48 L44 48 M69 52 L56 52" {...ln(9)} /><path d="M31 48 L44 48 M69 52 L56 52" {...ln(4, "#7cc47a")} />
      <rect x="40" y="22" width="20" height="48" rx="10" {...o("#7cc47a")} />
      {[[46, 36], [54, 46], [46, 56], [32, 38], [68, 46]].map(([x, y], i) => <path key={i} d={`M${x - 2} ${y} L${x + 2} ${y}`} {...ln(1.6)} />)}
      <Flor x={50} y={20} r={4.5} fill="#f49cb6" s={1.4} />
      <Maceta fill="#f2a679" />
    </g>
  ),
  planta_suculenta: () => (
    <g>
      {[-160, -130, -100, -80, -50, -20].map(a => (
        <path key={a} d="M0 0 Q6 -5 18 0 Q6 5 0 0Z" {...o("#bfe3c4", 2)} transform={`translate(50 64) rotate(${a})`} />
      ))}
      {[-140, -90, -40].map(a => <path key={a} d="M0 0 Q4 -4 12 0 Q4 4 0 0Z" {...o("#9fd4a8", 2)} transform={`translate(50 64) rotate(${a})`} />)}
      <Maceta fill="#ede0cc" top={64} w={50} h={28} />
    </g>
  ),
  planta_helecho: () => (
    <g>
      {[-62, -36, -12, 12, 36, 62].map(a => (
        <g key={a} transform={`translate(50 68) rotate(${a})`}>
          <path d="M0 0 Q7 -22 0 -46 Q-7 -22 0 0Z" {...o("#5fae68", 2.2)} />
          <path d="M0 -4 L0 -40" {...ln(1.4)} opacity="0.6" />
        </g>
      ))}
      <Maceta fill="#c9b3ea" w={44} />
    </g>
  ),
  planta_colgante: () => (
    <g>
      <path d="M50 8 L30 46 M50 8 L70 46 M50 8 L50 46" {...ln(1.8)} />
      <circle cx="50" cy="6" r="3" {...o(G.gold, 1.8)} />
      {[[36, 58, 34, 94], [50, 58, 52, 84], [64, 58, 67, 92]].map(([x1, y1, x2, y2]) => (
        <g key={x1}>
          <path d={`M${x1} ${y1} Q${x1 - 6} ${(y1 + y2) / 2} ${x2} ${y2}`} {...ln(2)} />
          {[0.35, 0.65, 0.95].map(t => <ellipse key={t} cx={x1 + (x2 - x1) * t - 3} cy={y1 + (y2 - y1) * t} rx="3.2" ry="2" fill="#7cc47a" stroke={INK} strokeWidth="1.3" transform={`rotate(-30 ${x1 + (x2 - x1) * t - 3} ${y1 + (y2 - y1) * t})`} />)}
        </g>
      ))}
      <path d="M30 50 L70 50 L65 62 L35 62Z" {...o("#f8dc8a")} />
      <rect x="27" y="44" width="46" height="7" rx="3" {...o("#f8dc8a")} />
      <Leaf x={42} y={44} len={12} rot={-130} fill="#7cc47a" s={1.8} />
      <Leaf x={58} y={44} len={12} rot={-50} fill="#7cc47a" s={1.8} />
    </g>
  ),
  planta_brote: () => (
    <g>
      <path d="M50 68 L50 42" {...ln(3)} />
      <Leaf x={50} y={44} len={16} w={7} rot={-150} fill="#7cc47a" />
      <Leaf x={50} y={42} len={16} w={7} rot={-30} fill="#7cc47a" />
      <Maceta fill="#f8c3d3" w={36} />
    </g>
  ),
  hongos: () => (
    <g>
      <ellipse cx="50" cy="89" rx="42" ry="6" {...o(G.bamboo)} />
      <rect x="68" y="70" width="10" height="18" rx="4" {...o("#fbf3e4")} />
      <path d="M59 74 C59 58 87 58 87 74Z" {...o("#f3a564")} />
      <circle cx="74" cy="66" r="2.6" fill="#fff" />
      <rect x="35" y="56" width="17" height="32" rx="6" {...o("#fbf3e4")} />
      <path d="M17 60 C17 32 71 32 71 60Z" {...o(G.red)} />
      <circle cx="33" cy="48" r="4.5" fill="#fff" /><circle cx="50" cy="41" r="3.5" fill="#fff" /><circle cx="58" cy="52" r="3" fill="#fff" />
    </g>
  ),

  // ── Flores
  flor_tulipan: () => (
    <g>
      <path d="M50 92 C34 82 31 66 35 57 C44 66 50 76 50 92Z" {...o("#7cc47a", 2.4)} />
      <path d="M50 92 C66 82 69 66 65 57 C56 66 50 76 50 92Z" {...o("#7cc47a", 2.4)} />
      <Tallo d="M50 94 L50 46" />
      <path d="M35 20 L43 31 L50 18 L57 31 L65 20 L65 38 C65 52 35 52 35 38Z" {...o("#f49cb6")} />
      <path d="M41 34 L41 41" {...ln(2.2, "#fff")} opacity="0.7" />
    </g>
  ),
  flor_margarita: () => (
    <g>
      <Tallo d="M50 94 L50 40" />
      <Leaf x={50} y={72} len={16} rot={-30} fill="#7cc47a" />
      {Array.from({ length: 12 }, (_, i) => i * 30).map(a => (
        <ellipse key={a} cx="50" cy="19" rx="4.5" ry="9" {...o("#fff", 2)} transform={`rotate(${a} 50 30)`} />
      ))}
      <circle cx="50" cy="30" r="7.5" {...o(G.gold, 2.2)} />
    </g>
  ),
  flor_girasol: () => (
    <g>
      <Tallo d="M50 94 L50 44" w={4} />
      <Leaf x={50} y={74} len={20} w={8} rot={-150} fill="#7cc47a" />
      <Leaf x={50} y={66} len={20} w={8} rot={-25} fill="#7cc47a" />
      {Array.from({ length: 14 }, (_, i) => i * (360 / 14)).map(a => (
        <path key={a} d="M50 30 Q46 18 50 8 Q54 18 50 30Z" {...o(G.gold, 1.8)} transform={`rotate(${a} 50 30)`} />
      ))}
      <circle cx="50" cy="30" r="11" {...o("#a8703f", 2.2)} />
      {[[-4, -4], [3, -5], [5, 2], [-2, 4], [-6, 1], [1, -1]].map(([x, y], i) => <circle key={i} cx={50 + x} cy={30 + y} r="1.2" fill={INK} opacity="0.6" />)}
    </g>
  ),
  flor_rosa: () => (
    <g>
      <Tallo d="M50 94 L50 42" />
      <Leaf x={50} y={74} len={16} w={7} rot={-150} fill="#7cc47a" />
      <Leaf x={50} y={64} len={16} w={7} rot={-30} fill="#7cc47a" />
      <circle cx="50" cy="30" r="15" {...o("#ef7b8e")} />
      <path d="M50 30 C46 28 47 23 51 23 C57 23 58 31 53 34 C46 38 39 32 41 25 C43 18 52 16 57 19" {...ln(2.2)} />
    </g>
  ),
  flor_lavanda: () => (
    <g>
      {[34, 42, 50, 58, 66].map((x, i) => (
        <g key={x}>
          <path d={`M50 86 L${x} ${18 + (i % 2) * 6}`} {...ln(2.2)} />
          {[0, 1, 2, 3, 4, 5].map(k => {
            const t = 0.08 + k * 0.08;
            const cx = x + (50 - x) * t, cy = 18 + (i % 2) * 6 + (86 - 18) * t;
            return <g key={k}><ellipse cx={cx - 2.4} cy={cy} rx="2.6" ry="3.2" {...o("#b49be0", 1.3)} /><ellipse cx={cx + 2.4} cy={cy} rx="2.6" ry="3.2" {...o("#c9b3ea", 1.3)} /></g>;
          })}
        </g>
      ))}
      <path d="M50 78 C42 70 38 78 50 80 M50 78 C58 70 62 78 50 80" {...o("#9a7fd9", 2)} />
      <path d="M48 80 L44 90 M52 80 L56 90" {...ln(2, "#9a7fd9")} />
    </g>
  ),
  flores_maceta: () => (
    <g>
      <path d="M50 68 L36 36 M50 68 L50 26 M50 68 L64 38" {...ln(3)} />
      <Leaf x={46} y={56} len={12} rot={-150} fill="#7cc47a" s={1.8} />
      <Leaf x={54} y={54} len={12} rot={-30} fill="#7cc47a" s={1.8} />
      <Flor x={36} y={36} r={8} fill="#f49cb6" />
      <Flor x={50} y={25} r={8} fill={G.gold} center="#f39a4a" />
      <Flor x={64} y={38} r={8} fill="#c9b3ea" />
      <Maceta fill="#f0a77c" />
    </g>
  ),
  ramo_flores: () => (
    <g>
      {[[34, 34, "#f49cb6"], [50, 26, "#fff"], [66, 34, "#c9b3ea"], [42, 42, G.gold], [58, 42, "#f49cb6"], [50, 36, "#c9b3ea"]].map(([x, y, c], i) => <Flor key={i} x={x} y={y} r={7.5} fill={c} />)}
      <path d="M28 46 L72 46 L53 94 L47 94Z" {...o("#fbe6c8")} />
      <path d="M50 46 L48 92" {...ln(1.8)} opacity="0.5" />
      <path d="M50 64 C40 54 34 64 50 66 M50 64 C60 54 66 64 50 66" {...o(G.pink, 2.2)} />
      <circle cx="50" cy="65" r="3" {...o(G.pink, 2)} />
    </g>
  ),
  pasto_con_flores: () => (
    <g>
      <rect x="6" y="74" width="88" height="16" rx="8" {...o("#6cbf68")} />
      {[14, 26, 38, 50, 62, 74, 86].map((x, i) => <path key={x} d={`M${x - 4} 76 L${x} ${62 - (i % 2) * 6} L${x + 4} 76`} {...o("#6cbf68", 2)} />)}
      {[[16, 60, "#f49cb6"], [34, 56, G.gold], [52, 60, "#fff"], [70, 56, "#c9b3ea"], [86, 60, "#f49cb6"]].map(([x, y, c], i) => (
        <g key={i}><path d={`M${x} ${y + 4} L${x} 76`} {...ln(2)} /><Flor x={x} y={y} r={5.2} fill={c} s={1.5} /></g>
      ))}
    </g>
  ),

  // ── Cielo
  nube_grande: () => <g><path d={NUBE} {...o(G.white)} /></g>,
  nube_pequena: () => <g transform="translate(22 30) scale(0.56)"><path d={NUBE} {...o(G.white, 5)} /></g>,
  nube_carita: () => <g><path d={NUBE} {...o(G.white)} /><Carita x={50} y={58} k={0.9} /></g>,
  nube_lluvia: () => (
    <g>
      <g transform="translate(8 -16) scale(0.84)"><path d={NUBE} {...o("#dbe8f6", 3.5)} /></g>
      <Carita x={50} y={36} k={0.8} dormida />
      {[[36, 72], [50, 80], [62, 70], [44, 90], [58, 88]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 5} C${x + 3} ${y} ${x + 3} ${y + 3} ${x} ${y + 3} C${x - 3} ${y + 3} ${x - 3} ${y} ${x} ${y - 5}Z`} {...o("#9cc7ee", 1.4)} />)}
    </g>
  ),
  sol: () => (
    <g>
      {Array.from({ length: 10 }, (_, i) => i * 36).map(a => <rect key={a} x="46" y="6" width="8" height="12" rx="4" {...o(G.gold, 2.4)} transform={`rotate(${a} 50 50)`} />)}
      <circle cx="50" cy="50" r="22" {...o("#f8d860")} />
      <Carita x={50} y={52} k={1} />
    </g>
  ),
  luna: () => (
    <g>
      <path d="M58 12 A38 38 0 1 0 88 72 A30 30 0 1 1 58 12Z" {...o("#fbe7a1")} />
      <Carita x={38} y={62} k={0.85} dormida />
      <path d={destello(80, 22, 6)} {...o(G.gold, 1.6)} />
      <path d={destello(90, 40, 4)} {...o(G.gold, 1.4)} />
    </g>
  ),
  estrella: () => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 18 : 40, a = (i * 36 - 90) * Math.PI / 180;
      return `${50 + Math.cos(a) * r},${54 + Math.sin(a) * r}`;
    }).join(" ");
    return <g><polygon points={pts} {...o(G.gold)} /><Carita x={50} y={58} k={0.8} /></g>;
  },
  arcoiris: () => (
    <g>
      {["#f6b3c4", "#f8cfa0", "#f8e8a0", "#bfe3b4", "#b4d4f0", "#cbb8ec"].map((c, i) => (
        <path key={c} d={`M${10 + i * 5} 74 A${40 - i * 5} ${40 - i * 5} 0 0 1 ${90 - i * 5} 74`} {...ln(5.2, c)} strokeLinecap="butt" />
      ))}
      <path d="M7.4 74 A42.6 42.6 0 0 1 92.6 74" {...ln(2.4)} />
      <path d="M37.4 74 A12.6 12.6 0 0 1 62.6 74" {...ln(2.4)} />
      <g transform="translate(-4 34) scale(0.36)"><path d={NUBE} {...o(G.white, 6)} /></g>
      <g transform="translate(68 34) scale(0.36)"><path d={NUBE} {...o(G.white, 6)} /></g>
    </g>
  ),
  pajarito: () => (
    <g>
      <path d="M30 52 L16 44 L18 58Z" {...o("#7fb0e0", 2.4)} />
      <path d="M68 50 L80 54 L68 58Z" {...o("#f6a04e", 2.2)} />
      <circle cx="50" cy="52" r="20" {...o(G.sky)} />
      <ellipse cx="50" cy="60" rx="12" ry="8" fill="#e2effa" />
      <path d="M36 50 C42 42 54 46 50 56 C46 58 40 56 36 50Z" {...o("#7fb0e0", 2)} />
      <circle cx="60" cy="47" r="2.2" fill={INK} />
      <ellipse cx="63" cy="55" rx="3" ry="1.8" fill="#f4a9b8" />
      <path d="M44 72 L43 80 M54 72 L55 80" {...ln(2)} />
    </g>
  ),
  mariposa: () => (
    <g>
      <path d="M44 30 C40 22 36 18 32 16 M56 30 C60 22 64 18 68 16" {...ln(2)} />
      <circle cx="32" cy="16" r="2.4" fill={INK} /><circle cx="68" cy="16" r="2.4" fill={INK} />
      <ellipse cx="34" cy="42" rx="16" ry="13" {...o(G.pinkL)} transform="rotate(-20 34 42)" />
      <ellipse cx="66" cy="42" rx="16" ry="13" {...o(G.pinkL)} transform="rotate(20 66 42)" />
      <ellipse cx="38" cy="64" rx="11" ry="10" {...o(G.lilac)} />
      <ellipse cx="62" cy="64" rx="11" ry="10" {...o(G.lilac)} />
      <circle cx="31" cy="40" r="4" fill="#fff" opacity="0.7" /><circle cx="69" cy="40" r="4" fill="#fff" opacity="0.7" />
      <ellipse cx="50" cy="50" rx="5" ry="20" {...o("#6b4a3a")} />
    </g>
  ),
  globo_aerostatico: () => (
    <g>
      <path d="M40 72 L43 82 M60 72 L57 82" {...ln(1.8)} />
      <rect x="41" y="80" width="18" height="13" rx="2.5" {...o("#c08a55")} />
      <path d="M41 85 L59 85" {...ln(1.6)} opacity="0.6" />
      <path d="M50 6 C74 6 84 26 80 44 C76 60 60 68 56 74 L44 74 C40 68 24 60 20 44 C16 26 26 6 50 6Z" {...o(G.pinkL)} />
      <path d="M50 6 C42 20 40 50 46 74 L54 74 C60 50 58 20 50 6Z" {...o("#fff", 2.4)} />
      <ellipse cx="32" cy="28" rx="4" ry="7" fill="#fff" opacity="0.5" transform="rotate(20 32 28)" />
    </g>
  ),
  papalote: () => (
    <g>
      <path d="M50 74 C44 80 58 84 50 90 C44 94 52 98 54 98" {...ln(1.8)} />
      <path d="M48 82 L44 80 L44 85Z M52 82 L56 80 L56 85Z" {...o("#9a7fd9", 1.4)} />
      <path d="M50 8 L50 40 L22 40Z" {...o(G.yellow, 2.6)} />
      <path d="M50 8 L78 40 L50 40Z" {...o(G.pink, 2.6)} />
      <path d="M22 40 L50 40 L50 74Z" {...o(G.pink, 2.6)} />
      <path d="M78 40 L50 74 L50 40Z" {...o(G.yellow, 2.6)} />
    </g>
  ),
  destellos: () => (
    <g>
      <path d={destello(36, 56, 18)} {...o(G.gold, 2.6)} />
      <path d={destello(72, 30, 10)} {...o(G.gold, 2.2)} />
      <path d={destello(74, 70, 11)} {...o(G.gold, 2.2)} />
      <path d={destello(22, 86, 6)} {...o(G.gold, 1.8)} />
    </g>
  ),

  // ── Ropa (íconos)
  lazo_mono: (s = SW) => (
    <g>
      <path d="M46 56 L36 82 L43 78 L47 84 L51 58 M54 56 L64 82 L57 78 L53 84 L49 58" {...o(G.pink, s)} />
      <path d="M50 50 C36 30 14 34 16 50 C18 66 38 64 50 54Z" {...o(G.pink, s)} />
      <path d="M50 50 C64 30 86 34 84 50 C82 66 62 64 50 54Z" {...o(G.pink, s)} />
      <path d="M24 46 C30 48 36 50 42 52 M76 46 C70 48 64 50 58 52" {...ln(s * 0.7)} opacity="0.5" />
      <rect x="43" y="44" width="14" height="16" rx="6" {...o(G.pink, s)} />
    </g>
  ),
  gorro_tejido: (s = SW) => (
    <g>
      <path d="M27 66 C27 34 73 34 73 66Z" {...o("#f6b955", s)} />
      {[38, 50, 62].map(x => <path key={x} d={`M${x} 44 L${x} 64`} {...ln(s * 0.6)} opacity="0.5" />)}
      <rect x="23" y="64" width="54" height="17" rx="7" {...o("#f8d79a", s)} />
      {[31, 39, 47, 55, 63, 71].map(x => <path key={x} d={`M${x} 68 L${x} 77`} {...ln(s * 0.6)} opacity="0.55" />)}
      <circle cx="50" cy="30" r="9" {...o("#fff7ea", s)} />
    </g>
  ),
  sombrero_paja: (s = SW) => (
    <g>
      <ellipse cx="50" cy="66" rx="43" ry="12" {...o("#f8dca0", s)} />
      <path d="M30 64 C30 38 70 38 70 64Z" {...o("#f8dca0", s)} />
      <path d="M30.5 56 C42 59 58 59 69.5 56 L70 63 C58 66 42 66 30 63Z" {...o("#f49cb6", s * 0.8)} />
      <Flor x={62} y={59} r={5} fill="#fff" s={s * 0.55} />
    </g>
  ),
  corona_flores: (s = SW) => (
    <g>
      <path d="M14 70 C30 52 70 52 86 70" {...ln(s + 3)} /><path d="M14 70 C30 52 70 52 86 70" {...ln(s, "#7cc47a")} />
      <Leaf x={24} y={63} len={10} w={4} rot={-120} fill="#7cc47a" s={s * 0.7} />
      <Leaf x={76} y={63} len={10} w={4} rot={-60} fill="#7cc47a" s={s * 0.7} />
      {[[18, 66, "#f49cb6"], [32, 57, G.gold], [50, 54, "#fff"], [68, 57, "#c9b3ea"], [82, 66, "#f49cb6"], [41, 54, "#c9b3ea"], [59, 54, G.gold]].map(([x, y, c], i) => <Flor key={i} x={x} y={y} r={5.5} fill={c} s={s * 0.6} />)}
    </g>
  ),
  boina: (s = SW) => (
    <g>
      <path d="M56 40 L58 33" {...ln(s)} />
      <ellipse cx="50" cy="58" rx="36" ry="18" {...o("#ee8a8a", s)} transform="rotate(-5 50 58)" />
      <ellipse cx="38" cy="51" rx="9" ry="4" fill="#fff" opacity="0.4" transform="rotate(-15 38 51)" />
    </g>
  ),
  corona: (s = SW) => (
    <g>
      <path d="M22 74 L18 34 L36 52 L50 28 L64 52 L82 34 L78 74Z" {...o(G.gold, s)} />
      <rect x="21" y="63" width="58" height="13" rx="3" {...o("#f6bb3a", s)} />
      <circle cx="34" cy="69.5" r="3.2" {...o("#8fb8e8", s * 0.6)} />
      <circle cx="50" cy="69.5" r="3.6" {...o("#f49cb6", s * 0.6)} />
      <circle cx="66" cy="69.5" r="3.2" {...o("#8fb8e8", s * 0.6)} />
      {[[18, 34], [50, 28], [82, 34]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" {...o("#fff", s * 0.7)} />)}
    </g>
  ),
  lentes: (s = SW) => (
    <g>
      <path d="M18 48 L6 42 M82 48 L94 42" {...ln(s)} />
      <circle cx="32" cy="50" r="14" {...o("#e2effa", s * 1.1)} />
      <circle cx="68" cy="50" r="14" {...o("#e2effa", s * 1.1)} />
      <path d="M46 49 Q50 45 54 49" {...ln(s)} />
      <path d="M26 44 L30 41" {...ln(s * 0.8, "#fff")} />
    </g>
  ),
  bufanda: (s = SW) => (
    <g>
      <rect x="58" y="44" width="15" height="36" rx="3" {...o(G.sky, s)} />
      <path d="M58 64 L73 64" {...ln(s * 1.6, "#fff")} /><path d="M58 64 L73 64" {...ln(s * 0.5)} opacity="0.3" />
      {[61, 65.5, 70].map(x => <path key={x} d={`M${x} 80 L${x} 86`} {...ln(s * 0.7)} />)}
      <path d="M16 36 C16 27 84 27 84 36 L84 46 C84 53 16 53 16 46Z" {...o(G.sky, s)} />
      <path d="M17 41 C40 46 60 46 83 41" {...ln(s * 1.4, "#fff")} />
    </g>
  ),
  panoleta: (s = SW) => (
    <g>
      <path d="M10 30 C30 40 70 40 90 30 L50 86Z" {...o(G.red, s)} />
      {[[34, 44], [50, 48], [66, 44], [42, 58], [58, 58], [50, 70]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#fff" />)}
      <path d="M10 30 L4 24 M90 30 L96 24" {...ln(s)} />
    </g>
  ),
  sueter: (s = SW) => (
    <g>
      <path d="M30 24 L42 19 C44 26 56 26 58 19 L70 24 L86 40 L76 50 L70 44 L70 78 L30 78 L30 44 L24 50 L14 40Z" {...o(G.lilac, s)} />
      <rect x="30" y="76" width="40" height="9" rx="3" {...o(G.lilacD, s)} />
      {[36, 43, 50, 57, 64].map(x => <path key={x} d={`M${x} 78 L${x} 83`} {...ln(s * 0.6)} opacity="0.5" />)}
      <path d="M50 64 C42 57 42 50 47 50 C49 50 50 52 50 53 C50 52 51 50 53 50 C58 50 58 57 50 64Z" {...o("#f49cb6", s * 0.7)} />
    </g>
  ),
  overol: (s = SW) => (
    <g>
      <path d="M36 12 L40 38 M64 12 L60 38" {...ln(s + 4)} /><path d="M36 12 L40 38 M64 12 L60 38" {...ln(4, G.blue)} />
      <rect x="35" y="34" width="30" height="24" rx="3" {...o(G.blue, s)} />
      <rect x="43" y="40" width="14" height="10" rx="2" {...o(G.blue, s * 0.8)} />
      <path d="M30 56 L70 56 L70 90 L54 90 L50 68 L46 90 L30 90Z" {...o(G.blue, s)} />
      <circle cx="40" cy="37" r="2.6" {...o(G.gold, s * 0.6)} /><circle cx="60" cy="37" r="2.6" {...o(G.gold, s * 0.6)} />
    </g>
  ),
  vestido: (s = SW) => (
    <g>
      <path d="M38 16 L62 16 L60 40 L40 40Z" {...o(G.pinkL, s)} />
      <path d="M40 40 L60 40 L80 86 C60 93 40 93 20 86Z" {...o(G.pinkL, s)} />
      <path d="M42 16 C46 22 54 22 58 16" {...o("#fff", s * 0.8)} />
      {[[36, 58], [50, 54], [64, 58], [30, 74], [44, 70], [58, 72], [70, 76], [50, 84]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#fff" />)}
      <path d="M50 40 C44 34 40 42 50 42 C60 42 56 34 50 40Z" {...o("#e46a8f", s * 0.7)} />
    </g>
  ),
  impermeable: (s = SW) => (
    <g>
      <path d="M34 18 L44 15 L50 24 L56 15 L66 18 L84 34 L76 46 L70 40 L70 88 L30 88 L30 40 L24 46 L16 34Z" {...o(G.yellow, s)} />
      <path d="M50 24 L50 88" {...ln(s * 0.8)} />
      {[38, 52, 66].map(y => <circle key={y} cx="46" cy={y} r="1.8" fill={INK} />)}
      <rect x="34" y="66" width="11" height="9" rx="2" {...o("#e8b830", s * 0.8)} />
      <rect x="55" y="66" width="11" height="9" rx="2" {...o("#e8b830", s * 0.8)} />
    </g>
  ),
  gorro_lluvia: (s = SW) => (
    <g>
      <path d="M28 62 C28 30 72 30 72 62Z" {...o(G.yellow, s)} />
      <path d="M10 66 C18 54 82 54 90 66 C76 74 24 74 10 66Z" {...o(G.yellow, s)} />
      <path d="M40 40 C36 46 35 52 35 56" {...ln(s * 0.9, "#fff")} opacity="0.7" />
    </g>
  ),
  delantal: (s = SW) => (
    <g>
      <path d="M38 30 C34 12 42 6 46 10 M62 30 C66 12 58 6 54 10" {...ln(s)} />
      <path d="M30 50 L18 54 M70 50 L82 54" {...ln(s)} />
      <rect x="37" y="28" width="26" height="22" rx="3" {...o("#fff", s)} />
      <Flor x={50} y={38} r={4.5} fill="#f49cb6" s={s * 0.5} />
      <path d="M29 50 L71 50 L73 88 C57 93 43 93 27 88Z" {...o("#fffaf2", s)} />
      <path d="M28 82 C44 87 56 87 72 82" {...ln(s * 1.6, "#f49cb6")} />
      <rect x="42" y="60" width="16" height="13" rx="3" {...o("#f7bfd6", s * 0.8)} />
      <path d="M50 60 L50 73" {...ln(s * 0.6)} />
    </g>
  ),
};

// ═══════════════════════════════════════════════
// CATÁLOGO
// slot: [x, y de la base, tamaño] dentro de la escena del jardín (390×290)
// slots (ropa): partes del panda que ocupa; al ponerse algo se quita lo que choque
// ═══════════════════════════════════════════════
export const TIENDA_CATS = [
  { id: "bambu", zona: "jardin", label: "Bambú", icon: "bambu_tallo" },
  { id: "arboles", zona: "jardin", label: "Árboles", icon: "arbol_redondo" },
  { id: "plantas", zona: "jardin", label: "Plantas", icon: "planta_monstera" },
  { id: "flores", zona: "jardin", label: "Flores", icon: "flor_tulipan" },
  { id: "cielo", zona: "jardin", label: "Cielo", icon: "nube_carita" },
  { id: "ropa", zona: "pandas", label: "Ropa", icon: "lazo_mono" },
  { id: "trajes", zona: "pandas", label: "Trajes", icon: "sueter" },
];

export const TIENDA_JARDIN = [
  { id: "bambu_tallo", cat: "bambu", name: "Tallo de bambú", cost: 15, desc: "El primero de muchos", slot: [22, 240, 118] },
  { id: "bambu_trio", cat: "bambu", name: "Trío de bambú", cost: 35, desc: "Crecen juntos", slot: [356, 244, 100] },
  { id: "bambu_brote", cat: "bambu", name: "Brote de bambú", cost: 12, desc: "Algo nuevo está naciendo", slot: [112, 258, 36] },
  { id: "bambu_ramita", cat: "bambu", name: "Ramita de bambú", cost: 18, desc: "Ligera y alegre", slot: [54, 238, 88] },
  { id: "bambu_maceta", cat: "bambu", name: "Bambú en maceta", cost: 28, desc: "Para cuidarlo de cerca", slot: [306, 268, 50] },
  { id: "bambu_snack", cat: "bambu", name: "Bambú para picar", cost: 22, desc: "Un antojo para los pandas", slot: [96, 290, 40] },

  { id: "arbol_redondo", cat: "arboles", name: "Árbol redondo", cost: 45, desc: "Sombra para descansar", slot: [74, 232, 92] },
  { id: "arbol_pino", cat: "arboles", name: "Pino", cost: 50, desc: "Siempre verde", slot: [236, 226, 100] },
  { id: "arbol_cerezo", cat: "arboles", name: "Cerezo", cost: 80, desc: "Florece en primavera", slot: [282, 232, 100] },
  { id: "arbol_manzano", cat: "arboles", name: "Manzano", cost: 65, desc: "Frutos de lo que siembran", slot: [128, 228, 80] },
  { id: "arbol_otono", cat: "arboles", name: "Árbol de otoño", cost: 60, desc: "Los cambios también son bellos", slot: [176, 226, 80] },
  { id: "arbol_palmera", cat: "arboles", name: "Palmera", cost: 70, desc: "Unas vacaciones juntos", slot: [380, 238, 90] },
  { id: "arbusto", cat: "arboles", name: "Arbusto florido", cost: 30, desc: "Pequeño y lleno de vida", slot: [36, 258, 70] },

  { id: "planta_monstera", cat: "plantas", name: "Monstera", cost: 32, desc: "Hojas para presumir", slot: [22, 290, 50] },
  { id: "planta_cactus", cat: "plantas", name: "Cactus", cost: 22, desc: "Fuerte y con flor", slot: [370, 290, 48] },
  { id: "planta_suculenta", cat: "plantas", name: "Suculenta", cost: 18, desc: "Pide poco, da mucho", slot: [282, 292, 34] },
  { id: "planta_helecho", cat: "plantas", name: "Helecho", cost: 26, desc: "Fresco y frondoso", slot: [62, 292, 44] },
  { id: "planta_colgante", cat: "plantas", name: "Planta colgante", cost: 38, desc: "Cae con gracia", slot: [366, 62, 66] },
  { id: "planta_brote", cat: "plantas", name: "Brote en maceta", cost: 12, desc: "Recién plantado", slot: [278, 274, 30] },
  { id: "hongos", cat: "plantas", name: "Hongos", cost: 20, desc: "Sorpresa en el pasto", slot: [116, 284, 34] },

  { id: "flor_tulipan", cat: "flores", name: "Tulipán", cost: 18, desc: "Amor sincero", slot: [96, 262, 40] },
  { id: "flor_margarita", cat: "flores", name: "Margarita", cost: 15, desc: "Me quiere, no me quiere…", slot: [296, 256, 40] },
  { id: "flor_girasol", cat: "flores", name: "Girasol", cost: 25, desc: "Siempre mirando al sol", slot: [326, 250, 60] },
  { id: "flor_rosa", cat: "flores", name: "Rosa", cost: 28, desc: "Clásica y romántica", slot: [274, 258, 40] },
  { id: "flor_lavanda", cat: "flores", name: "Lavanda", cost: 22, desc: "Huele a calma", slot: [14, 262, 46] },
  { id: "flores_maceta", cat: "flores", name: "Flores en maceta", cost: 30, desc: "Un trío de colores", slot: [338, 292, 44] },
  { id: "ramo_flores", cat: "flores", name: "Ramo de flores", cost: 40, desc: "Un regalo para ti", slot: [306, 290, 38] },
  { id: "pasto_con_flores", cat: "flores", name: "Pasto con flores", cost: 24, desc: "Un prado chiquito", slot: [195, 292, 80] },

  { id: "nube_grande", cat: "cielo", name: "Nube grande", cost: 20, desc: "Para soñar despiertos", slot: [74, 78, 92] },
  { id: "nube_pequena", cat: "cielo", name: "Nubecita", cost: 12, desc: "Pequeña y esponjosa", slot: [196, 66, 70] },
  { id: "nube_carita", cat: "cielo", name: "Nube feliz", cost: 25, desc: "Sonríe con ustedes", slot: [250, 118, 60] },
  { id: "nube_lluvia", cat: "cielo", name: "Nube de lluvia", cost: 22, desc: "Riega el jardín", slot: [146, 118, 56] },
  { id: "sol", cat: "cielo", name: "Sol", cost: 35, desc: "Calienta el día", slot: [318, 92, 66] },
  { id: "luna", cat: "cielo", name: "Luna", cost: 45, desc: "Para las noches juntos", slot: [30, 76, 54] },
  { id: "estrella", cat: "cielo", name: "Estrella", cost: 30, desc: "Pide un deseo", slot: [246, 50, 36] },
  { id: "arcoiris", cat: "cielo", name: "Arcoíris", cost: 90, desc: "Después de la tormenta", slot: [195, 196, 170] },
  { id: "pajarito", cat: "cielo", name: "Pajarito", cost: 28, desc: "Canta por las mañanas", slot: [168, 152, 32] },
  { id: "mariposa", cat: "cielo", name: "Mariposa", cost: 26, desc: "Revolotea feliz", slot: [104, 196, 28] },
  { id: "globo_aerostatico", cat: "cielo", name: "Globo aerostático", cost: 75, desc: "Volar juntos", slot: [362, 170, 54] },
  { id: "papalote", cat: "cielo", name: "Papalote", cost: 34, desc: "Hasta lo más alto", slot: [302, 168, 40] },
  { id: "destellos", cat: "cielo", name: "Destellos", cost: 40, desc: "Un poco de magia", slot: [112, 58, 40] },
];

export const TIENDA_PANDAS = [
  { id: "lazo_mono", cat: "ropa", name: "Moño", cost: 20, desc: "Un detalle muy tierno", slots: ["cabeza"] },
  { id: "gorro_tejido", cat: "ropa", name: "Gorro tejido", cost: 30, desc: "Calientito y suave", slots: ["cabeza"] },
  { id: "sombrero_paja", cat: "ropa", name: "Sombrero de paja", cost: 28, desc: "Para pasear al sol", slots: ["cabeza"] },
  { id: "corona_flores", cat: "ropa", name: "Corona de flores", cost: 40, desc: "Romántica", slots: ["cabeza"] },
  { id: "boina", cat: "ropa", name: "Boina", cost: 32, desc: "Tierna y elegante", slots: ["cabeza"] },
  { id: "corona", cat: "ropa", name: "Corona", cost: 70, desc: "Reyes de su jardín", slots: ["cabeza"] },
  { id: "gorro_lluvia", cat: "ropa", name: "Gorro de lluvia", cost: 24, desc: "Que llueva, no importa", slots: ["cabeza"] },
  { id: "lentes", cat: "ropa", name: "Lentes", cost: 25, desc: "Para verse mejor", slots: ["cara"] },
  { id: "bufanda", cat: "ropa", name: "Bufanda", cost: 26, desc: "Para el frío", slots: ["cuello"] },
  { id: "panoleta", cat: "ropa", name: "Pañoleta", cost: 22, desc: "Aire de aventura", slots: ["cuello"] },
  { id: "sueter", cat: "ropa", name: "Suéter", cost: 38, desc: "Con un corazón al centro", slots: ["cuerpo"] },
  { id: "overol", cat: "ropa", name: "Overol", cost: 45, desc: "Listos para el jardín", slots: ["cuerpo"] },
  { id: "vestido", cat: "ropa", name: "Vestido", cost: 48, desc: "Con lunares", slots: ["cuerpo"] },
  { id: "impermeable", cat: "ropa", name: "Impermeable", cost: 42, desc: "Para saltar en charcos", slots: ["cuerpo"] },
  { id: "delantal", cat: "ropa", name: "Delantal", cost: 30, desc: "Cocinar juntos", slots: ["cuerpo"] },

  { id: "traje_sudadera", cat: "trajes", name: "Sudadera", cost: 55, desc: "Domingo de flojera", slots: ["cuerpo"] },
  { id: "traje_rayas", cat: "trajes", name: "Suéter de rayas", cost: 55, desc: "Combinan sin querer", slots: ["cuerpo"] },
  { id: "traje_happi", cat: "trajes", name: "Happi japonés", cost: 70, desc: "Listos para el festival", slots: ["cuerpo"] },
  { id: "traje_china", cat: "trajes", name: "Chaqueta china", cost: 70, desc: "Con botones de nudo", slots: ["cuerpo"] },
  { id: "traje_abeja", cat: "trajes", name: "Traje de abeja", cost: 80, desc: "Dulces como la miel", slots: ["cuerpo", "cabeza"] },
  { id: "traje_abrigo", cat: "trajes", name: "Abrigo de invierno", cost: 75, desc: "Abrazos calientitos", slots: ["cuerpo", "cabeza"] },
  { id: "traje_calabaza", cat: "trajes", name: "Calabaza", cost: 85, desc: "Noche de brujas", slots: ["cuerpo", "cabeza"] },
  { id: "traje_santa", cat: "trajes", name: "Traje de Santa", cost: 95, desc: "Navidad juntos", slots: ["cuerpo", "cabeza"] },
];

// Accesorios de antes (ya no se venden, pero quien los tiene los sigue usando)
const SLOTS_ANTES = {
  hat_flower: ["cabeza"], hat_crown: ["cabeza"], hat_straw: ["cabeza"], hat_beret: ["cabeza"], hat_beanie: ["cabeza"],
  hat_frog: ["cabeza"], hat_love: ["cabeza"], acc_bow: ["cabeza"],
  glasses_heart: ["cara"], glasses_sun: ["cara"], glasses_round: ["cara"], glasses_clear: ["cara"], glasses_star: ["cara"], glasses_love: ["cara"],
  acc_scarf: ["cuello"],
  outfit_kimono: ["cuerpo"], outfit_sailor: ["cuerpo"], outfit_witch: ["cuerpo"], outfit_angel: ["cuerpo"],
};
const slotsDe = id => TIENDA_PANDAS.find(i => i.id === id)?.slots || SLOTS_ANTES[id] || [];

// Al ponerse `id`, lo que use la misma parte del panda vuelve a guardarse
export function ponerPrenda(accessories, id) {
  const mios = slotsDe(id);
  const next = { ...accessories };
  Object.keys(next).forEach(k => {
    if (k !== id && next[k] === true && slotsDe(k).some(s => mios.includes(s))) next[k] = "owned";
  });
  next[id] = true;
  return next;
}

export function ArtIcon({ id, size = 56 }) {
  const draw = ART[id];
  if (!draw) return null;
  return <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", overflow: "visible" }}>{draw()}</svg>;
}

// Objetos comprados, colocados en la escena del jardín (en orden de profundidad)
const PROFUNDIDAD = ["arcoiris", "cielo", "arboles", "bambu", "flores", "plantas", "vuelan"];
const VUELAN = ["pajarito", "mariposa", "papalote", "globo_aerostatico"];
const capa = i => PROFUNDIDAD.indexOf(i.id === "arcoiris" ? i.id : VUELAN.includes(i.id) ? "vuelan" : i.cat);
export function TiendaJardinLayer({ garden }) {
  const puestos = TIENDA_JARDIN.filter(i => garden?.[i.id] === true)
    .sort((a, b) => capa(a) - capa(b) || a.slot[1] - b.slot[1]);
  return (
    <g>
      {puestos.map(({ id, slot: [x, y, s] }) => (
        <g key={id} transform={`translate(${x - s / 2} ${y - s * 0.95}) scale(${s / 100})`}>{ART[id]()}</g>
      ))}
    </g>
  );
}

// ═══════════════════════════════════════════════
// ROPA PUESTA — mismas coordenadas que CouplePandaSVG (260×220)
// ═══════════════════════════════════════════════
const LADOS = {
  L: {
    body: "M52 205 C35 205 28 185 30 165 C32 145 42 132 62 128 C72 126 82 126 92 128 C112 132 122 145 122 165 C124 185 117 205 100 205 Z",
    x: 76, head: "rotate(6 76 95) translate(76 88)",
    brazo: { cx: 30, cy: 173, rx: 11, ry: 17, rot: 12 },
    pies: [[57, 21, 18], [98, 21, 18]],
  },
  R: {
    body: "M148 205 C131 205 124 185 126 165 C128 144 138 131 160 128 C170 126 182 126 194 128 C214 131 224 145 224 165 C226 185 219 205 202 205 Z",
    x: 175, head: "rotate(-4 176 90) translate(176 88) scale(1.045)",
    brazo: { cx: 225, cy: 173, rx: 11, ry: 17, rot: -12 },
    pies: [[157, 22, 19], [198, 22, 19]],
  },
};
// El brazo del panda derecho que abraza al izquierdo (queda encima de los dos cuerpos)
const ABRAZO = { cx: 122, cy: 148, rx: 19, ry: 12, rot: 15 };

const rayas = (X, color, desde = 132, paso = 12, alto = 5) => (
  Array.from({ length: 7 }, (_, i) => <rect key={i} x={X - 60} y={desde + i * paso} width="120" height={alto} fill={color} />)
);

// Prendas de cuerpo: dibujo recortado al cuerpo + cómo se ven las mangas
const CUERPO = {
  traje_sudadera: {
    manga: { fill: "#a8d8a0", puno: "#8cc485" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#a8d8a0" />
      <path d={`M${X - 24} 180 L${X + 24} 180 L${X + 30} 200 L${X - 30} 200Z`} {...o("#8cc485", 2.5)} />
      <path d={`M${X - 32} 130 C${X - 14} 143 ${X + 14} 143 ${X + 32} 130`} {...ln(2.5)} />
      <path d={`M${X - 8} 139 L${X - 9} 160 M${X + 8} 139 L${X + 9} 160`} {...ln(2)} />
      <circle cx={X - 9} cy="161" r="2.6" {...o("#fff", 1.6)} /><circle cx={X + 9} cy="161" r="2.6" {...o("#fff", 1.6)} />
    </>),
  },
  traje_rayas: {
    manga: { fill: G.cream, puno: "#7b9fd6", rayas: "#7b9fd6" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.cream} />
      {rayas(X, "#7b9fd6", 138)}
      <path d={`M${X - 30} 129 C${X - 12} 138 ${X + 12} 138 ${X + 30} 129`} {...ln(6, "#7b9fd6")} />
    </>),
  },
  traje_happi: {
    manga: { fill: "#5f7fc4", puno: G.cream },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#5f7fc4" />
      {Array.from({ length: 9 }, (_, r) => Array.from({ length: 11 }, (_, c) => {
        const x = X - 60 + c * 12 + (r % 2) * 6, y = 136 + r * 8;
        return <path key={`${r}-${c}`} d={`M${x - 5} ${y} A5 5 0 0 1 ${x + 5} ${y}`} {...ln(1.3, "#a9c0ef")} />;
      }))}
      <path d={`M${X - 28} 128 L${X - 6} 166 L${X + 6} 166 L${X + 28} 128 L${X + 15} 128 L${X} 156 L${X - 15} 128Z`} {...o(G.cream, 2.5)} />
      <rect x={X - 62} y="164" width="124" height="13" {...o("#f49cb6", 2.5)} />
      <circle cx={X + 14} cy="170.5" r="4" {...o(G.gold, 2)} />
    </>),
  },
  traje_china: {
    manga: { fill: "#e4646a", puno: G.gold },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#e4646a" />
      <rect x={X - 20} y="123" width="40" height="11" rx="5" {...o(G.gold, 2.5)} />
      <path d={`M${X} 134 L${X} 205`} {...ln(2.5)} />
      {[148, 162, 176].map(y => (
        <g key={y}><path d={`M${X - 8} ${y} L${X + 8} ${y}`} {...ln(5)} /><path d={`M${X - 8} ${y} L${X + 8} ${y}`} {...ln(2.6, G.gold)} /><circle cx={X} cy={y} r="3" {...o(G.gold, 1.6)} /></g>
      ))}
      {[-26, 26].map(dx => <path key={dx} d={`M${X + dx - 7} 196 C${X + dx - 7} 189 ${X + dx + 3} 189 ${X + dx + 1} 195 C${X + dx} 198 ${X + dx - 3} 196 ${X + dx - 2} 194`} {...ln(2, G.gold)} />)}
    </>),
  },
  traje_abeja: {
    manga: { fill: G.yellow, puno: G.brown },
    alas: true,
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.yellow} />
      {[146, 170, 194].map(y => <rect key={y} x={X - 60} y={y} width="120" height="11" fill={G.brown} />)}
    </>),
  },
  traje_abrigo: {
    manga: { fill: "#9fd0ef", puno: "#fff" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#9fd0ef" />
      {[150, 168, 186].map(y => <path key={y} d={`M${X - 60} ${y} Q${X} ${y + 5} ${X + 60} ${y}`} {...ln(1.8, "#6fa9d2")} />)}
      <path d={`M${X} 134 L${X} 205`} {...ln(2.5)} />
      <rect x={X - 3} y="138" width="6" height="10" rx="2" {...o(G.gold, 1.8)} />
      {[-28, -19, -10, -1, 8, 17, 26].map(dx => <circle key={dx} cx={X + dx + 1} cy={dx === -28 || dx === 26 ? 128 : 131} r="6" {...o("#fff", 2)} />)}
    </>),
  },
  traje_calabaza: {
    manga: { fill: G.orange, puno: "#7cc47a" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.orange} />
      {[-36, -14, 14, 36].map(dx => <path key={dx} d={`M${X + dx} 128 Q${X + dx * 1.35} 166 ${X + dx} 206`} {...ln(2, "#e08a3a")} />)}
      <path d={`M${X - 22} 162 L${X - 14} 149 L${X - 6} 162Z`} {...o(G.brown, 2)} />
      <path d={`M${X + 6} 162 L${X + 14} 149 L${X + 22} 162Z`} {...o(G.brown, 2)} />
      <path d={`M${X - 24} 172 Q${X} 196 ${X + 24} 172 Z`} {...o(G.brown, 2)} />
      <path d={`M${X - 9} 173 L${X - 5} 180 L${X - 1} 174Z M${X + 3} 174 L${X + 7} 180 L${X + 11} 173Z`} fill={G.yellow} />
    </>),
  },
  traje_santa: {
    manga: { fill: "#e4646a", puno: "#fff" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#e4646a" />
      <rect x={X - 8} y="118" width="16" height="95" {...o("#fff", 2.5)} />
      {[140, 154].map(y => <circle key={y} cx={X} cy={y} r="2.4" fill={INK} />)}
      <rect x={X - 62} y="168" width="124" height="12" {...o(G.brown, 2.5)} />
      <rect x={X - 9} y="165" width="18" height="18" rx="3" {...o(G.gold, 2.5)} />
      <rect x={X - 4} y="170" width="8" height="8" rx="1.5" fill={G.brown} />
    </>),
  },
  sueter: {
    manga: { fill: G.lilac, puno: G.lilacD },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.lilac} />
      <path d={`M${X - 30} 129 C${X - 12} 139 ${X + 12} 139 ${X + 30} 129`} {...ln(5, G.lilacD)} />
      <rect x={X - 60} y="194" width="120" height="14" {...o(G.lilacD, 2.5)} />
      {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${X - 54 + i * 9} 197 L${X - 54 + i * 9} 205`} {...ln(1.5)} opacity="0.45" />)}
      <path d={`M${X} 176 C${X - 11} 167 ${X - 11} 157 ${X - 5} 157 C${X - 2} 157 ${X} 160 ${X} 161 C${X} 160 ${X + 2} 157 ${X + 5} 157 C${X + 11} 157 ${X + 11} 167 ${X} 176Z`} {...o("#f49cb6", 2)} />
    </>),
  },
  overol: {
    manga: null,
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill="#fefdfb" />
      <path d={`M${X - 60} 158 L${X - 20} 158 L${X - 20} 140 L${X + 20} 140 L${X + 20} 158 L${X + 60} 158 L${X + 60} 212 L${X - 60} 212Z`} {...o(G.blue, 2.5)} />
      <path d={`M${X - 34} 128 L${X - 18} 143 M${X + 34} 128 L${X + 18} 143`} {...ln(8)} />
      <path d={`M${X - 34} 128 L${X - 18} 143 M${X + 34} 128 L${X + 18} 143`} {...ln(4.5, G.blue)} />
      <rect x={X - 8} y="146" width="16" height="9" rx="2" {...o(G.blue, 2)} />
      <circle cx={X - 18} cy="144" r="3" {...o(G.gold, 1.8)} /><circle cx={X + 18} cy="144" r="3" {...o(G.gold, 1.8)} />
      <path d={`M${X - 56} 168 L${X + 56} 168`} {...ln(1.4)} strokeDasharray="3 3" opacity="0.6" />
      <path d={`M${X} 172 L${X} 206`} {...ln(1.6)} opacity="0.5" />
    </>),
  },
  vestido: {
    manga: { fill: G.pinkL, puno: "#fff" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.pinkL} />
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => <circle key={`${r}-${c}`} cx={X - 54 + c * 18 + (r % 2) * 9} cy={146 + r * 11} r="2.3" fill="#fff" />))}
      <path d={`M${X - 24} 129 C${X - 16} 140 ${X + 16} 140 ${X + 24} 129`} {...o("#fff", 2.2)} />
      <path d={`M${X - 60} 152 L${X + 60} 152`} {...ln(2)} opacity="0.5" />
      <path d={`M${X} 152 C${X - 9} 143 ${X - 13} 157 ${X} 154 C${X + 13} 157 ${X + 9} 143 ${X} 152Z`} {...o("#e46a8f", 2)} />
    </>),
  },
  impermeable: {
    manga: { fill: G.yellow, puno: "#e8b830" },
    draw: X => (<>
      <rect x={X - 60} y="118" width="120" height="95" fill={G.yellow} />
      <path d={`M${X - 22} 128 L${X} 142 L${X + 22} 128`} {...o("#e8b830", 2.5)} />
      <path d={`M${X} 142 L${X} 206`} {...ln(2.5)} />
      {[154, 168, 182].map(y => <circle key={y} cx={X - 6} cy={y} r="2.2" fill={INK} />)}
      <rect x={X - 34} y="178" width="16" height="12" rx="2.5" {...o("#e8b830", 2)} />
      <rect x={X + 18} y="178" width="16" height="12" rx="2.5" {...o("#e8b830", 2)} />
    </>),
  },
  delantal: {
    manga: null,
    sinFondo: true,
    draw: X => (<>
      <path d={`M${X - 15} 140 C${X - 20} 126 ${X + 20} 126 ${X + 15} 140`} {...ln(2.5)} />
      <rect x={X - 16} y="139" width="32" height="22" rx="3" {...o("#fff", 2.5)} />
      <Flor x={X} y={150} r={4} fill="#f49cb6" s={1.3} />
      <path d={`M${X - 60} 162 L${X + 60} 162`} {...ln(2.5)} />
      <path d={`M${X - 34} 160 L${X + 34} 160 L${X + 38} 212 L${X - 38} 212Z`} {...o("#fffaf2", 2.5)} />
      <path d={`M${X - 36} 196 L${X + 36} 196`} {...ln(4, "#f49cb6")} />
      <rect x={X - 10} y="170" width="20" height="14" rx="3" {...o("#f7bfd6", 2)} />
    </>),
  },
};

// Accesorios de cabeza en coordenadas de la cabeza (centro 0,0; radio ≈44; coronilla en y=-42)
const icono = (id, x, y, k, ax = 50, ay = 50, rot = 0) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${k}) translate(${-ax} ${-ay})`}>{ART[id](SW / k)}</g>
);
const CABEZA = {
  lazo_mono: () => icono("lazo_mono", 28, -38, 0.46, 50, 52, 18),
  gorro_tejido: () => (<g>
    <path d="M-46 -14 C-48 -60 48 -60 46 -14Z" {...o("#f6b955")} />
    {[-24, -8, 8, 24].map(x => <path key={x} d={`M${x} -48 L${x} -26`} {...ln(1.8)} opacity="0.45" />)}
    <rect x="-49" y="-26" width="98" height="16" rx="7" {...o("#f8d79a")} />
    {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${-40 + i * 8} -22 L${-40 + i * 8} -14`} {...ln(1.6)} opacity="0.5" />)}
    <circle cx="0" cy="-54" r="9" {...o("#fff7ea")} />
  </g>),
  sombrero_paja: () => icono("sombrero_paja", 0, -34, 1.25, 50, 66),
  corona_flores: () => icono("corona_flores", 0, -32, 1.1, 50, 62),
  boina: () => icono("boina", 4, -42, 1.15, 50, 58, -8),
  corona: () => icono("corona", 0, -38, 0.78, 50, 76),
  gorro_lluvia: () => icono("gorro_lluvia", 0, -30, 1.3, 50, 64),
  lentes: () => (<g>
    <path d="M-34 -8 L-44 -12 M34 -8 L44 -12" {...ln(2.6)} />
    <circle cx="-19" cy="-4" r="15" fill="#e2effa" fillOpacity="0.45" stroke={INK} strokeWidth="3" />
    <circle cx="19" cy="-4" r="15" fill="#e2effa" fillOpacity="0.45" stroke={INK} strokeWidth="3" />
    <path d="M-4 -6 Q0 -10 4 -6" {...ln(2.6)} />
    <path d="M-26 -12 L-22 -15 M12 -12 L16 -15" {...ln(2, "#fff")} />
  </g>),
  traje_abeja: () => (<g>
    <path d="M-14 -44 L-20 -64 M14 -44 L20 -64" {...ln(2.6)} />
    <circle cx="-20" cy="-64" r="5" {...o(G.yellow, 2.4)} /><circle cx="20" cy="-64" r="5" {...o(G.yellow, 2.4)} />
    <path d="M-40 -22 C-36 -52 36 -52 40 -22" {...ln(8)} /><path d="M-40 -22 C-36 -52 36 -52 40 -22" {...ln(4, G.brown)} />
  </g>),
  traje_abrigo: () => (<g>
    <path d="M-40 -22 C-36 -52 36 -52 40 -22" {...ln(9)} /><path d="M-40 -22 C-36 -52 36 -52 40 -22" {...ln(5, "#f6a7b8")} />
    <circle cx="0" cy="-46" r="7" {...o("#fff", 2.4)} />
  </g>),
  traje_calabaza: () => (<g>
    <path d="M2 -40 C8 -46 14 -48 12 -54" {...ln(2, "#7cc47a")} />
    <rect x="-4" y="-56" width="8" height="16" rx="2" {...o("#8a5a34", 2.4)} transform="rotate(8 0 -48)" />
    <Leaf x={4} y={-52} len={14} w={5} rot={-20} fill="#7cc47a" s={2} />
  </g>),
  traje_santa: () => (<g>
    <path d="M-40 -30 C-34 -64 30 -72 52 -48 C42 -50 36 -44 38 -30Z" {...o("#e4646a")} />
    <path d="M-46 -34 C-30 -48 30 -48 46 -34 L46 -24 C30 -38 -30 -38 -46 -24Z" {...o("#fff")} />
    <circle cx="52" cy="-48" r="7" {...o("#fff")} />
  </g>),
};

const CUELLO = {
  bufanda: X => (<g>
    <rect x={X + 8} y="136" width="15" height="34" rx="3" {...o(G.sky)} />
    {[11, 15.5, 20].map(d => <path key={d} d={`M${X + d} 170 L${X + d} 176`} {...ln(2)} />)}
    <path d={`M${X - 36} 128 C${X - 36} 119 ${X + 36} 119 ${X + 36} 128 L${X + 36} 137 C${X + 36} 145 ${X - 36} 145 ${X - 36} 137Z`} {...o(G.sky)} />
    <path d={`M${X - 35} 132 C${X - 12} 137 ${X + 12} 137 ${X + 35} 132`} {...ln(4, "#fff")} />
  </g>),
  panoleta: X => (<g>
    <path d={`M${X - 36} 127 C${X - 12} 136 ${X + 12} 136 ${X + 36} 127 L${X} 168Z`} {...o(G.red)} />
    {[[-14, 138], [0, 141], [14, 138], [-6, 151], [6, 151], [0, 160]].map(([dx, y], i) => <circle key={i} cx={X + dx} cy={y} r="2.2" fill="#fff" />)}
  </g>),
};

function Manga({ a, manga, distal, clip }) {
  const { rx, ry } = a;
  return (
    <g transform={`translate(${a.cx} ${a.cy}) rotate(${a.rot})`}>
      <defs><clipPath id={clip}><ellipse rx={rx} ry={ry} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <ellipse rx={rx} ry={ry} fill={manga ? manga.fill : GRAY} />
        {manga?.rayas && [-0.5, 0.05].map(t => distal === "y"
          ? <rect key={t} x={-rx} y={ry * t - 2} width={rx * 2} height="4" fill={manga.rayas} />
          : <rect key={t} x={rx * -t - 2} y={-ry} width="4" height={ry * 2} fill={manga.rayas} />)}
        {manga && (distal === "y"
          ? <><ellipse cx="0" cy={ry * 0.62} rx={rx + 2} ry={ry * 0.5} fill={GRAY} /><rect x={-rx} y={ry * 0.1} width={rx * 2} height="5" {...o(manga.puno, 2)} /></>
          : <><ellipse cx={-rx * 0.62} cy="0" rx={rx * 0.5} ry={ry + 2} fill={GRAY} /><rect x={-rx * 0.15 - 5} y={-ry} width="5" height={ry * 2} {...o(manga.puno, 2)} /></>)}
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth="3" />
    </g>
  );
}

function Pies({ pies }) {
  return pies.map(([cx, rx, rxi]) => (
    <g key={cx}>
      <ellipse cx={cx} cy="198" rx={rx} ry="13" fill={INK} />
      <ellipse cx={cx} cy="197" rx={rxi} ry="11" fill={GRAY} />
      {[-7, 0, 7].map(d => <line key={d} x1={cx + d} y1={d ? 203 : 204} x2={cx + d + Math.sign(d)} y2={d ? 207 : 208} stroke={INK} strokeWidth="1.6" strokeLinecap="round" />)}
    </g>
  ));
}

// Capa con la ropa nueva sobre CouplePandaSVG (los dos pandas usan lo mismo)
export function PandaRopaLayer({ accessories, pandaSize = 160 }) {
  const uid = useId().replace(/:/g, "");
  const puesto = id => accessories?.[id] === true;
  const cuerpoId = Object.keys(CUERPO).find(puesto);
  const prenda = cuerpoId && CUERPO[cuerpoId];
  const cuellos = Object.keys(CUELLO).filter(puesto);
  const cabezas = ["lentes", ...Object.keys(CABEZA).filter(k => k !== "lentes")].filter(puesto);
  if (!prenda && !cuellos.length && !cabezas.length) return null;

  return (
    <svg viewBox="0 0 260 220" width={pandaSize} height={pandaSize * 0.846}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      {prenda && (<>
        {prenda.alas && [[24, 136, -30, 1], [236, 136, 30, -1]].map(([x, y, r, f]) => (
          <g key={x}>
            <ellipse cx={x} cy={y} rx="18" ry="11" {...o("#e3f1fb", 2.5)} transform={`rotate(${r} ${x} ${y})`} />
            <ellipse cx={x + f * 2} cy={y + 15} rx="13" ry="8" {...o("#e3f1fb", 2.5)} transform={`rotate(${-r / 3} ${x + f * 2} ${y + 15})`} />
          </g>
        ))}
        {["L", "R"].map(k => {
          const lado = LADOS[k];
          return (
            <g key={k}>
              <defs><clipPath id={`${uid}c${k}`}><path d={lado.body} /></clipPath></defs>
              <g clipPath={`url(#${uid}c${k})`}>{prenda.draw(lado.x)}</g>
              {!prenda.sinFondo && <path d={lado.body} fill="none" stroke={INK} strokeWidth="4" />}
              <Pies pies={lado.pies} />
            </g>
          );
        })}
        <Manga a={ABRAZO} manga={prenda.manga} distal="x" clip={`${uid}mA`} />
        <Manga a={LADOS.L.brazo} manga={prenda.manga} distal="y" clip={`${uid}mL`} />
        <Manga a={LADOS.R.brazo} manga={prenda.manga} distal="y" clip={`${uid}mR`} />
      </>)}
      {cuellos.map(id => <g key={id}>{CUELLO[id](LADOS.L.x)}{CUELLO[id](LADOS.R.x)}</g>)}
      {cabezas.length > 0 && (
        <defs>
          <mask id={`${uid}tras`} maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="220">
            <rect width="260" height="220" fill="#fff" />
            <g transform="rotate(-4 176 90)" fill="#000">
              <ellipse cx="176" cy="88" rx="47" ry="45" /><ellipse cx="140" cy="57" rx="19" ry="18" /><ellipse cx="212" cy="57" rx="19" ry="18" />
            </g>
          </mask>
        </defs>
      )}
      {cabezas.map(id => (
        <g key={id}>
          <g mask={`url(#${uid}tras)`}><g transform={LADOS.L.head}>{CABEZA[id]()}</g></g>
          <g transform={LADOS.R.head}>{CABEZA[id]()}</g>
        </g>
      ))}
    </svg>
  );
}
