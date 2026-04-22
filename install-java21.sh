#!/bin/bash

echo "☕ Instalando Java 21 (OpenJDK)"
echo "================================"
echo ""

# Descargar OpenJDK 21
echo "📥 Descargando OpenJDK 21..."
cd /tmp
curl -L -o openjdk-21_macos-aarch64_bin.tar.gz "https://download.java.net/openjdk/jdk21/ri/openjdk-21+35_macos-aarch64_bin.tar.gz"

# Extraer
echo "📦 Extrayendo..."
tar -xzf openjdk-21_macos-aarch64_bin.tar.gz

# Mover a /Library/Java
echo "📁 Instalando..."
sudo mkdir -p /Library/Java/JavaVirtualMachines
sudo mv jdk-21.jdk /Library/Java/JavaVirtualMachines/

# Configurar variables de entorno
echo "🔧 Configurando..."
echo 'export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home' >> ~/.zshrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.zshrc

# Aplicar cambios
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH

# Verificar
echo ""
echo "✅ Verificando instalación..."
java -version

echo ""
echo "🎉 Java 21 instalado correctamente!"
echo ""
echo "IMPORTANTE: Cierra y abre la Terminal para que los cambios surtan efecto"
