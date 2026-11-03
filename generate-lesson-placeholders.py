import re
import os
from PIL import Image, ImageDraw, ImageFont

jsx_path = "src/bkApp.jsx"
with open(jsx_path, "r", encoding="utf-8") as f:
    text = f.read()

start = text.find("const DAILY_LESSONS = [")
end = text.rfind("];", start)
lessons_text = text[start:end + 2]

# Encontrar cada lección por id y extraer su bloque balanceado
id_matches = list(re.finditer(r'\{\s*id:"([^"]+)"', lessons_text))

lessons = []
for i, m in enumerate(id_matches):
    lesson_id = m.group(1)
    block_start = m.start()
    block_end = len(lessons_text)
    if i + 1 < len(id_matches):
        block_end = id_matches[i + 1].start()
    block = lessons_text[block_start:block_end]

    # Contar secciones: cada objeto { title: ... } dentro de sections:[ ... ]
    sections_match = re.search(r'sections:\s*\[(.*?)\n\s*\]', block, re.DOTALL)
    if sections_match:
        sections_count = len(re.findall(r'\{\s*title:', sections_match.group(1)))
    else:
        sections_count = 0

    total_slides = 1 + sections_count + 1  # intro + sections + reflect
    lessons.append({"id": lesson_id, "slides": total_slides})
    print(f"{lesson_id}: {sections_count} secciones → {total_slides} tarjetas")

bg_colors = [
    "#f3ecfb", "#e8f4e8", "#fff8e0", "#fce4ec", "#e3f2fd",
    "#f1f8e9", "#fff3e0", "#ede7f6", "#e0f7fa", "#fce8ef",
    "#e8f5e9", "#fbe9e7"
]

slide_emojis = ["🐼", "🌱", "💬", "🎁", "🛠", "🤝", "🧠", "💛", "🌊", "✨", "🔓", "🎯"]

os.makedirs("public/lessons", exist_ok=True)


def draw_placeholder(path, emoji, label, bg_hex):
    w, h = 400, 260
    img = Image.new("RGB", (w, h), bg_hex)
    draw = ImageDraw.Draw(img)

    cx, cy, r = w // 2, h // 2 - 10, 90
    overlay = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 80))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    try:
        emoji_font = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 80)
    except:
        try:
            emoji_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 80)
        except:
            emoji_font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), emoji, font=emoji_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(((w - tw) // 2, (h - th) // 2 - 25), emoji, font=emoji_font, embedded_color=True)

    try:
        label_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
    except:
        label_font = ImageFont.load_default()

    lbbox = draw.textbbox((0, 0), label, font=label_font)
    ltw = lbbox[2] - lbbox[0]
    draw.text(((w - ltw) // 2, h - 45), label, fill="#6b5a87", font=label_font)

    img.save(path, "PNG")


for i, lesson in enumerate(lessons):
    lesson_id = lesson["id"]
    total_slides = lesson["slides"]
    bg = bg_colors[i % len(bg_colors)]
    for slide_idx in range(total_slides):
        path = f"public/lessons/{lesson_id}-{slide_idx}.png"
        emoji = slide_emojis[slide_idx % len(slide_emojis)]
        label = f"Lección {i+1} · Tarjeta {slide_idx+1}"
        draw_placeholder(path, emoji, label, bg)
        print(f"Generado {path}")

print("✅ Placeholders listos")
