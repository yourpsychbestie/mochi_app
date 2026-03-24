import React from "react";

export default function Lecciones({ open, isDone, onComplete, lessonsDone, todayLesson, todayDone, openLesson, DAILY_LESSONS, C }) {
  return (
    <div style={{ background:C.sandL, minHeight:"100vh", paddingBottom:80 }}>
      <div style={{ background:C.dark, padding:"44px 20px 24px" }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.9rem", color:C.cream2 }}>Lecciones</div>
        <div style={{ color:`${C.cream}88`, fontSize:"0.86rem", fontWeight:600, marginTop:4 }}>Psicología de parejas · +10 bambú cada una 🌿</div>
      </div>

      {/* Today's lesson highlight */}
      <div style={{ margin:"14px 14px 0" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.olive, letterSpacing:"0.6px", marginBottom:8 }}>📅 LECCIÓN DE HOY</div>
        <div onClick={() => openLesson(todayLesson)}
          style={{ background: todayDone ? C.cream : C.dark, borderRadius:20, padding:20, cursor:"pointer",
            boxShadow:`0 4px 0 ${todayDone?C.border:"rgba(0,0,0,0.25)"}`, border:`1.5px solid ${todayDone?C.border:C.dark}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:"2.5rem" }}>{todayLesson.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"1.15rem", color: todayDone ? C.ink : C.cream2 }}>{todayLesson.title}</div>
              <div style={{ fontSize:"0.75rem", color: todayDone ? C.inkL : `${C.cream}88`, fontWeight:700, marginTop:3 }}>{todayLesson.tag}</div>
            </div>
            {todayDone
              ? <div style={{ background:C.olive, color:C.cream2, borderRadius:8, padding:"4px 10px", fontSize:"0.72rem", fontWeight:800 }}>✓ Hecha</div>
              : <div style={{ background:C.oliveL, color:C.cream2, borderRadius:8, padding:"4px 10px", fontSize:"0.72rem", fontWeight:800 }}>+10 🌿</div>}
          </div>
        </div>
      </div>

      {/* All lessons */}
      <div style={{ padding:"16px 14px 0" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:800, color:C.inkL, letterSpacing:"0.6px", marginBottom:10 }}>📚 TODAS LAS LECCIONES</div>
        {DAILY_LESSONS.map(lesson => {
          const done = lessonsDone?.[lesson.id];
          const isToday = lesson.id === todayLesson.id;
          return (
            <div key={lesson.id} onClick={() => openLesson(lesson)}
              style={{ background:C.white, borderRadius:16, padding:"14px 16px", marginBottom:10, cursor:"pointer",
                border:`1.5px solid ${isToday?C.olive:C.border}`, boxShadow:`0 2px 0 ${C.border}`,
                opacity: done ? 0.75 : 1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:"1.8rem" }}>{lesson.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:"0.95rem", color:C.dark }}>{lesson.title}</div>
                  <div style={{ fontSize:"0.72rem", color:C.inkL, fontWeight:700, marginTop:2 }}>{lesson.tag}</div>
                </div>
                {done
                  ? <div style={{ color:C.olive, fontWeight:800, fontSize:"0.8rem" }}>✓</div>
                  : <div style={{ background:C.sandL, color:C.olive, borderRadius:7, padding:"3px 8px", fontSize:"0.68rem", fontWeight:800 }}>+10 🌿</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
