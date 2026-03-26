
import React, { useState } from 'react';
import Memoria from './Memoria';
import MochiDraw from './MochiDraw';
import './Juegos.css';

const TABS = [
  { id: 'memoria', label: '🃏 Memoria' },
  { id: 'ahorcado', label: '🔤 Ahorcado' },
  { id: 'trivia', label: '🧠 Trivia' },
  { id: 'wordle', label: '🟩 Wordle' },
  { id: 'scrabble', label: '🎲 Scrabble' },
  { id: 'draw', label: '🎨 Dibujo' },
];

export default function Juegos({ onBambuEarned }) {
  const [tab, setTab] = useState('memoria');

  return (
    <div className="juegos-container">
      <div className="game-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? 'game-tab active' : 'game-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="game-area">
        {tab === 'memoria' && <Memoria onBambuEarned={onBambuEarned} />}
        {tab === 'draw' && <MochiDraw />}
        {/* Otros juegos se agregarán aquí */}
      </div>
    </div>
  );
}
