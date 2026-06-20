# 🔐 Plan de Seguridad para Biblio

Para lograr que tu aplicación sea segura y privada (que no cualquiera pueda acceder a tus libros o utilizar tu despliegue), debemos abordar la seguridad desde dos enfoques según tus necesidades actuales y futuras. 

Como tu app es estática (HTML/CSS/JS corriendo en el navegador), podemos implementar una solución local muy rápida, o dar el salto a una solución profesional en la nube.

---

## 📌 Contexto Importante sobre IndexedDB (Tu estado actual)
Actualmente, la aplicación utiliza **IndexedDB** para almacenar los libros. Este almacenamiento es **100% local en tu navegador**:
- Si despliegas la aplicación en una URL pública (ej. GitHub Pages o Vercel) y otra persona accede a esa URL, **verá la app completamente vacía**.
- Nadie en internet puede ver los libros que agregas en tu teléfono o PC, ya que los datos nunca viajan por la red; se quedan en la memoria de almacenamiento interna del navegador de tu propio dispositivo.

Sin embargo, si quieres **evitar que cualquier persona que tome tu móvil (o que acceda a tu URL) pueda usar la aplicación**, o si quieres **sincronizar tus datos en la nube de forma segura**, aquí tienes el plan de acción:

---

## 🛡️ Opción 1: Pantalla de Bloqueo por PIN/Contraseña Local (La más rápida y sencilla)
Ideal si quieres mantener la aplicación estática en GitHub Pages (sin bases de datos en la nube), pero quieres evitar que un tercero que acceda a tu dispositivo o a tu URL privada pueda ver/usar tu catalogador.

### Cómo funciona:
1.  **Primer acceso**: La app detecta que no hay PIN configurado y te pide establecer un **PIN numérico o contraseña** (ej. "1234").
2.  **Cifrado local**: Almacenamos el hash criptográfico del PIN (usando la API nativa de JavaScript `SubtleCrypto`) de forma segura en el almacenamiento local.
3.  **Bloqueo**: Cada vez que se abra la aplicación (en móvil o PC), aparecerá una pantalla de bloqueo elegante pidiendo el PIN antes de renderizar la biblioteca o permitir registrar nada.

### Pros:
- ⚡ **Implementación inmediata**: Se puede añadir hoy mismo directamente sobre nuestro código actual (modificando `index.html` y `js/app.js`).
- 🆓 **100% gratuito y sin servidores**: No requiere registrarse en ningún servicio externo.

---

## ☁️ Opción 2: Autenticación en la Nube con Supabase / Firebase (La solución profesional y definitiva)
Si tu objetivo es poder iniciar sesión con tu usuario y contraseña (o con Google) desde tu móvil y tu ordenador, sincronizar los datos en la nube, y asegurar que **solo tú** puedas ver tus libros.

### Cómo funciona:
1.  **Backend "Serverless" gratuito**: Creamos un proyecto gratuito en **Supabase** (una alternativa de código abierto a Firebase basada en PostgreSQL).
2.  **Autenticación segura**: Añadimos un formulario de inicio de sesión / registro en la app. Supabase gestiona de forma segura el cifrado de contraseñas, tokens de sesión HTTPS y la seguridad del login.
3.  **Políticas de Seguridad a Nivel de Fila (RLS)**: En la base de datos de la nube, configuramos una regla estricta:
    *   *Regla*: Un usuario solo puede leer, añadir o modificar registros de la tabla `libros` si el campo `user_id` coincide con su identificador de sesión activa.
    *   *Resultado*: Aunque tu código fuente sea público en GitHub y tus claves de API de Supabase estén visibles, **es matemáticamente imposible** que alguien robe o acceda a tus datos sin tus credenciales.

### Pros:
- 🔄 **Sincronización multidispositivo**: Accedes a tu catálogo desde cualquier navegador iniciando sesión.
- 💾 **Respaldos permanentes**: No pierdes tus libros si borras el historial o cambias de móvil.
- 🔓 **Seguridad robusta**: Estándar de seguridad de la industria (cifrado JWT, tokens de sesión).

---

## 📋 Plan de Acción Recomendado

Te sugiero una transición en 2 pasos para no ralentizar tu uso:

### Paso 1: Implementar el Bloqueo de Acceso por PIN Local (Inmediato)
Añadimos una capa de autenticación local básica para que tu app desplegada en GitHub requiera una contraseña para abrirse. Esto protegerá el uso del frontend.

### Paso 2: Conexión con Supabase (Fase de Sincronización)
Cuando desees sincronización o base de datos en línea, integramos Supabase Auth y Database.

---

¿Qué opción prefieres que empecemos a implementar? 
Si te gusta la **Opción 1** para mantener el proyecto súper simple y offline pero con PIN de bloqueo, o si prefieres preparar la infraestructura para la **Opción 2 (Supabase)**. ¡Dime cuál es tu enfoque y nos ponemos a trabajar!
