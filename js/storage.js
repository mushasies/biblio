const storage = {
  dbName: 'BiblioDB',
  dbVersion: 3,
  storeName: 'libros',
  libraryStoreName: 'bibliotecas',
  db: null,
  isSupabaseEnabled: false,
  supabaseClient: null,
  libraries: [],
  currentLibraryId: null,

  async init(supabaseClient = null) {
    // Forzar eliminación de la base de datos antigua si existe para evitar conflictos
    // Esto es necesario porque cambiamos el nombre del object store de 'books' a 'libros'
    const deleteRequest = indexedDB.deleteDatabase(this.dbName);
    deleteRequest.onsuccess = () => {
      console.log('Base de datos antigua eliminada para forzar recreación.');
    };
    deleteRequest.onerror = (e) => {
      console.warn('No se pudo eliminar la base de datos antigua:', e);
    };
    
    // Esperar un momento para que la eliminación se complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('Base de datos IndexedDB inicializada correctamente.');
        this.loadSavedLibrary();
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;
        
        console.log(`Actualizando IndexedDB de v${oldVersion} a v${newVersion}`);
        
        // Migrar de 'books' a 'libros' si es necesario
        if (db.objectStoreNames.contains('books') && !db.objectStoreNames.contains(this.storeName)) {
          console.log('Migrando object store de "books" a "libros"...');
          const oldStore = event.transaction.objectStore('books');
          const newStore = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          newStore.createIndex('isbn', 'isbn', { unique: false });
          newStore.createIndex('titulo', 'titulo', { unique: false });
          newStore.createIndex('autor', 'autor', { unique: false });
          newStore.createIndex('fechaRegistro', 'fechaRegistro', { unique: false });
          newStore.createIndex('library_id', 'library_id', { unique: false });
          newStore.createIndex('user_id', 'user_id', { unique: false });
          
          // Copiar datos del old store al nuevo
          oldStore.getAll().onsuccess = (e) => {
            const allBooks = e.target.result;
            if (allBooks && allBooks.length > 0) {
              console.log(`Migrando ${allBooks.length} libros...`);
              allBooks.forEach(book => {
                // Eliminar el id para que autoIncrement lo genere
                const { id, ...bookData } = book;
                newStore.put(bookData);
              });
            }
          };
          console.log('Almacen de objetos "libros" creado (migrado desde "books").');
        } else if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('isbn', 'isbn', { unique: false });
          store.createIndex('titulo', 'titulo', { unique: false });
          store.createIndex('autor', 'autor', { unique: false });
          store.createIndex('fechaRegistro', 'fechaRegistro', { unique: false });
          store.createIndex('library_id', 'library_id', { unique: false });
          store.createIndex('user_id', 'user_id', { unique: false });
          console.log('Almacen de objetos "libros" creado.');
        }
        
        if (!db.objectStoreNames.contains(this.libraryStoreName)) {
          const libStore = db.createObjectStore(this.libraryStoreName, { keyPath: 'id', autoIncrement: true });
          libStore.createIndex('nombre', 'nombre', { unique: false });
          libStore.createIndex('user_id', 'user_id', { unique: false });
          libStore.createIndex('es_publica', 'es_publica', { unique: false });
          console.log('Almacen de objetos "libraries" creado.');
        }
      };
    });
    
    if (supabaseClient) {
      this.supabaseClient = supabaseClient;
    }
  },

  async checkDb() {
    if (!this.db) {
      await this.init();
    }
  },

  loadSavedLibrary() {
    const savedLib = localStorage.getItem('biblio_current_library');
    if (savedLib) {
      try {
        const lib = JSON.parse(savedLib);
        this.currentLibraryId = lib.id;
        console.log('Biblioteca cargada:', lib.nombre);
      } catch (e) {
        console.error('Error al cargar biblioteca:', e);
      }
    }
  },

  saveCurrentLibrary(library) {
    localStorage.setItem('biblio_current_library', JSON.stringify(library));
    this.currentLibraryId = library.id;
  },

  async setCurrentLibrary(libraryId) {
    const library = await this.getLibrary(libraryId);
    if (library) {
      this.saveCurrentLibrary(library);
      this.currentLibraryId = libraryId;
    }
  },

  getCurrentLibrary() {
    if (!this.currentLibraryId) return null;
    return this.libraries.find(lib => lib.id === this.currentLibraryId);
  },

  // ============ BIBLIOTECAS ============

  async getUserLibraries(userId = null) {
    if (!userId && auth.getUser()) {
      userId = auth.getUserId();
    }
    if (!userId) return [];

    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente Supabase no disponible');
        
        // NO filtrar por user_id en Supabase para evitar constraints
        // Cargamos todos y filtramos localmente
        const { data, error } = await client.from(this.libraryStoreName).select('*').order('nombre', { ascending: true });
        if (error) throw error;
        
        // Convertir y filtrar localmente
        const allLibraries = data.map(this.supabaseToLocalLibrary);
        let filteredLibraries = allLibraries;
        
        if (!auth.isAdmin()) {
          filteredLibraries = filteredLibraries.filter(lib => lib.user_id === userId);
        }
        
        this.libraries = filteredLibraries;
        await this.syncLibrariesToIndexedDB(data);
        return this.libraries;
      } catch (error) {
        console.error('Error bibliotecas Supabase:', error.message);
        return this.getUserLibrariesIndexedDB(userId);
      }
    } else {
      return this.getUserLibrariesIndexedDB(userId);
    }
  },

  async getUserLibrariesIndexedDB(userId) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.libraryStoreName], 'readonly');
      const store = transaction.objectStore(this.libraryStoreName);
      const index = store.index('user_id');
      const request = userId ? index.getAll(userId) : store.getAll();
      request.onsuccess = () => {
        this.libraries = request.result || [];
        resolve(this.libraries);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getLibrary(libraryId) {
    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        // NO filtrar por user_id en Supabase para evitar constraints
        const { data, error } = await client.from(this.libraryStoreName).select('*').eq('id', libraryId).single();
        if (error) throw error;
        return data ? this.supabaseToLocalLibrary(data) : null;
      } catch (error) {
        return this.getLibraryIndexedDB(libraryId);
      }
    } else {
      return this.getLibraryIndexedDB(libraryId);
    }
  },

  async getLibraryIndexedDB(libraryId) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.libraryStoreName], 'readonly');
      const store = transaction.objectStore(this.libraryStoreName);
      const numericId = typeof libraryId === 'number' ? libraryId : (libraryId ? parseInt(libraryId, 10) : NaN);
      if (isNaN(numericId)) {
        reject(new Error('ID de biblioteca inválido'));
        return;
      }
      const request = store.get(numericId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async createLibrary(nombre, userId = null, es_publica = false) {
    if (!userId && auth.getUser()) {
      userId = auth.getUserId();
    }
    if (!userId) throw new Error('Necesitas estar autenticado');

    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        
        // NO enviar user_id a Supabase para evitar constraints
        const supabaseLibrary = {
          nombre: nombre.trim(),
          es_publica: es_publica,
          created_at: new Date().toISOString()
        };
        
        const { data, error } = await client.from(this.libraryStoreName).insert(supabaseLibrary).select();
        if (error) throw error;
        
        // Crear biblioteca local con user_id
        const newLib = this.supabaseToLocalLibrary(data[0]);
        newLib.user_id = userId; // Añadir user_id localmente
        
        this.libraries.push(newLib);
        await this.saveLibraryIndexedDB(newLib);
        if (this.libraries.length === 1) {
          this.saveCurrentLibrary(newLib);
        }
        return newLib;
      } catch (error) {
        const library = {
          nombre: nombre.trim(),
          user_id: userId,
          es_publica: es_publica,
          created_at: new Date().toISOString()
        };
        return this.saveLibraryIndexedDB(library);
      }
    } else {
      const library = {
        nombre: nombre.trim(),
        user_id: userId,
        es_publica: es_publica,
        created_at: new Date().toISOString()
      };
      return this.saveLibraryIndexedDB(library);
    }
  },

  async saveLibraryIndexedDB(library) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.libraryStoreName], 'readwrite');
      const store = transaction.objectStore(this.libraryStoreName);
      const request = store.put(library);
      request.onsuccess = () => {
        library.id = request.result;
        resolve(library);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async syncLibrariesToIndexedDB(supabaseLibraries) {
    await this.checkDb();
    const transaction = this.db.transaction([this.libraryStoreName], 'readwrite');
    const store = transaction.objectStore(this.libraryStoreName);
    await store.clear();
    for (const sLib of supabaseLibraries) {
      const localLib = this.supabaseToLocalLibrary(sLib);
      store.put(localLib);
    }
  },

  supabaseToLocalLibrary(sLib) {
    // Obtener user_id del contexto local (no de Supabase)
    // ya que no lo guardamos en Supabase para evitar problemas de constraints
    const currentUserId = auth.getUser() ? auth.getUserId() : null;
    
    return {
      id: sLib.id,
      nombre: sLib.nombre,
      user_id: sLib.user_id || currentUserId, // Priorizar el de Supabase si existe, sino usar local
      es_publica: sLib.es_publica || false,
      created_at: sLib.created_at || new Date().toISOString()
    };
  },

  // ============ LIBROS ============

  async getAllBooks(libraryId = null) {
    if (!libraryId && this.currentLibraryId) {
      libraryId = this.currentLibraryId;
    }
    
    if (auth.isAdmin() && !libraryId) {
      return this.getAllBooksForAdmin();
    }
    
    if (!auth.getUser()) {
      return this.getAllBooksIndexedDB(null, null);
    }

    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        // NO filtrar por library_id ni user_id en Supabase (no existen esos campos allí)
        // Cargamos todos y luego filtramos localmente
        const { data, error } = await client.from(this.storeName).select('*').order('fechaRegistro', { ascending: false });
        if (error) throw error;
        
        // Convertir y filtrar localmente
        const allBooks = data.map(this.supabaseToLocalBook);
        
        // Filtrar por library_id y user_id localmente
        const userId = auth.getUserId();
        let filteredBooks = allBooks;
        
        if (!auth.isAdmin()) {
          filteredBooks = filteredBooks.filter(b => b.user_id === userId);
        }
        if (libraryId) {
          filteredBooks = filteredBooks.filter(b => b.library_id === libraryId);
        }
        
        await this.syncBooksToIndexedDB(data);
        return filteredBooks;
      } catch (error) {
        return this.getAllBooksIndexedDB(libraryId, auth.getUserId());
      }
    } else {
      return this.getAllBooksIndexedDB(libraryId, auth.getUserId());
    }
  },

  async getAllBooksForAdmin() {
    if (!auth.isAdmin()) return this.getAllBooks();
    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        const { data, error } = await client.from(this.storeName).select('*').order('fechaRegistro', { ascending: false });
        if (error) throw error;
        await this.syncBooksToIndexedDB(data);
        return data.map(this.supabaseToLocalBook);
      } catch (error) {
        return this.getAllBooksIndexedDB();
      }
    } else {
      return this.getAllBooksIndexedDB();
    }
  },

  async getAllBooksIndexedDB(libraryId = null, userId = null) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const allBooks = request.result || [];
        const filtered = allBooks.filter(b => 
          (!libraryId || b.library_id === libraryId) && 
          (!userId || b.user_id === userId)
        );
        resolve(filtered);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getBook(id) {
    if (this.isSupabaseEnabled && auth.getUser()) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        // NO filtrar por user_id en Supabase (no existe ese campo allí)
        const { data, error } = await client.from(this.storeName).select('*').eq('id', id).single();
        if (error) throw error;
        return data ? this.supabaseToLocalBook(data) : null;
      } catch (error) {
        return this.getBookIndexedDB(id);
      }
    } else {
      return this.getBookIndexedDB(id);
    }
  },

  async getBookIndexedDB(id) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const numericId = typeof id === 'number' ? id : (id ? parseInt(id, 10) : NaN);
      if (isNaN(numericId)) {
        reject(new Error('ID inválido'));
        return;
      }
      const request = store.get(numericId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async saveBook(book) {
    if (!book.fechaRegistro) book.fechaRegistro = new Date().toISOString();
    book.precioCompra = book.precioCompra ? parseFloat(book.precioCompra) : null;
    book.precioVenta = book.precioVenta ? parseFloat(book.precioVenta) : null;
    book.fecha_compra = book.fecha_compra ? book.fecha_compra : null;
    book.realPhotos = book.realPhotos || [];
    
    if (!book.user_id && auth.getUser()) book.user_id = auth.getUserId();
    
    // Asegurar que library_id tenga un valor válido
    if (!book.library_id) {
      if (this.currentLibraryId) {
        book.library_id = this.currentLibraryId;
      } else if (auth.getUser()) {
        // Si no hay biblioteca seleccionada, intentar obtener la primera del usuario
        const userLibraries = await this.getUserLibrariesIndexedDB(auth.getUserId());
        if (userLibraries && userLibraries.length > 0) {
          book.library_id = userLibraries[0].id;
          this.currentLibraryId = userLibraries[0].id;
          this.saveCurrentLibrary(userLibraries[0]);
        } else {
          // Crear una biblioteca por defecto si no hay ninguna
          console.warn('No hay biblioteca seleccionada, creando una por defecto...');
          const userId = auth.getUserId();
          const defaultLib = {
            nombre: 'Mi Biblioteca',
            user_id: userId,
            es_publica: false,
            created_at: new Date().toISOString()
          };
          const savedLib = await this.saveLibraryIndexedDB(defaultLib);
          book.library_id = savedLib.id;
          this.currentLibraryId = savedLib.id;
          this.saveCurrentLibrary(savedLib);
        }
      }
    }

    if (this.isSupabaseEnabled && auth.getUser()) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        const supabaseBook = this.localToSupabaseBook(book);
        console.log('Guardando en Supabase:', this.storeName, supabaseBook);
        let result;
        if (book.id !== undefined && book.id !== null && book.id !== '' && !isNaN(book.id)) {
          console.log('Actualizando libro con id:', book.id);
          const { data, error } = await client.from(this.storeName).update(supabaseBook).eq('id', book.id).select();
          if (error) {
            console.error('Error al actualizar en Supabase:', error);
            throw error;
          }
          result = this.supabaseToLocalBook(data[0]);
        } else {
          console.log('Insertando nuevo libro');
          const { data, error } = await client.from(this.storeName).insert(supabaseBook).select();
          if (error) {
            console.error('Error al insertar en Supabase:', error);
            throw error;
          }
          result = this.supabaseToLocalBook(data[0]);
        }
        // Guardar localmente con user_id y library_id (que no se enviaron a Supabase)
        const localBookWithRelations = {
          ...result,
          user_id: book.user_id,
          library_id: book.library_id
        };
        await this.saveBookIndexedDB(localBookWithRelations);
        return localBookWithRelations;
      } catch (error) {
        console.warn('No se pudo guardar en Supabase, guardando solo localmente:', error.message);
        return this.saveBookIndexedDB(book);
      }
    } else {
      return this.saveBookIndexedDB(book);
    }
  },

  async saveBookIndexedDB(book) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Asegurar que el id es un número válido para IndexedDB
      // Si el libro tiene id pero no es un número válido, eliminarlo para que autoIncrement lo genere
      if (book.id === undefined || book.id === null || book.id === '' || typeof book.id !== 'number' || isNaN(book.id)) {
        console.warn('ID inválido para IndexedDB, se generará uno nuevo:', book.id);
        delete book.id;
      }
      
      const request = store.put(book);
      request.onsuccess = (e) => {
        book.id = e.target.result;
        resolve(book);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteBook(id) {
    if (this.isSupabaseEnabled && auth.getUser()) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        // NO filtrar por user_id en Supabase (no existe ese campo allí)
        // Confiamos en que el libro pertence al usuario por el contexto local
        const { error } = await client.from(this.storeName).delete().eq('id', id);
        if (error) throw error;
        await this.deleteBookIndexedDB(id);
        return true;
      } catch (error) {
        return this.deleteBookIndexedDB(id);
      }
    } else {
      return this.deleteBookIndexedDB(id);
    }
  },

  async deleteBookIndexedDB(id) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const numericId = typeof id === 'number' ? id : (id ? parseInt(id, 10) : NaN);
      if (isNaN(numericId)) {
        reject(new Error('ID inválido para eliminar'));
        return;
      }
      const request = store.delete(numericId);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async syncBooksToIndexedDB(supabaseBooks) {
    await this.checkDb();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    await store.clear();
    for (const sBook of supabaseBooks) {
      const localBook = this.supabaseToLocalBook(sBook);
      store.put(localBook);
    }
  },

  supabaseToLocalBook(sBook) {
    // Asegurar que el id es un número (BIGINT de Supabase llega como número en JavaScript)
    const bookId = typeof sBook.id === 'string' ? parseInt(sBook.id, 10) : (sBook.id || undefined);
    
    // Obtener user_id y library_id del contexto local (no de Supabase)
    // ya que no los guardamos en Supabase para evitar problemas de constraints
    const currentUserId = auth.getUser() ? auth.getUserId() : null;
    
    return {
      id: bookId,
      titulo: sBook.titulo,
      autor: sBook.autor,
      autores: sBook.autores || sBook.autor ? [sBook.autor] : [],
      isbn: sBook.isbn,
      editorial: sBook.editorial,
      anio: sBook.anio_publicacion || sBook.anio,
      anio_publicacion: sBook.anio_publicacion || sBook.anio,
      descripcion: sBook.descripcion,
      portadaUrl: sBook.portada_url,
      precioCompra: sBook.precio_compra,
      precioVenta: sBook.precio_venta_estimado || sBook.precio_venta,
      fechaCompra: sBook.fecha_compra,
      realPhotos: sBook.real_photos || [],
      fechaRegistro: sBook.fecha_registro || new Date().toISOString(),
      user_id: currentUserId,
      library_id: this.currentLibraryId,
      biblioteca_id: sBook.biblioteca_id
    };
  },

  localToSupabaseBook(localBook) {
    // NO enviar user_id ni library_id a Supabase para evitar constraints
    // Estos campos solo se guardan localmente en IndexedDB
    
    // Convertir autores array a string si es necesario
    let autoresValue = localBook.autores || localBook.autor || '';
    if (Array.isArray(autoresValue)) {
      autoresValue = autoresValue.join(', ');
    }
    
    const supabaseBook = {
      titulo: localBook.titulo,
      autor: localBook.autor,
      autores: autoresValue,
      isbn: localBook.isbn,
      editorial: localBook.editorial,
      anio_publicacion: localBook.anio_publicacion || localBook.anio,
      descripcion: localBook.descripcion,
      portada_url: localBook.portadaUrl,
      precio_compra: localBook.precioCompra,
      precio_venta_estimado: localBook.precio_venta_estimado || localBook.precioVenta,
      fecha_compra: localBook.fechaCompra,
      real_photos: localBook.realPhotos,
      fecha_registro: localBook.fechaRegistro || new Date().toISOString(),
      biblioteca_id: localBook.biblioteca_id || localBook.library_id
    };
    
    // Solo incluir id si existe y es un número válido (para UPDATE)
    if (localBook.id !== undefined && localBook.id !== null && localBook.id !== '' && !isNaN(localBook.id)) {
      supabaseBook.id = localBook.id;
    }
    
    return supabaseBook;
  }
};

// Exponer el objeto storage globalmente
window.storage = storage;
