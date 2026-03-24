import React, { useState } from "react";
// You may need to import C, ScreenTop, etc. from your shared UI/util files

// Copy DIARIO_TYPES and DiarioPersonal implementation from App10.jsx
const DIARIO_TYPES = [
  {
    id: "abcd", label: "🧠 ABCD (reestructurar)", sub: "Pensamientos automáticos y reestructuración cognitiva",
    prompts: [
      { key:"a", label:"A: Hecho (¿qué pasó?)", hint:"Describe solo el hecho visible, como una cámara." },
      { key:"b", label:"B: Pensamiento automático", hint:"¿Qué frase se te vino a la mente?" },
      { key:"c", label:"C: Emoción + reacción", hint:"¿Qué sentiste y qué hiciste?" },
      { key:"d", label:"D: Reestructuración", hint:"¿Qué otra explicación es posible?" },
    ]
  },
  {
    id: "hoy", label: "🌙 Cómo estuve hoy", sub: "Un registro rápido de cómo me sentí",
    prompts: [
      { key:"q1", label:"Mi día en una oración", hint:"¿Cómo estuvo?" },
      { key:"q2", label:"Lo más significativo", hint:"Un momento, una palabra..." },
      { key:"q3", label:"En mi relación hoy", hint:"¿Cómo me sentí con mi pareja?" },
    ]
  },
  {
    id: "interpersonal", label: "🫶 Interpersonal", sub: "Reflexionar sobre lo que siento en mi relación",
    prompts: [
      { key:"q1", label:"Momento de conexión", hint:"¿Hubo alguno hoy?" },
      { key:"q2", label:"Lo que me costó expresar", hint:"¿Qué no le dije?" },
      { key:"q3", label:"Lo que necesito pedirle", hint:"Una petición clara..." },
    ]
  },
];

