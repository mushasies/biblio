# 📚 Plan Biblio - Análisis Completo del Proyecto

---

## 📋 Índice

1. [Propósito y Visión General](#1-propósito-y-visión-general)
2. [Arquitectura Técnica](#2-arquitectura-técnica)
3. [Componentes Principales](#3-componentes-principales-y-sus-funciones)
4. [Flujo de Usuario](#4-flujo-de-usuario)
5. [Base de Datos y Almacenamiento](#5-base-de-datos-y-almacenamiento)
6. [Integraciones Externas](#6-integraciones-externas)
7. [Relación Usuario - Aplicación](#7-relación-usuario---aplicación)
8. [Estado Actual y Problemas Conocidos](#8-estado-actual-y-problemas-conocidos)
9. [Elementos del Proyecto](#9-elementos-que-debería-tener)
10. [Resumen Ejecutivo](#10-resumen-ejecutivo)

---

---

## 1. PROPÓSITO Y VISIÓN GENERAL

**Biblio** es una **Progressive Web App (PWA)** diseñada como un **gestor personal de colecciones de libros** para coleccionistas, lectores y potencialmente revendedores. Su valor principal radica en:

- **Catalogación inteligente**: Registro de libros mediante escaneo de ISBN (cámara/foto) o introducción manual
- **Enriquecimiento automático**: Consulta de metadatos (título, autor, editorial, año, sinopsis y portada) desde APIs externas (Google Books, Open Library)
- **Gestión personalizada**: Registra el Precio de compra, Precio estimado de venta y Fecha de compra
- **Captura de fotos adicionales**: Múltiples fotos del estado físico del libro
- **Estadísticas en Tiempo Real**: Total de libros, inversión total, valor estimado de venta
- **Búsqueda e Historial**: Filtra por título, autor, editorial o ISBN
- **Base de Datos Local**: IndexedDB para almacenamiento permanente en el dispositivo
- **Soporte Offline Completo**: Service Worker para funcionamiento sin conexión

**Público objetivo:** Coleccionistas de libros, vendedores de segunda mano, lectores que quieren llevar un inventario organizado.

---

---

## 2. ARQUITECTURA TÉCNICA

Biblio/
├── index.html              # Interfaz principal (HTML5 + Tailwind CSS CDN)
├── manifest.json           # Configuración PWA (iconos, nombre, theme color)
├── sw.js                   # Service Worker para caching y modo offline
├── SUPABASE_SETUP.sql      # SQL para tabla libros (public.books)
├── SUPABASE_USERS_SETUP.sql # SQL para tabla usuarios (users/perfiles)
└── js/
    ├── app.js              # Nucleo: Orquestador, UI, eventos, navegación
    ├── api.js              # Cliente para Google Books y Open Library APIs
    ├── auth.js             # Autenticación (login/registro) + gestión Supabase
    ├── users.js            # Lógica de usuarios (CRUD, hash contraseñas, roles)
    ├── storage.js          # Almacenamiento local (IndexedDB) + sincronización Supabase
    └── scanner.js          # Escaneo de códigos de barras (html5-qrcode)

**Tecnologías usadas:**
- Frontend: HTML5, Tailwind CSS (CDN), Lucide Icons, Vanilla JS (ES6+)
- Backend: Supabase (PostgreSQL + Autenticación personalizada)
- PWA: Service Worker, Manifest
- APIs externas: Google Books API, Open Library API
- Escaneo: html5-qrcode library
- Almacenamiento local: IndexedDB (para modo offline)

---

---

## 3. COMPONENTES PRINCIPALES Y SUS FUNCIONES

| Componente | Responsabilidad | Estado |
|------------|------------------|--------|
| index.html | Estructura visual completa: header, dashboard, lista libros, modales (añadir, detalles, auth, config) | Implementado |
| app.js | Lógica central: inicialización, navegación entre vistas, manejo de modales, renderizado de libros, búsquedas, ordenación | Implementado |
| api.js | Consultas a Google Books y Open Library para obtener datos de libros por ISBN | Implementado |
| scanner.js | Integración con html5-qrcode para escaneo por cámara o foto | Implementado |
| storage.js | CRUD de libros en IndexedDB + sincronización con Supabase | Implementado |
| auth.js | Autenticación (login/registro), gestión de sesiones, conexión con Supabase | Implementado |
| users.js | Lógica de negocio de usuarios: registro, login, roles (admin/user), gestión | Implementado |
| sw.js | Service Worker para caching de assets y soporte offline | Implementado |
| manifest.json | Configuración PWA para instalación en dispositivos | Implementado |

---

---

## 4. FLUJO DE USUARIO PRINCIPAL

Splash Screen → Autenticación (Login/Registro) → Interfaz Principal (Dashboard, Buscador, Lista de Libros) → Modales (Añadir, Detalles, Configuración)

**Acciones clave:** Escanear ISBN, añadir manual, buscar, ver/editar/eliminar libro, configurar Supabase

---

---

## 5. BASE DE DATOS Y ALMACENAMIENTO

### Supabase (Cloud)

**Tabla libros (public.books o libros):**
- id (BIGINT, primary key, identity)
- user_id (UUID, referencia a auth.users)
- titulo (TEXT, not null)
- autor (TEXT)
- isbn (TEXT)
- editorial (TEXT)
- anio (TEXT)
- descripcion (TEXT)
- portada_url (TEXT)
- precio_compra (NUMERIC(10,2))
- precio_venta (NUMERIC(10,2))
- fecha_compra (DATE)
- real_photos (TEXT[] - array de imágenes Base64)
- fecha_registro (TIMESTAMP, default NOW())

**Tabla perfiles (o users - PROBLEMA ACTUAL):**
- id (UUID, primary key, gen_random_uuid())
- email (TEXT, not null, unique)
- password_hash (TEXT, not null) - SHA-256
- role (TEXT, default user) - user o admin
- created_at (TIMESTAMP, default NOW())

**Índices:** idx_books_user_id, idx_users_email
**RLS:** Activado con políticas de acceso por usuario

### Local (IndexedDB)
- Propósito: funcionamiento 100% offline
- Estructura: similar a books pero almacenado localmente
- Sincronización: storage.js maneja sincronización bidireccional con Supabase

---

---

## 6. INTEGRACIONES EXTERNAS

| Servicio | Propósito | Implementación |
|----------|-----------|----------------|
| Google Books API | Metadatos de libros | api.js |
| Open Library API | Metadatos alternativo | api.js |
| html5-qrcode | Escaneo ISBN | scanner.js |
| Supabase | Backend (PostgreSQL) | auth.js, users.js, storage.js |
| Tailwind CSS | Estilos | CDN en index.html |
| Lucide Icons | Iconos | CDN en index.html |

---

---

## 7. RELACIÓN USUARIO - APLICACIÓN

### Casos de uso:
- Registrarse (email+password)
- Iniciar sesión
- Añadir libro por escaneo (cámara/foto) o manual
- Buscar ISBN manualmente
- Ver/Editar/Eliminar detalles de libro
- Configurar Supabase
- Trabajar offline

**UX:** Diseño móvil primero, feedback visual, error handling claro, persistencia de datos

---

---

## 8. ESTADO ACTUAL Y PROBLEMAS CONOCIDOS

### Funciona:
- Interfaz completa y responsive
- Escaneo de códigos de barras
- Búsqueda en APIs externas
- Almacenamiento local (IndexedDB)
- PWA: instalable, caching, offline
- Autenticación básica
- Gestión de libros (CRUD)

### Problemas:

| Problema | Causa | Solución | Estado |
|----------|-------|----------|--------|
| Error registro usuario | Tabla users no existe, existe perfiles | Cambiar users→perfiles en código | Hecho |
| Inconsistencia tabla usuarios | SQL crea users, BD tiene perfiles | Alinear nombres | Pendiente confirmar campos |
| Seguridad SERVICE KEY | Expuesta en frontend | Advertencias en código | Solución temporal |
| Nombre tabla libros | SQL crea books, código usa libros | Verificar consistencia | Pendiente |

### Inconsistencias:
1. Nombres de tablas: código usa libros vs public.books en SQL
2. Tabla usuarios: SQL crea users, usuario tiene perfiles, código ahora apunta a perfiles
3. Campos: código asume (id, email, password_hash, role, created_at) en perfiles

---

---

## 9. ELEMENTOS QUE DEBERÍA TENER

| Elemento | Descripción | Estado |
|----------|-------------|--------|
| Autenticación | Login/Registro email+password | Implementado |
| Gestión de libros | CRUD completo | Implementado |
| Escaneo ISBN | Cámara + foto + teclado | Implementado |
| Búsqueda API | Google Books + Open Library | Implementado |
| Almacenamiento | IndexedDB + Supabase | Implementado |
| PWA | Manifest + Service Worker | Implementado |
| Dashboard | Estadísticas | Implementado |
| Filtros/Búsqueda | Por título, autor, editorial, ISBN | Implementado |
| Ordenación | Por fecha, título, autor, precio | Implementado |
| Fotos reales | Captura y almacenamiento | Implementado |
| Roles | Admin vs usuario normal | Implementado |
| Sincronización | Local ↔ Cloud | Parcial |

---

---

## 10. RESUMEN EJECUTIVO

Biblio es una PWA para gestión de colecciones de libros que permite catalogar libros escaneando ISBN o manualmente, enriquecer con datos de APIs, personalizar con precios y fotos, visualizar estadísticas, trabajar offline y sincronizar en la nube con Supabase.

Arquitectura: Frontend puro (HTML/CSS/JS) + Supabase (backend opcional) + APIs externas

Tecnologías clave: PWA, Tailwind CSS, Supabase, IndexedDB, html5-qrcode

Problema actual: Inconsistencia en nombre de tabla de usuarios (users en SQL vs perfiles en BD). Solución aplicada: código ahora usa perfiles. Pendiente: confirmar que perfiles tiene los campos correctos (id, email, password_hash, role, created_at).

Pendiente: Verificar consistencia entre books/libros en todas las referencias.

---

*Documento generado el 02/07/2026*
