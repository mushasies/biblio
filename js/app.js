const app = {
    books: [],
    currentPhotos: [],
    isAuthenticated: false,
    user: null,
    userProfile: null,

    // Inicializar la aplicacion
    async init() {
        console.log('Iniciando Biblio App...');

        // 1. Inicializar Supabase Auth
        await auth.init();

        // 2. Configurar eventos de busqueda y filtros
        document.getElementById('search-input')?.addEventListener('input', () => this.filterAndRenderBooks());
        document.getElementById('sort-select')?.addEventListener('change', () => this.filterAndRenderBooks());

        // 3. Inicializar iconos
        this.refreshIcons();

        // 4. Configurar manejadores de formularios
        document.getElementById("login-form")?.addEventListener("submit", (e) => this.handleLogin(e));
        document.getElementById("signup-form")?.addEventListener("submit", (e) => this.handleSignup(e));
        document.getElementById("supabase-config-form")?.addEventListener("submit", (e) => this.handleSupabaseConfig(e));

        // 5. Inicializar storage con el cliente de auth
        storage.init(auth.getClient());

        // 6. Verificar autenticacion
        this.handleAuthChange(auth.getUser(), auth.getProfile());

        // 7. Registrar Service Worker
        this.registerServiceWorker();
    },

    // Registrar Service Worker
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then((reg) => console.log('Service Worker registrado.', reg.scope))
                    .catch((err) => console.warn('Error al registrar Service Worker:', err));
            });
        }
    },

    // Actualizar iconos
    refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    // Manejar cambios en autenticacion
    async handleAuthChange(user, profile) {
        this.user = user;
        this.userProfile = profile;
        this.isAuthenticated = !!user;

        const appContent = document.getElementById("app-content");
        const authModal = document.getElementById("auth-modal");
        const supabaseConfigModal = document.getElementById("supabase-config-modal");

        console.log("handleAuthChange llamado - user:", user, "profile:", profile);

        if (user && profile) {
            console.log("Usuario autenticado:", user.email, "Rol:", profile.role || profile.rol);

            // Ocultar modals
            if (authModal) authModal.classList.add("hidden");
            if (supabaseConfigModal) supabaseConfigModal.classList.add("hidden");
            if (appContent) appContent.classList.remove("hidden");

            // Habilitar Supabase en storage
            storage.isSupabaseEnabled = true;

            // Cargar bibliotecas del usuario
            await this.loadLibraries();

            // Cargar libros
            await this.loadAndRenderBooks();
        } else {
            console.log("Usuario desautenticado");

            // Mostrar modal de configuracion si Supabase esta configurado
            const hasUrl = localStorage.getItem("supabaseUrl");
            const hasKey = localStorage.getItem("supabaseAnonKey") || localStorage.getItem("supabaseServiceKey");

            if (hasUrl && hasKey) {
                if (authModal) this.showAuthModal("login");
                if (appContent) appContent.classList.add("hidden");
                if (supabaseConfigModal) supabaseConfigModal.classList.add("hidden");
            } else {
                // Mostrar modal de configuracion de Supabase
                if (supabaseConfigModal) supabaseConfigModal.classList.remove("hidden");
                if (appContent) appContent.classList.remove("hidden");
                if (authModal) authModal.classList.add("hidden");
            }
            
            this.books = [];
            this.filterAndRenderBooks();
        }

        this.refreshIcons();
    },

    // Cargar bibliotecas del usuario
    async loadLibraries() {
        try {
            const userId = auth.getUserId();
            const isAdmin = auth.isAdmin();
            
            // Cargar bibliotecas desde storage
            storage.libraries = await storage.getUserLibraries(userId);
            
            // Cargar biblioteca seleccionada
            storage.loadSavedLibrary();

            if (storage.libraries.length === 0 && this.user) {
                // Crear biblioteca por defecto si no hay ninguna
                const defaultLib = await storage.createLibrary('Mi Biblioteca', userId);
                if (defaultLib) {
                    storage.libraries = [defaultLib];
                    storage.currentLibraryId = defaultLib.id;
                    storage.saveCurrentLibrary(defaultLib);
                }
            }

            // Actualizar selector de bibliotecas
            this.renderLibrarySelector();
        } catch (error) {
            console.error('Error al cargar bibliotecas:', error);
        }
    },

    // Renderizar selector de bibliotecas en el header
    renderLibrarySelector() {
        const userId = auth.getUserId();
        const isAdmin = auth.isAdmin();
        const libraries = storage.libraries;

        // Buscar contenedor para el selector
        let libSelectorContainer = document.getElementById('library-selector-container');

        if (!libSelectorContainer) {
            const header = document.querySelector('header div.max-w-6xl');
            if (header) {
                const addBookBtn = header.querySelector('button[onclick*="showAddBookModal"]');
                if (addBookBtn) {
                    const container = document.createElement('div');
                    container.id = 'library-selector-container';
                    container.className = 'hidden md:flex items-center gap-2';
                    addBookBtn.before(container);
                    libSelectorContainer = container;
                }
            }
        }

        if (!libSelectorContainer) return;

        // Limpiar contenedor
        libSelectorContainer.innerHTML = '';

        // Crear selector
        const select = document.createElement('select');
        select.id = 'library-selector';
        select.className = 'bg-white/20 border border-white/30 text-white text-sm rounded-lg px-2 py-1 backdrop-blur-sm';

        // Anadir opciones
        libraries.forEach(lib => {
            const option = document.createElement('option');
            option.value = lib.id;
            option.textContent = lib.nombre;
            if (lib.id === storage.currentLibraryId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // Evento change
        select.addEventListener('change', (e) => {
            storage.setCurrentLibrary(e.target.value);
            this.loadAndRenderBooks();
        });

        // Si hay bibliotecas, mostrar selector
        if (libraries.length > 0) {
            const label = document.createElement('span');
            label.className = 'text-white/80 text-xs hidden sm:inline';
            label.textContent = 'Biblioteca:';
            libSelectorContainer.appendChild(label);
            libSelectorContainer.appendChild(select);
        }

        // Boton para crear nueva biblioteca
        if (this.isAuthenticated) {
            const newLibBtn = document.createElement('button');
            newLibBtn.innerHTML = '<i data-lucide="folder-plus" class="w-4 h-4"></i>';
            newLibBtn.className = 'text-white/80 hover:text-white p-1 rounded hover:bg-white/20 transition';
            newLibBtn.title = 'Crear nueva biblioteca';
            newLibBtn.onclick = () => this.showNewLibraryModal();
            libSelectorContainer.appendChild(newLibBtn);
        }

        this.refreshIcons();
    },

    // Mostrar modal para crear nueva biblioteca
    showNewLibraryModal() {
        const name = prompt('Nombre de la nueva biblioteca:');
        if (name && name.trim()) {
            const userId = auth.getUserId();
            storage.createLibrary(name.trim(), userId).then(lib => {
                if (lib) {
                    storage.libraries.push(lib);
                    storage.setCurrentLibrary(lib.id);
                    this.renderLibrarySelector();
                    this.loadAndRenderBooks();
                }
            });
        }
    },

    // Cargar libros desde storage
    async loadAndRenderBooks() {
        try {
            const libraryId = storage.currentLibraryId;
            const userId = auth.getUserId();

            // Si es admin y no hay biblioteca seleccionada, cargar todos los libros
            if (auth.isAdmin() && !libraryId) {
                this.books = await storage.getAllBooks();
            } else {
                this.books = await storage.getAllBooks(libraryId);
            }

            this.filterAndRenderBooks();
        } catch (error) {
            console.error("Error al cargar libros:", error);
            this.books = [];
            this.filterAndRenderBooks();
        }
    },

    // Calcular estadisticas
    updateStatistics(filteredBooks) {
        const total = filteredBooks.length;
        let totalCompra = 0;
        let totalVenta = 0;

        filteredBooks.forEach(book => {
            if (book.precioCompra) totalCompra += book.precioCompra;
            if (book.precioVenta) totalVenta += book.precioVenta;
        });

        const formatter = new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
        });

        // Desktop
        const totalDesk = document.getElementById('stats-total-desktop');
        if (totalDesk) totalDesk.textContent = total;
        const compraDesk = document.getElementById('stats-compra-desktop');
        if (compraDesk) compraDesk.textContent = formatter.format(totalCompra);
        const ventaDesk = document.getElementById('stats-venta-desktop');
        if (ventaDesk) ventaDesk.textContent = formatter.format(totalVenta);

        // Movil
        const totalMob = document.getElementById('stats-total-mobile');
        if (totalMob) totalMob.textContent = total;
        const compraMob = document.getElementById('stats-compra-mobile');
        if (compraMob) compraMob.textContent = formatter.format(totalCompra);
        const ventaMob = document.getElementById('stats-venta-mobile');
        if (ventaMob) ventaMob.textContent = formatter.format(totalVenta);
    },

    // Filtrar, ordenar y renderizar
    filterAndRenderBooks() {
        const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        const sortBy = document.getElementById('sort-select')?.value || 'fechaRegistroDesc';

        // Filtrar por busqueda
        let filtered = this.books.filter(book => {
            const matchTitulo = (book.titulo || '').toLowerCase().includes(query);
            const matchAutor = (book.autor || '').toLowerCase().includes(query);
            const matchEditorial = (book.editorial || '').toLowerCase().includes(query);
            const matchISBN = (book.isbn || '').includes(query);
            return matchTitulo || matchAutor || matchEditorial || matchISBN;
        });

        // Ordenar
        filtered.sort((a, b) => {
            if (sortBy === 'tituloAsc') {
                return (a.titulo || '').localeCompare(b.titulo || '');
            } else if (sortBy === 'autorAsc') {
                return (a.autor || '').localeCompare(b.autor || '');
            } else if (sortBy === 'precioCompraDesc') {
                return (b.precioCompra || 0) - (a.precioCompra || 0);
            } else {
                return new Date(b.fechaRegistro || b.fecha_registro || 0) - new Date(a.fechaRegistro || a.fecha_registro || 0);
            }
        });

        // Actualizar estadisticas
        this.updateStatistics(this.books);

        const booksGrid = document.getElementById('books-grid');
        const emptyState = document.getElementById('empty-state');
        const booksCount = document.getElementById('books-count');

        if (booksCount) booksCount.textContent = filtered.length;

        if (filtered.length === 0) {
            if (booksGrid) booksGrid.classList.add('hidden');
            if (emptyState) {
                emptyState.classList.remove('hidden');
                const currentLib = storage.getCurrentLibrary();
                const libName = currentLib?.nombre || 'biblioteca';
                const emptyMsg = emptyState.querySelector('p');
                if (emptyMsg) {
                    emptyMsg.textContent = `Escanea el codigo de barras de un libro o anadelo manualmente para empezar en "${libName}".`;
                }
            }
        } else {
            if (emptyState) emptyState.classList.add('hidden');
            if (booksGrid) {
                booksGrid.classList.remove('hidden');
                booksGrid.innerHTML = '';

                filtered.forEach(book => this.renderBookCard(book, booksGrid));
            }
        }

        this.refreshIcons();
    },

    // Renderizar tarjeta de libro
    renderBookCard(book, container) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md transition cursor-pointer flex flex-col group';
        card.onclick = () => this.showDetailModal(book.id);

        let coverSrc = '';
        if (book.portadaUrl) {
            coverSrc = book.portadaUrl;
        } else if (book.realPhotos && book.realPhotos.length > 0) {
            coverSrc = book.realPhotos[0];
        }
        else if (book.portada_url) {
            coverSrc = book.portada_url;
        } else if (book.real_photos && book.real_photos.length > 0) {
            coverSrc = book.real_photos[0];
        }

        const hasCover = coverSrc !== '';
        const currentLib = storage.getCurrentLibrary();
        const libName = currentLib?.nombre || 'Desconocida';

        card.innerHTML = `
            <div class="aspect-[3/4] bg-slate-100 relative overflow-hidden flex items-center justify-center border-b border-slate-100 shrink-0">
                ${hasCover
                    ? `<img src="${coverSrc}" alt="Portada de ${book.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">`
                    : `<div class="text-slate-300 flex flex-col items-center">
                         <i data-lucide="book" class="w-10 h-10"></i>
                         <span class="text-[10px] text-slate-400 mt-1">Sin portada</span>
                       </div>`
                }
                ${book.precioCompra || book.precio_compra
                    ? `<span class="absolute bottom-2 right-2 bg-slate-900/85 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                         ${(book.precioCompra || book.precio_compra || 0).toFixed(2)}€
                       </span>`
                    : ''
                }
            </div>
            <div class="p-3 flex-1 flex flex-col justify-between">
                <div>
                    <h4 class="font-bold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-tight group-hover:text-primary-600 transition" title="${book.titulo}">${book.titulo}</h4>
                    <p class="text-slate-500 text-[11px] sm:text-xs line-clamp-1 mt-0.5">${book.autor || 'Autor desconocido'}</p>
                </div>
                <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-50 text-[10px] text-slate-400">
                    <span class="truncate max-w-[70px]">${book.editorial || ''}</span>
                    <span>${book.anio || book.anio || ''}</span>
                </div>
                ${!auth.isAdmin() ? `<div class="text-xs text-slate-400 mt-1 truncate">${libName}</div>` : ''}
            </div>
        `;

        container.appendChild(card);
        this.refreshIcons();
    },

    // ============ MODALES ============

    // Modal de configuracion de Supabase
    showSupabaseConfigModal() {
        const modal = document.getElementById("supabase-config-modal");
        if (modal) {
            modal.classList.remove("hidden");
            document.getElementById("supabase-url-input").value = localStorage.getItem("supabaseUrl") || "";
            document.getElementById("supabase-anon-key-input").value = localStorage.getItem("supabaseAnonKey") || "";
            document.getElementById("supabase-service-key-input").value = localStorage.getItem("supabaseServiceKey") || "";
        }
    },

    closeSupabaseConfigModal() {
        const modal = document.getElementById("supabase-config-modal");
        if (modal) modal.classList.add("hidden");
    },

    handleSupabaseConfig(event) {
        event.preventDefault();
        const url = document.getElementById("supabase-url-input").value.trim();
        const anonKey = document.getElementById("supabase-anon-key-input").value.trim();
        const serviceKey = document.getElementById("supabase-service-key-input").value.trim();

        // Validar que al menos tengamos URL
        if (!url) {
            alert("Por favor, introduce la URL de tu proyecto Supabase.");
            return;
        }

        // Validar que tengamos al menos una clave
        if (!anonKey && !serviceKey) {
            alert("Por favor, introduce al menos la URL y una clave (ANON KEY o SERVICE KEY). La SERVICE KEY es obligatoria para registrar usuarios.");
            return;
        }

        // Guardar configuración
        localStorage.setItem("supabaseUrl", url);
        
        if (anonKey) {
            localStorage.setItem("supabaseAnonKey", anonKey);
        }
        
        if (serviceKey) {
            localStorage.setItem("supabaseServiceKey", serviceKey);
        }

        // Advertencia si solo se usa anon key (no podrá registrar usuarios)
        if (anonKey && !serviceKey) {
            if (!confirm("ADVERTENCIA: Con solo la ANON KEY no podrás registrar usuarios ni guardar libros. Necesitas la SERVICE KEY o desactivar RLS en Supabase. ¿Continuar de todos modos?")) {
                return;
            }
        }

        this.closeSupabaseConfigModal();
        auth.initSupabase();
    },

    // Modal de autenticacion
    showAuthModal(tab = "login") {
        const modal = document.getElementById("auth-modal");
        if (modal) {
            modal.classList.remove("hidden");
            this.switchAuthTab(tab);
        }
    },

    closeAuthModal() {
        const modal = document.getElementById("auth-modal");
        if (modal) modal.classList.add("hidden");
    },

    switchAuthTab(tab) {
        const btnLogin = document.getElementById("auth-tab-btn-login");
        const btnSignup = document.getElementById("auth-tab-btn-signup");
        const contentLogin = document.getElementById("auth-tab-content-login");
        const contentSignup = document.getElementById("auth-tab-content-signup");
        const title = document.querySelector("#auth-modal h3");

        if (tab === "login") {
            btnLogin?.classList.add("border-primary-500", "text-primary-600");
            btnLogin?.classList.remove("border-transparent", "text-slate-500", "hover:text-slate-800");
            btnSignup?.classList.add("border-transparent", "text-slate-500", "hover:text-slate-800");
            btnSignup?.classList.remove("border-primary-500", "text-primary-600");
            contentLogin?.classList.add("active");
            contentSignup?.classList.remove("active");
            if (title) title.textContent = "Iniciar Sesion";
        } else {
            btnSignup?.classList.add("border-primary-500", "text-primary-600");
            btnSignup?.classList.remove("border-transparent", "text-slate-500", "hover:text-slate-800");
            btnLogin?.classList.add("border-transparent", "text-slate-500", "hover:text-slate-800");
            btnLogin?.classList.remove("border-primary-500", "text-primary-600");
            contentSignup?.classList.add("active");
            contentLogin?.classList.remove("active");
            if (title) title.textContent = "Registrarse";
        }
        this.refreshIcons();
    },

    async handleLogin(event) {
        event.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        try {
            await auth.signIn(email, password);
            this.closeAuthModal();
            this.handleAuthChange(auth.getUser(), auth.getProfile());
        } catch (error) {
            alert("Error al iniciar sesion: " + error.message);
            console.error("Error login:", error);
        }
    },

    async handleSignup(event) {
        event.preventDefault();
        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;
        try {
            await auth.signUp(email, password);
            alert('¡Registro exitoso! Ya puedes iniciar sesion.');
            this.closeAuthModal();
            this.showAuthModal('login');
        } catch (error) {
            alert("Error en el registro: " + error.message);
            console.error("Error signup:", error);
        }
    },

    async handleLogout() {
        if (confirm("¿Estas seguro de que quieres cerrar sesion?")) {
            try {
                await auth.signOut();
                this.handleAuthChange(null, null);
            } catch (error) {
                alert("Error al cerrar sesion: " + error.message);
            }
        }
    },

    // ============ MODAL ANADIR LIBRO ============

    showAddBookModal(tab = 'scan') {
        if (!this.isAuthenticated) {
            alert("Debes iniciar sesion para anadir libros.");
            this.showAuthModal("login");
            return;
        }
        const modal = document.getElementById('add-book-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.switchModalTab(tab);
            document.getElementById('book-form')?.reset();
            document.getElementById('form-book-id').value = '';
            document.getElementById('isbn-input').value = '';
            this.currentPhotos = [];
            this.renderFormPhotosPreview();
        }
    },

    closeAddBookModal() {
        const modal = document.getElementById('add-book-modal');
        if (modal) {
            modal.classList.add('hidden');
            scanner.stopScanner();
        }
    },

    switchModalTab(tab) {
        const btnScan = document.getElementById('tab-btn-scan');
        const btnManual = document.getElementById('tab-btn-manual');
        const contentScan = document.getElementById('tab-content-scan');
        const contentManual = document.getElementById('tab-content-manual');

        if (tab === 'scan') {
            btnScan?.classList.add('border-primary-500', 'text-primary-600');
            btnScan?.classList.remove('border-transparent', 'text-slate-500');
            btnManual?.classList.add('border-transparent', 'text-slate-500');
            btnManual?.classList.remove('border-primary-500', 'text-primary-600');
            contentScan?.classList.add('active');
            contentManual?.classList.remove('active');
        } else {
            btnManual?.classList.add('border-primary-500', 'text-primary-600');
            btnManual?.classList.remove('border-transparent', 'text-slate-500');
            btnScan?.classList.add('border-transparent', 'text-slate-500');
            btnScan?.classList.remove('border-primary-500', 'text-primary-600');
            contentManual?.classList.add('active');
            contentScan?.classList.remove('active');
            scanner.stopScanner();
        }
    },

    // ============ ISBN Y ESCANER ============

    async lookupISBN(manualIsbn = null) {
        const isbnVal = manualIsbn || document.getElementById('isbn-input')?.value;
        if (!isbnVal) {
            alert('Ingresa un numero de ISBN primero.');
            return;
        }

        const btn = document.querySelector('button[onclick="app.lookupISBN()"]');
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Buscando...</span>';
        this.refreshIcons();

        try {
            const bookData = await api.lookupBook(isbnVal);
            document.getElementById('form-titulo').value = bookData.titulo;
            document.getElementById('form-autor').value = bookData.autor;
            document.getElementById('form-isbn').value = bookData.isbn;
            document.getElementById('form-editorial').value = bookData.editorial;
            document.getElementById('form-anio').value = bookData.anio;
            document.getElementById('form-descripcion').value = bookData.descripcion;
            document.getElementById('form-portada-url').value = bookData.portadaUrl;
            this.switchModalTab('manual');
        } catch (err) {
            console.error(err);
            alert(err.message || 'No se pudo encontrar el libro. Prueba a ingresarlo de manera manual.');
            this.switchModalTab('manual');
            document.getElementById('form-isbn').value = isbnVal;
        } finally {
            if (btn) btn.innerHTML = originalContent;
            this.refreshIcons();
        }
    },

    // ============ FOTOS REALES ============

    handleRealPhotos(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.currentPhotos.push(e.target.result);
                this.renderFormPhotosPreview();
            };
            reader.readAsDataURL(file);
        });

        event.target.value = '';
    },

    renderFormPhotosPreview() {
        const container = document.getElementById('form-photos-preview');
        if (!container) return;

        container.innerHTML = '';
        this.currentPhotos.forEach((photoData, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'w-16 h-16 rounded-lg overflow-hidden relative border border-slate-200 shadow-sm shrink-0 group';

            wrapper.innerHTML = `
                <img src="${photoData}" alt="Foto real" class="w-full h-full object-cover">
                <button type="button" onclick="app.removeFormPhoto(${index})" class="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            `;
            container.appendChild(wrapper);
        });

        this.refreshIcons();
    },

    removeFormPhoto(index) {
        this.currentPhotos.splice(index, 1);
        this.renderFormPhotosPreview();
    },

    // ============ GUARDAR LIBRO ============

    async saveBook(event) {
        event.preventDefault();

        const bookId = document.getElementById('form-book-id').value;
        const title = document.getElementById('form-titulo').value;
        const autor = document.getElementById('form-autor').value;
        const isbn = document.getElementById('form-isbn').value;
        const editorial = document.getElementById('form-editorial').value;
        const anio = document.getElementById('form-anio').value;
        const descripcion = document.getElementById('form-descripcion').value;
        const portadaUrl = document.getElementById('form-portada-url').value;
        const precioCompra = document.getElementById('form-precio-compra').value;
        const precioVenta = document.getElementById('form-precio-venta').value;
        const fechaCompra = document.getElementById('form-fecha-compra').value;

        const bookToSave = {
            id: bookId ? (typeof bookId === 'number' ? bookId : parseInt(bookId, 10)) : undefined,
            titulo: title,
            autor: autor,
            isbn: api.cleanISBN(isbn),
            editorial: editorial,
            anio: anio,
            descripcion: descripcion,
            portadaUrl: portadaUrl,
            precioCompra: precioCompra ? parseFloat(precioCompra) : null,
            precioVenta: precioVenta ? parseFloat(precioVenta) : null,
            fechaCompra: fechaCompra || null,
            realPhotos: this.currentPhotos,
            library_id: storage.currentLibraryId
        };

        if (bookId) {
            const numericBookId = typeof bookId === 'number' ? bookId : parseInt(bookId, 10);
            const originalBook = this.books.find(b => b.id === numericBookId || b.id === bookId);
            if (originalBook) {
                bookToSave.fechaRegistro = originalBook.fechaRegistro || originalBook.fecha_registro;
            }
        }

        try {
            await storage.saveBook(bookToSave);
            this.closeAddBookModal();
            await this.loadAndRenderBooks();

            const detailModal = document.getElementById('detail-book-modal');
            if (detailModal && !detailModal.classList.contains('hidden') && bookId) {
                this.showDetailModal(bookId);
            }
        } catch (err) {
            console.error('Error al guardar el libro:', err);
            alert('Hubo un error al guardar el libro.');
        }
    },

    // ============ MODAL DETALLES LIBRO ============

    async showDetailModal(bookId) {
        try {
            const book = await storage.getBook(bookId);
            if (!book) return;

            const modal = document.getElementById('detail-book-modal');
            if (!modal) return;

            // Datos basicos
            document.getElementById('detail-titulo').textContent = book.titulo || 'Sin titulo';
            document.getElementById('detail-autor').textContent = book.autor || 'Autor desconocido';
            document.getElementById('detail-editorial').textContent = book.editorial || '-';
            document.getElementById('detail-anio').textContent = book.anio || '-';
            document.getElementById('detail-descripcion').textContent = book.descripcion || 'No hay descripcion disponible.';
            document.getElementById('detail-isbn').textContent = book.isbn ? `ISBN: ${book.isbn}` : 'Sin ISBN';

            // Precios
            const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
            document.getElementById('detail-precio-compra').textContent = book.precioCompra || book.precio_compra ? formatter.format(book.precioCompra || book.precio_compra) : '-';
            document.getElementById('detail-precio-venta').textContent = book.precioVenta || book.precio_venta ? formatter.format(book.precioVenta || book.precio_venta) : '-';

            // Fecha compra
            const fechaCompra = book.fechaCompra || book.fecha_compra;
            if (fechaCompra) {
                const parts = fechaCompra.split('-');
                const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fechaCompra;
                document.getElementById('detail-fecha-compra').textContent = dateFormatted;
            } else {
                document.getElementById('detail-fecha-compra').textContent = '-';
            }

            // Portada
            const coverImg = document.getElementById('detail-portada');
            const coverPlaceholder = document.getElementById('detail-portada-placeholder');

            let coverSrc = book.portadaUrl || book.portada_url;
            if (!coverSrc && book.realPhotos && book.realPhotos.length > 0) {
                coverSrc = book.realPhotos[0];
            }
            else if (!coverSrc && book.real_photos && book.real_photos.length > 0) {
                coverSrc = book.real_photos[0];
            }

            if (coverSrc) {
                coverImg.src = coverSrc;
                coverImg.classList.remove('hidden');
                coverPlaceholder.classList.add('hidden');
            } else {
                coverImg.classList.add('hidden');
                coverPlaceholder.classList.remove('hidden');
            }

            // Fotos reales
            const realPhotosSection = document.getElementById('detail-real-photos-section');
            const realPhotosGrid = document.getElementById('detail-real-photos-grid');

            const photos = book.realPhotos || book.real_photos || [];
            if (photos.length > 0) {
                if (realPhotosSection) realPhotosSection.classList.remove('hidden');
                if (realPhotosGrid) {
                    realPhotosGrid.innerHTML = '';
                    photos.forEach((photoBase64) => {
                        const imgContainer = document.createElement('div');
                        imgContainer.className = 'aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative shadow-sm cursor-zoom-in group';
                        imgContainer.onclick = () => this.fullscreenPhoto(photoBase64);
                        imgContainer.innerHTML = `<img src="${photoBase64}" alt="Foto real" class="w-full h-full object-cover group-hover:scale-105 transition">`;
                        realPhotosGrid.appendChild(imgContainer);
                    });
                }
            } else {
                if (realPhotosSection) realPhotosSection.classList.add('hidden');
            }

            // Botones de accion
            const btnEdit = document.getElementById('btn-edit-book');
            const btnDelete = document.getElementById('btn-delete-book');

            const canEdit = auth.isAdmin() || book.user_id === auth.getUserId();

            if (btnEdit) {
                btnEdit.onclick = () => {
                    if (canEdit) {
                        this.closeDetailModal();
                        this.editBook(book);
                    } else {
                        alert('No tienes permisos para editar este libro.');
                    }
                };
            }

            if (btnDelete) {
                btnDelete.onclick = () => {
                    if (canEdit) {
                        if (confirm(`¿Estas seguro de que quieres eliminar "${book.titulo}"?`)) {
                            this.deleteBook(book);
                        }
                    } else {
                        alert('No tienes permisos para eliminar este libro.');
                    }
                };
            }

            modal.classList.remove('hidden');
            this.refreshIcons();

        } catch (err) {
            console.error('Error al cargar detalle:', err);
        }
    },

    closeDetailModal() {
        const modal = document.getElementById('detail-book-modal');
        if (modal) modal.classList.add('hidden');
    },

    editBook(book) {
        this.showAddBookModal('manual');

        document.getElementById('form-book-id').value = book.id || '';
        document.getElementById('form-titulo').value = book.titulo || '';
        document.getElementById('form-autor').value = book.autor || '';
        document.getElementById('form-isbn').value = book.isbn || '';
        document.getElementById('form-editorial').value = book.editorial || '';
        document.getElementById('form-anio').value = book.anio || '';
        document.getElementById('form-descripcion').value = book.descripcion || '';
        document.getElementById('form-portada-url').value = book.portadaUrl || book.portada_url || '';
        document.getElementById('form-precio-compra').value = book.precioCompra || book.precio_compra || '';
        document.getElementById('form-precio-venta').value = book.precioVenta || book.precio_venta || '';
        document.getElementById('form-fecha-compra').value = book.fechaCompra || book.fecha_compra || '';

        this.currentPhotos = [...(book.realPhotos || book.real_photos || [])];
        this.renderFormPhotosPreview();
    },

    async deleteBook(id) {
        try {
            await storage.deleteBook(id);
            this.closeDetailModal();
            await this.loadAndRenderBooks();
        } catch (err) {
            console.error('Error al eliminar:', err);
            alert('Error al intentar eliminar el libro.');
        }
    },

    fullscreenPhoto(base64Data) {
        const viewer = document.createElement('div');
        viewer.className = 'fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 cursor-zoom-out';
        viewer.onclick = () => viewer.remove();

        const img = document.createElement('img');
        img.src = base64Data;
        img.className = 'max-w-full max-h-full rounded-lg shadow-2xl object-contain';

        viewer.appendChild(img);
        document.body.appendChild(viewer);
    },

    // Desplazar al inicio
    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};
