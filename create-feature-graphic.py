from PIL import Image, ImageDraw, ImageFont
import os

output_dir = "/Users/johanafragosoblendl/.verdent/verdent-projects/Mochi/google-play-assets"
os.makedirs(output_dir, exist_ok=True)

# Colores de tu app (basados en los screenshots)
DARK_PURPLE = (75, 54, 95)  # Color del header
LIGHT_PURPLE = (230, 220, 240)  # Fondo claro
PINK = (255, 150, 180)  # Rosa de acentos
WHITE = (255, 255, 255)
GREEN = (100, 180, 100)  # Verde del jardín

def create_feature_graphic():
    """Crear feature graphic 1024x500 con el estilo de Mochi"""
    width, height = 1024, 500
    img = Image.new('RGB', (width, height), DARK_PURPLE)
    draw = ImageDraw.Draw(img)
    
    # Fondo con gradiente suave
    for y in range(height):
        factor = y / height
        r = int(75 + factor * 20)
        g = int(54 + factor * 15)
        b = int(95 + factor * 25)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Intentar cargar fuentes del sistema
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 80)
        font_subtitle = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
    except:
        font_title = ImageFont.load_default()
        font_subtitle = ImageFont.load_default()
    
    # Título principal
    draw.text((60, 140), "Mochi", fill=WHITE, font=font_title)
    
    # Subtítulo
    draw.text((60, 240), "Tu jardín de pareja", fill=PINK, font=font_subtitle)
    
    # Dibujar panda estilo cartoon (similar al de tu app)
    panda_x = 780
    panda_y = 280
    
    # Orejas redondas
    ear_color = (40, 35, 40)
    draw.ellipse([panda_x - 70, panda_y - 130, panda_x - 25, panda_y - 85], fill=ear_color)
    draw.ellipse([panda_x + 25, panda_y - 130, panda_x + 70, panda_y - 85], fill=ear_color)
    
    # Cabeza redonda
    head_color = (255, 252, 245)
    draw.ellipse([panda_x - 75, panda_y - 80, panda_x + 75, panda_y + 70], fill=head_color)
    
    # Ojos grandes con lentes/ojos de cartoon
    eye_black = (40, 35, 40)
    draw.ellipse([panda_x - 50, panda_y - 40, panda_x - 15, panda_y - 5], fill=eye_black)
    draw.ellipse([panda_x + 15, panda_y - 40, panda_x + 50, panda_y - 5], fill=eye_black)
    
    # Brillo en ojos
    draw.ellipse([panda_x - 40, panda_y - 35, panda_x - 25, panda_y - 20], fill=WHITE)
    draw.ellipse([panda_x + 25, panda_y - 35, panda_x + 40, panda_y - 20], fill=WHITE)
    
    # Nariz pequeña
    draw.ellipse([panda_x - 8, panda_y + 5, panda_x + 8, panda_y + 18], fill=(80, 70, 80))
    
    # Mejillas rosadas
    cheek_color = (255, 180, 190)
    draw.ellipse([panda_x - 60, panda_y - 10, panda_x - 35, panda_y + 15], fill=cheek_color)
    draw.ellipse([panda_x + 35, panda_y - 10, panda_x + 60, panda_y + 15], fill=cheek_color)
    
    # Cuerpo
    draw.ellipse([panda_x - 65, panda_y + 50, panda_x + 65, panda_y + 180], fill=head_color)
    
    # Panza blanca
    draw.ellipse([panda_x - 40, panda_y + 80, panda_x + 40, panda_y + 150], fill=WHITE)
    
    # Corazón rosa en el pecho
    heart_y = panda_y + 100
    # Dos círculos para el corazón
    draw.ellipse([panda_x - 15, heart_y - 15, panda_x + 2, heart_y + 5], fill=PINK)
    draw.ellipse([panda_x - 2, heart_y - 15, panda_x + 15, heart_y + 5], fill=PINK)
    # Punta del corazón
    draw.polygon([(panda_x, heart_y + 18), 
                  (panda_x - 15, heart_y - 5),
                  (panda_x + 15, heart_y - 5)], fill=PINK)
    
    # Decoración: pequeñas flores alrededor
    flower_positions = [
        (150, 400), (200, 420), (950, 150), (1000, 180),
        (300, 100), (900, 400)
    ]
    
    for fx, fy in flower_positions:
        # Pétalos
        petal_color = (255, 200, 220)
        draw.ellipse([fx - 8, fy - 15, fx + 8, fy - 5], fill=petal_color)
        draw.ellipse([fx - 8, fy + 5, fx + 8, fy + 15], fill=petal_color)
        draw.ellipse([fx - 15, fy - 8, fx - 5, fy + 8], fill=petal_color)
        draw.ellipse([fx + 5, fy - 8, fx + 15, fy + 8], fill=petal_color)
        # Centro
        draw.ellipse([fx - 5, fy - 5, fx + 5, fy + 5], fill=(255, 220, 150))
    
    img.save(f"{output_dir}/feature-graphic-1024x500.png", "PNG")
    print(f"✅ Feature graphic creado: {output_dir}/feature-graphic-1024x500.png")
    return img

# También copiar el ícono existente al directorio
def copy_app_icon():
    from PIL import Image
    icon_path = "/Users/johanafragosoblendl/.verdent/verdent-projects/Mochi/public/icon-512.png"
    output_path = f"{output_dir}/app-icon-512.png"
    
    if os.path.exists(icon_path):
        img = Image.open(icon_path)
        # Asegurar que sea 512x512
        if img.size != (512, 512):
            img = img.resize((512, 512), Image.Resampling.LANCZOS)
        img.save(output_path, "PNG")
        print(f"✅ App icon copiado: {output_path}")
    else:
        print(f"❌ No se encontró el ícono en {icon_path}")

print("🎨 Creando assets para Google Play...\n")
copy_app_icon()
create_feature_graphic()

print("\n✅ Listo! Archivos en:", output_dir)
