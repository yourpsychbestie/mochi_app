// Banco de 30 preguntas para la Semilla del Día
export const DAILY_SEED_QUESTIONS = [
  { id: "q_001", text: "¿Qué pequeño detalle de tu pareja te hizo feliz ayer?", category: "gratitud" },
  { id: "q_002", text: "¿Cuál es tu snack favorito de tu pareja?", category: "humor" },
  { id: "q_003", text: "¿Qué te hace reír siempre de tu pareja?", category: "humor" },
  { id: "q_004", text: "Si tuvieran un superpoder juntos, ¿cuál sería?", category: "deseos" },
  { id: "q_005", text: "¿Cuál es el mejor recuerdo de un viaje juntos?", category: "recuerdos" },
  { id: "q_006", text: "¿Qué te gustaría que hiciéramos más seguido?", category: "conexion" },
  { id: "q_007", text: "¿Cómo te gusta que te demuestren cariño?", category: "conexion" },
  { id: "q_008", text: "¿Qué te hace sentir más conectado/a cuando estamos juntos?", category: "conexion" },
  { id: "q_009", text: "Comparte un meme que te haga pensar en nosotros.", category: "humor" },
  { id: "q_010", text: "¿Qué te sorprendió positivamente de tu pareja esta semana?", category: "gratitud" },
  { id: "q_011", text: "¿Cuál es tu forma favorita de pasar tiempo juntos?", category: "conexion" },
  { id: "q_012", text: "¿Qué pequeña tradición te gustaría crear juntos?", category: "deseos" },
  { id: "q_013", text: "¿Qué te gustaría recordar dentro de 5 años?", category: "recuerdos" },
  { id: "q_014", text: "¿Qué apoyo te gustaría recibir más de tu pareja?", category: "conexion" },
  { id: "q_015", text: "¿Qué significa “hogar” para ti en esta relación?", category: "conexion" },
  { id: "q_016", text: "¿Qué te hace sentir amado/a?", category: "conexion" },
  { id: "q_017", text: "¿Cuál es el mejor cumplido que te ha hecho tu pareja?", category: "gratitud" },
  { id: "q_018", text: "¿Qué te gustaría hacer juntos este fin de semana?", category: "deseos" },
  { id: "q_019", text: "¿Qué te gustaría que tu pareja supiera sobre ti?", category: "conexion" },
  { id: "q_020", text: "¿Qué pequeño gesto de tu pareja te hace sentir especial?", category: "gratitud" },
  { id: "q_021", text: "¿Cuál es tu recuerdo favorito de cuando empezaron?", category: "recuerdos" },
  { id: "q_022", text: "¿Qué te gustaría que cambiáramos en nuestra rutina?", category: "deseos" },
  { id: "q_023", text: "¿Qué te hace sentir más cerca de tu pareja?", category: "conexion" },
  { id: "q_024", text: "Comparte una foto o recuerdo que te haga sonreír.", category: "recuerdos" },
  { id: "q_025", text: "¿Qué te gustaría que hiciéramos más en pareja?", category: "deseos" },
  { id: "q_026", text: "¿Qué te hace sentir seguro/a en esta relación?", category: "conexion" },
  { id: "q_027", text: "¿Qué pequeño detalle te gustaría recibir más seguido?", category: "gratitud" },
  { id: "q_028", text: "¿Qué te gustaría celebrar juntos pronto?", category: "deseos" },
  { id: "q_029", text: "¿Qué te hace sentir orgulloso/a de tu pareja?", category: "gratitud" },
  { id: "q_030", text: "¿Qué te gustaría que recordáramos siempre?", category: "recuerdos" },
];

export const DAILY_SEED_BAMBOO_REWARD = 10;

export function getDateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Simple numeric hash for a string (used to distribute questions per couple)
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Deterministic daily question for a couple.
// The same couple gets the same question on the same day, but different days rotate through the bank.
export function getDailySeedForCouple(coupleCode, dateKey = getDateKeyLocal()) {
  if (!coupleCode) return DAILY_SEED_QUESTIONS[0];
  const dayIndex = hashString(`${coupleCode}:${dateKey}`);
  const idx = dayIndex % DAILY_SEED_QUESTIONS.length;
  return DAILY_SEED_QUESTIONS[idx];
}

export function getDailySeedDocId(coupleCode, dateKey = getDateKeyLocal()) {
  return `${coupleCode}_${dateKey}`;
}
