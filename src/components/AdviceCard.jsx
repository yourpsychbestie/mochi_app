import React from "react";
import { CouplePandaSVG } from "./PandaSVG";

export default function AdviceCard({ tips = [] }) {
  if (!tips.length) return null;

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #f8f3ff 0%, #efe6ff 100%)",
        borderRadius: 22,
        padding: 18,
        border: "2px solid rgba(111, 86, 184, 0.18)",
        boxShadow: "0 8px 24px rgba(63, 47, 99, 0.10)",
        marginTop: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Decorative soft blobs */}
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "rgba(244, 184, 200, 0.22)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -24,
          left: -24,
          width: 90,
          height: 90,
          borderRadius: "50%",
          background: "rgba(138, 200, 232, 0.18)",
          pointerEvents: "none",
        }}
      />

      {/* Header with pandas */}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255, 255, 255, 0.85)",
            borderRadius: "50%",
            padding: "10px 10px 4px",
            boxShadow: "0 6px 18px rgba(63, 47, 99, 0.10)",
            marginBottom: 12,
          }}
        >
          <CouplePandaSVG happy size={130} />
        </div>

        <div
          style={{
            fontFamily: "'Fredoka One', cursive",
            fontSize: "1.05rem",
            color: "#3f2f63",
            marginBottom: 4,
            letterSpacing: "0.3px",
          }}
        >
          💡 Consejos de Mochi
        </div>
        <div
          style={{
            fontSize: "0.74rem",
            color: "#6f56b8",
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          Pequeñas ideas para cuidar su relación
        </div>
      </div>

      {/* Tips list */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {tips.map((tip, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "rgba(255, 255, 255, 0.92)",
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: idx === tips.length - 1 ? 0 : 10,
              border: "1px solid rgba(111, 86, 184, 0.12)",
              boxShadow: "0 2px 0 rgba(111, 86, 184, 0.06)",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #e6d7ff 0%, #dccbff 100%)",
                color: "#3f2f63",
                fontSize: "0.78rem",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              {idx + 1}
            </span>
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                lineHeight: 1.55,
                color: "#32264a",
                fontWeight: 600,
              }}
            >
              {tip}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
