import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  cream:"#f5edda", cream2:"#fdf8ef", dark:"#1e2b1e",
  olive:"#4a6e30", oliveL:"#7ab848", gold:"#d4a843",
  salmon:"#e8907a", sky:"#88b8c8", sand:"#ede4cc", sandL:"#f8f2e4",
  white:"#ffffff", ink:"#1e2b1e", inkM:"#5a6a4a", inkL:"#8a9a7a",
  border:"rgba(30,43,30,0.14)", line:"rgba(30,43,30,0.08)",
  pink:"#f4a8c0", rose:"#e8607a",
};

const ls = {
  get:(k)=>{ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} },
  set:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════

const GARDEN_ITEMS = [
  {id:"bamboo", name:"Bambú", cost:20},
  {id:"bamboo2", name:"Bambusal", cost:35},
  {id:"flowers", name:"Flores", cost:15},
  {id:"peony", name:"Peonías", cost:15},
  {id:"tree", name:"Cerezo", cost:80},
  {id:"lake", name:"Estanque", cost:60},
  {id:"butterfly",name:"Mariposas", cost:45},
  {id:"rainbow", name:"Arcoíris", cost:100},
  {id:"sun", name:"Sol", cost:30},
  {id:"water", name:"Regar", cost:5},
  {id:"lantern", name:"Farolito", cost:25},
  {id:"heart", name:"Corazón", cost:50},
];

const EXERCISES = [
  {id:"validacion",emoji:"💬",title:"La Danza de la Validación",tags:"DBT · Sistémica",bamboo:40,time:"15 min",
    desc:"Aprendan a validar las emociones del otro sin defenderse ni explicar. La validación no significa estar de acuerdo — significa decir 'tiene sentido que sientas eso'.",
    instructions:["Siéntense cómodos frente a frente","Persona A comparte algo que le molestó","Persona B valida sin defenderse ni explicar","Intercambien roles","Reflexionen juntos al final"],
    phases:[
      {role:0,q:"Persona A: Comparte algo que te molestó esta semana.",ph:"Esta semana me sentí… cuando…",hint:"Habla desde el 'yo'. Ej: 'Me sentí ignorado/a cuando…'"},
      {role:1,q:"Persona B: Valida con 'Tiene sentido porque...'",ph:"Tiene sentido porque…",hint:"Validar no es estar de acuerdo. Solo reconocer."},
      {role:0,q:"Persona A: ¿Te sentiste comprendido/a?",ph:"Me sentí comprendido/a cuando…"},
      {role:1,q:"Persona B: Tu turno — comparte algo que hayas sentido.",ph:"Esta semana yo sentí…"},
      {role:0,q:"Persona A: Valida a tu pareja.",ph:"Tiene sentido porque…"},
      {role:1,q:"Persona B: ¿Cómo fue recibir esa validación?",ph:"Eso me hizo sentir…"},
    ]},
  {id:"ojos",emoji:"👁",title:"4 Minutos de Contacto Visual",tags:"ACT · Arthur Aron",bamboo:30,time:"5 min",
    desc:"Mirarse a los ojos 4 minutos sin hablar. Estudios de Arthur Aron demuestran que esta práctica genera sentimientos de amor profundo entre extraños — imagina entre parejas.",
    instructions:["Siéntense muy cerca, frente a frente","Pongan el teléfono entre los dos","Está permitido sonreír — no hablar","Respiren juntos naturalmente","Presionen INICIAR cuando estén listos"],
    timer:240,timerLabel:"Mírense a los ojos en silencio",
    beforeTimer:["Siéntense frente a frente, muy cerca.","Pongan el teléfono entre los dos.","Está permitido sonreír — no hablar.","Presionen INICIAR cuando estén listos."],
    afterPrompts:[{role:0,ph:"Una palabra para lo que sentí…"},{role:1,ph:"Lo que vi en tus ojos fue…"}]},
  {id:"espejo",emoji:"🪞",title:"Técnica del Espejo",tags:"Imago · Narrativa",bamboo:35,time:"20 min",
    desc:"El espejo confirma que el mensaje fue recibido antes de responder. Basada en terapia Imago de Harville Hendrix.",
    instructions:["Persona A comparte algo importante","Persona B refleja textualmente lo escuchado","A confirma si fue bien capturado","B valida la experiencia de A","Intercambien roles"],
    phases:[
      {role:0,q:"Persona A: Algo que quieras que tu pareja entienda mejor.",ph:"Quiero que entiendas que…"},
      {role:1,q:"Persona B: Refleja lo que escuchaste.",ph:"Lo que escucho es… ¿Lo capté bien?",hint:"No interpretes — solo refleja. Usa sus mismas palabras."},
      {role:0,q:"Persona A: ¿Te sentiste reflejado/a?",ph:"Sí captaste… / Lo que faltó fue…"},
      {role:1,q:"Persona B: Valida.",ph:"Tiene sentido porque…"},
      {role:1,q:"Persona B: Ahora comparte tú.",ph:"Quiero que entiendas que…"},
      {role:0,q:"Persona A: Refleja.",ph:"Lo que escucho es…"},
      {role:1,q:"¿Cómo fue sentirte reflejado/a?",ph:"De este ejercicio me llevo…"},
    ]},
  {id:"apreciacion",emoji:"💝",title:"3 Apreciaciones Específicas",tags:"Gottman · TCC+",bamboo:25,time:"10 min",
    desc:"La fórmula Gottman: 5 interacciones positivas por cada negativa. Las apreciaciones vagas no nutren — las específicas sí.",
    instructions:["Cada persona piensa en 3 cosas específicas que aprecia","Compartan una a la vez","Quien recibe, solo dice gracias y cómo le hizo sentir","No minimicen ni desvíen los halagos","Dejen que el amor entre"],
    phases:[
      {role:0,q:"Persona A: Una apreciación MUY específica.",ph:"Aprecio cuando hiciste…",hint:"Específico: 'me preparaste café el martes', no 'eres atento/a'"},
      {role:1,q:"Persona B: Recibe. Di 'Gracias' y cómo te hizo sentir.",ph:"Gracias. Eso me hizo sentir…"},
      {role:1,q:"Persona B: Tu apreciación específica.",ph:"Aprecio cuando tú…"},
      {role:0,q:"Persona A: Recibe.",ph:"Gracias. Eso me hizo sentir…"},
      {role:0,q:"Persona A: Algo que admiras profundamente.",ph:"Lo que más admiro de cómo enfrentas la vida es…"},
      {role:1,q:"¿Cómo se sienten después?",ph:"Hacer esto juntos me hace sentir que nuestra relación…"},
    ]},
  {id:"respiracion",emoji:"🌬",title:"Respiración Sincronizada",tags:"ACT · Mindfulness",bamboo:20,time:"8 min",
    desc:"Respirar juntos activa el nervio vago — el nervio de la seguridad. Sincronizar la respiración reduce cortisol y genera co-regulación emocional.",
    instructions:["Siéntense uno detrás del otro","El de atrás coloca su mano en la espalda","Sigan el ritmo 4-2-6 juntos","Cierren los ojos si quieren","Presionen INICIAR"],
    timer:300,timerLabel:"4 seg inhalar · 2 sostener · 6 exhalar",
    beforeTimer:["Siéntense uno detrás del otro.","El de atrás coloca su mano en la espalda.","Sigan el ritmo 4-2-6 juntos.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Después de respirar juntos, siento…"},{role:1,ph:"Lo que noté al sincronizarme fue…"}]},
  {id:"carta",emoji:"✉️",title:"Carta a mi Herida",tags:"Narrativa · TCC",bamboo:60,time:"30 min",
    desc:"Identificar las creencias de infancia que gobiernan cómo amamos. Cada uno escribe individualmente y luego comparte lo que quiera.",
    instructions:["Cada uno escribe su carta por separado","Tomen 10-15 min en silencio","Compartan lo que se sientan cómodos compartiendo","El otro solo escucha, sin consejo","Terminen con un abrazo"],
    isEscritura:true,
    instruccion:"Escribe una carta a tu herida de infancia. Comienza: 'Querida [soledad / miedo al abandono…], sé que estás ahí porque...'",
    prompts:["¿Cómo y cuándo apareciste en mi vida?","¿Qué creencias sobre el amor me enseñaste?","¿Cómo apareces en mi relación hoy?","¿Qué quiero decirte desde mi yo adulto?"],
    afterPrompts:[{role:0,ph:"Compartir esto me hizo sentir…"},{role:1,ph:"Después de escucharte, entiendo mejor que…"}]},
  {id:"suenos",emoji:"🌙",title:"Mapa de Sueños",tags:"Narrativa · Positiva",bamboo:35,time:"15 min",
    desc:"Las parejas que conocen los sueños del otro tienen 3x más probabilidades de navegar conflictos. Este ejercicio crea un mapa compartido del futuro.",
    instructions:["Cada persona piensa en 3 sueños personales","Compartan sin juzgar ni 'aterrizar' los sueños","Busquen los sueños que se superponen","Identifiquen uno que puedan perseguir juntos","Celébrense por soñar en voz alta"],
    phases:[
      {role:0,q:"Persona A: Un sueño que tienes para tu vida.",ph:"Algo que sueño es…",hint:"Sin filtros. No importa si parece imposible."},
      {role:1,q:"Persona B: ¿Qué admiras de ese sueño?",ph:"Lo que admiro de ese sueño es…"},
      {role:1,q:"Persona B: Tu sueño.",ph:"Algo que yo sueño es…"},
      {role:0,q:"Persona A: ¿Qué admiras de ese sueño?",ph:"Lo que me inspira de eso es…"},
      {role:0,q:"¿Hay un sueño que quieran perseguir juntos?",ph:"Un sueño que podríamos tener juntos…"},
      {role:1,q:"¿Cuál sería el primer paso?",ph:"El primer paso podría ser…"},
    ]},
  {id:"perdida",emoji:"🕊",title:"El Perdón Activo",tags:"Gottman · EFT",bamboo:55,time:"25 min",
    desc:"El perdón no es olvidar — es soltar la carga. Basado en el modelo de Gottman: reconocer, asumir responsabilidad, reparar.",
    instructions:["Elijan algo específico que quieran sanar","No es para reabrir heridas — es para cerrarlas","Quien pide perdón no se justifica","Quien perdona no impone condiciones","Terminen con contacto físico: tomarse las manos"],
    phases:[
      {role:0,q:"Persona A: Algo que quieras sanar entre ustedes.",ph:"Algo que quisiera soltar es…",hint:"Sin acusaciones. Desde el 'yo'."},
      {role:1,q:"Persona B: Reconoce sin defenderte.",ph:"Entiendo que te afectó cuando…"},
      {role:1,q:"Persona B: Asume tu parte.",ph:"Mi parte en esto fue…"},
      {role:0,q:"Persona A: ¿Qué necesitas para soltar esto?",ph:"Para poder soltar esto necesito sentir…"},
      {role:1,q:"Persona B: ¿Puedes ofrecerlo?",ph:"Lo que puedo ofrecerte es…"},
      {role:0,q:"¿Cómo se sienten ahora?",ph:"Después de este ejercicio, me siento…"},
    ]},
  {id:"amor_idiomas",emoji:"💞",title:"Idiomas del Amor",tags:"Chapman · ACT",bamboo:30,time:"12 min",
    desc:"Gary Chapman identificó 5 idiomas del amor. Conocer el idioma de tu pareja evita que el amor se pierda en traducción.",
    instructions:["Lean los 5 idiomas juntos","Cada quien elige su TOP 2","Compartan sin juzgar","Hablen de cómo pueden 'hablar' el idioma del otro","Hagan un pequeño compromiso"],
    phases:[
      {role:0,q:"De estos 5, ¿cuál es tu idioma principal? (Palabras de afirmación / Tiempo de calidad / Regalos / Actos de servicio / Contacto físico)",ph:"Mi idioma del amor principal es…",hint:"El que más te hace sentir amado/a cuando lo recibes."},
      {role:1,q:"Persona B: ¿Cuál es tu idioma?",ph:"Mi idioma del amor es…"},
      {role:0,q:"¿Cómo podrías hablar mejor el idioma de tu pareja?",ph:"Podría hablar tu idioma cuando…"},
      {role:1,q:"Persona B: ¿Cómo podrías hablar el idioma de tu pareja?",ph:"Podría hablar tu idioma cuando…"},
      {role:0,q:"Un pequeño compromiso para esta semana.",ph:"Esta semana voy a…"},
      {role:1,q:"¿Cómo se sienten con este compromiso?",ph:"Este compromiso me hace sentir…"},
    ]},
  {id:"conflicto",emoji:"⚡",title:"Mapa del Conflicto",tags:"EFT · Sistémica",bamboo:45,time:"20 min",
    desc:"Bajo cada pelea hay una necesidad no expresada. Este ejercicio les ayuda a ir de la superficie al corazón del conflicto.",
    instructions:["Elijan un conflicto reciente (no el más grande)","No busquen quién tiene razón","Busquen qué necesidad hay detrás","El objetivo es entenderse, no ganar","Hablen despacio y hagan pausas"],
    phases:[
      {role:0,q:"Persona A: Describe el conflicto desde tu perspectiva.",ph:"Cuando discutimos por… yo sentí…",hint:"Sin acusaciones. 'Yo sentí…' no 'Tú hiciste…'"},
      {role:1,q:"Persona B: ¿Qué sentiste tú?",ph:"Desde mi lugar, yo sentí…"},
      {role:0,q:"Persona A: ¿Qué necesidad tuya no estaba siendo vista?",ph:"Detrás de mi reacción, lo que necesitaba era…"},
      {role:1,q:"Persona B: ¿Qué necesidad tuya no estaba siendo vista?",ph:"Lo que yo necesitaba era…"},
      {role:0,q:"¿Pueden ver el ciclo? ¿Cómo se activan mutuamente?",ph:"Creo que cuando tú… yo reacciono con… y eso te hace…"},
      {role:1,q:"¿Qué podrían hacer diferente la próxima vez?",ph:"La próxima vez podríamos…"},
    ]},
  {id:"presencia",emoji:"🌿",title:"Presencia Plena",tags:"Mindfulness · ACT",bamboo:25,time:"10 min",
    desc:"En un mundo de distracciones, dar presencia plena es el regalo más raro. 10 minutos sin teléfonos, sin listas mentales — solo ustedes.",
    instructions:["Apaguen o silencien los teléfonos","Siéntense cómodos, sin mesa entre ustedes","No hay agenda — solo estar","Si surge silencio, está bien","Al final, compartan una observación"],
    timer:600,timerLabel:"Presencia plena — sin distracciones",
    beforeTimer:["Apaguen o silencien los teléfonos.","Siéntense cómodos, cerca.","No hay tema — solo estén presentes.","Hablen de lo que surja naturalmente.","Presionen INICIAR."],
    afterPrompts:[{role:0,ph:"Lo que noté en ti hoy fue…"},{role:1,ph:"Estar presente contigo me hizo sentir…"}]},
];