export default function DiarioPersonal({ entries, onSave, user }) {
  const [view, setView] = useState("list"); // "list" | "new" | "detail"
  const [selType, setSelType] = useState(null);
  const [draft, setDraft] = useState({});
  const [selEntry, setSelEntry] = useState(null);

  const sortedEntries = Object.values(entries || {}).sort((a, b) => b.ts.localeCompare(a.ts));

  const fmtDate = ts => {
    const d = new Date(ts);
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"short" });
  };
  const fmtTime = ts => new Date(ts).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" });

  const handleSave = () => {
    const type = DIARIO_TYPES.find(t => t.id === selType);
    if (!type) return;
    const filled = type.prompts.filter(p => (draft[p.key] || "").trim().length > 0);
    if (filled.length === 0) return;
    const ts = new Date().toISOString();
    onSave({ id: ts, ts, type: selType, prompts: { ...draft } });
    setDraft({}); setSelType(null); setView("list");
  };

  if (view === "new" && selType) {
    const type = DIARIO_TYPES.find(t => t.id === selType);
    const abcdFieldHelp = {
      a: "Describe solo el hecho visible, como una camara. Evita interpretar intenciones.",
      b: "Escribe la frase exacta que se te vino a la mente, incluso si suena extrema.",
      c: "Nombra emocion + reaccion: por ejemplo ansiedad + me calle / enojo + discuti.",
      d: "Busca una version mas amplia y realista, sin negar lo que sentiste.",
    };
    return (
      <div style={{ background: '#f8f2e4', minHeight: "100vh", paddingBottom: 90 }}>
        {/* Add your ScreenTop if needed */}
        <div style={{ padding: "10px 14px 0" }}>
          {selType === "abcd" && (
            <div style={{ background:"#eef6ea", borderRadius:14, padding:14, marginBottom:10, border:'1.5px solid #d4a843' }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.9rem", color:'#222', marginBottom:6 }}>¿Qué es ABCD y qué significa reestructurar?</div>
              <div style={{ fontSize:"0.8rem", color:'#666', lineHeight:1.6, marginBottom:8 }}>
                ABCD es una forma simple de ordenar tu mente cuando te activas. Reestructurar no es mentirte:
                es pasar de un pensamiento automático que duele a una idea más completa y justa.
              </div>
              <div style={{ background:'#fff', borderRadius:10, padding:"9px 10px", border:'1px solid #d4a843', fontSize:"0.75rem", color:'#666', lineHeight:1.55 }}>
                <b>Ejemplo:</b> A: "No respondió en 2 horas". B: "Seguro ya no le importo".
                C: "Ansiedad, me cerré". D: "Puede estar ocupado/a; cuando pueda, pregunto con calma".
              </div>
            </div>
          )}
          {type.prompts.map(p => (
            <div key={p.key} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, border: '1.5px solid #d4a843' }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.9rem", color:'#222', marginBottom:7 }}>{p.label}</div>
              {selType === "abcd" && abcdFieldHelp[p.key] && (
                <div style={{ fontSize:"0.76rem", color:'#888', lineHeight:1.55, marginBottom:8, background:'#f8f2e4', border:'1px solid #d4a843', borderRadius:9, padding:"7px 9px" }}>
                  {abcdFieldHelp[p.key]}
                </div>
              )}
              <textarea
                value={draft[p.key] || ""}
                onChange={e => setDraft(d => ({ ...d, [p.key]: e.target.value }))}
                placeholder={p.hint}
                rows={3}
                style={{ width:"100%", border:'1.5px solid #d4a843', borderRadius:10, padding:"9px 11px", fontSize:"0.84rem", fontFamily:"'Nunito',sans-serif", resize:"none", outline:"none", boxSizing:"border-box", color:'#222', lineHeight:1.6 }}
              />
            </div>
          ))}
          <div style={{ display:"flex", gap:10, marginTop:4 }}>
            <button onClick={() => { setSelType(null); setView("new"); }} style={{ flex:1, padding:13, background:'#f8f2e4', border:'1.5px solid #d4a843', borderRadius:14, fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", color:'#888' }}>← Tipo</button>
            <button onClick={handleSave} style={{ flex:2, padding:13, background:'#222', color:'#fff', border:"none", borderRadius:14, fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.2)" }}>Guardar entrada ✓</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "new") {
    return (
      <div style={{ background: '#f8f2e4', minHeight: "100vh", paddingBottom: 90 }}>
        {/* Add your ScreenTop if needed */}
        <div style={{ padding: "10px 14px 0" }}>
          {DIARIO_TYPES.map(t => (
            <div key={t.id} onClick={() => setSelType(t.id)}
              style={{ background:'#fff', borderRadius:16, padding:"14px 16px", marginBottom:10, cursor:"pointer", border:'1.5px solid #d4a843', boxShadow:'0 3px 0 #d4a843' }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.05rem", color:'#222' }}>{t.label}</div>
              <div style={{ fontSize:"0.8rem", color:'#666', marginTop:3 }}>{t.sub}</div>
            </div>
          ))}
          <button onClick={() => setView("list")} style={{ width:"100%", padding:12, background:"transparent", border:'1.5px solid #d4a843', borderRadius:14, fontFamily:"'Fredoka One',cursive", fontSize:"0.9rem", cursor:"pointer", color:'#888', marginTop:4 }}>← Volver</button>
        </div>
      </div>
    );
  }

  // list view
  return (
    <div style={{ background: '#f8f2e4', minHeight: "100vh", paddingBottom: 90 }}>
      {/* Add your ScreenTop if needed */}
      <div style={{ padding: "10px 14px 0" }}>
        <div style={{ background:'#fff', borderRadius:14, padding:12, marginBottom:10, border:'1.5px solid #d4a843' }}>
          <div style={{ fontSize:"0.8rem", color:'#666', lineHeight:1.55 }}>
            Este diario es privado: te ayuda a bajar ruido mental, entender lo que sentiste y escribir con claridad antes de reaccionar.
          </div>
        </div>
        <button onClick={() => setView("new")} style={{ width:"100%", background:'#222', color:'#fff', border:"none", borderRadius:14, padding:"13px 16px", fontFamily:"'Fredoka One',cursive", fontSize:"1rem", cursor:"pointer", boxShadow:"0 4px 0 rgba(0,0,0,0.25)", marginBottom:14, textAlign:"left" }}>
          + Nueva entrada 📝
        </button>
        {sortedEntries.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 20px", color:'#888', fontSize:"0.88rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:10 }}>📓</div>
            Tu diario está vacío. Empieza con una entrada hoy.
          </div>
        )}
        {sortedEntries.map(entry => {
          const type = DIARIO_TYPES.find(t => t.id === entry.type);
          const firstPromptKey = type?.prompts?.[0]?.key;
          const preview = firstPromptKey ? (entry.prompts?.[firstPromptKey] || "") : "";
          return (
            <div key={entry.id} onClick={() => { setSelEntry(entry); }}
              style={{ background:'#fff', borderRadius:16, padding:"13px 15px", marginBottom:9, border:'1.5px solid #d4a843', boxShadow:'0 2px 0 #d4a843', cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                <div style={{ background:'#f8f2e4', borderRadius:8, padding:"3px 10px", fontSize:"0.72rem", fontWeight:800, color:'#222' }}>{type?.label || entry.type}</div>
                <div style={{ fontSize:"0.7rem", color:'#888', fontWeight:700 }}>{fmtDate(entry.ts)} · {fmtTime(entry.ts)}</div>
              </div>
              {preview && <div style={{ fontSize:"0.84rem", color:'#666', lineHeight:1.55, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{preview}</div>}
            </div>
          );
        })}
      </div>
      {selEntry && (() => {
        const type = DIARIO_TYPES.find(t => t.id === selEntry.type);
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15,25,15,0.65)", zIndex:5000, display:"flex", alignItems:"flex-end" }} onClick={() => setSelEntry(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:'#f8f2e4', borderRadius:"22px 22px 0 0", width:"100%", maxHeight:"88vh", overflowY:"auto", border:'1.5px solid #d4a843' }}>
              <div style={{ background:'#222', padding:"16px 18px 18px", borderRadius:"22px 22px 0 0" }}>
                <div style={{ width:34, height:5, background:"rgba(255,255,255,0.2)", borderRadius:50, margin:"0 auto 12px" }}/>
                <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.1rem", color:'#fff' }}>{type?.label}</div>
                <div style={{ fontSize:"0.75rem", color:'#fff', marginTop:3 }}>{fmtDate(selEntry.ts)} · {fmtTime(selEntry.ts)}</div>
              </div>
              <div style={{ padding:"14px 16px 32px" }}>
                {(type?.prompts || []).map(p => {
                  const val = selEntry.prompts?.[p.key];
                  if (!val) return null;
                  return (
                    <div key={p.key} style={{ background:'#fff', borderRadius:12, padding:"11px 13px", marginBottom:9, border:'1.5px solid #d4a843' }}>
                      <div style={{ fontSize:"0.72rem", fontWeight:800, color:'#888', marginBottom:5, textTransform:"uppercase", letterSpacing:"0.5px" }}>{p.label}</div>
                      <div style={{ fontSize:"0.86rem", color:'#222', lineHeight:1.65 }}>{val}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
