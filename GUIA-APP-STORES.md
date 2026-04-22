# 🐼 Mochi - Guía de Publicación en App Stores

## ✅ Capacitor Instalado

Tu app ahora está configurada con Capacitor para convertirla en app nativa.

---

## 📁 Estructura del Proyecto

```
Mochi/
├── android/          ← Proyecto Android Studio
├── ios/              ← Proyecto Xcode
├── capacitor.config.json
└── package.json
```

---

## 🚀 Comandos Disponibles

### Desarrollo Web
```bash
npm start              # Iniciar servidor de desarrollo
npm run build          # Construir para producción
```

### Comandos Capacitor
```bash
npm run cap:sync              # Sincronizar web con nativo
npm run cap:open:ios          # Abrir proyecto en Xcode
npm run cap:open:android      # Abrir proyecto en Android Studio
npm run cap:build:ios         # Build completo iOS
npm run cap:build:android     # Build completo Android
```

---

## 📱 PUBLICAR EN GOOGLE PLAY STORE

### Requisitos previos:
1. Tener Android Studio instalado
2. Crear cuenta de desarrollador Google ($25 USD una vez)
   → https://play.google.com/console

### Pasos:

**1. Construir la app**
```bash
npm run build
npx cap sync android
```

**2. Abrir en Android Studio**
```bash
npx cap open android
```

**3. Generar APK/AAB firmado (en Android Studio):**
   - Menu: Build → Generate Signed Bundle/APK
   - Selecciona "Android App Bundle (.aab)" (recomendado)
   - Crea un nuevo keystore:
     * Key store path: `~/mochi-keystore.jks`
     * Password: (elige uno seguro)
     * Key alias: `mochi`
     * Key password: (puede ser igual al store)
   - Selecciona `release`
   - Click "Finish"

**4. Subir a Play Console:**
   - Ve a https://play.google.com/console
   - Crea nueva app
   - Sube el archivo `.aab` generado
   - Completa la ficha de la app (descripción, capturas, etc.)
   - Configura precio y distribución
   - Enviar a revisión

---

## 🍎 PUBLICAR EN APP STORE

### Requisitos previos:
1. Tener Xcode instalado (Mac obligatorio)
2. Cuenta de desarrollador Apple ($99 USD/año)
   → https://developer.apple.com

### Pasos:

**1. Construir la app**
```bash
npm run build
npx cap sync ios
```

**2. Abrir en Xcode**
```bash
npx cap open ios
```

**3. Configurar firma (en Xcode):**
   - Selecciona el proyecto "App" en el sidebar
   - Ve a "Signing & Capabilities"
   - Selecciona tu Team (cuenta de desarrollador)
   - Cambia Bundle Identifier si es necesario

**4. Archivar y subir:**
   - Menu: Product → Archive
   - Espera a que termine
   - En Organizer, selecciona el archive
   - Click "Distribute App"
   - Selecciona "App Store Connect"
   - Sigue los pasos y sube

**5. En App Store Connect:**
   - Ve a https://appstoreconnect.apple.com
   - Crea nueva app
   - Completa toda la información requerida
   - Selecciona el build subido
   - Enviar a revisión

---

## 🎨 Íconos y Recursos

Los íconos se generan automáticamente desde:
- `public/icon-192.png`
- `public/icon-512.png`
- `public/icon.svg`

Para mejores resultados, asegúrate de que tus íconos sean:
- Sin transparencia (fondo sólido)
- Forma cuadrada con esquinas redondeadas
- Mínimo 1024x1024 para el App Store

---

## ⚠️ Notas Importantes

1. **Firebase**: Verifica que tu configuración de Firebase funcione en móvil
2. **Storage**: Los datos se guardan localmente, pero si usas Firebase, necesitarás conexión
3. **Permisos**: La app no requiere permisos especiales

---

## 🆘 Solución de Problemas

### Error "dist not found"
```bash
npm run build
```

### Error de sincronización
```bash
npx cap sync
```

### Cambios no aparecen en móvil
```bash
npm run build && npx cap copy
```

---

## 📞 Siguientes Pasos

1. ✅ Probar la app en emulador/simulador
2. ✅ Probar en dispositivo físico
3. ✅ Crear cuentas de desarrollador
4. ✅ Preparar materiales de marketing (capturas de pantalla, descripción)
5. ✅ Subir y esperar aprobación

¡Éxito con tu publicación! 🐼💖
