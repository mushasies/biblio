// =============================================
// APP - LOGICA PRINCIPAL
// =============================================

const app = {
    supabase: null,
    currentUser: null,
    libros: [],
    bibliotecas: [],
    currentBibliotecaId: null,
    isAdmin: false,

    // =============================================
    // INICIALIZACION
    // =============================================

    async init() {
        console.log('app.init() - Iniciando...');
        try {
            // Escuchar evento para mostrar modal de configuración de Supabase
            document.addEventListener('showSupabaseConfig', () => {
                // Ocultar todos los modales primero
                this.closeAuthModal();
                this.closeSupabaseConfigModal();
                this.closeAddBookModal();
                this.closeDetailModal();
                // Luego mostrar el de configuración de Supabase
                this.showSupabaseConfigModal();
            });
            
            // Escuchar eventos de cambio de autenticación desde auth.js
            // SOLAMENTE para cuando hay usuario (login/registro exitoso)
            document.addEventListener('authChange', async (e) => {
                console.log('Evento authChange recibido:', e.detail);
                if (e.detail && e.detail.user) {
                    console.log('authChange: Usuario autenticado detectado');
                    this.currentUser = e.detail.user;
                    console.log('Usuario detectado, ejecutando onUserAuthenticated');
                    await this.onUserAuthenticated(e.detail.user);
                } else {
                    // NO mostrar modal de auth aquí - el flujo se controla en init()
                    console.log('authChange: Ningún usuario. Flujos de modales controlados manualmente.');
                }
            });
            
            // Inicializar Supabase
            await this.initSupabase();
            
            // Verificar que auth esté disponible
            if (typeof auth === 'undefined' || auth === null) {
                console.error('ERROR: auth no está definido. Esperando...');
                await new Promise(resolve => setTimeout(resolve, 500));
                if (typeof auth === 'undefined' || auth === null) {
                    throw new Error('auth no está disponible después de esperar');
                }
            }
            console.log('app.init() - auth disponible:', typeof auth);
            
            // Inicializar auth (esto también inicializa el cliente de Supabase en auth.js)
            // NOTA: auth.init() puede disparar el evento showSupabaseConfig si no hay URL
            await auth.init();
            
            // Usar el cliente de auth si está disponible
            if (auth.getClient()) {
                this.supabase = auth.getClient();
            }

            // Escuchar cambios de autenticacion
            this.setupAuthListeners();

            // Cargar configuracion guardada
            await this.loadConfig();

            // FLUJO DE INICIO CONTROLADO: Primero Supabase, luego autenticación
            const supabaseUrl = localStorage.getItem('supabaseUrl');
            const supabaseAnonKey = localStorage.getItem('supabaseAnonKey');
            const user = auth.getUser();
            
            console.log('app.init() - Estado: Supabase URL=', !!supabaseUrl, 'AnonKey=', !!supabaseAnonKey, 'User=', !!user);
            
            // Prioridad 1: Si no hay configuración de Supabase, mostrar modal de configuración
            if (!supabaseUrl || !supabaseAnonKey) {
                console.log('app.init() - No hay configuración de Supabase, mostrando modal de configuración');
                if (typeof hideSplashScreen === 'function') {
                    hideSplashScreen();
                }
                // Asegurar que todos los modales están cerrados
                this.closeAuthModal();
                this.closeSupabaseConfigModal();
                this.closeAddBookModal();
                this.closeDetailModal();
                this.showSupabaseConfigModal();
                return; // Salir aquí - no continuar
            }
            
            // Prioridad 2: Si hay usuario autenticado
            if (user) {
                console.log('app.init() - Usuario autenticado encontrado, inicializando...');
                this.currentUser = user;
                await this.onUserAuthenticated(user);
            } else {
                // Prioridad 3: Hay Supabase configurado pero no usuario - mostrar modal de auth
                console.log('app.init() - Supabase configurado pero no hay usuario, mostrando modal de auth');
                if (typeof hideSplashScreen === 'function') {
                    hideSplashScreen();
                }
                // Asegurar que todos los modales están cerrados
                this.closeAuthModal();
                this.closeSupabaseConfigModal();
                this.closeAddBookModal();
                this.closeDetailModal();
                this.showAuthModal();
            }

        } catch (error) {
            console.error('Error al inicializar la app:', error);
            alert('Error al inicializar la aplicacion: ' + error.message);
        }
    },

    async initSupabase() {
        const config = this.loadSupabaseConfig();
        if (config.url && config.anonKey) {
            this.supabase = supabase.createClient(config.url, config.anonKey);
        } else {
            this.showSupabaseConfigModal();
            // Esperar a que se configure (con timeout de seguridad)
            await new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (this.supabase) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
                // Timeout de 30 segundos por si el usuario no configura
                setTimeout(() => {
                    clearInterval(interval);
                    resolve();
                }, 30000);
            });
        }
    },

    loadSupabaseConfig() {
        const url = localStorage.getItem('supabaseUrl');
        const anonKey = localStorage.getItem('supabaseAnonKey');
        return { url, anonKey };
    },

    setupAuthListeners() {
        // Como estamos usando el sistema de autenticación personalizado (auth.js),
        // no necesitamos escuchar los eventos nativos de Supabase auth
        // Los eventos de auth ya se manejan a través del listener 'authChange'
        console.log('setupAuthListeners() - Usando sistema de autenticación personalizado');
    },

    // =============================================
    // AUTENTICACION
    // =============================================

    async onUserAuthenticated(user) {
        console.log('onUserAuthenticated llamado con usuario:', user);
        this.currentUser = user;

        // Asegurar que app.supabase esté disponible usando el cliente de auth si es necesario
        if (!this.supabase && typeof auth !== 'undefined' && auth.getClient) {
            this.supabase = auth.getClient();
            console.log('app.supabase obtenido de auth.getClient()');
        }
        console.log('app.supabase disponible:', !!this.supabase);
        console.log('app.currentUser establecido:', this.currentUser);

        // Obtener perfil del usuario (proteger contra errores si no hay tabla de perfiles)
        let perfil = null;
        try {
            const perfilResult = await obtenerPerfil();
            perfil = perfilResult.data;
            console.log('Perfil obtenido:', perfil);
        } catch (error) {
            console.warn('No se pudo obtener perfil:', error.message);
            // Continuar sin perfil si hay error
        }
        
        this.isAdmin = perfil?.es_admin || false;
        console.log('isAdmin:', this.isAdmin);

        // Cargar bibliotecas
        await this.cargarBibliotecas();
        console.log('Bibliotecas cargadas:', this.bibliotecas);

        // Cargar libros de la primera biblioteca
        if (this.bibliotecas.length > 0) {
            this.currentBibliotecaId = this.bibliotecas[0].id;
            await this.cargarLibros();
            console.log('Libros cargados:', this.libros.length);
        } else {
            console.log('No hay bibliotecas para cargar libros');
        }

        this.updateUIForAuthState();
        console.log('UI actualizada para estado de autenticación');
    },

    updateUIForAuthState() {
        const appContent = document.getElementById('app-content');
        const authModal = document.getElementById('auth-modal');

        console.log('updateUIForAuthState - currentUser:', this.currentUser, 'appContent:', !!appContent, 'authModal:', !!authModal);
        console.log('app-content classList antes:', appContent?.classList.value);
        console.log('auth-modal classList antes:', authModal?.classList.value);

        if (this.currentUser) {
            // Usuario autenticado
            if (appContent) {
                appContent.classList.remove('hidden');
                console.log('Mostrando app-content, hidden removido');
            }
            if (authModal) {
                authModal.classList.add('hidden');
                console.log('Ocultando auth-modal, hidden añadido');
            }
        } else {
            // No autenticado
            if (appContent) {
                appContent.classList.add('hidden');
                console.log('Ocultando app-content, hidden añadido');
            }
            if (authModal) {
                authModal.classList.remove('hidden');
                console.log('Mostrando auth-modal, hidden removido');
            }
        }
        
        console.log('app-content classList después:', appContent?.classList.value);
        console.log('auth-modal classList después:', authModal?.classList.value);
    },

    showAuthModal(tab = 'login') {
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.classList.remove('hidden');
            this.switchAuthTab(tab);
        }
    },

    closeAuthModal() {
        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.classList.add('hidden');
    },

    // Manejadores de submit para formularios de autenticación
    async handleLoginSubmit(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            alert('Por favor, completa todos los campos');
            return;
        }
        
        try {
            if (typeof auth === 'undefined' || !auth.signIn) {
                alert('Error: Sistema de autenticación no disponible');
                return;
            }
            
            const user = await auth.signIn(email, password);
            this.currentUser = user;
            
            // Asegurar que app.supabase esté disponible
            if (!this.supabase && typeof auth !== 'undefined' && auth.getClient) {
                this.supabase = auth.getClient();
            }
            
            await this.onUserAuthenticated(user);
            this.closeAuthModal();
            this.updateUIForAuthState();
            
            // Disparar evento authChange para consistencia
            document.dispatchEvent(new CustomEvent('authChange', { 
                detail: { user: user, session: user } 
            }));
            
        } catch (error) {
            console.error('Error en login:', error.message);
            alert('Error al iniciar sesión: ' + error.message);
        }
    },

    async handleSignupSubmit(event) {
        event.preventDefault();
        
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        
        if (!email || !password) {
            alert('Por favor, completa todos los campos');
            return;
        }
        
        if (password.length < 6) {
            alert('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        
        try {
            if (typeof auth === 'undefined' || !auth.signUp) {
                alert('Error: Sistema de autenticación no disponible');
                return;
            }
            
            const user = await auth.signUp(email, password);
            this.currentUser = user;
            
            // Asegurar que app.supabase esté disponible
            if (!this.supabase && typeof auth !== 'undefined' && auth.getClient) {
                this.supabase = auth.getClient();
            }
            
            await this.onUserAuthenticated(user);
            this.closeAuthModal();
            this.updateUIForAuthState();
            
            // Disparar evento authChange para consistencia
            document.dispatchEvent(new CustomEvent('authChange', { 
                detail: { user: user, session: user } 
            }));
            
        } catch (error) {
            console.error('Error en registro:', error.message);
            alert('Error al registrar usuario: ' + error.message);
        }
    },

    switchAuthTab(tab) {
        const loginBtn = document.getElementById('auth-tab-btn-login');
        const signupBtn = document.getElementById('auth-tab-btn-signup');
        const loginContent = document.getElementById('auth-tab-content-login');
        const signupContent = document.getElementById('auth-tab-content-signup');

        if (tab === 'login') {
            loginBtn?.classList.add('border-primary-500', 'text-primary-600');
            loginBtn?.classList.remove('border-transparent', 'text-slate-500');
            signupBtn?.classList.add('border-transparent', 'text-slate-500');
            signupBtn?.classList.remove('border-primary-500', 'text-primary-600');
            loginContent?.classList.add('active');
            signupContent?.classList.remove('active');
        } else {
            signupBtn?.classList.add('border-primary-500', 'text-primary-600');
            signupBtn?.classList.remove('border-transparent', 'text-slate-500');
            loginBtn?.classList.add('border-transparent', 'text-slate-500');
            loginBtn?.classList.remove('border-primary-500', 'text-primary-600');
            signupContent?.classList.add('active');
            loginContent?.classList.remove('active');
        }
    },

    // Manejadores de submit para formularios de autenticación
    async handleLoginSubmit(event) {
        event.preventDefault();
        console.log('handleLoginSubmit: Manejo de submit de login');
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        console.log('handleLoginSubmit: Email a autenticar:', email);
        
        if (!email || !password) {
            console.log('handleLoginSubmit: Campos incompletos');
            alert('Por favor, completa todos los campos');
            return;
        }
        
        try {
            // Verificar que auth esté disponible
            if (typeof auth === 'undefined' || !auth.signIn) {
                console.error('handleLoginSubmit: auth no está disponible o no tiene método signIn');
                alert('Error: Sistema de autenticación no disponible');
                return;
            }
            
            console.log('handleLoginSubmit: Intentando iniciar sesión...');
            const user = await auth.signIn(email, password);
            console.log('handleLoginSubmit: Login exitoso, usuario:', user);
            
            // Actualizar usuario actual
            this.currentUser = user;
            console.log('handleLoginSubmit: currentUser establecido');
            
            // Asegurar que el cliente Supabase esté disponible
            if (!this.supabase && typeof auth !== 'undefined' && auth.getClient) {
                this.supabase = auth.getClient();
                console.log('handleLoginSubmit: app.supabase obtenido de auth');
            }
            
            // Llamar a onUserAuthenticated para cargar datos
            console.log('handleLoginSubmit: Llamando a onUserAuthenticated');
            await this.onUserAuthenticated(user);
            console.log('handleLoginSubmit: onUserAuthenticated completado');
            
            // Cerrar modal de auth y actualizar UI
            console.log('handleLoginSubmit: Cerrando modal y actualizando UI');
            this.closeAuthModal();
            this.updateUIForAuthState();
            
            // Disparar evento authChange para consistencia
            console.log('handleLoginSubmit: Disparando evento authChange');
            document.dispatchEvent(new CustomEvent('authChange', { 
                detail: { user: user, session: user } 
            }));
            console.log('handleLoginSubmit: Evento authChange disparado');
            
        } catch (error) {
            console.error('handleLoginSubmit: Error en login:', error.message);
            alert('Error al iniciar sesión: ' + error.message);
        }
    },

    async handleSignupSubmit(event) {
        event.preventDefault();
        console.log('Manejo de submit de registro');
        
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        
        if (!email || !password) {
            alert('Por favor, completa todos los campos');
            return;
        }
        
        if (password.length < 6) {
            alert('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        
        try {
            // Verificar que auth esté disponible
            if (typeof auth === 'undefined' || !auth.signUp) {
                console.error('auth no está disponible o no tiene método signUp');
                alert('Error: Sistema de autenticación no disponible');
                return;
            }
            
            console.log('Intentando registrar usuario con:', email);
            const user = await auth.signUp(email, password);
            console.log('Registro exitoso:', user);
            
            // Actualizar usuario actual
            this.currentUser = user;
            
            // Asegurar que el cliente Supabase esté disponible
            if (!this.supabase && typeof auth !== 'undefined' && auth.getClient) {
                this.supabase = auth.getClient();
            }
            
            // Llamar a onUserAuthenticated para cargar datos
            await this.onUserAuthenticated(user);
            
            // Cerrar modal de auth y actualizar UI
            this.closeAuthModal();
            this.updateUIForAuthState();
            
            // Disparar evento authChange para consistencia
            document.dispatchEvent(new CustomEvent('authChange', { 
                detail: { user: user, session: user } 
            }));
            
        } catch (error) {
            console.error('Error en registro:', error.message);
            alert('Error al registrar usuario: ' + error.message);
        }
    },

    // =============================================
    // BIBLIOTECAS
    // =============================================

    async cargarBibliotecas() {
        console.log('cargarBibliotecas: Iniciando carga de bibliotecas');
        console.log('cargarBibliotecas: app.supabase disponible:', !!this.supabase);
        console.log('cargarBibliotecas: app.currentUser:', this.currentUser);
        
        const { data, error } = await obtenerBibliotecas();
        if (error) {
            console.error('cargarBibliotecas: Error al cargar bibliotecas:', error);
            return;
        }
        this.bibliotecas = data || [];
        console.log('cargarBibliotecas: Bibliotecas cargadas:', this.bibliotecas.length);
        this.actualizarSelectBiblioteca();
    },

    actualizarSelectBiblioteca() {
        const selectContainer = document.getElementById('biblioteca-select-container');
        const select = document.getElementById('biblioteca-select');

        if (!select || !selectContainer) return;

        // Limpiar opciones
        select.innerHTML = '';

        // Anadir opciones
        this.bibliotecas.forEach(bib => {
            const option = document.createElement('option');
            option.value = bib.id;
            option.textContent = bib.nombre;
            if (bib.id === this.currentBibliotecaId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // Mostrar selector solo si hay mas de una biblioteca
        selectContainer.style.display = this.bibliotecas.length > 1 ? 'block' : 'none';
    },

    async cambiarBiblioteca(bibliotecaId) {
        this.currentBibliotecaId = bibliotecaId;
        await this.cargarLibros();
    },

    async crearBiblioteca() {
        const nombre = prompt('Nombre de la nueva biblioteca:', 'Nueva Biblioteca');
        if (!nombre) return;

        const { data, error } = await crearBiblioteca(nombre);
        if (error) {
            alert('Error al crear biblioteca: ' + error.message);
            return;
        }

        // Anadir a la lista local
        this.bibliotecas.push(data);
        this.currentBibliotecaId = data.id;
        this.actualizarSelectBiblioteca();
        await this.cargarLibros();
    },

    // =============================================
    // LIBROS
    // =============================================

    async cargarLibros() {
        if (!this.currentBibliotecaId) return;

        const { data, error } = await obtenerLibros(this.currentBibliotecaId);
        if (error) {
            console.error('Error al cargar libros:', error);
            return;
        }
        this.libros = data;
        this.renderizarLibros();
        this.actualizarEstadisticas();
    },

    renderizarLibros() {
        const booksGrid = document.getElementById('books-grid');
        const emptyState = document.getElementById('empty-state');

        if (!booksGrid || !emptyState) return;

        if (this.libros.length === 0) {
            booksGrid.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else {
            booksGrid.classList.remove('hidden');
            emptyState.classList.add('hidden');

            // Limpiar grid
            booksGrid.innerHTML = '';

            // Renderizar cada libro
            this.libros.forEach(libro => {
                const bookCard = this.crearTarjetaLibro(libro);
                booksGrid.appendChild(bookCard);
            });
        }

        // Actualizar contador
        const booksCount = document.getElementById('books-count');
        if (booksCount) {
            booksCount.textContent = this.libros.length;
        }
    },

    crearTarjetaLibro(libro) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden group cursor-pointer transition hover:shadow-md';
        card.onclick = () => this.mostrarDetalleLibro(libro.id);

        // Portada
        const coverDiv = document.createElement('div');
        coverDiv.className = 'bg-slate-100 aspect-[3/4] overflow-hidden relative';

        if (libro.portada_url) {
            const img = document.createElement('img');
            img.src = libro.portada_url;
            img.alt = libro.titulo;
            img.className = 'w-full h-full object-cover';
            img.onerror = () => {
                img.onerror = null;
                img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23f3f4f6"%2F%3E%3Ctext x="100" y="150" text-anchor="middle" fill="%236b7280" font-family="Arial" font-size="14"%3EMi Libro%3C/text%3E%3C/svg%3E';
            };
            coverDiv.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50';
            placeholder.innerHTML = `
                <i data-lucide="book" class="w-12 h-12 mb-2"></i>
                <span class="text-xs">Sin portada</span>
            `;
            coverDiv.appendChild(placeholder);
        }

        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'p-3 space-y-1';

        const title = document.createElement('h3');
        title.className = 'font-semibold text-slate-800 text-sm line-clamp-2';
        title.textContent = libro.titulo;
        infoDiv.appendChild(title);

        if (libro.autores && libro.autores.length > 0) {
            const authors = document.createElement('p');
            authors.className = 'text-xs text-slate-500 line-clamp-1';
            authors.textContent = libro.autores.join(', ');
            infoDiv.appendChild(authors);
        }

        const pricesDiv = document.createElement('div');
        pricesDiv.className = 'flex justify-between text-xs mt-2';

        const precioCompra = document.createElement('span');
        precioCompra.className = 'font-bold text-slate-600';
        precioCompra.textContent = `${libro.precio_compra || 0} €`;
        pricesDiv.appendChild(precioCompra);

        const precioVenta = document.createElement('span');
        precioVenta.className = 'font-bold text-emerald-600';
        precioVenta.textContent = `${libro.precio_venta_estimado || 0} €`;
        pricesDiv.appendChild(precioVenta);

        infoDiv.appendChild(pricesDiv);

        card.appendChild(coverDiv);
        card.appendChild(infoDiv);

        return card;
    },

    mostrarDetalleLibro(libroId) {
        const libro = this.libros.find(l => l.id === libroId);
        if (!libro) return;

        const modal = document.getElementById('detail-book-modal');
        if (modal) modal.classList.remove('hidden');

        // Rellenar datos
        document.getElementById('detail-titulo').textContent = libro.titulo || 'Sin titulo';
        document.getElementById('detail-autor').textContent = libro.autores?.join(', ') || 'Autor desconocido';
        document.getElementById('detail-editorial').textContent = libro.editorial || '-';
        document.getElementById('detail-anio').textContent = libro.anio_publicacion || '-';
        document.getElementById('detail-isbn').textContent = `ISBN: ${libro.isbn || '-'}`;
        document.getElementById('detail-descripcion').textContent = libro.descripcion || 'No hay descripcion disponible.';
        document.getElementById('detail-precio-compra').textContent = `${libro.precio_compra || 0} €`;
        document.getElementById('detail-precio-venta').textContent = `${libro.precio_venta_estimado || 0} €`;
        document.getElementById('detail-fecha-compra').textContent = libro.fecha_compra ? new Date(libro.fecha_compra).toLocaleDateString() : '-';

        // Portada
        const portadaImg = document.getElementById('detail-portada');
        const portadaPlaceholder = document.getElementById('detail-portada-placeholder');

        if (libro.portada_url) {
            portadaImg.src = libro.portada_url;
            portadaImg.classList.remove('hidden');
            portadaPlaceholder.classList.add('hidden');
        } else {
            portadaImg.classList.add('hidden');
            portadaPlaceholder.classList.remove('hidden');
        }

        // Configurar botones de accion
        document.getElementById('btn-edit-book').onclick = () => this.editarLibro(libro);
        document.getElementById('btn-delete-book').onclick = () => this.confirmarEliminarLibro(libro);

        // Cargar fotos reales
        this.cargarFotosRealesLibro(libroId);
    },

    async cargarFotosRealesLibro(libroId) {
        const section = document.getElementById('detail-real-photos-section');
        const grid = document.getElementById('detail-real-photos-grid');

        if (!section || !grid) return;

        const { data: fotos, error } = await obtenerFotosLibro(libroId);
        if (error || !fotos || fotos.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        grid.innerHTML = '';

        fotos.forEach(foto => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'relative rounded-lg overflow-hidden border border-slate-200';

            const img = document.createElement('img');
            img.src = foto.url;
            img.alt = 'Foto real';
            img.className = 'w-full h-24 object-cover';

            imgContainer.appendChild(img);
            grid.appendChild(imgContainer);
        });
    },

    // =============================================
    // MODALES DE LIBRO
    // =============================================

    showAddBookModal(mode = 'scan') {
        const modal = document.getElementById('add-book-modal');
        if (modal) modal.classList.remove('hidden');

        // Seleccionar tab
        this.switchModalTab(mode);

        // Reiniciar formulario
        this.resetBookForm();
    },

    closeAddBookModal() {
        const modal = document.getElementById('add-book-modal');
        if (modal) modal.classList.add('hidden');
    },

    switchModalTab(tab) {
        const scanBtn = document.getElementById('tab-btn-scan');
        const manualBtn = document.getElementById('tab-btn-manual');
        const scanContent = document.getElementById('tab-content-scan');
        const manualContent = document.getElementById('tab-content-manual');

        if (tab === 'scan') {
            scanBtn?.classList.add('border-primary-500', 'text-primary-600');
            scanBtn?.classList.remove('border-transparent', 'text-slate-500');
            manualBtn?.classList.add('border-transparent', 'text-slate-500');
            manualBtn?.classList.remove('border-primary-500', 'text-primary-600');
            scanContent?.classList.add('active');
            manualContent?.classList.remove('active');
        } else {
            manualBtn?.classList.add('border-primary-500', 'text-primary-600');
            manualBtn?.classList.remove('border-transparent', 'text-slate-500');
            scanBtn?.classList.add('border-transparent', 'text-slate-500');
            scanBtn?.classList.remove('border-primary-500', 'text-primary-600');
            manualContent?.classList.add('active');
            scanContent?.classList.remove('active');
        }
    },

    resetBookForm() {
        document.getElementById('form-book-id').value = '';
        document.getElementById('form-biblioteca-id').value = this.currentBibliotecaId || '';
        document.getElementById('form-titulo').value = '';
        document.getElementById('form-autor').value = '';
        document.getElementById('form-isbn').value = '';
        document.getElementById('form-editorial').value = '';
        document.getElementById('form-anio').value = '';
        document.getElementById('form-descripcion').value = '';
        document.getElementById('form-portada-url').value = '';
        document.getElementById('form-precio-compra').value = '';
        document.getElementById('form-precio-venta').value = '';
        document.getElementById('form-fecha-compra').value = '';

        // Limpiar previsualizacion de fotos
        const preview = document.getElementById('form-photos-preview');
        if (preview) preview.innerHTML = '';
    },

    editarLibro(libro) {
        this.showAddBookModal('manual');

        // Rellenar formulario
        document.getElementById('form-book-id').value = libro.id || '';
        document.getElementById('form-biblioteca-id').value = libro.biblioteca_id || '';
        document.getElementById('form-titulo').value = libro.titulo || '';
        document.getElementById('form-autor').value = libro.autores?.join(', ') || '';
        document.getElementById('form-isbn').value = libro.isbn || '';
        document.getElementById('form-editorial').value = libro.editorial || '';
        document.getElementById('form-anio').value = libro.anio_publicacion || '';
        document.getElementById('form-descripcion').value = libro.descripcion || '';
        document.getElementById('form-portada-url').value = libro.portada_url || '';
        document.getElementById('form-precio-compra').value = libro.precio_compra || '';
        document.getElementById('form-precio-venta').value = libro.precio_venta_estimado || '';
        document.getElementById('form-fecha-compra').value = libro.fecha_compra || '';

        // Cargar fotos para previsualizacion (opcional)
        this.cargarFotosEnFormulario(libro.id);
    },

    async cargarFotosEnFormulario(libroId) {
        const { data: fotos } = await obtenerFotosLibro(libroId);
        if (!fotos || fotos.length === 0) return;

        const preview = document.getElementById('form-photos-preview');
        if (!preview) return;

        preview.innerHTML = '';

        fotos.forEach(foto => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200';

            const img = document.createElement('img');
            img.src = foto.url;
            img.className = 'w-full h-full object-cover';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs';
            removeBtn.innerHTML = '<i data-lucide="x" class="w-3 h-3"></i>';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                // Aqui podrias eliminar la foto de Supabase Storage
                imgContainer.remove();
            };

            imgContainer.appendChild(img);
            imgContainer.appendChild(removeBtn);
            preview.appendChild(imgContainer);
        });
    },

    confirmarEliminarLibro(libro) {
        if (!confirm(`Estas seguro de que quieres eliminar "${libro.titulo}"?`)) {
            return;
        }
        this.eliminarLibro(libro);
    },

    async eliminarLibro(libro) {
        const { error } = await eliminarLibro(libro.id);
        if (error) {
            alert('Error al eliminar el libro: ' + error.message);
            return;
        }

        // Actualizar lista local
        this.libros = this.libros.filter(l => l.id !== libro.id);
        this.renderizarLibros();
        this.actualizarEstadisticas();

        this.closeDetailModal();
    },

    closeDetailModal() {
        const modal = document.getElementById('detail-book-modal');
        if (modal) modal.classList.add('hidden');
    },

    async saveBook(event) {
        event.preventDefault();

        const formData = {
            id: document.getElementById('form-book-id').value || undefined,
            biblioteca_id: document.getElementById('form-biblioteca-id').value || this.currentBibliotecaId || this.bibliotecas[0]?.id,
            titulo: document.getElementById('form-titulo').value,
            autores: document.getElementById('form-autor').value.split(',').map(a => a.trim()).filter(a => a),
            isbn: document.getElementById('form-isbn').value,
            editorial: document.getElementById('form-editorial').value,
            anio_publicacion: document.getElementById('form-anio').value,
            descripcion: document.getElementById('form-descripcion').value,
            portada_url: document.getElementById('form-portada-url').value,
            precio_compra: parseFloat(document.getElementById('form-precio-compra').value) || 0,
            precio_venta_estimado: parseFloat(document.getElementById('form-precio-venta').value) || 0,
            fecha_compra: document.getElementById('form-fecha-compra').value || null
        };

        // Validar
        if (!formData.titulo) {
            alert('El titulo es obligatorio');
            return;
        }
        
        // Validar que hay una biblioteca seleccionada
        if (!formData.biblioteca_id) {
            alert('Debe seleccionar una biblioteca');
            return;
        }

        // Guardar libro
        let libro;
        try {
            libro = await storage.saveBook(formData);
        } catch (error) {
            alert('Error al guardar el libro: ' + error.message);
            return;
        }

        // Subir fotos reales si las hay
        const fotoInput = document.getElementById('form-real-photo-input');
        if (fotoInput?.files?.length > 0) {
            const { urls } = await subirFotosLibro(libro.id, Array.from(fotoInput.files));
            if (urls.length > 0) {
                await guardarFotosLibro(libro.id, urls);
            }
        }

        // Actualizar lista local
        // Normalizar biblioteca_id para asegurar consistencia
        const libroBibliotecaId = libro.biblioteca_id || libro.library_id || formData.biblioteca_id || formData.library_id;
        
        if (formData.id) {
            // Actualizar libro existente
            const index = this.libros.findIndex(l => l.id === formData.id);
            if (index !== -1) {
                this.libros[index] = { ...libro, bibliotecas: this.libros[index].bibliotecas };
            }
        } else {
            // Anadir nuevo libro
            const bibliotecaNombre = this.bibliotecas.find(b => b.id === libroBibliotecaId)?.nombre || 'Desconocida';
            this.libros.unshift({ ...libro, bibliotecas: { nombre: bibliotecaNombre } });
        }

        this.renderizarLibros();
        this.actualizarEstadisticas();
        this.closeAddBookModal();
        this.resetBookForm();
    },

    // =============================================
    // BUSQUEDA
    // =============================================

    setupSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        let timeout = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.buscarLibros(e.target.value);
            }, 500);
        });
    },

    async buscarLibros(texto) {
        if (!texto.trim()) {
            await this.cargarLibros();
            return;
        }

        if (!this.currentBibliotecaId) return;

        const { data, error } = await app.supabase
            .from('libros')
            .select('*, bibliotecas(nombre)')
            .eq('biblioteca_id', this.currentBibliotecaId)
            .or(`titulo.ilike.%${texto}%,autores.ilike.%${texto}%,editorial.ilike.%${texto}%,isbn.ilike.%${texto}%`)
            .order('fecha_registro', { ascending: false });

        if (error) {
            console.error('Error al buscar:', error);
            return;
        }

        this.libros = data || [];
        this.renderizarLibros();
    },

    // =============================================
    // ESTADISTICAS
    // =============================================

    async actualizarEstadisticas() {
        if (!this.currentBibliotecaId) return;

        // Calcular localmente (mas rapido)
        const totalLibros = this.libros.length;
        const inversionTotal = this.libros.reduce((sum, libro) => sum + (libro.precio_compra || 0), 0);
        const valorVentaTotal = this.libros.reduce((sum, libro) => sum + (libro.precio_venta_estimado || 0), 0);

        // Actualizar en movil
        const statsTotalMobile = document.getElementById('stats-total-mobile');
        const statsCompraMobile = document.getElementById('stats-compra-mobile');
        const statsVentaMobile = document.getElementById('stats-venta-mobile');

        if (statsTotalMobile) statsTotalMobile.textContent = totalLibros;
        if (statsCompraMobile) statsCompraMobile.textContent = `${inversionTotal.toFixed(2)}€`;
        if (statsVentaMobile) statsVentaMobile.textContent = `${valorVentaTotal.toFixed(2)}€`;

        // Actualizar en desktop
        const statsTotalDesktop = document.getElementById('stats-total-desktop');
        const statsCompraDesktop = document.getElementById('stats-compra-desktop');
        const statsVentaDesktop = document.getElementById('stats-venta-desktop');

        if (statsTotalDesktop) statsTotalDesktop.textContent = totalLibros;
        if (statsCompraDesktop) statsCompraDesktop.textContent = `${inversionTotal.toFixed(2)} €`;
        if (statsVentaDesktop) statsVentaDesktop.textContent = `${valorVentaTotal.toFixed(2)} €`;
    },

    // =============================================
    // ISBN LOOKUP
    // =============================================

    async lookupISBN() {
        const isbnInput = document.getElementById('isbn-input');
        const isbn = isbnInput.value.trim();

        if (!isbn) {
            alert('Por favor, introduce un ISBN');
            return;
        }

        // Mostrar loading
        const originalValue = isbnInput.value;
        isbnInput.value = 'Buscando...';
        isbnInput.disabled = true;

        try {
            // Buscar en Google Books
            const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
            const googleResponse = await fetch(googleBooksUrl);
            const googleData = await googleResponse.json();

            let libroData = {};

            if (googleData.totalItems > 0) {
                const book = googleData.items[0].volumeInfo;
                libroData = {
                    titulo: book.title || '',
                    autores: book.authors || [],
                    isbn: isbn,
                    editorial: book.publisher || '',
                    anio_publicacion: book.publishedDate ? book.publishedDate.substring(0, 4) : '',
                    descripcion: book.description || '',
                    portada_url: book.imageLinks?.thumbnail || book.imageLinks?.smallThumbnail || ''
                };
            } else {
                // Si no se encuentra en Google Books, probar Open Library
                const openLibraryUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
                const openLibraryResponse = await fetch(openLibraryUrl);
                const openLibraryData = await openLibraryResponse.json();

                const olKey = `ISBN:${isbn}`;
                if (openLibraryData[olKey]) {
                    const book = openLibraryData[olKey];
                    libroData = {
                        titulo: book.title || '',
                        autores: book.authors ? book.authors.map(a => a.name) : [],
                        isbn: isbn,
                        editorial: book.publishers ? book.publishers[0] : '',
                        anio_publicacion: book.publish_date ? book.publish_date.substring(0, 4) : '',
                        descripcion: book.notes ? book.notes.value : '',
                        portada_url: book.cover ? book.cover.medium : book.cover?.small || ''
                    };
                }
            }

            isbnInput.value = originalValue;
            isbnInput.disabled = false;

            if (Object.keys(libroData).length > 0) {
                // Abrir formulario manual con datos pre-cargados
                this.showAddBookModal('manual');

                // Rellenar formulario
                document.getElementById('form-isbn').value = libroData.isbn || isbn;
                document.getElementById('form-titulo').value = libroData.titulo || '';
                document.getElementById('form-autor').value = libroData.autores?.join(', ') || '';
                document.getElementById('form-editorial').value = libroData.editorial || '';
                document.getElementById('form-anio').value = libroData.anio_publicacion || '';
                document.getElementById('form-descripcion').value = libroData.descripcion || '';
                document.getElementById('form-portada-url').value = libroData.portada_url || '';
            } else {
                alert('No se encontraron informacion para este ISBN. Puedes anadir el libro manualmente.');
            }

        } catch (error) {
            isbnInput.value = originalValue;
            isbnInput.disabled = false;
            console.error('Error al buscar ISBN:', error);
            alert('Error al buscar el ISBN. Intentalo de nuevo.');
        }
    },

    // =============================================
    // FOTOS
    // =============================================

    handleRealPhotos(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const preview = document.getElementById('form-photos-preview');
        if (!preview) return;

        // Mostrar previsualizacion
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200';

                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'w-full h-full object-cover';

                const removeBtn = document.createElement('button');
                removeBtn.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs';
                removeBtn.innerHTML = '<i data-lucide="x" class="w-3 h-3"></i>';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    imgContainer.remove();
                    // Actualizar el input file para que no envie esta foto
                    const newFiles = Array.from(event.target.files).filter(f => f !== file);
                    const dataTransfer = new DataTransfer();
                    newFiles.forEach(f => dataTransfer.items.add(f));
                    event.target.files = dataTransfer.files;
                };

                imgContainer.appendChild(img);
                imgContainer.appendChild(removeBtn);
                preview.appendChild(imgContainer);
            };
            reader.readAsDataURL(file);
        });

        // Resetear el input para permitir seleccionar los mismos archivos otra vez
        event.target.value = '';
    },

    // =============================================
    // MODAL DE CONFIGURACION DE SUPABASE
    // =============================================

    showSupabaseConfigModal() {
        const modal = document.getElementById('supabase-config-modal');
        if (modal) modal.classList.remove('hidden');
    },

    closeSupabaseConfigModal() {
        const modal = document.getElementById('supabase-config-modal');
        if (modal) modal.classList.add('hidden');
    },

    async saveSupabaseConfig(event) {
        if (event) event.preventDefault();

        const url = document.getElementById('supabase-url-input').value.trim();
        const anonKey = document.getElementById('supabase-anon-key-input').value.trim();
        const serviceKey = document.getElementById('supabase-service-key-input').value.trim();

        if (!url || !anonKey) {
            alert('URL y Clave Anonima son obligatorias');
            return;
        }

        // Guardar en localStorage
        localStorage.setItem('supabaseUrl', url);
        localStorage.setItem('supabaseAnonKey', anonKey);

        // Si hay service key, guardarla tambien (para registro de usuarios)
        if (serviceKey) {
            localStorage.setItem('supabaseServiceKey', serviceKey);
        }

        // Asegurar que window.supabase esté disponible
        if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
            // Esperar a que window.supabase esté disponible
            await new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(interval);
                    resolve();
                }, 5000);
            });
        }
        
        // Reiniciar cliente de Supabase
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
            this.supabase = window.supabase.createClient(url, serviceKey || anonKey);
            
            // Recrear el cliente de auth completamente usando el método dedicado
            if (typeof auth !== 'undefined' && auth.reinitializeClient) {
                await auth.reinitializeClient();
                
                // Asegurar que app.supabase use el cliente de auth si está disponible
                if (auth.getClient()) {
                    this.supabase = auth.getClient();
                }
            }
        }

        // Cerrar modal
        this.closeSupabaseConfigModal();

        // NOTA: Después de configurar Supabase, NO intentar autenticar automáticamente
        // porque el usuario quiere configurar primero y luego iniciar sesión manualmente
        // Re-inicializar auth para que use las nuevas credenciales
        if (typeof auth !== 'undefined' && auth && auth.reinitializeClient) {
            try {
                await auth.reinitializeClient();
                // Actualizar app.supabase
                if (auth.getClient()) {
                    this.supabase = auth.getClient();
                }
            } catch (error) {
                console.error('Error al reinicializar auth después de guardar configuración:', error);
            }
        }
        
        // Mostrar modal de autenticación para que el usuario inicie sesión
        // con las nuevas credenciales de Supabase
        if (typeof hideSplashScreen === 'function') {
            hideSplashScreen();
        }
        this.closeAuthModal();
        this.closeSupabaseConfigModal();
        this.closeAddBookModal();
        this.closeDetailModal();
        this.showAuthModal();
        
        alert('Configuración de Supabase guardada correctamente. Por favor, inicia sesión.');
    },

    // =============================================
    // UTILIDADES
    // =============================================

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadConfig() {
        // Cargar configuracion de Supabase
        const url = localStorage.getItem('supabaseUrl');
        const anonKey = localStorage.getItem('supabaseAnonKey');
        const serviceKey = localStorage.getItem('supabaseServiceKey');

        if (url && anonKey) {
            this.supabase = supabase.createClient(url, anonKey);
        }

        return { url, anonKey, serviceKey };
    }
};

// Inicializar al cargar la pagina
if (typeof window !== 'undefined') {
    window.app = app;
}
