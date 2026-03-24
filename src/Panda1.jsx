import React from "react";

// Panda1: Panda feliz con la mano levantada (referencia: esquina superior izquierda)
export default function Panda1({ size = 180 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cuerpo */}
      <ellipse cx="128" cy="160" rx="80" ry="70" fill="#FFF6E9" />
      {/* Pierna izquierda */}
      <ellipse cx="60" cy="220" rx="28" ry="22" fill="#3B2C25" />
      {/* Pierna derecha */}
      <ellipse cx="196" cy="220" rx="28" ry="22" fill="#3B2C25" />
      {/* Barriga */}
      <ellipse cx="128" cy="180" rx="50" ry="40" fill="#FFF6E9" />
      {/* Brazo izquierdo (levantado) */}
      <ellipse cx="40" cy="70" rx="24" ry="38" fill="#3B2C25" transform="rotate(-20 40 70)" />
      {/* Brazo derecho */}
      <ellipse cx="200" cy="140" rx="22" ry="36" fill="#3B2C25" transform="rotate(20 200 140)" />
      {/* Cabeza */}
      <ellipse cx="110" cy="80" rx="70" ry="60" fill="#FFF6E9" />
      {/* Oreja izquierda */}
      <ellipse cx="50" cy="30" rx="22" ry="22" fill="#3B2C25" />
      {/* Oreja derecha */}
      <ellipse cx="170" cy="30" rx="22" ry="22" fill="#3B2C25" />
      {/* Ojo izquierdo */}
      <ellipse cx="80" cy="80" rx="18" ry="16" fill="#3B2C25" />
      <ellipse cx="80" cy="90" rx="6" ry="7" fill="#222" />
      {/* Ojo derecho */}
      <ellipse cx="140" cy="80" rx="18" ry="16" fill="#3B2C25" />
      <ellipse cx="140" cy="90" rx="6" ry="7" fill="#222" />
      {/* Mejilla izquierda */}
      <ellipse cx="70" cy="110" rx="10" ry="8" fill="#FFD1C1" />
      {/* Mejilla derecha */}
      <ellipse cx="150" cy="110" rx="10" ry="8" fill="#FFD1C1" />
      {/* Nariz */}
      <ellipse cx="110" cy="105" rx="8" ry="5" fill="#222" />
      {/* Boca (sonriente) */}
      <path d="M95 120 Q110 130 125 120" stroke="#222" strokeWidth="3" fill="none" />
      {/* Dedo pie izquierdo */}
      <ellipse cx="60" cy="235" rx="6" ry="4" fill="#FFD1C1" />
      {/* Dedo pie derecho */}
      <ellipse cx="196" cy="235" rx="6" ry="4" fill="#FFD1C1" />
    </svg>
  );
}
