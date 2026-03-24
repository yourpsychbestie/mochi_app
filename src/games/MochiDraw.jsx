import React, { useRef, useState } from 'react';
import './Juegos.css';

// Palabras de ejemplo para adivinar
defaultWords = [
  { word: 'GATO', category: 'animal' },
  { word: 'CASA', category: 'lugar' },
  { word: 'ARBOL', category: 'naturaleza' },
  { word: 'SOL', category: 'astronomía' },
  { word: 'FLOR', category: 'naturaleza' },
  { word: 'LIBRO', category: 'objeto' },
];

export default function MochiDraw() {
  const [screen, setScreen] = useState('start'); // start, word, draw, pass, guess, result
  const [round, setRound] = useState(1);
  const [drawer, setDrawer] = useState('A');
  const [scores, setScores] = useState({ A: 0, B: 0 });
  const [currentWord, setCurrentWord] = useState(null);
  const [guess, setGuess] = useState('');
  const [guessHistory, setGuessHistory] = useState([]);
  const [result, setResult] = useState(null); // { correct: bool, word: string }
  const canvasRef = useRef(null);
  const [color, setColor] = useState('#1a1a1a');
  const [size, setSize] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);

  // --- Palabra secreta ---
  function getRandomWord() {
    return defaultWords[Math.floor(Math.random() * defaultWords.length)];
  }

  function handleSeeWord() {
    setCurrentWord(getRandomWord());
    setScreen('word');
  }

  function handleStartDraw() {
    setScreen('draw');
  }

  function handlePass() {
    setScreen('pass');
  }

  function handleGuessScreen() {
    setScreen('guess');
  }

  function handleGuessChange(e) {
    setGuess(e.target.value.toUpperCase());
  }

  function handleSendGuess() {
    setGuessHistory([...guessHistory, guess]);
    if (guess === currentWord.word) {
      setResult({ correct: true, word: currentWord.word });
      setScores({ ...scores, [drawer]: scores[drawer] + 1 });
      setScreen('result');
    } else {
      setResult({ correct: false, word: currentWord.word });
    }
    setGuess('');
  }

  function handleNextRound() {
    setRound(round + 1);
    setDrawer(drawer === 'A' ? 'B' : 'A');
    setGuessHistory([]);
    setResult(null);
    setPaths([]);
    setCurrentPath([]);
    setScreen('start');
  }

  function handleReset() {
    setRound(1);
    setDrawer('A');
    setScores({ A: 0, B: 0 });
    setGuessHistory([]);
    setResult(null);
    setPaths([]);
    setCurrentPath([]);
    setScreen('start');
  }

  // --- Canvas drawing logic ---
  function handlePointerDown(e) {
    setDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    setCurrentPath([{ x, y, color, size }]);
  }

  function handlePointerMove(e) {
    if (!drawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    setCurrentPath(path => [...path, { x, y, color, size }]);
  }

  function handlePointerUp() {
    if (currentPath.length > 0) {
      setPaths(paths => [...paths, currentPath]);
      setCurrentPath([]);
    }
    setDrawing(false);
  }

  function handleClear() {
    setPaths([]);
    setCurrentPath([]);
  }

  function handleUndo() {
    setPaths(paths => paths.slice(0, -1));
  }

  // --- Render canvas ---
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [...paths, currentPath].forEach(path => {
      if (path.length < 2) return;
      ctx.strokeStyle = path[0].color;
      ctx.lineWidth = path[0].size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });
  }, [paths, currentPath]);

  // --- UI ---
  return (
    <div className="draw-panel">
      {screen === 'start' && (
        <div id="dr-start">
          <div className="gtitle">🎨 mochi draw 🎨</div>
          <div className="scores">
            <div className="sbox"><span className="sv">{scores.A}</span>🐼 panda A</div>
            <div className="sbox"><span className="sv">{scores.B}</span>🐼 panda B</div>
          </div>
          <div className="status">
            ronda <strong>{round}</strong> — dibuja: <span className="badge">🐼 panda {drawer}</span>
          </div>
          <div style={{ fontSize: 11, color: '#8a6040', textAlign: 'center', margin: '6px 0 12px', lineHeight: 1.6 }}>
            solo el dibujante toca "ver palabra" · el otro mira para otro lado 🙈
          </div>
          <button className="btn btn-block" onClick={handleSeeWord}>ver mi palabra secreta 👀</button>
        </div>
      )}
      {screen === 'word' && (
        <div id="dr-word" style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#7a5530', fontWeight: 'bold' }}>¡no se la muestres! 🤫</div>
          <div style={{ background: '#f0c870', border: '3px solid #c8a040', borderRadius: 16, padding: '14px 28px', fontSize: 26, fontWeight: 'bold', color: '#5a3010', letterSpacing: 2 }}>{currentWord.word}</div>
          <div style={{ fontSize: 11, color: '#8a6040' }}>{currentWord.category}</div>
          <div style={{ background: 'rgba(255,255,255,.55)', border: '2px solid #c8a870', borderRadius: 12, padding: 12, fontSize: 11, color: '#5a3010', lineHeight: 1.7, maxWidth: 280 }}>
            Memoriza la palabra.<br />Dibuja sin escribir letras ni números.<br />¡Tu pareja tiene que adivinar! 🎨
          </div>
          <button className="btn" onClick={handleStartDraw}>¡listo, a dibujar! ✏️</button>
          <button className="btn" style={{ background: 'rgba(255,255,255,.55)', borderColor: '#c8a870', color: '#7a5530' }} onClick={handleSeeWord}>⟲ otra palabra</button>
        </div>
      )}
      {screen === 'draw' && (
        <div id="dr-draw" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,.38)', borderBottom: '2px solid rgba(160,130,80,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ background: '#f0c870', border: '2px solid #c8a040', borderRadius: 10, padding: '4px 12px', fontSize: 12, fontWeight: 'bold', color: '#5a3010' }}>{currentWord.word}</span>
            <span style={{ fontSize: 10, color: '#8a6040' }}>¡no lo digas! 🤫</span>
            <button className="btn" style={{ padding: '5px 12px', fontSize: 11 }} onClick={handlePass}>listo ➜</button>
          </div>
          <div id="dr-canvas-wrap" style={{ position: 'relative', background: 'white', height: 280, overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              width={320}
              height={280}
              style={{ display: 'block', touchAction: 'none', cursor: 'crosshair', width: '100%', height: '100%' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          </div>
          {/* toolbar */}
          <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,.38)', borderTop: '2px solid rgba(160,130,80,.2)', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {/* Colores */}
            {['#1a1a1a','#e84040','#4080e8','#40c040','#e8c040','#e87840','#c040c0','#ffffff'].map(c => (
              <div
                key={c}
                className={color === c ? 'dr-col on' : 'dr-col'}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid #c8a870' : '3px solid transparent', cursor: 'pointer' }}
                onClick={() => setColor(c)}
              />
            ))}
            <div style={{ width: 1, height: 24, background: 'rgba(160,130,80,.3)' }} />
            {/* Tamaños */}
            {[4,10,22].map(s => (
              <div
                key={s}
                className={size === s ? 'dr-sz on' : 'dr-sz'}
                style={{ width: 28, height: 28, border: '2px solid #c8a870', borderRadius: 7, background: 'rgba(255,255,255,.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#5a3010', fontWeight: 'bold' }}
                onClick={() => setSize(s)}
              >{s === 4 ? 'S' : s === 10 ? 'M' : 'L'}</div>
            ))}
            <button style={{ background: 'rgba(255,255,255,.6)', border: '2px solid #c8a870', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#7a5530', cursor: 'pointer', fontFamily: 'Courier New,monospace', fontWeight: 'bold' }} onClick={handleClear}>🗑️</button>
            <button style={{ background: 'rgba(255,255,255,.6)', border: '2px solid #c8a870', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#7a5530', cursor: 'pointer', fontFamily: 'Courier New,monospace', fontWeight: 'bold' }} onClick={handleUndo}>↩</button>
          </div>
        </div>
      )}
      {screen === 'pass' && (
        <div id="dr-pass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>📱➜🐼</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#5a3010', letterSpacing: 1 }}>pásale el celular<br />a tu pareja</div>
          <div style={{ fontSize: 12, color: '#7a5530', lineHeight: 1.7 }}>El dibujante ya terminó.</div>
          <button className="btn" onClick={handleGuessScreen}>¡ya lo tengo! 👀</button>
        </div>
      )}
      {screen === 'guess' && (
        <div id="dr-guess" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,.38)', borderBottom: '2px solid rgba(160,130,80,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, letterSpacing: 7, fontWeight: 'bold', color: '#5a3010' }}>{currentWord.word.split('').map(() => '_').join(' ')}</span>
            <span style={{ fontSize: 10, color: '#8a6040' }}>¿qué dibujó?</span>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 10, background: 'rgba(255,255,255,.55)', borderColor: '#c8a870', color: '#7a5530' }} onClick={() => setScreen('result')}>🏳️ rendirse</button>
          </div>
          <div id="dr-guess-canvas-wrap" style={{ background: 'white', height: 240, overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              style={{ display: 'block', width: '100%', height: '100%' }}
              // No drawing in guess mode
              readOnly
            />
          </div>
          <div id="dr-hist" style={{ padding: '5px 12px', background: 'rgba(255,255,255,.25)', maxHeight: 66, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {guessHistory.map((g, i) => <div key={i}>{g}</div>)}
          </div>
          <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,.38)', borderTop: '2px solid rgba(160,130,80,.2)', display: 'flex', gap: 7 }}>
            <input
              id="dr-guess-input"
              placeholder="escribe tu respuesta..."
              value={guess}
              onChange={handleGuessChange}
              onKeyDown={e => { if (e.key === 'Enter') handleSendGuess(); }}
              style={{ flex: 1, padding: '9px 12px', border: '2px solid #c8a870', borderRadius: 12, fontFamily: 'Courier New,monospace', fontSize: 13, background: 'rgba(255,255,255,.7)', color: '#5a3010' }}
            />
            <button className="btn" style={{ padding: '9px 14px' }} onClick={handleSendGuess}>➜</button>
          </div>
        </div>
      )}
      {screen === 'result' && (
        <div id="dr-result" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>{result && result.correct ? '🎉' : '😅'}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#5a3010' }} id="dr-res-title">{result && result.correct ? '¡adivinaste!' : 'no era esa...'}</div>
          <div style={{ fontSize: 11, color: '#8a6040' }}>la palabra era</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#5a3010', background: 'rgba(255,255,255,.6)', border: '2px solid #c8a870', borderRadius: 12, padding: '10px 24px', letterSpacing: 2 }}>{currentWord.word}</div>
          <div className="scores" style={{ margin: 0 }}>
            <div className="sbox"><span className="sv">{scores.A}</span>🐼 panda A</div>
            <div className="sbox"><span className="sv">{scores.B}</span>🐼 panda B</div>
          </div>
          <button className="btn" onClick={handleNextRound}>siguiente ronda ➜</button>
          <button className="btn" style={{ background: 'rgba(255,255,255,.55)', borderColor: '#c8a870', color: '#7a5530' }} onClick={handleReset}>⟲ nuevo juego</button>
        </div>
      )}
    </div>
  );
}
