# 📚 Biblio - Gestor de Libros Personal (PWA)

¡Bienvenido a **Biblio**! Una aplicación web modular, elegante y ultra-ligera diseñada para catalogar y gestionar tu colección de libros directamente en tu bolsillo o en la nube. 

Esta aplicación está optimizada para dispositivos móviles y de escritorio como una **Progressive Web App (PWA)**, lo que te permite instalarla en la pantalla de inicio de tu teléfono inteligente y utilizarla sin conexión.

---

## 🚀 Características Clave
- **Capture por ISBN (Cámara / Foto / Teclado)**: Escanea el código de barras (EAN-13 / ISBN) directamente usando la cámara trasera del móvil o subiendo una foto clara del código de barras.
- **Autocompletado Inteligente**: Consulta de forma automática las APIs de **Google Books** y **Open Library** para recuperar al instante el título, autor, editorial, año de publicación, sinopsis y portada del libro.
- **Detalles Personalizados**: Registra el *Precio de compra*, un *Precio estimado de venta* (para coleccionistas o revendedores) y la *Fecha de compra*.
- **Carga de Fotos Reales**: Añade múltiples fotos del estado físico de tu propio libro para mantener un registro visual exacto de tu colección.
- **Estadísticas en Tiempo Real**: Visualiza el total de libros en tu biblioteca, tu inversión total (gasto en compras) y el valor estimado de venta.
- **Búsqueda e Historial**: Filtra y busca instantáneamente por título, autor o ISBN, y ordena tu catálogo por fecha de adición, título o valor.
- **Base de Datos Local (IndexedDB)**: Todos tus datos y fotos se almacenan de manera permanente y segura en tu dispositivo, sin necesidad de un backend o servidor.
- **Soporte Offline Completo**: Gracias a su Service Worker, la aplicación se inicia instantáneamente y funciona incluso sin conexión a internet.

---

## 📂 Estructura Limpia del Proyecto
```text
Biblio/
├── index.html            # Interfaz de usuario principal (HTML5 estructurado, Tailwind CSS y Lucide Icons)
├── manifest.json         # Archivo de configuración PWA para instalación en móviles
├── sw.js                 # Service Worker para almacenamiento en caché y soporte Offline
└── js/
    ├── app.js            # Inicializador principal y coordinador de eventos de la aplicación
    ├── api.js            # Cliente para consultas a Google Books y Open Library APIs
    ├── scanner.js        # Integración con html5-qrcode para el escaneo en vivo o desde foto
    └── storage.js        # Capa de datos local utilizando la base de datos IndexedDB
```

---

## 🛠️ Cómo Probar la Aplicación Localmente

Debido a que los navegadores exigen protocolos de seguridad (HTTPS) y bloquean ciertas peticiones locales por seguridad (CORS en Service Workers), es muy recomendable levantar un servidor local sencillo para probarla:

### Opción A: Extensión de VS Code (La más fácil)
1. Instala la extensión **Live Server** en VS Code.
2. Abre `index.html` y haz clic en el botón **"Go Live"** en la barra de estado inferior.
3. La aplicación se abrirá automáticamente en tu navegador predeterminado (normalmente en `http://127.0.5.1:5500`).

### Opción B: Usando Python (Preinstalado en tu máquina)
Ejecuta el siguiente comando en tu terminal dentro de la carpeta del proyecto:
```bash
python -m http.server 8000
```
Luego abre tu navegador en `http://localhost:8000`.

---

## ☁️ Cómo Desplegar la Aplicación (100% Gratis)

Para utilizar el escáner de cámara trasera en tu teléfono móvil, **es obligatorio desplegar la app bajo HTTPS**. Aquí tienes las mejores plataformas gratuitas para desplegarla en menos de 2 minutos:

### 1. GitHub Pages (Recomendado)
Como ya tienes un repositorio de Git listo, sigue estos pasos:
1. Sube todos los archivos a tu repositorio de GitHub.
2. Ve a la pestaña **Settings** (Configuración) de tu repositorio.
3. En el menú lateral izquierdo, haz clic en **Pages**.
4. En la sección **Build and deployment**, selecciona la rama `main` (o `master`) y la carpeta `/root`. Haz clic en **Save**.
5. ¡Listo! En un par de minutos, GitHub te dará un enlace HTTPS del tipo `https://tu-usuario.github.io/biblio/`.

### 2. Vercel
1. Ve a [vercel.com](https://vercel.com/) y regístrate con tu cuenta de GitHub.
2. Haz clic en **Add New** > **Project**.
3. Importa tu repositorio de `biblio`.
4. Haz clic en **Deploy**. Tendrás un subdominio `.vercel.app` seguro con HTTPS al instante.

### 3. Netlify
1. Ve a [netlify.com](https://netlify.com/) e inicia sesión.
2. Arrastra la carpeta de tu proyecto directamente a la sección de carga rápida de su dashboard o conéctalo con GitHub.
3. En segundos tendrás un enlace activo y seguro.

---

## 🚀 Próximas Actualizaciones y Escalabilidad
El diseño modular de **Biblio** permite expandir la aplicación de forma natural:
- **Sincronización Cloud**: Se puede modificar `js/storage.js` para sincronizar los libros locales con un backend NoSQL o BaaS como **Supabase** o **Firebase**, permitiendo el inicio de sesión del usuario.
- **Exportar/Importar**: Añadir funciones para exportar toda tu biblioteca en formato JSON o CSV.
- **Lectura**: Añadir campos para marcar libros como "Leídos", "Leyendo", o "Por Leer", junto con puntuaciones por estrellas.
