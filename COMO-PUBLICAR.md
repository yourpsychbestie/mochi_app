# 🐼 Cómo publicar Mochi como app móvil

## PASO 1 — Subir gratis a Netlify (5 minutos)

1. Ve a **netlify.com** → crea cuenta gratis
2. En la terminal de VS Code corre:
   ```
   npm run build
   ```
   Esto crea una carpeta `dist/` con la app lista
3. En Netlify, arrastra la carpeta `dist/` al área que dice  
   **"Drag and drop your site folder here"**
4. ¡Listo! Te da un link como `mochi-pandas.netlify.app`

---

## PASO 2 — Instalar en el celular como app

### iPhone (Safari):
1. Abre el link en **Safari** (no Chrome)
2. Toca el botón de compartir **⎙**
3. Toca **"Agregar a pantalla de inicio"**
4. Ponle nombre **Mochi** → **Agregar**
5. Aparece el ícono del panda en tu pantalla 🐼

### Android (Chrome):
1. Abre el link en **Chrome**
2. Toca el menú **⋮**
3. Toca **"Agregar a pantalla de inicio"** o  
   aparece un banner automático "Instalar app"
4. ¡Listo!

---

## Dominio propio (opcional)

Si quieres `miapp.com` en vez de `netlify.app`:
- En Netlify → **Domain settings** → **Add custom domain**
- Compra un dominio en Namecheap (~$10/año)

---

## ¿Cómo funciona offline?

Mochi tiene un Service Worker instalado que guarda la app  
en el celular. Una vez instalada, **funciona sin internet**.  
Los datos se guardan localmente en el dispositivo.
