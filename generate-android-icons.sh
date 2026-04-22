#!/bin/bash

# Script para generar íconos de Android desde el SVG base
# Requiere: ImageMagick (brew install imagemagick)

# Colores de la app
BACKGROUND="#2d3d2d"

# Crear directorios de Android
mkdir -p android/app/src/main/res/mipmap-mdpi
mkdir -p android/app/src/main/res/mipmap-hdpi
mkdir -p android/app/src/main/res/mipmap-xhdpi
mkdir -p android/app/src/main/res/mipmap-xxhdpi
mkdir -p android/app/src/main/res/mipmap-xxxhdpi
mkdir -p android/app/src/main/res/drawable-mdpi
mkdir -p android/app/src/main/res/drawable-hdpi
mkdir -p android/app/src/main/res/drawable-xhdpi
mkdir -p android/app/src/main/res/drawable-xxhdpi
mkdir -p android/app/src/main/res/drawable-xxxhdpi

# Tamaños de íconos del launcher
# mdpi: 48x48
# hdpi: 72x72
# xhdpi: 96x96
# xxhdpi: 144x144
# xxxhdpi: 192x192

echo "Generando íconos del launcher..."

# Usar el icon-512.png como base y redimensionar
if [ -f "public/icon-512.png" ]; then
    convert public/icon-512.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
    convert public/icon-512.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
    convert public/icon-512.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
    convert public/icon-512.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
    convert public/icon-512.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
    
    # Íconos redondeados (adaptive icons)
    convert public/icon-512.png -resize 108x108 android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
    convert public/icon-512.png -resize 162x162 android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
    convert public/icon-512.png -resize 216x216 android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
    convert public/icon-512.png -resize 324x324 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
    convert public/icon-512.png -resize 432x432 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
    
    echo "Íconos del launcher generados ✅"
else
    echo "❌ No se encontró public/icon-512.png"
fi

# Splash screen (9-patch o drawable)
echo "Generando splash screen..."

# Splash screen en diferentes tamaños
if [ -f "public/icon-512.png" ]; then
    # Crear fondo del splash
    convert -size 320x480 xc:"$BACKGROUND" android/app/src/main/res/drawable-mdpi/splash.png
    convert -size 480x800 xc:"$BACKGROUND" android/app/src/main/res/drawable-hdpi/splash.png
    convert -size 640x960 xc:"$BACKGROUND" android/app/src/main/res/drawable-xhdpi/splash.png
    convert -size 960x1600 xc:"$BACKGROUND" android/app/src/main/res/drawable-xxhdpi/splash.png
    convert -size 1280x1920 xc:"$BACKGROUND" android/app/src/main/res/drawable-xxxhdpi/splash.png
    
    # Añadir el ícono al centro del splash
    for dir in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
        size=""
        icon_size=""
        case $dir in
            mdpi) size="320x480"; icon_size="96x96" ;;
            hdpi) size="480x800"; icon_size="144x144" ;;
            xhdpi) size="640x960"; icon_size="192x192" ;;
            xxhdpi) size="960x1600"; icon_size="288x288" ;;
            xxxhdpi) size="1280x1920"; icon_size="384x384" ;;
        esac
        
        convert public/icon-512.png -resize $icon_size /tmp/icon_temp.png
        convert android/app/src/main/res/drawable-$dir/splash.png /tmp/icon_temp.png -gravity center -composite android/app/src/main/res/drawable-$dir/splash.png
    done
    
    echo "Splash screens generados ✅"
fi

echo ""
echo "🎉 Todos los recursos de Android han sido generados!"
echo ""
echo "Ahora puedes abrir Android Studio y construir tu app:"
echo "  npx cap open android"
