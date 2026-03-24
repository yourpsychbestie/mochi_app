import React, { useState } from 'react';

const MEMORY_EMOJIS = ['🌸','🥕','🍄','🌿','🐼','🍯','🫐','⭐'];

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

export default function Memoria({ onBambuEarned }) {
  const [pairs, setPairs] = useState(shuffle([...MEMORY_EMOJIS, ...MEMORY_EMOJIS]));
  const [flipped, setFlipped] = useState([]); // indices
  const [matched, setMatched] = useState([]); // indices
  const [turn, setTurn] = useState(1); // 1 = panda A, 2 = panda B
  const [scores, setScores] = useState([0, 0]);
  const [status, setStatus] = useState('turno: 🐼 panda A');
  const [locked, setLocked] = useState(false);

  function resetGame() {
    setPairs(shuffle([...MEMORY_EMOJIS, ...MEMORY_EMOJIS]));
    setFlipped([]);
    setMatched([]);
    setTurn(1);
    setScores([0, 0]);
    setStatus('turno: 🐼 panda A');
    setLocked(false);
  }

  function handleFlip(idx) {
    if (locked || flipped.includes(idx) || matched.includes(idx)) return;
    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      setLocked(true);
      setTimeout(() => checkMatch(newFlipped), 700);
    }
  }

  function checkMatch([a, b]) {
    if (pairs[a] === pairs[b]) {
      // Match!
      const newMatched = [...matched, a, b];
      const newScores = [...scores];
      newScores[turn - 1]++;
      setMatched(newMatched);
      setScores(newScores);
      if (newMatched.length === 16) {
        let winner = newScores[0] > newScores[1] ? '🐼 panda A'
                  : newScores[0] < newScores[1] ? '🐼 panda B'
                  : '¡empate! 💕';
        setStatus(`🎉 gana ${winner} — ${newScores[0]}-${newScores[1]}`);
        if (onBambuEarned) onBambuEarned(30); // +30 bambú
      }
    } else {
      setTurn(turn === 1 ? 2 : 1);
      setStatus(`turno: 🐼 panda ${turn === 1 ? 'B' : 'A'}`);
    }
    setFlipped([]);
    setLocked(false);
  }

  return (
    <div className="memoria-panel">
      <div className="game-title">🃏 memoria en pareja 🃏</div>
      <div className="scores">
        <div className="score-box">
          <span className="score-val">{scores[0]}</span>
          🐼 panda A
        </div>
        <div className="score-box" style={{alignSelf:'center',color:'#a07040'}}>vs</div>
        <div className="score-box">
          <span className="score-val">{scores[1]}</span>
          🐼 panda B
        </div>
      </div>
      <div className="status">{status}</div>
      <div className="mem-grid">
        {pairs.map((emoji, idx) => {
          const isFlipped = flipped.includes(idx) || matched.includes(idx);
          return (
            <div
              key={idx}
              className={
                'mem-card' +
                (isFlipped ? ' flipped' : '') +
                (matched.includes(idx) ? ' matched' : '')
              }
              onClick={() => handleFlip(idx)}
            >
              {isFlipped ? emoji : '?'}
            </div>
          );
        })}
      </div>
      <button className="btn btn-block" onClick={resetGame}>↺ nueva partida</button>
    </div>
  );
}
