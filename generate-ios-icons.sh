#!/bin/bash

# Script para generar íconos de iOS usando sips (nativo de Mac)

echo "🍎 Mochi - Generador de íconos para iOS"
echo "========================================"
echo ""

# Crear directorio de recursos de iOS
mkdir -p ios/App/App/Assets.xcassets/AppIcon.appiconset

# Archivo base
BASE_ICON="public/icon-512.png"

if [ ! -f "$BASE_ICON" ]; then
    echo "❌ No se encontró $BASE_ICON"
    exit 1
fi

echo "📱 Generando íconos para iPhone y iPad..."

# Función para redimensionar
resize_icon() {
    local input=$1
    local size=$2
    local output=$3
    sips -z $size $size "$input" --out "$output" > /dev/null 2>&1
}

# iPhone Notification
resize_icon $BASE_ICON 20 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-20.png"
resize_icon $BASE_ICON 40 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png"
resize_icon $BASE_ICON 60 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png"

# iPhone Settings
resize_icon $BASE_ICON 29 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-29.png"
resize_icon $BASE_ICON 58 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png"
resize_icon $BASE_ICON 87 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png"

# iPhone Spotlight
resize_icon $BASE_ICON 40 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-40.png"
resize_icon $BASE_ICON 80 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png"
resize_icon $BASE_ICON 120 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png"

# iPhone App
resize_icon $BASE_ICON 120 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png"
resize_icon $BASE_ICON 180 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png"

# iPad Notification
resize_icon $BASE_ICON 20 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-20-ipad.png"
resize_icon $BASE_ICON 40 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-20@2x-ipad.png"

# iPad Settings
resize_icon $BASE_ICON 29 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-29-ipad.png"
resize_icon $BASE_ICON 58 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-29@2x-ipad.png"

# iPad Spotlight
resize_icon $BASE_ICON 40 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-40-ipad.png"
resize_icon $BASE_ICON 80 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-40@2x-ipad.png"

# iPad App
resize_icon $BASE_ICON 76 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-76.png"
resize_icon $BASE_ICON 152 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-76@2x.png"

# iPad Pro App
resize_icon $BASE_ICON 167 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-83.5@2x.png"

# App Store
resize_icon $BASE_ICON 1024 "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-1024.png"

echo "📝 Creando Contents.json..."

cat > ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json << 'JSONEOF'
{
  "images" : [
    {
      "filename" : "Icon-20@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-20@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-29@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-29@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-40@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-40@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-60@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "60x60"
    },
    {
      "filename" : "Icon-60@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "60x60"
    },
    {
      "filename" : "Icon-20-ipad.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-20@2x-ipad.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-29-ipad.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-29@2x-ipad.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "filename" : "Icon-40-ipad.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-40@2x-ipad.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "40x40"
    },
    {
      "filename" : "Icon-76.png",
      "idiom" : "ipad",
      "scale" : "1x",
      "size" : "76x76"
    },
    {
      "filename" : "Icon-76@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "76x76"
    },
    {
      "filename" : "Icon-83.5@2x.png",
      "idiom" : "ipad",
      "scale" : "2x",
      "size" : "83.5x83.5"
    },
    {
      "filename" : "Icon-1024.png",
      "idiom" : "ios-marketing",
      "scale" : "1x",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSONEOF

echo ""
echo "✅ Íconos de iOS generados correctamente!"
echo "📁 Ubicación: ios/App/App/Assets.xcassets/AppIcon.appiconset/"
echo ""
echo "🎉 Listo para usar en Xcode!"
