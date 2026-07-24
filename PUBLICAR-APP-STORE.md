# 🍎 Cómo publicar Mochi en App Store

## Requisitos previos

- [ ] Mac con Xcode instalado
- [ ] Cuenta de Apple Developer activa ($99 USD/año)
- [ ] Bundle ID registrado: `com.mochi.app`
- [ ] App creada en App Store Connect
- [ ] Política de privacidad publicada en URL accesible (ej. Netlify)

## Build rápido

```bash
./build-ios.sh
```

Esto hace:
1. `npm install` si falta
2. `npm run build` (Vite)
3. `npx cap sync ios`

Luego abre Xcode:

```bash
npx cap open ios
```

## En Xcode

1. Selecciona el target **App**
2. Revisa que el **Bundle Identifier** sea `com.mochi.app`
3. Selecciona tu **Team** de Apple Developer
4. Conecta un iPhone físico o usa **Any iOS Device** para archive
5. **Product > Archive**
6. En **Organizer**, selecciona el archive y dale **Distribute App**
7. Sube a App Store Connect

## Notas para el revisor de Apple

Copia y pega esto en App Store Connect:

```
Estimados revisores de Apple,

Mochi es una aplicación diseñada exclusivamente para parejas que desean fortalecer su relación mediante ejercicios guiados, un jardín virtual compartido y comunicación privada.

CARACTERÍSTICAS PRINCIPALES:
- Chat privado entre parejas (1 a 1)
- Jardín virtual que crece con interacciones
- Ejercicios de terapia de pareja basados en evidencia
- Sistema de rachas para mantener la conexión

PARA PROBAR LA APP:
La app está diseñada para ser usada por DOS personas. Para fines de revisión, puede:
1. Crear una cuenta con un correo electrónico
2. El código de pareja se mostrará en pantalla
3. Use ese código para simular la conexión (o cree una segunda cuenta)

CONTENIDO:
- Clasificación: 4+ (para todos)
- Sin contenido violento, sexual y/o ofensivo
- Enfoque en bienestar emocional y relaciones saludables

PRIVACIDAD:
- Los mensajes solo son accesibles por la pareja conectada
- Datos almacenados en Firebase con encriptación
- No compartimos datos con terceros

Gracias por su revisión.
```

## Cuenta de demostración (opcional pero recomendada)

- Email: `reviewer@mochi.app`
- Contraseña: `[crea una temporal]`

Incluye estas credenciales en las notas para el revisor.

## Screenshots requeridas

- iPhone 6.7" (1290 x 2796)
- iPhone 6.5" (1284 x 2778)
- iPad 12.9" (2048 x 2732)

Máximo 10 por tamaño.

## Metadata

- **Nombre:** Mochi - Tu jardín de pareja
- **Subtítulo:** Fortalece tu relación día a día
- **Categoría:** Estilo de vida / Relaciones
- **Clasificación:** 4+

## Checklist final

- [ ] Build exitoso
- [ ] `npx cap sync ios` actualizado
- [ ] Sin `alert()` nativos
- [ ] Sin `console.log` en producción
- [ ] Política de privacidad online
- [ ] Screenshots listos
- [ ] Información bancaria en App Store Connect
- [ ] Build subida y enviada a revisión

---

¡Éxito con tu publicación! 🐼💖🍎
