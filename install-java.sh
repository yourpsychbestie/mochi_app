#!/bin/bash

echo "☕ Instalando Java OpenJDK (GRATIS)"
echo "===================================="
echo ""

# Instalar Homebrew si no está instalado
if ! command -v brew &> /dev/null; then
    echo "📦 Instalando Homebrew primero..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Agregar Homebrew al PATH
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Instalar OpenJDK 17 (versión LTS gratuita)
echo "☕ Instalando OpenJDK 17 (gratis)..."
brew install openjdk@17

# Configurar Java en el sistema
echo "🔧 Configurando Java..."
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Agregar al PATH
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"

# Verificar instalación
echo ""
echo "✅ Verificando instalación..."
java -version

echo ""
echo "🎉 Java instalado correctamente!"
echo ""
echo "IMPORTANTE: Cierra y abre la Terminal para que los cambios surtan efecto"
echo ""
