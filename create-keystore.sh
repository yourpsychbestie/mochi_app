#!/bin/bash

# Script para crear el keystore y firmar la app Android
# Guarda ESTOS DATOS - son necesarios para actualizar la app en el futuro

echo "🐼 Mochi - Generador de Keystore"
echo "================================"
echo ""
echo "⚠️  IMPORTANTE: Guarda esta información en un lugar seguro"
echo "   Sin estos datos NO podrás actualizar tu app en el futuro"
echo ""

# Crear directorio para el keystore
mkdir -p android/keystore

# Variables - Puedes cambiar estos valores
KEYSTORE_FILE="android/keystore/mochi-release-key.jks"
KEY_ALIAS="mochi"
VALIDITY_DAYS=10000  # ~27 años

# Generar contraseñas aleatorias seguras (o usa las tuyas)
STORE_PASSWORD="MochiPanda2026!"
KEY_PASSWORD="MochiPanda2026!"

echo "📋 Información del Keystore:"
echo "   Archivo: $KEYSTORE_FILE"
echo "   Alias: $KEY_ALIAS"
echo "   Contraseña del almacén: $STORE_PASSWORD"
echo "   Contraseña de la clave: $KEY_PASSWORD"
echo ""

# Crear el keystore
echo "🔐 Creando keystore..."
keytool -genkey -v \
    -keystore $KEYSTORE_FILE \
    -alias $KEY_ALIAS \
    -keyalg RSA \
    -keysize 2048 \
    -validity $VALIDITY_DAYS \
    -storepass $STORE_PASSWORD \
    -keypass $KEY_PASSWORD \
    -dname "CN=Mochi App, OU=Mochi, O=Mochi Inc, L=Ciudad, ST=Estado, C=MX"

echo ""
echo "✅ Keystore creado exitosamente!"
echo ""

# Crear archivo de propiedades para Android Studio
cat > android/keystore.properties << EOF
storeFile=keystore/mochi-release-key.jks
storePassword=$STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

echo "📝 Archivo keystore.properties creado"
echo ""

# Crear archivo de referencia
cat > android/keystore/IMPORTANTE-LEER.txt << EOF
🐼 MOCHI - INFORMACIÓN DEL KEYSTORE
===================================

⚠️  GUARDA ESTE ARCHIVO EN UN LUGAR SEGURO
⚠️  SIN ESTOS DATOS NO PODRÁS ACTUALIZAR TU APP

Archivo del keystore: mochi-release-key.jks
Alias de la clave: $KEY_ALIAS
Contraseña del almacén: $STORE_PASSWORD
Contraseña de la clave: $KEY_PASSWORD

Ubicación: android/keystore/mochi-release-key.jks

¿Qué es esto?
-------------
Este keystore es la "firma digital" de tu app. Google Play usa esto para
verificar que tú eres el dueño de la app. Si pierdes este archivo o las
contraseñas, NO podrás actualizar tu app nunca más.

Recomendaciones:
----------------
1. Haz copias de seguridad en múltiples lugares (USB, nube, etc.)
2. No compartas estas contraseñas
3. Guarda este archivo junto con el .jks

Fecha de creación: $(date)
EOF

echo "📄 Archivo de referencia creado: android/keystore/IMPORTANTE-LEER.txt"
echo ""
echo "🎉 ¡Listo! Tu keystore está en: $KEYSTORE_FILE"
echo ""
echo "Próximo paso: Abre Android Studio y genera el APK firmado"
echo "   npx cap open android"