const CONOCE_CATS = {
  infancia:{emoji:"🧸",label:"Infancia",bg:"#f5edda",preguntas:["¿Cuál es tu recuerdo más feliz de la infancia?","¿Cómo era tu relación con tu mamá cuando eras pequeño/a?","¿Cómo era tu relación con tu papá cuando eras pequeño/a?","¿Qué aprendiste sobre el amor en tu familia de origen?","¿Cuál fue el momento más difícil de tu infancia?","¿Qué cosas de tu infancia te gustaría haber tenido?"]},
  amor: {emoji:"💕",label:"El Amor",bg:"#fce8e0",preguntas:["¿Qué significa para ti sentirte amado/a?","¿Cuál ha sido tu mayor herida en el amor?","¿Qué es lo que más te da miedo en una relación?","¿Qué valoras más de nuestra relación hoy?","¿Hay algo que siempre has querido decirme y no has podido?","¿Qué necesitas de mí que quizás no me has pedido?"]},
  suenos: {emoji:"🌙",label:"Sueños",bg:"#e4e8f8",preguntas:["¿Cuál es el sueño que sientes que aún no has perseguido?","¿Cómo te imaginas tu vida en 10 años?","¿Qué cosa quisiste lograr y aún no has intentado?","¿Qué nos falta vivir juntos?","Si el dinero no fuera problema, ¿cómo vivirías?","¿Qué legado quieres dejar en el mundo?"]},
  miedos: {emoji:"🫂",label:"Miedos",bg:"#e4f0e0",preguntas:["¿A qué le tienes más miedo en la vida?","¿Cuándo más necesitas que te abracen?","¿Cuándo te sientes solo/a aunque esté presente?","¿Qué es lo que más te cuesta pedir?","¿Qué es lo que más te cuesta recibir?","¿Cuál es tu mayor inseguridad y cómo puedo apoyarte?"]},
};

const BURBUJA_SECTIONS = [
  {id:"tipo",icon:"💑",title:"Tipo de relación",sub:"Monogamia, exclusividad, definición",itemBg:"#fce4d0",
    items:[
      {id:"tipo1",q:"¿Qué tipo de relación tienen? ¿Cómo la definirían?",phA:"Para mí nuestra relación es...",phB:"Para mí nuestra relación es..."},
      {id:"tipo2",q:"¿Cuánto espacio personal necesita cada uno?",phA:"Necesito...",phB:"Necesito..."},
      {id:"tipo3",q:"¿Cómo manejan el tiempo con amigos y familia por separado?",phA:"Para mí es importante...",phB:"Para mí es importante..."},
    ]},
  {id:"fidelidad",icon:"🤝",title:"Fidelidad & Límites",sub:"Qué es infidelidad para nosotros",itemBg:"#fce4e4",
    items:[
      {id:"fidel1",q:"¿Qué consideras tú que es infidelidad?",phA:"Para mí la infidelidad es...",phB:"Para mí la infidelidad es...",note:"Más allá de lo físico: mensajes, emocional, coqueteo. Sin respuestas incorrectas."},
      {id:"fidel2",q:"¿Qué le pides al otro para sentirte seguro/a?",phA:"Para sentirme seguro/a necesito...",phB:"Para sentirme seguro/a necesito..."},
      {id:"fidel3",q:"¿Cómo manejan la privacidad (teléfonos, contraseñas)?",phA:"Para mí la privacidad significa...",phB:"Para mí la privacidad significa..."},
    ]},
  {id:"discusion",icon:"⚡",title:"Reglas para discutir",sub:"Cómo manejar conflictos juntos",itemBg:"#e8eafc",
    items:[
      {id:"disc1",q:"Señal de 'necesito pausa' — ¿cuál es la tuya?",phA:"Cuando me desborda...",phB:"Cuando me desborda..."},
      {id:"disc2",q:"¿Qué está PROHIBIDO en una discusión entre ustedes?",phA:"Ej: gritar, traer el pasado...",phB:"Ej: insultar, silencio de días..."},
      {id:"disc3",q:"¿Cómo se reconcilian después de una pelea?",phA:"Para reconciliarme necesito...",phB:"Para reconciliarme necesito..."},
      {id:"disc4",q:"¿Cuánto tiempo de pausa está bien antes de retomar una conversación?",phA:"Necesito al menos...",phB:"Necesito al menos..."},
    ]},
  {id:"quiero",icon:"✨",title:"Lo que quiero del otro",sub:"Necesidades, deseos, peticiones",itemBg:"#fce4f4",
    items:[
      {id:"quiero1",q:"¿Qué MÁS necesitas de tu pareja que no has pedido?",phA:"Lo que más necesito es...",phB:"Lo que más necesito es..."},
      {id:"quiero2",q:"¿Cómo prefieres recibir amor?",phA:"Me siento amado/a cuando...",phB:"Me siento amado/a cuando..."},
      {id:"quiero3",q:"¿Qué es algo pequeño que el otro podría hacer y te haría muy feliz?",phA:"Algo pequeño que me haría feliz...",phB:"Algo pequeño que me haría feliz..."},
    ]},
  {id:"futuro",icon:"🌱",title:"El Futuro",sub:"Planes, metas y sueños compartidos",itemBg:"#e4f4e8",
    items:[
      {id:"fut1",q:"¿Dónde se imaginan viviendo en 5 años?",phA:"Me imagino que...",phB:"Me imagino que..."},
      {id:"fut2",q:"¿Quieren tener o no tener hijos? ¿Cuándo?",phA:"Sobre los hijos, yo siento...",phB:"Sobre los hijos, yo siento..."},
      {id:"fut3",q:"¿Cómo manejarán las finanzas juntos?",phA:"Para mí lo ideal sería...",phB:"Para mí lo ideal sería..."},
    ]},
];

const LOVE_QUICK = [
  "Hoy pienso en ti y me alegra tanto tenerte 🌸",
  "Gracias por estar aquí conmigo. Te amo 💜",
  "Eres mi lugar favorito en el mundo 🌍",
  "No puedo esperar para verte. Te extraño 🐼",
  "Eres la persona más especial en mi vida ✨",
  "Cada día a tu lado es mi favorito 🌿",
  "Solo quería decirte que te pienso mucho 🫶",
  "Me siento muy afortunado/a de amarte 💫",
];

// ═══════════════════════════════════════════════════════
// COUPLE PANDA SVG — inspired by the uploaded images
// ═══════════════════════════════════════════════════════

function CouplePandaSVG({ happy = false, size = 160 }) {
  const s = size;
  return (
    <svg viewBox="0 0 220 200" width={s} height={s * 0.91} style={{ display: "block" }}>
      {/* === LEFT PANDA (facing right, slightly behind) === */}
      {/* Left panda body */}
      <ellipse cx="78" cy="148" rx="40" ry="42" fill="#f5edda" />
      <ellipse cx="55" cy="158" rx="28" ry="32" fill="#1e2b1e" />
      <ellipse cx="100" cy="158" rx="28" ry="32" fill="#1e2b1e" />
      {/* Left panda belly */}
      <ellipse cx="78" cy="152" rx="20" ry="24" fill="#fdf8ef" />
      {/* Left arm hugging right panda */}
      <ellipse cx="110" cy="138" rx="14" ry="22" fill="#1e2b1e" transform="rotate(-20 110 138)" />
      {/* Left arm behind */}
      <ellipse cx="50" cy="138" rx="13" ry="20" fill="#1e2b1e" transform="rotate(14 50 138)" />
      {/* Left panda feet */}
      <ellipse cx="62" cy="185" rx="16" ry="9" fill="#1e2b1e" />
      <ellipse cx="94" cy="185" rx="16" ry="9" fill="#1e2b1e" />
      {/* Left panda head */}
      <circle cx="78" cy="80" r="44" fill="#f5edda" />
      {/* Left ears */}
      <circle cx="44" cy="44" r="16" fill="#1e2b1e" />
      <circle cx="112" cy="44" r="16" fill="#1e2b1e" />
      {/* Left eye patches */}
      <ellipse cx="62" cy="78" rx="16" ry="14" fill="#1e2b1e" />
      <ellipse cx="94" cy="78" rx="16" ry="14" fill="#1e2b1e" />
      {/* Left eyes */}
      {happy ? (
        <>
          <path d="M55 79 Q62 86 69 79" fill="none" stroke="#f5edda" strokeWidth="3" strokeLinecap="round" />
          <path d="M87 79 Q94 86 101 79" fill="none" stroke="#f5edda" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="62" cy="79" r="7" fill="#f5edda" />
          <circle cx="94" cy="79" r="7" fill="#f5edda" />
          <circle cx="62" cy="80" r="3.5" fill="#1e2b1e" />
          <circle cx="94" cy="80" r="3.5" fill="#1e2b1e" />
          <circle cx="64" cy="78" r="1.5" fill="white" />
          <circle cx="96" cy="78" r="1.5" fill="white" />
        </>
      )}
      {/* Left nose */}
      <ellipse cx="78" cy="94" rx="5" ry="3.5" fill="#1e2b1e" />
      {/* Left mouth */}
      {happy
        ? <path d="M70 101 Q78 110 86 101" fill="none" stroke="#1e2b1e" strokeWidth="2.5" strokeLinecap="round" />
        : <path d="M72 100 Q78 106 84 100" fill="none" stroke="#1e2b1e" strokeWidth="2" strokeLinecap="round" />
      }
      {/* Left blush */}
      {happy && <>
        <ellipse cx="50" cy="95" rx="11" ry="7" fill="#e8907a" opacity="0.4" />
        <ellipse cx="106" cy="95" rx="11" ry="7" fill="#e8907a" opacity="0.4" />
      </>}

      {/* === RIGHT PANDA (facing left, slightly in front) === */}
      {/* Right panda body */}
      <ellipse cx="142" cy="148" rx="40" ry="42" fill="#f5edda" />
      <ellipse cx="119" cy="158" rx="28" ry="32" fill="#1e2b1e" />
      <ellipse cx="165" cy="158" rx="28" ry="32" fill="#1e2b1e" />
      {/* Right panda belly */}
      <ellipse cx="142" cy="152" rx="20" ry="24" fill="#fdf8ef" />
      {/* Right arm hugging left panda */}
      <ellipse cx="110" cy="138" rx="14" ry="22" fill="#2e3b2e" transform="rotate(20 110 138)" />
      {/* Right arm behind */}
      <ellipse cx="168" cy="138" rx="13" ry="20" fill="#1e2b1e" transform="rotate(-14 168 138)" />
      {/* Right panda feet */}
      <ellipse cx="128" cy="185" rx="16" ry="9" fill="#1e2b1e" />
      <ellipse cx="156" cy="185" rx="16" ry="9" fill="#1e2b1e" />
      {/* Right panda head */}
      <circle cx="142" cy="80" r="44" fill="#f5edda" />
      {/* Right ears */}
      <circle cx="108" cy="44" r="16" fill="#1e2b1e" />
      <circle cx="176" cy="44" r="16" fill="#1e2b1e" />
      {/* Right eye patches */}
      <ellipse cx="126" cy="78" rx="16" ry="14" fill="#1e2b1e" />
      <ellipse cx="158" cy="78" rx="16" ry="14" fill="#1e2b1e" />
      {/* Right eyes */}
      {happy ? (
        <>
          <path d="M119 79 Q126 86 133 79" fill="none" stroke="#f5edda" strokeWidth="3" strokeLinecap="round" />
          <path d="M151 79 Q158 86 165 79" fill="none" stroke="#f5edda" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="126" cy="79" r="7" fill="#f5edda" />
          <circle cx="158" cy="79" r="7" fill="#f5edda" />
          <circle cx="126" cy="80" r="3.5" fill="#1e2b1e" />
          <circle cx="158" cy="80" r="3.5" fill="#1e2b1e" />
          <circle cx="128" cy="78" r="1.5" fill="white" />
          <circle cx="160" cy="78" r="1.5" fill="white" />
        </>
      )}
      {/* Right nose */}
      <ellipse cx="142" cy="94" rx="5" ry="3.5" fill="#1e2b1e" />
      {/* Right mouth */}
      {happy
        ? <path d="M134 101 Q142 110 150 101" fill="none" stroke="#1e2b1e" strokeWidth="2.5" strokeLinecap="round" />
        : <path d="M136 100 Q142 106 148 100" fill="none" stroke="#1e2b1e" strokeWidth="2" strokeLinecap="round" />
      }
      {/* Right blush */}
      {happy && <>
        <ellipse cx="114" cy="95" rx="11" ry="7" fill="#e8907a" opacity="0.4" />
        <ellipse cx="170" cy="95" rx="11" ry="7" fill="#e8907a" opacity="0.4" />
      </>}

      {/* Heart between them */}
      {happy && (
        <g transform="translate(104, 105)">
          <path d="M6 3 C6 1 8 0 10 2 C12 0 14 1 14 3 C14 5 10 9 10 9 C10 9 6 5 6 3Z" fill="#e8607a" opacity="0.9" />
        </g>
      )}

      {/* Stars when happy */}
      {happy && <>
        <path d="M18 30 L19.5 33.5 L23 34 L20.5 36.5 L21 40 L18 38 L15 40 L15.5 36.5 L13 34 L16.5 33.5Z" fill="#d4a843" opacity="0.9" />
        <path d="M198 40 L199 43 L202 43.5 L200 45.5 L200.5 48.5 L198 47 L195.5 48.5 L196 45.5 L194 43.5 L197 43Z" fill="#d4a843" opacity="0.9" />
      </>}
    </svg>
  );
}

