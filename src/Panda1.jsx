import React from "react";

// Panda1: Panda sentado, estilo kawaii (referencia: imagen adjunta)
export default function Panda1({ size = 200 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cabeza */}
      <ellipse cx="150" cy="90" rx="100" ry="90" fill="#fff" stroke="#222" strokeWidth="4" />
      {/* Orejas */}
      <ellipse cx="65" cy="30" rx="35" ry="35" fill="#222" />
      <ellipse cx="235" cy="30" rx="35" ry="35" fill="#222" />
      {/* Ojos */}
      <ellipse cx="105" cy="90" rx="32" ry="38" fill="#222" />
      <ellipse cx="195" cy="90" rx="32" ry="38" fill="#222" />
      {/* Pupilas */}
      <ellipse cx="105" cy="100" rx="10" ry="14" fill="#fff" />
      <ellipse cx="195" cy="100" rx="10" ry="14" fill="#fff" />
      {/* Nariz */}
      <ellipse cx="150" cy="120" rx="18" ry="12" fill="#222" />
      {/* Boca y lengua */}
      <path d="M130 140 Q150 160 170 140" stroke="#222" strokeWidth="4" fill="none" />
      <path d="M140 145 Q150 160 160 145 Q150 155 140 145" fill="#F9A9B8" stroke="#222" strokeWidth="2" />
      {/* Mejillas */}
      <ellipse cx="110" cy="130" rx="18" ry="7" fill="#F9A9B8" fillOpacity="0.5" />
      <ellipse cx="190" cy="130" rx="18" ry="7" fill="#F9A9B8" fillOpacity="0.5" />
      {/* Cuerpo */}
      <ellipse cx="150" cy="220" rx="90" ry="80" fill="#fff" stroke="#222" strokeWidth="4" />
      {/* Brazos */}
      <ellipse cx="60" cy="200" rx="40" ry="30" fill="#222" />
      <ellipse cx="240" cy="200" rx="40" ry="30" fill="#222" />
      {/* Piernas */}
      <ellipse cx="100" cy="290" rx="45" ry="50" fill="#222" />
      <ellipse cx="200" cy="290" rx="45" ry="50" fill="#222" />
      {/* Dedos pie izquierdo */}
      <ellipse cx="100" cy="305" rx="10" ry="8" fill="#444" />
      <ellipse cx="85" cy="295" rx="8" ry="7" fill="#444" />
      <ellipse cx="115" cy="295" rx="8" ry="7" fill="#444" />
      {/* Dedos pie derecho */}
      <ellipse cx="200" cy="305" rx="10" ry="8" fill="#444" />
      <ellipse cx="185" cy="295" rx="8" ry="7" fill="#444" />
      <ellipse cx="215" cy="295" rx="8" ry="7" fill="#444" />
    </svg>
  );
}
