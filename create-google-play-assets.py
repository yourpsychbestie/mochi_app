from PIL import Image, ImageDraw, ImageFont
import os

# Crear directorio de salida
output_dir = "/Users/johanafragosoblendl/.verdent/verdent-projects/Mochi/google-play-assets"
os.makedirs(output_dir, exist_ok=True)

# Colores de Mochi
DARK_GREEN = (45, 61, 45)  # #2d3d2d
LIGHT_BG = (250, 248, 245)  # #faf8f5
PINK = (255, 107, 157)  # #ff6b9d
WHITE = (255, 255, 255)
CREAM = (255, 252, 245)

def create_app_icon():
    """Crear ícono de app 512x512"""
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Fondo redondeado
    corner_radius = 100
    draw.rounded_rectangle([0, 0, size, size], radius=corner_radius, fill=DARK_GREEN)
    
    # Panda simplificado
    center_x, center_y = size // 2, size // 2
    
    # Orejas
    ear_size = 80
    ear_offset = 90
    draw.ellipse([center_x - ear_offset - ear_size//2, center_y - 140 - ear_size//2,
                  center_x - ear_offset + ear_size//2, center_y - 140 + ear_size//2], 
                 fill=(30, 40, 30))
    draw.ellipse([center_x + ear_offset - ear_size//2, center_y - 140 - ear_size//2,
                  center_x + ear_offset + ear_size//2, center_y - 140 + ear_size//2], 
                 fill=(30, 40, 30))
    
    # Cabeza
    head_size = 180
    draw.ellipse([center_x - head_size//2, center_y - 100 - head_size//2,
                  center_x + head_size//2, center_y - 100 + head_size//2], 
                 fill=CREAM)
    
    # Ojos
    eye_size = 35
    eye_offset = 45
    draw.ellipse([center_x - eye_offset - eye_size//2, center_y - 120 - eye_size//2,
                  center_x - eye_offset + eye_size//2, center_y - 120 + eye_size//2], 
                 fill=(30, 40, 30))
    draw.ellipse([center_x + eye_offset - eye_size//2, center_y - 120 - eye_size//2,
                  center_x + eye_offset + eye_size//2, center_y - 120 + eye_size//2], 
                 fill=(30, 40, 30))
    
    # Brillo en ojos
    shine_size = 12
    draw.ellipse([center_x - eye_offset - 5, center_y - 125 - shine_size//2,
                  center_x - eye_offset + 7, center_y - 125 + shine_size//2], 
                 fill=WHITE)
    draw.ellipse([center_x + eye_offset - 5, center_y - 125 - shine_size//2,
                  center_x + eye_offset + 7, center_y - 125 + shine_size//2], 
                 fill=WHITE)
    
    # Nariz
    draw.ellipse([center_x - 8, center_y - 95, center_x + 8, center_y - 85], fill=(60, 60, 60))
    
    # Mejillas rosadas
    cheek_size = 25
    cheek_offset = 70
    cheek_y = center_y - 100
    draw.ellipse([center_x - cheek_offset - cheek_size//2, cheek_y - cheek_size//2,
                  center_x - cheek_offset + cheek_size//2, cheek_y + cheek_size//2], 
                 fill=(255, 180, 180, 150))
    draw.ellipse([center_x + cheek_offset - cheek_size//2, cheek_y - cheek_size//2,
                  center_x + cheek_offset + cheek_size//2, cheek_y + cheek_size//2], 
                 fill=(255, 180, 180, 150))
    
    # Cuerpo
    body_width = 140
    body_height = 160
    body_y = center_y + 20
    draw.ellipse([center_x - body_width//2, body_y - body_height//2,
                  center_x + body_width//2, body_y + body_height//2], 
                 fill=CREAM)
    
    # Panza
    belly_width = 90
    belly_height = 100
    draw.ellipse([center_x - belly_width//2, body_y - 10 - belly_height//2,
                  center_x + belly_width//2, body_y - 10 + belly_height//2], 
                 fill=WHITE)
    
    # Corazón rosa
    heart_size = 35
    heart_y = body_y - 10
    # Dibujar corazón con dos círculos y triángulo
    draw.ellipse([center_x - heart_size//2 - 8, heart_y - heart_size//2 - 5,
                  center_x - 8, heart_y + 5], fill=PINK)
    draw.ellipse([center_x + 8, heart_y - heart_size//2 - 5,
                  center_x + heart_size//2 + 8, heart_y + 5], fill=PINK)
    draw.polygon([(center_x, heart_y + heart_size//2 + 10),
                  (center_x - heart_size//2 - 8, heart_y),
                  (center_x + heart_size//2 + 8, heart_y)], fill=PINK)
    
    img.save(f"{output_dir}/app-icon-512.png", "PNG")
    print(f"✅ App icon creado: {output_dir}/app-icon-512.png")
    return img

def create_feature_graphic():
    """Crear feature graphic 1024x500"""
    width, height = 1024, 500
    img = Image.new('RGB', (width, height), DARK_GREEN)
    draw = ImageDraw.Draw(img)
    
    # Fondo con gradiente sutil
    for y in range(height):
        color_value = int(45 + (y / height) * 10)
        draw.line([(0, y), (width, y)], fill=(color_value, color_value + 10, color_value))
    
    # Intentar cargar fuente, usar default si no existe
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 72)
        font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Texto principal
    title = "Mochi"
    subtitle = "Tu jardín de pareja"
    tagline = "🌸 Cultiva tu amor día a día"
    
    # Dibujar texto
    draw.text((60, 120), title, fill=CREAM, font=font_large)
    draw.text((60, 210), subtitle, fill=PINK, font=font_medium)
    draw.text((60, 280), tagline, fill=WHITE, font=font_small)
    
    # Dibujar panda pequeño decorativo a la derecha
    panda_x = 750
    panda_y = 250
    
    # Orejas
    draw.ellipse([panda_x - 60, panda_y - 80, panda_x - 20, panda_y - 40], fill=CREAM)
    draw.ellipse([panda_x + 20, panda_y - 80, panda_x + 60, panda_y - 40], fill=CREAM)
    
    # Cabeza
    draw.ellipse([panda_x - 70, panda_y - 50, panda_x + 70, panda_y + 90], fill=CREAM)
    
    # Ojos
    draw.ellipse([panda_x - 40, panda_y - 20, panda_x - 10, panda_y + 10], fill=(30, 40, 30))
    draw.ellipse([panda_x + 10, panda_y - 20, panda_x + 40, panda_y + 10], fill=(30, 40, 30))
    
    # Cuerpo
    draw.ellipse([panda_x - 60, panda_y + 60, panda_x + 60, panda_y + 180], fill=CREAM)
    
    # Corazón
    draw.ellipse([panda_x - 15, panda_y + 80, panda_x + 5, panda_y + 100], fill=PINK)
    draw.ellipse([panda_x - 5, panda_y + 80, panda_x + 15, panda_y + 100], fill=PINK)
    draw.polygon([(panda_x + 5, panda_y + 115), (panda_x - 15, panda_y + 95), 
                  (panda_x + 25, panda_y + 95)], fill=PINK)
    
    img.save(f"{output_dir}/feature-graphic-1024x500.png", "PNG")
    print(f"✅ Feature graphic creado: {output_dir}/feature-graphic-1024x500.png")
    return img

def create_screenshot(name, title, features, bg_color=DARK_GREEN):
    """Crear screenshot 1080x1920 (9:16)"""
    width, height = 1080, 1920
    img = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    # Intentar cargar fuentes
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 64)
        font_text = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
    except:
        font_title = ImageFont.load_default()
        font_text = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Título
    draw.text((width//2, 150), title, fill=CREAM, font=font_title, anchor="mm")
    
    # Línea decorativa
    draw.line([(200, 220), (width-200, 220)], fill=PINK, width=4)
    
    # Características
    y_pos = 350
    for feature in features:
        draw.text((100, y_pos), feature, fill=WHITE, font=font_text)
        y_pos += 100
    
    # Panda decorativo en la parte inferior
    panda_y = height - 300
    panda_x = width // 2
    
    # Cuerpo panda
    draw.ellipse([panda_x - 80, panda_y - 60, panda_x + 80, panda_y + 100], fill=CREAM)
    draw.ellipse([panda_x - 50, panda_y + 20, panda_x + 50, panda_y + 80], fill=WHITE)
    
    # Cabeza
    draw.ellipse([panda_x - 60, panda_y - 100, panda_x + 60, panda_y + 20], fill=CREAM)
    
    # Ojos
    draw.ellipse([panda_x - 35, panda_y - 60, panda_x - 10, panda_y - 35], fill=(30, 40, 30))
    draw.ellipse([panda_x + 10, panda_y - 60, panda_x + 35, panda_y - 35], fill=(30, 40, 30))
    
    # Corazón
    draw.ellipse([panda_x - 12, panda_y - 10, panda_x + 2, panda_y + 8], fill=PINK)
    draw.ellipse([panda_x - 2, panda_y - 10, panda_x + 12, panda_y + 8], fill=PINK)
    draw.polygon([(panda_x + 5, panda_y + 18), (panda_x - 12, panda_y + 2), 
                  (panda_x + 22, panda_y + 2)], fill=PINK)
    
    img.save(f"{output_dir}/{name}.png", "PNG")
    print(f"✅ Screenshot creado: {output_dir}/{name}.png")
    return img

# Crear todos los assets
print("🎨 Creando assets para Google Play...\n")

# 1. App Icon
create_app_icon()

# 2. Feature Graphic
create_feature_graphic()

# 3. Screenshots
create_screenshot(
    "screenshot-1-jardin",
    "🌱 Tu Jardín Virtual",
    ["• Planta semillas juntos", "• Mira crecer tu amor", "• Desbloquea flores especiales", "• Cada interacción cuenta"]
)

create_screenshot(
    "screenshot-2-chat",
    "💬 Chatea en Privado",
    ["• Mensajes directos", "• Stickers especiales", "• Notificaciones instantáneas", "• Solo tú y tu pareja"]
)

create_screenshot(
    "screenshot-3-juegos",
    "🎮 Juega y Conecta",
    ["• Juego de memoria", "• Retos divertidos", "• Preguntas para parejas", "• Gana bambú juntos"]
)

create_screenshot(
    "screenshot-4-cuestionarios",
    "📊 Conoce a tu Pareja",
    ["• Cuestionarios interactivos", "• Descubre qué piensa", "• Consejos personalizados", "• Fortalece tu vínculo"]
)

create_screenshot(
    "screenshot-5-racha",
    "🔥 Racha Semanal",
    ["• Mantén tu conexión", "• Celebra cada semana", "• No dejes que se apague", "• Cultivan su amor"]
)

print(f"\n✅ Todos los assets creados en: {output_dir}")
print("\n📋 Lista de archivos:")
print("  • app-icon-512.png (512x512)")
print("  • feature-graphic-1024x500.png (1024x500)")
print("  • screenshot-1-jardin.png (1080x1920)")
print("  • screenshot-2-chat.png (1080x1920)")
print("  • screenshot-3-juegos.png (1080x1920)")
print("  • screenshot-4-cuestionarios.png (1080x1920)")
print("  • screenshot-5-racha.png (1080x1920)")