// Small side-view single panda for login
function SinglePandaSVG({ size = 100 }) {
  return (
    <svg viewBox="0 0 160 200" width={size} height={size * 1.25} style={{ display: "block" }}>
      <ellipse cx="80" cy="155" rx="52" ry="50" fill="#f5edda" />
      <ellipse cx="50" cy="165" rx="36" ry="40" fill="#1e2b1e" />
      <ellipse cx="110" cy="165" rx="36" ry="40" fill="#1e2b1e" />
      <ellipse cx="80" cy="158" rx="26" ry="30" fill="#fdf8ef" />
      <ellipse cx="38" cy="140" rx="16" ry="24" fill="#1e2b1e" transform="rotate(14 38 140)" />
      <ellipse cx="122" cy="140" rx="16" ry="24" fill="#1e2b1e" transform="rotate(-14 122 140)" />
      <ellipse cx="60" cy="196" rx="20" ry="10" fill="#1e2b1e" />
      <ellipse cx="100" cy="196" rx="20" ry="10" fill="#1e2b1e" />
      <circle cx="80" cy="78" r="50" fill="#f5edda" />
      <circle cx="42" cy="38" r="19" fill="#1e2b1e" />
      <circle cx="118" cy="38" r="19" fill="#1e2b1e" />
      <ellipse cx="60" cy="76" rx="18" ry="16" fill="#1e2b1e" />
      <ellipse cx="100" cy="76" rx="18" ry="16" fill="#1e2b1e" />
      <circle cx="60" cy="77" r="8" fill="#f5edda" />
      <circle cx="100" cy="77" r="8" fill="#f5edda" />
      <circle cx="60" cy="78" r="4" fill="#1e2b1e" />
      <circle cx="100" cy="78" r="4" fill="#1e2b1e" />
      <circle cx="62" cy="76" r="1.8" fill="white" />
      <circle cx="102" cy="76" r="1.8" fill="white" />
      <ellipse cx="80" cy="92" rx="6" ry="4" fill="#1e2b1e" />
      <path d="M68 101 Q80 112 92 101" fill="none" stroke="#1e2b1e" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="52" cy="96" rx="12" ry="7" fill="#e8907a" opacity="0.35" />
      <ellipse cx="108" cy="96" rx="12" ry="7" fill="#e8907a" opacity="0.35" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════

function Btn({ children, onClick, disabled, variant = "dark", style = {} }) {
  const V = {
    dark: { bg: C.dark, fg: C.cream2 },
    olive: { bg: C.olive, fg: C.cream2 },
    cream: { bg: C.cream, fg: C.ink },
    sand: { bg: C.sand, fg: C.ink },
    salmon: { bg: C.salmon, fg: C.white },
    rose: { bg: C.rose, fg: C.white },
    ghost: { bg: "transparent", fg: C.inkM, border: `2px solid ${C.border}` }
  };
  const v = V[variant] || V.dark;
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ fontFamily: "'Fredoka One',cursive", letterSpacing: "0.4px", background: v.bg, color: v.fg, border: v.border || "none", borderRadius: 12, padding: "12px 24px", fontSize: "0.98rem", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, boxShadow: disabled ? "none" : "0 3px 0 rgba(0,0,0,0.18)", transition: "transform 0.12s", ...style }}
      onMouseDown={e => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.boxShadow = "0 1px 0 rgba(0,0,0,0.18)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 3px 0 rgba(0,0,0,0.18)"; }}>
      {children}
    </button>
  );
}

function TA({ value, onChange, placeholder, rows = 2, style = {} }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px 13px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", resize: "none", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", lineHeight: 1.5, ...style }} />;
}

function Inp({ value, onChange, placeholder, type = "text", style = {} }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", outline: "none", color: C.ink, background: C.cream2, boxSizing: "border-box", ...style }} />;
}

function Tag({ children, bg = C.sand, color = C.inkM }) {
  return <span style={{ background: bg, color, borderRadius: 6, padding: "3px 9px", fontSize: "0.7rem", fontWeight: 800, display: "inline-block", letterSpacing: "0.4px" }}>{children}</span>;
}

function ProgBar({ value, max = 100, color = C.olive, height = 6, style = {} }) {
  return <div style={{ height, background: C.sand, borderRadius: 50, overflow: "hidden", ...style }}><div style={{ height: "100%", width: `${Math.min(100, (value / max) * 100)}%`, background: color, borderRadius: 50, transition: "width 0.5s" }} /></div>;
}

function PBadge({ who = "A" }) {
  return <div style={{ display: "inline-block", background: who === "A" ? C.cream : "#d4e8c4", color: C.ink, borderRadius: 7, padding: "2px 11px", fontSize: "0.72rem", fontWeight: 800, marginBottom: 6, letterSpacing: "0.4px" }}>PERSONA {who}</div>;
}

function ScreenTop({ title, sub, bg }) {
  return <div style={{ background: bg || C.dark, padding: "48px 20px 24px", textAlign: "center" }}>
    <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0, letterSpacing: "0.5px" }}>{title}</h1>
    {sub && <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>{sub}</p>}
  </div>;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: C.dark, color: C.cream2, padding: "11px 22px", borderRadius: 12, fontFamily: "'Nunito',sans-serif", fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", zIndex: 9999, boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>{msg}</div>;
}

// ═══════════════════════════════════════════════════════
// GARDEN ITEMS
// ═══════════════════════════════════════════════════════

function ItemIcon({ id, size = 38 }) {
  const s = size;
  const icons = {
    bamboo: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="17" y="2" width="7" height="44" rx="3.5" fill="#4a6e30" /><rect x="14" y="12" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="14" y="26" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="14" y="38" width="13" height="5" rx="2.5" fill="#3a5824" /><ellipse cx="10" cy="10" rx="12" ry="5" fill="#5a7e3c" transform="rotate(-30 10 10)" /><ellipse cx="30" cy="6" rx="10" ry="4" fill="#6a8a48" transform="rotate(20 30 6)" /></svg>),
    bamboo2: (<svg viewBox="0 0 48 48" width={s} height={s}><rect x="10" y="2" width="7" height="44" rx="3.5" fill="#4a6e30" /><rect x="7" y="14" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="7" y="30" width="13" height="5" rx="2.5" fill="#3a5824" /><rect x="26" y="6" width="7" height="40" rx="3.5" fill="#5a8035" /><rect x="23" y="18" width="13" height="5" rx="2.5" fill="#3a6020" /><rect x="23" y="32" width="13" height="5" rx="2.5" fill="#3a6020" /></svg>),
    flowers: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="24" width="5" height="22" rx="2.5" fill="#5a7e3c" /><circle cx="20" cy="20" r="8" fill="#f4b8c8" /><circle cx="11" cy="17" r="6" fill="#f4b8c8" /><circle cx="29" cy="17" r="6" fill="#f4b8c8" /><circle cx="20" cy="20" r="5" fill="#f8e0a0" /></svg>),
    peony: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="26" width="5" height="20" rx="2.5" fill="#5a7e3c" /><ellipse cx="20" cy="14" rx="14" ry="12" fill="#d4a0d8" /><ellipse cx="20" cy="16" rx="10" ry="9" fill="#e0b8e8" /><ellipse cx="20" cy="18" rx="6" ry="6" fill="#f0d0f4" /><ellipse cx="20" cy="19" rx="3" ry="3" fill="#f8e0a0" /></svg>),
    tree: (<svg viewBox="0 0 48 48" width={s} height={s}><rect x="21" y="30" width="7" height="16" rx="3" fill="#9a7848" /><circle cx="24" cy="22" r="14" fill="#f4a8b8" opacity="0.85" /><circle cx="14" cy="26" r="10" fill="#f8b8c8" opacity="0.85" /><circle cx="34" cy="25" r="11" fill="#f0a0b0" opacity="0.85" /></svg>),
    lake: (<svg viewBox="0 0 48 28" width={s} height={s * 0.6}><ellipse cx="24" cy="16" rx="22" ry="11" fill="#88b8c8" /><ellipse cx="24" cy="14" rx="18" ry="8" fill="#a8d0e0" /><ellipse cx="16" cy="16" rx="5" ry="3.5" fill="#5a9030" opacity="0.8" /><circle cx="16" cy="14" r="1.5" fill="#e8607a" /></svg>),
    butterfly: (<svg viewBox="0 0 48 36" width={s} height={s * 0.75}><ellipse cx="14" cy="14" rx="13" ry="10" fill="#c0a0e0" transform="rotate(-15 14 14)" /><ellipse cx="34" cy="14" rx="13" ry="10" fill="#b090d0" transform="rotate(15 34 14)" /><ellipse cx="24" cy="18" rx="3" ry="10" fill="#5a3080" /></svg>),
    rainbow: (<svg viewBox="0 0 48 28" width={s} height={s * 0.6}><path d="M4 26 Q24 2 44 26" fill="none" stroke="#e87878" strokeWidth="4" strokeLinecap="round" /><path d="M8 26 Q24 7 40 26" fill="none" stroke="#e8a858" strokeWidth="4" strokeLinecap="round" /><path d="M12 26 Q24 11 36 26" fill="none" stroke="#e8d860" strokeWidth="4" strokeLinecap="round" /><path d="M16 26 Q24 15 32 26" fill="none" stroke="#8ac868" strokeWidth="4" strokeLinecap="round" /><path d="M20 26 Q24 18 28 26" fill="none" stroke="#88b8d8" strokeWidth="4" strokeLinecap="round" /></svg>),
    sun: (<svg viewBox="0 0 48 48" width={s} height={s}>{[0, 45, 90, 135, 180, 225, 270, 315].map(a => (<line key={a} x1={24 + Math.cos(a * Math.PI / 180) * 16} y1={24 + Math.sin(a * Math.PI / 180) * 16} x2={24 + Math.cos(a * Math.PI / 180) * 22} y2={24 + Math.sin(a * Math.PI / 180) * 22} stroke="#e88040" strokeWidth="3" strokeLinecap="round" />))}<circle cx="24" cy="24" r="12" fill="#e88040" /><circle cx="24" cy="24" r="8" fill="#f0a050" /></svg>),
    water: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="8" y="24" width="28" height="12" rx="4" fill="#88b8c8" /><path d="M36 28 L44 22 L44 26 L36 32Z" fill="#7aaaba" /><path d="M10 24 Q4 18 8 12 Q12 8 18 12" fill="none" stroke="#7aaaba" strokeWidth="4" strokeLinecap="round" /></svg>),
    lantern: (<svg viewBox="0 0 40 48" width={s} height={s}><rect x="18" y="2" width="5" height="6" rx="2" fill="#9a7848" /><rect x="14" y="12" width="13" height="24" rx="6" fill="#e88040" /><rect x="16" y="12" width="9" height="24" rx="4" fill="#f0a050" opacity="0.6" /><ellipse cx="20" cy="12" rx="8" ry="3" fill="#9a7848" /><ellipse cx="20" cy="36" rx="8" ry="3" fill="#9a7848" /><rect x="19" y="36" width="3" height="8" rx="1.5" fill="#9a7848" /></svg>),
    heart: (<svg viewBox="0 0 40 40" width={s} height={s}><path d="M20 34 C20 34 4 22 4 13 C4 7 9 4 14 6 C17 7 20 10 20 10 C20 10 23 7 26 6 C31 4 36 7 36 13 C36 22 20 34 20 34Z" fill="#e8607a" /><path d="M20 28 C20 28 9 20 9 15 C9 12 11 10 13 11 C15 12 20 15 20 15" fill="#f4a8c0" opacity="0.5" /></svg>),
  };
  return icons[id] || <svg viewBox="0 0 40 40" width={s} height={s}><circle cx="20" cy="20" r="16" fill={C.sand} /></svg>;
}

