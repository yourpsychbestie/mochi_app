#!/bin/bash
set -e

echo "🐼 Building Mochi for iOS..."

# Install deps if needed
if [ ! -d "node_modules/@capacitor/cli" ]; then
  echo "📦 Instalando dependencias..."
  npm install
fi

# Build web app
echo "🌐 Haciendo build web..."
npm run build

# Sync to iOS
echo "📱 Sincronizando con iOS..."
npx cap sync ios

echo "✅ Listo. Abre Xcode con:"
echo "   npx cap open ios"
echo ""
echo "🚀 En Xcode: Product > Archive y sube a App Store Connect."
