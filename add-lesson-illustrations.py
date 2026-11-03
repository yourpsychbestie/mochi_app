import re

jsx_path = "src/bkApp.jsx"
with open(jsx_path, "r", encoding="utf-8") as f:
    text = f.read()

start = text.find("const DAILY_LESSONS = [")
end = text.rfind("];", start)
lessons_text = text[start:end + 2]

id_matches = list(re.finditer(r'\{\s*id:"([^"]+)"', lessons_text))

replacements = []
for i, m in enumerate(id_matches):
    lesson_id = m.group(1)
    block_start = m.start()
    block_end = len(lessons_text)
    if i + 1 < len(id_matches):
        block_end = id_matches[i + 1].start()
    block = lessons_text[block_start:block_end]

    sections_match = re.search(r'sections:\s*\[(.*?)\n\s*\]', block, re.DOTALL)
    if sections_match:
        sections_count = len(re.findall(r'\{\s*title:', sections_match.group(1)))
    else:
        sections_count = 0

    total_slides = 1 + sections_count + 1
    illustrations = [f'"/lessons/{lesson_id}-{j}.png"' for j in range(total_slides)]
    ill_str = ",\n    ".join(illustrations)

    # Insertar después de reflect:"..." y antes de la coma/llave que cierra la lección
    # Buscar la posición relativa de reflect en el bloque
    reflect_match = re.search(r'reflect:"[^"]*"', block)
    if not reflect_match:
        print(f"⚠️ No se encontró reflect para {lesson_id}, saltando")
        continue

    abs_reflect_end = block_start + reflect_match.end()
    replacements.append((abs_reflect_end, f",\n    illustrations:[\n      {ill_str}\n    ]"))

# Aplicar reemplazos de atrás hacia adelante para no desplazar índices
for pos, insert in sorted(replacements, reverse=True):
    lessons_text = lessons_text[:pos] + insert + lessons_text[pos:]

new_text = text[:start] + lessons_text + text[end + 2:]

with open(jsx_path, "w", encoding="utf-8") as f:
    f.write(new_text)

print(f"✅ Agregados {len(replacements)} arrays de illustrations")