// ═══════════════════════════════════════════════════════
// GARDEN SCENE
// ═══════════════════════════════════════════════════════

function GardenBg({ garden }) {
  const g = garden;
  return (
    <svg viewBox="0 0 390 270" style={{ width: "100%", display: "block" }}>
      <rect width="390" height="270" fill="#f0e8d4" />
      <circle cx="330" cy="52" r={g.sun ? 38 : 26} fill={g.sun ? "#e88040" : "#d4a843"} opacity={g.sun ? 1 : 0.5} />
      {g.sun && [0, 40, 80, 120, 160, 200, 240, 280, 320].map(a => (
        <line key={a} x1={330 + Math.cos(a * Math.PI / 180) * 42} y1={52 + Math.sin(a * Math.PI / 180) * 42} x2={330 + Math.cos(a * Math.PI / 180) * 52} y2={52 + Math.sin(a * Math.PI / 180) * 52} stroke="#e88040" strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
      ))}
      {g.rainbow && [["#e87878", 4], ["#e8a858", 4], ["#e8d860", 4], ["#8ac868", 4], ["#88b8d8", 4]].map(([col, w], i) => (
        <path key={i} d={`M${15 + i * 7},265 Q${130},${130 + i * 8} ${245 + i * 7},265`} fill="none" stroke={col} strokeWidth={w + 2} strokeLinecap="round" opacity="0.65" />
      ))}
      <polygon points="0,270 90,138 180,270" fill="#7ab848" />
      <polygon points="50,270 155,108 260,270" fill="#5a9030" />
      <polygon points="210,270 295,148 380,270" fill="#88b8c8" opacity="0.85" />
      <rect y="242" width="390" height="28" fill="#b8d8a0" />
      {g.bamboo && <>
        <rect x="48" y="75" width="10" height="185" rx="5" fill="#4a6e30" />
        <rect x="46" y="105" width="14" height="8" rx="4" fill="#3a5824" />
        <rect x="46" y="140" width="14" height="8" rx="4" fill="#3a5824" />
        <ellipse cx="34" cy="90" rx="22" ry="8" fill="#5a7e3c" transform="rotate(-30 34 90)" />
      </>}
      {g.bamboo2 && <>
        <rect x="72" y="75" width="10" height="185" rx="5" fill="#4a6e30" />
        <rect x="70" y="115" width="14" height="8" rx="4" fill="#3a5824" />
        <rect x="70" y="155" width="14" height="8" rx="4" fill="#3a5824" />
      </>}
      {g.flowers && <>
        <rect x="114" y="198" width="6" height="44" rx="3" fill="#5a7e3c" />
        <circle cx="117" cy="194" r="13" fill="#f4b8c8" />
        <circle cx="107" cy="198" r="9" fill="#f4b8c8" opacity="0.8" />
        <circle cx="117" cy="194" r="7" fill="#f8e0a0" />
      </>}
      {g.peony && <>
        <rect x="142" y="200" width="6" height="42" rx="3" fill="#5a7e3c" />
        <ellipse cx="145" cy="194" rx="15" ry="13" fill="#d4a0d8" />
        <ellipse cx="145" cy="196" rx="10" ry="9" fill="#f0d0f4" />
        <ellipse cx="145" cy="197" rx="5" ry="5" fill="#f8e0a0" />
      </>}
      {g.tree && <>
        <rect x="290" y="168" width="14" height="72" rx="6" fill="#9a7848" />
        <circle cx="297" cy="150" r="34" fill="#f4a8b8" opacity="0.75" />
        <circle cx="276" cy="160" r="24" fill="#f8b8c8" opacity="0.75" />
        <circle cx="318" cy="156" r="26" fill="#f0a0b0" opacity="0.75" />
      </>}
      {g.lake && <>
        <ellipse cx="200" cy="258" rx="70" ry="16" fill="#88b8c8" opacity="0.65" />
        <ellipse cx="200" cy="255" rx="56" ry="10" fill="#a8d0e0" opacity="0.55" />
        <ellipse cx="184" cy="255" rx="6" ry="4" fill="#5a9030" opacity="0.7" />
        <circle cx="184" cy="252" r="2" fill="#e8607a" opacity="0.8" />
      </>}
      {g.butterfly && <>
        <ellipse cx="166" cy="145" rx="15" ry="9" fill="#c0a0e0" opacity="0.9" transform="rotate(-18 166 145)" />
        <ellipse cx="150" cy="147" rx="15" ry="9" fill="#b090d0" opacity="0.9" transform="rotate(18 150 147)" />
        <ellipse cx="158" cy="149" rx="2.5" ry="8" fill="#5a3080" />
      </>}
      {g.heart && <>
        <path d="M185 80 C185 80 174 70 174 63 C174 58 178 56 181 57 C183 58 185 60 185 60 C185 60 187 58 189 57 C192 56 196 58 196 63 C196 70 185 80 185 80Z" fill="#e8607a" opacity="0.85" />
      </>}
      {g.lantern && <>
        <rect x="350" y="130" width="5" height="30" rx="2" fill="#9a7848" />
        <rect x="344" y="160" width="17" height="30" rx="7" fill="#e88040" />
        <rect x="346" y="160" width="13" height="30" rx="5" fill="#f0a050" opacity="0.5" />
        <ellipse cx="352" cy="160" rx="9" ry="3.5" fill="#9a7848" />
        <ellipse cx="352" cy="190" rx="9" ry="3.5" fill="#9a7848" />
      </>}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════

function Login({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [names, setNames] = useState(""); const [durN, setDurN] = useState(""); const [durU, setDurU] = useState("meses");
  const [pCode, setPCode] = useState(""); const [pEmail, setPEmail] = useState(""); const [pPass, setPPass] = useState("");
  const [err, setErr] = useState("");
  const [code] = useState("MO" + Math.random().toString(36).slice(2, 6).toUpperCase());

  const doLogin = () => {
    const u = ls.get("mochi_users") || {};
    if (!u[email] || u[email].pass !== btoa(pass)) { setErr("Correo o contraseña incorrectos"); return; }
    onLogin({ email, ...u[email], isGuest: false }, false);
  };
  const doReg = () => {
    if (!names || !email || pass.length < 6) { setErr("Completa todos los campos (mín. 6 caracteres)"); return; }
    const u = ls.get("mochi_users") || {};
    if (u[email]) { setErr("Este correo ya tiene cuenta"); return; }
    const since = durN ? `Juntos ${durN} ${durU}` : "Juntos desde hoy";
    u[email] = { pass: btoa(pass), names, code, since, isOwner: true };
    const c = ls.get("mochi_codes") || {}; c[code] = { ownerEmail: email, names, since };
    ls.set("mochi_users", u); ls.set("mochi_codes", c);
    onLogin({ email, names, code, since, isOwner: true, isGuest: false }, true);
  };
  const doJoin = () => {
    const c = ls.get("mochi_codes") || {};
    if (!c[pCode]) { setErr("Código no encontrado"); return; }
    if (!pEmail || pPass.length < 6) { setErr("Completa correo y contraseña"); return; }
    const u = ls.get("mochi_users") || {}; const info = c[pCode];
    u[pEmail] = { pass: btoa(pPass), names: info.names, code: pCode, since: info.since, isOwner: false };
    c[pCode].partnerEmail = pEmail; ls.set("mochi_users", u); ls.set("mochi_codes", c);
    onLogin({ email: pEmail, names: info.names, code: pCode, since: info.since, isOwner: false, isGuest: false }, true);
  };

  const LBL = { fontSize: "0.72rem", fontWeight: 800, color: C.inkM, marginBottom: 5, display: "block", letterSpacing: "0.6px", textTransform: "uppercase" };
  const TABS = [{ id: "login", label: "Entrar" }, { id: "register", label: "Crear" }, { id: "pair", label: "Unirse" }];

  return (
    <div style={{ minHeight: "100vh", background: C.sandL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", fontFamily: "'Nunito',sans-serif" }}>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "3rem", color: C.dark, letterSpacing: "2px" }}>mochi</div>
      <div style={{ color: C.inkL, fontWeight: 700, marginBottom: 12, fontSize: "0.85rem", letterSpacing: "0.6px" }}>TU JARDÍN DE PAREJA 🌿</div>
      <div style={{ marginBottom: 18, animation: "float 3s ease-in-out infinite" }}>
        <CouplePandaSVG size={160} happy={true} />
      </div>
      <div style={{ background: C.white, borderRadius: 24, padding: "22px 20px", width: "100%", maxWidth: 380, boxShadow: `0 4px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ display: "flex", background: C.sand, borderRadius: 12, padding: 3, marginBottom: 18, gap: 3 }}>
          {TABS.map(t => (
            <div key={t.id} onClick={() => { setTab(t.id); setErr(""); }} style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRadius: 9, fontFamily: "'Fredoka One',cursive", fontSize: "0.9rem", cursor: "pointer", background: tab === t.id ? C.white : "transparent", color: tab === t.id ? C.dark : C.inkL, boxShadow: tab === t.id ? `0 2px 0 ${C.border}` : "none", border: tab === t.id ? `1.5px solid ${C.border}` : "1.5px solid transparent", transition: "all 0.18s" }}>
              {t.label}
            </div>
          ))}
        </div>
        {err && <div style={{ background: "#fce4e4", color: "#c04040", fontSize: "0.82rem", fontWeight: 700, padding: "9px 13px", borderRadius: 10, marginBottom: 12, textAlign: "center" }}>{err}</div>}
        {tab === "login" && <>
          <label style={LBL}>Correo</label><Inp value={email} onChange={setEmail} placeholder="tu@correo.com" type="email" style={{ marginBottom: 10 }} />
          <label style={LBL}>Contraseña</label><Inp value={pass} onChange={setPass} placeholder="••••••••" type="password" style={{ marginBottom: 16 }} />
          <Btn onClick={doLogin} style={{ width: "100%", marginBottom: 8 }}>Entrar 🐼</Btn>
          <Btn onClick={() => onLogin({ isGuest: true, names: "Nosotros", since: "Siempre juntos" }, false)} variant="ghost" style={{ width: "100%" }}>Continuar sin cuenta</Btn>
        </>}
        {tab === "register" && <>
          {[["Nombres de la pareja", names, setNames, "Ana & Luis", "text"], ["Correo", email, setEmail, "tu@correo.com", "email"], ["Contraseña", pass, setPass, "Mínimo 6 caracteres", "password"]].map(([l, v, fn, ph, t]) => (
            <div key={l}><label style={LBL}>{l}</label><Inp value={v} onChange={fn} placeholder={ph} type={t} style={{ marginBottom: 10 }} /></div>
          ))}
          <label style={LBL}>¿Cuánto tiempo llevan juntos?</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="number" placeholder="Ej: 2" value={durN} onChange={e => setDurN(e.target.value)} style={{ flex: 1, border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Nunito',sans-serif", fontSize: "0.9rem", outline: "none", color: C.ink, background: C.cream2 }} />
            <select value={durU} onChange={e => setDurU(e.target.value)} style={{ flex: 1.3, border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Nunito',sans-serif", fontSize: "0.88rem", outline: "none", color: C.ink, background: C.cream2 }}>
              {["días", "semanas", "meses", "años"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <Btn onClick={doReg} style={{ width: "100%", marginBottom: 14 }}>Crear cuenta 🌱</Btn>
          <div style={{ background: C.cream, borderRadius: 16, padding: 14, textAlign: "center", border: `1.5px solid ${C.border}` }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.inkL, letterSpacing: "0.6px", marginBottom: 7 }}>TU CÓDIGO DE PAREJA</div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "2.2rem", letterSpacing: 9, color: C.dark, background: C.white, borderRadius: 10, padding: "10px", marginBottom: 6, border: `1.5px solid ${C.border}` }}>{code}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>Compártelo para que tu pareja se una</div>
          </div>
        </>}
        {tab === "pair" && <>
          <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: "1.8rem", marginBottom: 4 }}>🔗</div><div style={{ fontFamily: "'Fredoka One',cursive", color: C.dark, fontSize: "1.1rem" }}>Únete al jardín de tu pareja</div></div>
          <input value={pCode} onChange={e => setPCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CÓDIGO" style={{ width: "100%", border: `2px solid ${C.border}`, borderRadius: 12, padding: "10px", fontFamily: "'Fredoka One',cursive", fontSize: "1.8rem", letterSpacing: 9, textAlign: "center", outline: "none", marginBottom: 12, color: C.dark, background: C.cream2, boxSizing: "border-box" }} />
          {[["Tu correo", pEmail, setPEmail, "tu@correo.com", "email"], ["Contraseña", pPass, setPPass, "Mínimo 6 caracteres", "password"]].map(([l, v, fn, ph, t]) => (
            <div key={l}><label style={LBL}>{l}</label><Inp value={v} onChange={fn} placeholder={ph} type={t} style={{ marginBottom: 10 }} /></div>
          ))}
          <Btn onClick={doJoin} style={{ width: "100%", marginTop: 4 }}>Unirme al jardín 🌿</Btn>
        </>}
      </div>
    </div>
  );
}

// GARDEN SCREEN
function Jardin({ bamboo, happiness, water, garden, mochiHappy, onPet, onBuy, onWater }) {
  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "44px 18px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.55rem", color: C.cream2, letterSpacing: "0.5px" }}>El Jardín</div>
            <div style={{ fontSize: "0.72rem", color: `${C.cream}88`, fontWeight: 700, letterSpacing: "0.5px" }}>DE MOCHI & MOCHI</div>
          </div>
          <div style={{ background: C.olive, borderRadius: 10, padding: "8px 16px", fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.cream2, boxShadow: "0 3px 0 rgba(0,0,0,0.2)" }}>🌿 {bamboo}</div>
        </div>
        {[{ l: "♡ AMOR", v: happiness, c: C.salmon }, { l: "💧 AGUA", v: water, c: C.sky }].map(b => (
          <div key={b.l} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: "0.68rem", color: `${C.cream}88`, fontWeight: 800, minWidth: 54, letterSpacing: "0.5px" }}>{b.l}</span>
            <div style={{ flex: 1, height: 9, background: "rgba(255,255,255,0.14)", borderRadius: 50, overflow: "hidden" }}>
              <div style={{ height: "100%", width: b.v + "%", background: b.c, borderRadius: 50, transition: "width 0.8s" }} />
            </div>
            <span style={{ fontSize: "0.68rem", color: `${C.cream}88`, fontWeight: 800, minWidth: 28, textAlign: "right" }}>{b.v}%</span>
          </div>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <GardenBg garden={garden} />
        <div onClick={onPet} style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", cursor: "pointer", animation: mochiHappy ? "floatHappy 1.6s ease-in-out infinite" : "float 3s ease-in-out infinite" }}>
          <CouplePandaSVG happy={mochiHappy} size={140} />
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "18px 0 4px", fontSize: "0.7rem", color: C.inkL, fontWeight: 800, letterSpacing: "0.5px" }}>
        TOCA A LOS PANDAS PARA DAR AMOR · {Object.values(garden).filter(Boolean).length} ITEMS
      </div>
      <div style={{ background: C.white, borderRadius: "22px 22px 0 0", border: `1.5px solid ${C.border}`, boxShadow: `0 -3px 0 ${C.border}` }}>
        <div style={{ padding: "16px 16px 6px" }}>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.dark }}>Cuida tu jardín</div>
          <div style={{ fontSize: "0.74rem", color: C.inkL, fontWeight: 700, letterSpacing: "0.3px" }}>Completa ejercicios para ganar bambú</div>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "8px 16px 18px" }}>
          {GARDEN_ITEMS.map(item => {
            const owned = garden[item.id];
            return (
              <div key={item.id} onClick={() => item.id === "water" ? onWater() : onBuy(item)}
                style={{ background: owned ? C.cream : C.sandL, border: `2px solid ${owned ? C.olive : C.border}`, borderRadius: 16, padding: "12px 10px", textAlign: "center", cursor: "pointer", minWidth: 78, flexShrink: 0, boxShadow: owned ? `0 3px 0 ${C.olive}50` : `0 2px 0 ${C.border}`, transition: "all 0.15s" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><ItemIcon id={item.id} size={36} /></div>
                <div style={{ fontSize: "0.67rem", fontWeight: 800, color: C.ink, marginBottom: 5, lineHeight: 1.2 }}>{item.name}</div>
                {owned && item.id !== "water" ? <div style={{ background: C.olive, color: C.cream2, borderRadius: 6, padding: "2px 7px", fontSize: "0.65rem", fontWeight: 800 }}>✓</div> : <div style={{ background: C.dark, color: C.cream2, borderRadius: 6, padding: "2px 7px", fontSize: "0.65rem", fontWeight: 800 }}>{item.cost} 🌿</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// EXERCISES
function ChatEx({ ex, onDone }) {
  const [step, setStep] = useState(0);
  const [hist, setHist] = useState([]);
  const [val, setVal] = useState("");
  const cur = ex.phases[step];

  const send = () => {
    if (val.trim().length < 3) return;
    const nh = [...hist, { text: val.trim(), role: cur.role }];
    setHist(nh); setVal("");
    if (nh.length >= ex.phases.length) onDone(); else setStep(step + 1);
  };

  return (
    <div>
      <ProgBar value={step} max={ex.phases.length} style={{ marginBottom: 6 }} />
      <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 800, textAlign: "right", marginBottom: 12 }}>PASO {step + 1} / {ex.phases.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
        {hist.map((h, i) => (
          <div key={i} style={{ background: h.role === 0 ? C.cream : "#d4e8c4", borderRadius: 14, padding: "9px 13px", maxWidth: "88%", alignSelf: h.role === 0 ? "flex-start" : "flex-end" }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 800, color: C.inkM, marginBottom: 2 }}>PERSONA {h.role === 0 ? "A" : "B"}</div>
            <div style={{ fontSize: "0.88rem", color: C.ink, lineHeight: 1.5 }}>{h.text}</div>
          </div>
        ))}
      </div>
      {cur && <div style={{ background: C.sandL, borderRadius: 16, padding: 14, border: `1.5px solid ${C.border}` }}>
        <PBadge who={cur.role === 0 ? "A" : "B"} />
        <div style={{ fontSize: "0.9rem", color: C.ink, fontWeight: 700, marginBottom: 8, lineHeight: 1.6 }}>{cur.q}</div>
        {cur.hint && <div style={{ fontSize: "0.75rem", color: C.inkM, background: C.cream, borderRadius: 8, padding: "6px 10px", marginBottom: 9, border: `1px solid ${C.border}` }}>💡 {cur.hint}</div>}
        <TA value={val} onChange={setVal} placeholder={cur.ph} rows={3} style={{ marginBottom: 10 }} />
        <Btn onClick={send} style={{ width: "100%" }}>{step < ex.phases.length - 1 ? "Enviar →" : "Finalizar ✓"}</Btn>
      </div>}
    </div>
  );
}

function TimerEx({ ex, onDone }) {
  const [started, setStarted] = useState(false);
  const [secs, setSecs] = useState(ex.timer);
  const [done, setDone] = useState(false);
  const [vals, setVals] = useState(["", ""]);
  const tid = useRef(null);

  useEffect(() => () => clearInterval(tid.current), []);

  const start = () => {
    setStarted(true);
    tid.current = setInterval(() => setSecs(s => {
      if (s <= 1) { clearInterval(tid.current); setDone(true); return 0; }
      return s - 1;
    }), 1000);
  };

  if (!started) return (
    <div>
      <div style={{ background: C.sandL, borderRadius: 14, padding: 14, marginBottom: 14, border: `1.5px solid ${C.border}` }}>
        {ex.beforeTimer.map((s, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.88rem", color: C.ink, marginBottom: 9 }}>
          <div style={{ width: 24, height: 24, background: C.dark, color: C.cream2, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.72rem", flexShrink: 0 }}>{i + 1}</div>
          <div style={{ paddingTop: 2 }}>{s}</div>
        </div>)}
      </div>
      <Btn onClick={start} variant="olive" style={{ width: "100%", fontSize: "1.1rem" }}>▶ Iniciar</Btn>
    </div>
  );

  if (!done) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "4.8rem", color: C.dark, letterSpacing: 4 }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
      <div style={{ fontSize: "0.85rem", color: C.inkM, fontWeight: 700, marginTop: 8 }}>{ex.timerLabel}</div>
    </div>
  );

  return (
    <div>
      <div style={{ background: C.cream, borderRadius: 12, padding: 12, textAlign: "center", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark, marginBottom: 14, border: `1.5px solid ${C.border}` }}>¡{Math.floor(ex.timer / 60)} minutos completados! 🎉</div>
      {ex.afterPrompts.map((p, i) => <div key={i} style={{ marginBottom: 10 }}><PBadge who={i === 0 ? "A" : "B"} /><TA value={vals[i]} onChange={v => { const n = [...vals]; n[i] = v; setVals(n); }} placeholder={p.ph} /></div>)}
      <Btn onClick={() => { if (!vals.some(v => v.length < 2)) onDone(); }} style={{ width: "100%" }}>Finalizar ✓</Btn>
    </div>
  );
}

function ExModal({ ex, onClose, onComplete }) {
  const [done, setDone] = useState(false);
  const [pts, setPts] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);

  const finish = (p = ex.bamboo) => { setDone(true); setPts(p); onComplete(ex, p); };

  if (done) return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ marginBottom: 14 }}><CouplePandaSVG happy size={120} /></div>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.6rem", color: C.dark, marginBottom: 5 }}>¡Lo hicieron juntos!</div>
      <div style={{ fontSize: "0.88rem", color: C.inkM, marginBottom: 16 }}>Sus pandas están muy felices de verlos crecer</div>
      <div style={{ background: C.gold, color: C.ink, borderRadius: 12, padding: "10px 24px", fontFamily: "'Fredoka One',cursive", fontSize: "1.15rem", display: "inline-block", marginBottom: 18, boxShadow: "0 3px 0 rgba(0,0,0,0.14)" }}>+{pts} bambú 🌿</div>
      <Btn onClick={onClose} variant="olive" style={{ width: "100%", fontSize: "1.05rem" }}>Reclamar recompensa</Btn>
    </div>
  );

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 5 }}>{ex.emoji}</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.4rem", color: C.dark }}>{ex.title}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <Tag bg={C.cream} color={C.inkM}>{ex.tags}</Tag>
          <Tag bg={C.sandL} color={C.olive}>{ex.time}</Tag>
          <Tag bg="#fff8e0" color="#9a7020">+{ex.bamboo} 🌿</Tag>
        </div>
      </div>

      {/* Instructions panel */}
      {ex.instructions && (
        <div style={{ background: "#f0f8e8", borderRadius: 14, padding: 14, marginBottom: 14, border: `1.5px solid ${C.olive}30` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showInstructions ? 10 : 0, cursor: "pointer" }} onClick={() => setShowInstructions(!showInstructions)}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.95rem", color: C.olive }}>📋 Instrucciones</div>
            <div style={{ color: C.inkL, transition: "transform 0.2s", transform: showInstructions ? "rotate(180deg)" : "none" }}>▼</div>
          </div>
          {showInstructions && (
            <div>
              {ex.instructions.map((inst, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
                  <div style={{ width: 22, height: 22, background: C.olive, color: C.cream2, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.68rem", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: "0.84rem", color: C.inkM, lineHeight: 1.5, paddingTop: 2 }}>{inst}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: C.sandL, borderRadius: 12, padding: 12, fontSize: "0.88rem", color: C.inkM, lineHeight: 1.7, marginBottom: 16, border: `1px solid ${C.border}` }}>{ex.desc}</div>
      {ex.phases && <ChatEx ex={ex} onDone={finish} />}
      {ex.timer && <TimerEx ex={ex} onDone={finish} />}
    </div>
  );
}

function Ejercicios({ exDone, onComplete }) {
  const [openId, setOpenId] = useState(null);
  const ex = EXERCISES.find(e => e.id === openId);

  return (
    <>
      <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
        <ScreenTop title="Ejercicios" sub="Actividades basadas en ciencia" />
        {EXERCISES.map(e => {
          const count = exDone[e.id] || 0;
          return (
            <div key={e.id} onClick={() => setOpenId(e.id)}
              style={{ background: C.white, borderRadius: 20, padding: 18, margin: "10px 14px", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, cursor: "pointer", transition: "transform 0.13s" }}
              onMouseOver={ev => ev.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={ev => ev.currentTarget.style.transform = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", flexShrink: 0, border: `1.5px solid ${C.border}` }}>{e.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.dark }}>{e.title}</div>
                  <Tag bg={C.cream} color={C.inkM} style={{ marginTop: 3 }}>{e.tags}</Tag>
                </div>
                <div style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: i < count ? (count >= 3 ? C.gold : C.olive) : C.sand }} />)}</div>
              </div>
              <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.5, marginBottom: 12 }}>{e.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ background: C.olive, color: C.cream2, borderRadius: 8, padding: "4px 12px", fontWeight: 800, fontSize: "0.78rem" }}>+{e.bamboo} bambú</div>
                <span style={{ color: C.inkL, fontSize: "0.78rem", fontWeight: 700 }}>{e.time}</span>
              </div>
            </div>
          );
        })}
      </div>
      {openId && ex && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,15,0.65)", zIndex: 5000, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div style={{ background: C.white, borderRadius: "22px 22px 0 0", padding: "16px 18px 44px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto", border: `1.5px solid ${C.border}` }}>
            <div style={{ width: 34, height: 5, background: C.sand, borderRadius: 50, margin: "0 auto 14px" }} />
            <button onClick={() => setOpenId(null)} style={{ position: "absolute", right: 16, top: 14, background: C.sandL, border: `1.5px solid ${C.border}`, borderRadius: 9, width: 30, height: 30, fontSize: "0.85rem", cursor: "pointer", color: C.inkM }}>✕</button>
            <ExModal ex={ex} onClose={() => setOpenId(null)} onComplete={(exercise, pts) => { onComplete(exercise, pts); }} />
          </div>
        </div>
      )}
    </>
  );
}

// MESSAGES
function Mensajes({ user, messages, onSend }) {
  const [modal, setModal] = useState(false);
  const [text, setText] = useState("");
  const [quick, setQuick] = useState(null);
  const myEmail = user?.email || "guest";
  const todayStr = new Date().toDateString();
  const todayMsg = messages.find(m => m.senderEmail !== myEmail && new Date(m.time).toDateString() === todayStr);
  const myLast = messages.find(m => m.senderEmail === myEmail);
  const unread = messages.filter(m => m.senderEmail !== myEmail && !m.read).length;
  const send = () => { const msg = quick || text.trim(); if (!msg) return; onSend(msg); setModal(false); setText(""); setQuick(null); };

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: "#c05068", padding: "48px 20px 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0 }}>Mensajes</h1>
        <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>Mándense algo lindo hoy · +5 bambú 🌿</p>
      </div>
      <div style={{ background: C.white, borderRadius: 20, margin: 14, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#c05068", marginBottom: 10, letterSpacing: "0.5px" }}>💌 MENSAJE DE HOY</div>
        {todayMsg ? <div style={{ background: C.dark, color: C.cream2, borderRadius: "16px 16px 16px 4px", padding: "13px 16px", fontSize: "0.92rem", lineHeight: 1.6 }}>{todayMsg.text}<div style={{ fontSize: "0.7rem", opacity: 0.65, marginTop: 4 }}>De {todayMsg.sender}</div></div>
          : myLast ? <div><div style={{ background: "#c05068", color: C.cream2, borderRadius: "16px 16px 4px 16px", padding: "13px 16px", fontSize: "0.92rem", lineHeight: 1.6 }}>{myLast.text}</div><div style={{ textAlign: "center", fontSize: "0.8rem", color: C.inkL, fontWeight: 600, marginTop: 9 }}>Esperando el mensajito de tu pareja 🐼</div></div>
          : <div style={{ textAlign: "center", padding: "18px 0", fontSize: "0.86rem", color: C.inkL }}><div style={{ fontSize: "2.8rem", marginBottom: 8 }}>💝</div>¡Sé el primero en enviar un mensajito!</div>}
      </div>
      <button onClick={() => setModal(true)} style={{ background: "#c05068", color: C.cream2, border: "none", borderRadius: 12, padding: 14, fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", cursor: "pointer", width: "calc(100% - 28px)", margin: "0 14px 14px", display: "block", boxShadow: "0 3px 0 rgba(0,0,0,0.18)" }}>💌 Mandar mensajito de amor</button>
      <div style={{ background: C.white, borderRadius: 20, margin: "0 14px 14px", padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>Mensajes anteriores{unread > 0 && <span style={{ background: "#c05068", color: C.white, borderRadius: 6, padding: "2px 7px", fontSize: "0.7rem", fontWeight: 800 }}>{unread}</span>}</div>
        {messages.length === 0 ? <div style={{ textAlign: "center", fontSize: "0.85rem", color: C.inkL, padding: 14 }}>Los mensajes aparecerán aquí 🌸</div>
          : messages.slice(0, 20).map(m => {
            const mine = m.senderEmail === myEmail;
            return <div key={m.id} style={{ background: mine ? C.sand : C.cream, borderRadius: 13, padding: 12, marginBottom: 8, borderLeft: `4px solid ${mine ? "#c05068" : C.olive}` }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#c05068", marginBottom: 2 }}>{mine ? "Tú enviaste" : `De ${m.sender}`}</div>
              <div style={{ fontSize: "0.86rem", color: C.ink, lineHeight: 1.5 }}>{m.text}</div>
              <div style={{ fontSize: "0.68rem", color: C.inkL, marginTop: 3, fontWeight: 700 }}>{new Date(m.time).toLocaleDateString("es", { day: "numeric", month: "short" })}</div>
            </div>;
          })}
      </div>
      {modal && <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,15,0.62)", zIndex: 5000, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
        <div style={{ background: C.white, borderRadius: "22px 22px 0 0", padding: "16px 18px 44px", width: "100%", maxWidth: 480, margin: "0 auto", border: `1.5px solid ${C.border}` }}>
          <div style={{ width: 34, height: 5, background: C.sand, borderRadius: 50, margin: "0 auto 14px" }} />
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.3rem", color: C.dark, marginBottom: 4 }}>💌 Mensajito de amor</div>
          <div style={{ fontSize: "0.82rem", color: "#aaa", marginBottom: 14 }}>+5 bambú 🌿 por enviar</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
            {LOVE_QUICK.map(q => <div key={q} onClick={() => setQuick(quick === q ? null : q)} style={{ background: quick === q ? C.dark : C.cream, color: quick === q ? C.cream2 : C.ink, borderRadius: 9, padding: "6px 12px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", border: `1.5px solid ${C.border}`, transition: "all 0.15s" }}>{q.split(" ").slice(0, 4).join(" ")}…</div>)}
          </div>
          {!quick && <TA value={text} onChange={setText} placeholder="Escríbele algo desde el corazón..." rows={3} style={{ marginBottom: 12 }} />}
          {quick && <div style={{ background: C.cream, borderRadius: 12, padding: 13, fontSize: "0.9rem", color: C.ink, marginBottom: 12, border: `1.5px solid ${C.border}` }}>{quick}</div>}
          <Btn onClick={send} variant="salmon" style={{ width: "100%", fontSize: "1.05rem" }}>Enviar con amor 💌</Btn>
        </div>
      </div>}
    </div>
  );
}

// CONOCETE
function Conocete({ conoce, onSave }) {
  const [cat, setCat] = useState(null);
  const [qIdx, setQIdx] = useState(null);
  const [rA, setRA] = useState(""); const [rB, setRB] = useState("");
  const [saved, setSaved] = useState(false);

  const openQ = (c, i) => { setCat(c); setQIdx(i); setSaved(false); const ex = conoce[`${c}-${i}`] || {}; setRA(ex.a || ""); setRB(ex.b || ""); };
  const saveQ = () => { if (!rA && !rB) return; onSave(cat, qIdx, rA, rB, !conoce[`${cat}-${qIdx}`]); setSaved(true); };

  if (qIdx !== null) return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse · +15 bambú cada una" />
      <div style={{ margin: 14 }}>
        <div style={{ background: C.white, borderRadius: 20, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.inkM, marginBottom: 8, letterSpacing: "0.5px" }}>{CONOCE_CATS[cat].emoji} {CONOCE_CATS[cat].label.toUpperCase()}</div>
          <div style={{ fontSize: "0.97rem", color: C.ink, lineHeight: 1.6, fontWeight: 700, marginBottom: 16 }}>{CONOCE_CATS[cat].preguntas[qIdx]}</div>
          {[["A", rA, setRA], ["B", rB, setRB]].map(([w, v, fn]) => <div key={w} style={{ marginBottom: 12 }}><PBadge who={w} /><TA value={v} onChange={fn} placeholder="Tu respuesta..." rows={3} /></div>)}
          {saved && <div style={{ textAlign: "center", fontSize: "0.82rem", fontWeight: 800, color: C.olive, marginBottom: 10, background: C.cream, borderRadius: 9, padding: "8px", border: `1.5px solid ${C.border}` }}>✓ Guardado — +15 bambú 🌿</div>}
          <div style={{ display: "flex", gap: 9 }}><Btn onClick={saveQ} style={{ flex: 1 }}>Guardar 🌿</Btn><Btn onClick={() => setQIdx(null)} variant="ghost" style={{ padding: "12px 14px" }}>✕</Btn></div>
        </div>
      </div>
    </div>
  );

  if (cat) return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse" />
      <div style={{ margin: 14 }}>
        <div style={{ background: C.white, borderRadius: 20, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", color: C.dark }}>{CONOCE_CATS[cat].emoji} {CONOCE_CATS[cat].label}</div>
            <button onClick={() => setCat(null)} style={{ background: C.sand, border: `1.5px solid ${C.border}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: "0.85rem", color: C.inkM }}>✕</button>
          </div>
          {CONOCE_CATS[cat].preguntas.map((q, i) => {
            const done = !!conoce[`${cat}-${i}`];
            return <div key={i} onClick={() => openQ(cat, i)} style={{ background: done ? C.cream : C.sandL, borderRadius: 12, padding: 13, marginBottom: 8, cursor: "pointer", borderLeft: `4px solid ${done ? C.olive : C.border}`, transition: "all 0.13s" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: C.ink }}>{q}</div>
              {done && <div style={{ fontSize: "0.72rem", color: C.olive, fontWeight: 800, marginTop: 3 }}>✓ RESPONDIDA · +15 bambú</div>}
            </div>;
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <ScreenTop title="Conócete" sub="Preguntas para descubrirse" />
      <div style={{ padding: "8px 14px 0", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Elige una categoría</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, padding: "10px 14px" }}>
        {Object.entries(CONOCE_CATS).map(([key, data]) => {
          const done = data.preguntas.filter((_, i) => conoce[`${key}-${i}`]).length;
          return <div key={key} onClick={() => setCat(key)} style={{ background: data.bg, borderRadius: 18, padding: 18, textAlign: "center", cursor: "pointer", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, transition: "transform 0.13s" }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
            <div style={{ fontSize: "2.2rem", marginBottom: 7 }}>{data.emoji}</div>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "0.97rem", color: C.dark }}>{data.label}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkM, fontWeight: 700, marginTop: 3 }}>{done} / {data.preguntas.length}</div>
            <ProgBar value={done} max={data.preguntas.length} color={C.olive} style={{ marginTop: 8 }} />
          </div>;
        })}
      </div>
    </div>
  );
}

// BURBUJA
function Burbuja({ burbuja, onSave }) {
  const [open, setOpen] = useState({});
  const [tmp, setTmp] = useState({});

  const get = (id, f) => tmp[id]?.[f] ?? burbuja[id]?.[f] ?? "";
  const set_ = (id, f, v) => setTmp(p => ({ ...p, [id]: { ...p[id], [f]: v } }));
  const save = (id) => { const a = get(id, "a"), b = get(id, "b"), c = get(id, "c"); if (!a && !b) return; onSave(id, { a, b, c }); };
  const total = BURBUJA_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.olive, padding: "48px 20px 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.9rem", color: C.cream2, margin: 0 }}>La Burbuja</h1>
        <p style={{ color: `${C.cream}88`, fontSize: "0.86rem", fontWeight: 600, margin: "4px 0 0" }}>Sus reglas, acuerdos y mundo compartido · +10 bambú c/u</p>
      </div>
      <div style={{ background: C.cream, borderRadius: 18, margin: "14px 14px 8px", padding: 16, border: `1.5px solid ${C.border}`, boxShadow: `0 3px 0 ${C.border}` }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.dark, marginBottom: 5 }}>¿Qué es la burbuja?</div>
        <div style={{ fontSize: "0.85rem", color: C.inkM, lineHeight: 1.7 }}>Su relación tiene sus propias reglas — únicas para ustedes. Este es el espacio para definirlas juntos, sin juicios.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <ProgBar value={Object.keys(burbuja).length} max={total} color={C.olive} height={7} style={{ flex: 1 }} />
          <div style={{ fontSize: "0.76rem", fontWeight: 800, color: C.olive, whiteSpace: "nowrap" }}>{Object.keys(burbuja).length} / {total}</div>
        </div>
      </div>
      {BURBUJA_SECTIONS.map(sec => (
        <div key={sec.id} style={{ background: C.white, borderRadius: 18, margin: "0 14px 10px", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
          <div onClick={() => setOpen(p => ({ ...p, [sec.id]: !p[sec.id] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, cursor: "pointer" }}>
            <div style={{ width: 44, height: 44, background: sec.itemBg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", flexShrink: 0 }}>{sec.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.dark }}>{sec.title}</div>
              <div style={{ fontSize: "0.72rem", color: C.inkL, fontWeight: 700 }}>{sec.sub}</div>
            </div>
            <div style={{ color: C.inkL, transition: "transform 0.25s", transform: open[sec.id] ? "rotate(180deg)" : "none" }}>▼</div>
          </div>
          {open[sec.id] && <div style={{ padding: "0 16px 16px" }}>
            {sec.items.map(item => {
              const sv = !!burbuja[item.id];
              return <div key={item.id} style={{ background: sv ? C.cream : C.sandL, borderRadius: 13, padding: 13, marginBottom: 9, borderLeft: `3px solid ${sv ? C.olive : C.border}` }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: C.ink, marginBottom: 10 }}>{item.q}</div>
                {item.note && <div style={{ background: C.white, borderRadius: 9, padding: "9px 11px", marginBottom: 10, fontSize: "0.78rem", color: C.inkM, lineHeight: 1.6, border: `1px solid ${C.border}` }}>{item.note}</div>}
                {[["A", "a", item.phA], ["B", "b", item.phB]].map(([w, f, ph]) => <div key={w} style={{ marginBottom: 8 }}><PBadge who={w} /><TA value={get(item.id, f)} onChange={v => set_(item.id, f, v)} placeholder={ph} rows={2} /></div>)}
                {sv && <div style={{ background: C.white, borderRadius: 10, padding: 10, marginBottom: 8, border: `1.5px solid ${C.olive}` }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.olive, marginBottom: 3, letterSpacing: "0.4px" }}>✓ NUESTRO ACUERDO</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.ink }}>{burbuja[item.id].c || burbuja[item.id].a}</div>
                </div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <TA value={get(item.id, "c")} onChange={v => set_(item.id, "c", v)} placeholder="Acuerdo compartido (opcional)... +10 bambú 🌿" rows={1} style={{ flex: 1, margin: 0 }} />
                  <Btn onClick={() => save(item.id)} variant="olive" style={{ padding: "10px 14px", fontSize: "0.85rem", whiteSpace: "nowrap" }}>Guardar</Btn>
                </div>
              </div>;
            })}
          </div>}
        </div>
      ))}
    </div>
  );
}

// PROFILE — Enhanced with more info fields
function Perfil({ user, bamboo, exDone, messages, burbuja, coupleInfo, onSaveCoupleInfo, onLogout }) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    anniversary: coupleInfo.anniversary || "",
    firstDate: coupleInfo.firstDate || "",
    firstKiss: coupleInfo.firstKiss || "",
    howMet: coupleInfo.howMet || "",
    favoritePlace: coupleInfo.favoritePlace || "",
    favoriteSong: coupleInfo.favoriteSong || "",
    favoriteMovie: coupleInfo.favoriteMovie || "",
    sharedDream: coupleInfo.sharedDream || "",
    petNames: coupleInfo.petNames || "",
    mantra: coupleInfo.mantra || "",
    nextAdventure: coupleInfo.nextAdventure || "",
    bucketList: coupleInfo.bucketList || "",
  });

  const totalEx = Object.values(exDone).reduce((a, b) => a + b, 0);
  const myEmail = user?.email || "guest";
  const myMsgs = messages.filter(m => m.senderEmail === myEmail).length;
  const codes = ls.get("mochi_codes") || {}; const ci = user?.code ? codes[user.code] : null;
  const connected = !!(ci?.partnerEmail && ci?.ownerEmail);

  const ACHS = [
    { icon: "🌱", name: "Primer ejercicio", done: totalEx >= 1 },
    { icon: "⭐", name: "10 ejercicios", done: totalEx >= 10 },
    { icon: "🔗", name: "Pareja conectada", done: connected },
    { icon: "💌", name: "5 mensajitos", done: myMsgs >= 5 },
    { icon: "🌸", name: "5 acuerdos", done: Object.keys(burbuja).length >= 5 },
    { icon: "🌿", name: "100 bambú", done: bamboo >= 100 },
    { icon: "💝", name: "Jardín lleno", done: Object.keys(burbuja).length >= 10 },
    { icon: "🏆", name: "25 ejercicios", done: totalEx >= 25 },
  ];

  const FIELDS = [
    { key: "anniversary", label: "💑 Aniversario", ph: "Ej: 14 de febrero de 2022" },
    { key: "firstDate", label: "🌟 Primera cita", ph: "¿Dónde fue su primera cita?" },
    { key: "firstKiss", label: "💋 Primer beso", ph: "¿Cuándo y dónde?" },
    { key: "howMet", label: "🤝 ¿Cómo se conocieron?", ph: "Su historia..." },
    { key: "favoritePlace", label: "🗺 Lugar favorito juntos", ph: "Ese lugar especial..." },
    { key: "favoriteSong", label: "🎵 Canción de ustedes", ph: "La canción que es de los dos" },
    { key: "favoriteMovie", label: "🎬 Película favorita juntos", ph: "La que ven siempre" },
    { key: "sharedDream", label: "🌙 Sueño compartido", ph: "Lo que sueñan juntos" },
    { key: "petNames", label: "🐾 Apodos del uno al otro", ph: "Ej: mi osito, mi sol..." },
    { key: "mantra", label: "✨ Mantra de la relación", ph: "Una frase que los define" },
    { key: "nextAdventure", label: "🗺 Próxima aventura", ph: "A dónde quieren ir" },
    { key: "bucketList", label: "📋 Lista de deseos", ph: "Cosas que quieren hacer juntos" },
  ];

  const save = () => { onSaveCoupleInfo(form); setEditMode(false); };

  return (
    <div style={{ background: C.sandL, minHeight: "100vh", paddingBottom: 90 }}>
      <div style={{ background: C.dark, padding: "38px 20px 28px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <CouplePandaSVG happy size={130} />
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.75rem", color: C.cream2 }}>{user?.names || "Nosotros"}</div>
        <div style={{ color: `${C.cream}88`, fontSize: "0.85rem", fontWeight: 700, marginTop: 3 }}>{user?.since || ""}</div>
        {coupleInfo.anniversary && <div style={{ color: C.gold, fontSize: "0.82rem", fontWeight: 700, marginTop: 4 }}>💑 {coupleInfo.anniversary}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "10px 14px" }}>
        {[["Ejercicios", totalEx], ["Bambú 🌿", bamboo], ["Mensajes", myMsgs]].map(([l, v]) => (
          <div key={l} style={{ background: C.white, borderRadius: 16, padding: "14px 10px", textAlign: "center", boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.7rem", color: C.dark }}>{v}</div>
            <div style={{ fontSize: "0.7rem", color: C.inkL, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Couple Story Card */}
      <div style={{ margin: "0 14px 12px", background: C.white, borderRadius: 18, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.05rem", color: C.dark }}>📖 Nuestra historia</div>
          <Btn onClick={() => setEditMode(!editMode)} variant={editMode ? "olive" : "sand"} style={{ padding: "7px 14px", fontSize: "0.82rem" }}>{editMode ? "Guardar ✓" : "Editar ✏️"}</Btn>
        </div>
        {editMode ? (
          <div>
            {FIELDS.map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: C.inkM, marginBottom: 4 }}>{f.label}</div>
                <TA value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} placeholder={f.ph} rows={2} />
              </div>
            ))}
            <Btn onClick={save} variant="olive" style={{ width: "100%", marginTop: 4 }}>Guardar nuestra historia 💚</Btn>
          </div>
        ) : (
          <div>
            {FIELDS.filter(f => coupleInfo[f.key]).map(f => (
              <div key={f.key} style={{ marginBottom: 10, background: C.sandL, borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${C.olive}` }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.inkL, marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: "0.88rem", color: C.ink, lineHeight: 1.5 }}>{coupleInfo[f.key]}</div>
              </div>
            ))}
            {FIELDS.filter(f => coupleInfo[f.key]).length === 0 && (
              <div style={{ textAlign: "center", padding: "16px 0", color: C.inkL, fontSize: "0.85rem" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>📖</div>
                Cuenten su historia — presionen "Editar" para empezar
              </div>
            )}
          </div>
        )}
      </div>

      {/* Code */}
      {!user?.isGuest && <div style={{ margin: "0 14px 12px", background: C.cream, borderRadius: 18, padding: 18, boxShadow: `0 3px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark, marginBottom: 10 }}>Código de pareja</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: connected ? C.olive : C.sand, border: `1.5px solid ${C.border}` }} />
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.ink }}>{connected ? "¡Pareja conectada!" : "Esperando a tu pareja…"}</div>
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "2rem", letterSpacing: 8, color: C.dark, textAlign: "center", background: C.white, borderRadius: 11, padding: 11, marginBottom: 10, border: `1.5px solid ${C.border}` }}>{user?.code || "----"}</div>
        <Btn onClick={() => navigator.clipboard?.writeText(user?.code || "")} variant="sand" style={{ width: "100%" }}>Copiar código</Btn>
      </div>}

      {/* Achievements */}
      <div style={{ padding: "4px 14px 6px", fontFamily: "'Fredoka One',cursive", fontSize: "1rem", color: C.dark }}>Logros</div>
      <div style={{ display: "flex", gap: 10, padding: "4px 14px 18px", overflowX: "auto" }}>
        {ACHS.map(a => <div key={a.name} style={{ background: a.done ? C.cream : C.sandL, borderRadius: 16, padding: "14px 11px", textAlign: "center", minWidth: 88, flexShrink: 0, opacity: a.done ? 1 : 0.4, boxShadow: `0 2px 0 ${C.border}`, border: `1.5px solid ${C.border}` }}>
          <div style={{ fontSize: "1.7rem", marginBottom: 5 }}>{a.icon}</div>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>{a.name}</div>
        </div>)}
      </div>

      <div style={{ padding: "0 14px 20px" }}>
        <Btn onClick={onLogout} variant="ghost" style={{ width: "100%", color: "#c04040", borderColor: "#f0d0d0" }}>Cerrar sesión</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// GLOBAL STYLES + ROOT APP
// ═══════════════════════════════════════════════════════

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f8f2e4; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes floatHappy { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-18px) rotate(1.5deg)} }
textarea:focus, input:focus { border-color: #4a6e30 !important; box-shadow: 0 0 0 3px rgba(74,110,48,0.15) !important; outline: none !important; }
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-thumb { background:#ede4cc; border-radius:50px; }
select { appearance: none; }
`;

const OB = [
  { title: "Bienvenidos a Mochi", body: "Una app para que su amor florezca — basada en terapia real." },
  { title: "Su jardín crece con amor", body: "Completen ejercicios, envíen mensajes y respondan preguntas juntos para ganar bambú 🌿 y plantar cosas en el jardín." },
  { title: "¡Listos para empezar!", body: "Hagan su primer ejercicio y siembren la primera semilla." },
];

function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  return (
    <div style={{ minHeight: "100vh", background: C.sandL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ animation: "float 3s ease-in-out infinite", marginBottom: 16 }}>
          <CouplePandaSVG size={170} happy />
        </div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: "1.85rem", color: C.dark, marginBottom: 8 }}>{OB[i].title}</div>
        <div style={{ color: C.inkM, lineHeight: 1.6, marginBottom: 24, fontFamily: "'Nunito',sans-serif" }}>{OB[i].body}</div>
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 24 }}>{OB.map((_, j) => <div key={j} style={{ width: j === i ? 24 : 8, height: 8, borderRadius: 50, background: j === i ? C.dark : C.sand, transition: "all 0.3s" }} />)}</div>
        {i < OB.length - 1 ? <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={onDone} style={{ background: "none", border: "none", color: C.inkL, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>Saltar</button>
          <button onClick={() => setI(i + 1)} style={{ background: C.white, border: `1.5px solid ${C.border}`, color: C.dark, borderRadius: 12, padding: "10px 22px", fontFamily: "'Fredoka One',cursive", cursor: "pointer", boxShadow: `0 3px 0 ${C.border}` }}>Siguiente →</button>
        </div> : <button onClick={onDone} style={{ width: "100%", background: C.dark, color: C.cream2, border: "none", borderRadius: 12, padding: "14px", fontFamily: "'Fredoka One',cursive", fontSize: "1.1rem", cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>Comenzar juntos 🐼</button>}
      </div>
    </div>
  );
}

const NAV = [
  { id: "jardin", emoji: "🌿", label: "Jardín" },
  { id: "ejerc", emoji: "⭐", label: "Ejercicios" },
  { id: "mensajes", emoji: "💌", label: "Mensajes" },
  { id: "conocete", emoji: "💬", label: "Conócete" },
  { id: "burbuja", emoji: "🫧", label: "Burbuja" },
  { id: "perfil", emoji: "👤", label: "Nosotros" },
];

export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("jardin");
  const [toastMsg, setToastMsg] = useState(null);
  const [bamboo, setBamboo] = useState(0);
  const [happiness, setHappiness] = useState(20);
  const [water, setWater] = useState(40);
  const [garden, setGarden] = useState({});
  const [exDone, setExDone] = useState({});
  const [messages, setMessages] = useState([]);
  const [conoce, setConoce] = useState({});
  const [burbuja, setBurbuja] = useState({});
  const [coupleInfo, setCoupleInfo] = useState({});
  const [mochiHappy, setMochiHappy] = useState(false);
  const happyTimer = useRef(null);

  const saveKey = u => u?.email ? "mochi_prog_" + u.email : null;
  const toast = msg => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };
  const trigHappy = useCallback(() => { setMochiHappy(true); clearTimeout(happyTimer.current); happyTimer.current = setTimeout(() => setMochiHappy(false), 4000); }, []);

  const save = useCallback((u, s) => { const k = saveKey(u || user); if (k) ls.set(k, s); }, [user]);

  const afterLogin = (u, isNew) => {
    setUser(u); ls.set("mochi_last", u.email || "guest");
    if (!isNew && u.email) {
      const s = ls.get(saveKey(u));
      if (s) {
        if (s.bamboo != null) setBamboo(s.bamboo);
        if (s.happiness != null) setHappiness(s.happiness);
        if (s.water != null) setWater(s.water);
        if (s.garden) setGarden(s.garden);
        if (s.exDone) setExDone(s.exDone);
        if (s.messages) setMessages(s.messages);
        if (s.conoce) setConoce(s.conoce);
        if (s.burbuja) setBurbuja(s.burbuja);
        if (s.coupleInfo) setCoupleInfo(s.coupleInfo);
      }
    }
    setScreen(isNew ? "onboarding" : "main");
  };

  useEffect(() => {
    const last = ls.get("mochi_last");
    if (last && last !== "guest") {
      const u = ls.get("mochi_users") || {};
      if (u[last]) afterLogin({ email: last, ...u[last], isGuest: false }, false);
    }
  }, []);

  const buyItem = item => {
    if (garden[item.id]) { toast("Ya está en el jardín"); return; }
    if (bamboo < item.cost) { toast("Necesitas más bambú — completa ejercicios"); return; }
    const nb = bamboo - item.cost, ng = { ...garden, [item.id]: true }, nh = Math.min(100, happiness + 10);
    setBamboo(nb); setGarden(ng); setHappiness(nh); trigHappy(); toast(`${item.name} plantado 🌿`);
    save(null, { bamboo: nb, happiness: nh, water, garden: ng, exDone, messages, conoce, burbuja, coupleInfo });
  };

  const waterGarden = () => {
    if (bamboo < 5) { toast("Necesitas más bambú"); return; }
    const nb = bamboo - 5, nw = Math.min(100, water + 15), nh = Math.min(100, happiness + 5);
    setBamboo(nb); setWater(nw); setHappiness(nh); trigHappy(); toast("Jardín regado 💧");
    save(null, { bamboo: nb, happiness: nh, water: nw, garden, exDone, messages, conoce, burbuja, coupleInfo });
  };

  const petMochi = () => { trigHappy(); toast("¡Los pandas los quieren mucho! 🐼"); setHappiness(h => Math.min(100, h + 2)); };

  const completeEx = (ex, pts) => {
    const nd = { ...exDone, [ex.id]: (exDone[ex.id] || 0) + 1 };
    const bonus = nd[ex.id] === 3 ? 30 : 0;
    const nb = bamboo + pts + bonus, nh = Math.min(100, happiness + 8);
    setBamboo(nb); setHappiness(nh); setExDone(nd); trigHappy();
    toast(bonus ? `¡Maestría! +${pts + bonus} bambú 🌟` : `+${pts} bambú 🌿`);
    save(null, { bamboo: nb, happiness: nh, water, garden, exDone: nd, messages, conoce, burbuja, coupleInfo });
  };

  const sendMsg = text => {
    const key = user?.code ? "mochi_msgs_" + user.code : "mochi_msgs_guest";
    const prev = ls.get(key) || [];
    const nm = [{ id: Date.now(), text, sender: (user?.names || "Yo").split("&")[user?.isOwner ? 0 : 1]?.trim() || "Yo", senderEmail: user?.email || "guest", time: new Date().toISOString(), read: false }, ...prev];
    ls.set(key, nm); setMessages(nm);
    const nb = bamboo + 5; setBamboo(nb); trigHappy(); toast("Mensajito enviado 💌 +5 bambú");
    save(null, { bamboo: nb, happiness, water, garden, exDone, messages: nm, conoce, burbuja, coupleInfo });
  };

  useEffect(() => { if (tab === "mensajes" && user?.code) { const m = ls.get("mochi_msgs_" + user.code); if (m) setMessages(m); } }, [tab]);

  const saveConoce = (cat, idx, a, b, isNew) => {
    const nc = { ...conoce, [`${cat}-${idx}`]: { a, b } }; setConoce(nc);
    if (isNew) {
      const nb = bamboo + 15; setBamboo(nb); trigHappy(); toast("+15 bambú por conocerse más 🌿");
      save(null, { bamboo: nb, happiness, water, garden, exDone, messages, conoce: nc, burbuja, coupleInfo });
    } else save(null, { bamboo, happiness, water, garden, exDone, messages, conoce: nc, burbuja, coupleInfo });
  };

  const saveBurbuja = (id, data) => {
    const nb2 = { ...burbuja, [id]: data }; setBurbuja(nb2);
    const isNew = !burbuja[id];
    if (isNew) {
      const nb = bamboo + 10; setBamboo(nb); trigHappy(); toast("Acuerdo guardado ✓ +10 bambú 🌿");
      save(null, { bamboo: nb, happiness, water, garden, exDone, messages, conoce, burbuja: nb2, coupleInfo });
    } else {
      trigHappy(); toast("Acuerdo actualizado ✓");
      save(null, { bamboo, happiness, water, garden, exDone, messages, conoce, burbuja: nb2, coupleInfo });
    }
  };

  const saveCoupleInfo = (info) => {
    const isNew = Object.keys(coupleInfo).length === 0;
    setCoupleInfo(info);
    const nb = isNew ? bamboo + 20 : bamboo;
    if (isNew) { setBamboo(nb); trigHappy(); toast("Historia guardada 💚 +20 bambú"); }
    else toast("Historia actualizada 💚");
    save(null, { bamboo: nb, happiness, water, garden, exDone, messages, conoce, burbuja, coupleInfo: info });
  };

  const logout = () => {
    ls.set("mochi_last", null); setUser(null); setScreen("login");
    setBamboo(0); setHappiness(20); setWater(40); setGarden({});
    setExDone({}); setMessages([]); setConoce({}); setBurbuja({}); setCoupleInfo({});
  };

  const unread = messages.filter(m => m.senderEmail !== (user?.email || "guest") && !m.read).length;

  if (screen === "login") return <><style>{STYLES}</style><Login onLogin={afterLogin} /></>;
  if (screen === "onboarding") return <><style>{STYLES}</style><Onboarding onDone={() => setScreen("main")} /></>;

  return (
    <div style={{ fontFamily: "'Nunito',sans-serif", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.sandL, position: "relative" }}>
      <style>{STYLES}</style>
      <div style={{ paddingBottom: 72 }}>
        {tab === "jardin" && <Jardin bamboo={bamboo} happiness={happiness} water={water} garden={garden} mochiHappy={mochiHappy} onPet={petMochi} onBuy={buyItem} onWater={waterGarden} />}
        {tab === "ejerc" && <Ejercicios exDone={exDone} onComplete={completeEx} />}
        {tab === "mensajes" && <Mensajes user={user} messages={messages} onSend={sendMsg} />}
        {tab === "conocete" && <Conocete conoce={conoce} onSave={saveConoce} />}
        {tab === "burbuja" && <Burbuja burbuja={burbuja} onSave={saveBurbuja} />}
        {tab === "perfil" && <Perfil user={user} bamboo={bamboo} exDone={exDone} messages={messages} burbuja={burbuja} coupleInfo={coupleInfo} onSaveCoupleInfo={saveCoupleInfo} onLogout={logout} />}
      </div>
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.white, borderTop: `1.5px solid ${C.border}`, display: "flex", zIndex: 1000, boxShadow: `0 -3px 0 ${C.line}` }}>
        {NAV.map(n => {
          const active = tab === n.id, badge = n.id === "mensajes" && unread > 0 ? unread : null;
          return (
            <div key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 7px", cursor: "pointer" }}>
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: active ? "1.3rem" : "1.1rem", transition: "all 0.15s", filter: active ? "none" : "opacity(0.45)", transform: active ? "scale(1.15) translateY(-2px)" : "none" }}>{n.emoji}</div>
                {badge && <div style={{ position: "absolute", top: -4, right: -6, background: "#c05068", color: C.white, borderRadius: 5, width: 15, height: 15, fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</div>}
              </div>
              <div style={{ fontSize: "0.58rem", fontWeight: active ? 800 : 600, color: active ? C.dark : C.inkL, marginTop: 2, letterSpacing: "0.3px" }}>{n.label}</div>
              {active && <div style={{ width: 16, height: 3, borderRadius: 50, background: C.dark, marginTop: 2 }} />}
            </div>
          );
        })}
      </div>
      <Toast msg={toastMsg} />
    </div>
  );
}
