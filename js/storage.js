const storage = {
  dbName: 'BiblioDB',
  dbVersion: 3,
  storeName: 'libros',
  libraryStoreName: 'bibliotecas',
  supabaseStoreName: 'books',
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
        const { data, error } = await client.from(this.supabaseStoreName).select('*').order('fechaRegistro', { ascending: false });
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
        const { data, error } = await client.from(this.supabaseStoreName).select('*').order('fechaRegistro', { ascending: false });
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
        const { data, error } = await client.from(this.supabaseStoreName).select('*').eq('id', id).single();
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
    console.log('storage.saveBook() llamado con:', book);
    
    // Normalizar nombres de campos para manejar tanto snake_case como camelCase
    // Precios
    if (book.precio_compra !== undefined) {
      book.precioCompra = book.precio_compra;
    }
    if (book.precio_venta_estimado !== undefined) {
      book.precioVenta = book.precio_venta_estimado;
    }
    
    // Asegurar valores numéricos para precios
    book.precioCompra = book.precioCompra !== undefined ? parseFloat(book.precioCompra) : (book.precio_compra ? parseFloat(book.precio_compra) : null);
    book.precioVenta = book.precioVenta !== undefined ? parseFloat(book.precioVenta) : (book.precio_venta_estimado ? parseFloat(book.precio_venta_estimado) : null);
    
    // Fecha de compra
    if (book.fecha_compra === undefined && book.fechaCompra !== undefined) {
      book.fecha_compra = book.fechaCompra;
    }
    book.fecha_compra = book.fecha_compra ? book.fecha_compra : null;
    
    // Biblioteca ID - manejar biblioteca_id y library_id
    if (book.biblioteca_id !== undefined && !book.library_id) {
      book.library_id = book.biblioteca_id;
    }
    
    // Año de publicación
    if (book.anio_publicacion !== undefined && !book.anio) {
      book.anio = book.anio_publicacion;
    }
    
    // Portada URL
    if (book.portada_url !== undefined && !book.portadaUrl) {
      book.portadaUrl = book.portada_url;
    }
    
    // Autores - si viene como array, convertir a string
    if (Array.isArray(book.autores)) {
      book.autor = book.autores.join(', ');
    } else if (typeof book.autores === 'string') {
      book.autor = book.autores;
    }
    
    if (!book.fechaRegistro) book.fechaRegistro = new Date().toISOString();
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
        console.log('Guardando en Supabase:', this.supabaseStoreName, supabaseBook);
        let result;
        if (book.id !== undefined && book.id !== null && book.id !== '' && !isNaN(book.id)) {
          console.log('Actualizando libro con id:', book.id);
          const { data, error } = await client.from(this.supabaseStoreName).update(supabaseBook).eq('id', book.id).select();
          if (error) {
            console.error('Error al actualizar en Supabase:', error);
            throw error;
          }
          result = this.supabaseToLocalBook(data[0]);
        } else {
          console.log('Insertando nuevo libro');
          const { data, error } = await client.from(this.supabaseStoreName).insert(supabaseBook).select();
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
      const result = await this.saveBookIndexedDB(book);
      console.log('storage.saveBook() devuelve (solo IndexedDB):', result);
      return result;
    }
  },

  async saveBookIndexedDB(book) {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Asegurar que el id es un número válido para IndexedDB
      // Intentar convertir a número si es string numérico
      if (typeof book.id === 'string' && book.id.trim() !== '') {
        const numId = parseInt(book.id, 10);
        if (!isNaN(numId) && numId >= 0) {
          book.id = numId;
        } else {
          delete book.id;
        }
      } else if (book.id === undefined || book.id === null || book.id === '' || typeof book.id !== 'number' || isNaN(book.id) || book.id < 0) {
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
        const { error } = await client.from(this.supabaseStoreName).delete().eq('id', id);
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
    
    // Normalizar autores - puede ser string o array
    let autoresArray = [];
    if (sBook.autores) {
      autoresArray = Array.isArray(sBook.autores) ? sBook.autores : sBook.autores.split(',').map(a => a.trim()).filter(a => a);
    } else if (sBook.autor) {
      autoresArray = [sBook.autor];
    }
    
    // Normalizar biblioteca_id
    const biblioteca_id = sBook.biblioteca_id || sBook.library_id;
    
    return {
      id: bookId,
      titulo: sBook.titulo,
      autor: sBook.autor,
      autores: autoresArray,
      isbn: sBook.isbn,
      editorial: sBook.editorial,
      anio: sBook.anio_publicacion || sBook.anio,
      anio_publicacion: sBook.anio_publicacion || sBook.anio,
      descripcion: sBook.descripcion,
      portadaUrl: sBook.portada_url,
      portada_url: sBook.portada_url,
      precioCompra: sBook.precio_compra !== undefined ? parseFloat(sBook.precio_compra) : null,
      precio_compra: sBook.precio_compra !== undefined ? parseFloat(sBook.precio_compra) : null,
      precioVenta: sBook.precio_venta_estimado !== undefined ? parseFloat(sBook.precio_venta_estimado) : (sBook.precio_venta ? parseFloat(sBook.precio_venta) : null),
      precio_venta_estimado: sBook.precio_venta_estimado !== undefined ? parseFloat(sBook.precio_venta_estimado) : (sBook.precio_venta ? parseFloat(sBook.precio_venta) : null),
      fechaCompra: sBook.fecha_compra,
      fecha_compra: sBook.fecha_compra,
      realPhotos: sBook.real_photos || [],
      real_photos: sBook.real_photos || [],
      fechaRegistro: sBook.fecha_registro || new Date().toISOString(),
      fecha_registro: sBook.fecha_registro || new Date().toISOString(),
      user_id: currentUserId,
      library_id: biblioteca_id,
      biblioteca_id: biblioteca_id
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
    
    // Normalizar campos para manejar tanto snake_case como camelCase
    const titulo = localBook.titulo;
    const autor = localBook.autor || localBook.autor;
    const isbn = localBook.isbn;
    const editorial = localBook.editorial;
    const anio_publicacion = localBook.anio_publicacion || localBook.anio || localBook.anio_publicacion;
    const descripcion = localBook.descripcion || localBook.descripcion;
    const portada_url = localBook.portadaUrl || localBook.portada_url;
    
    // Precios - manejar ambos formatos
    let precio_compra = localBook.precioCompra;
    if (precio_compra === undefined && localBook.precio_compra !== undefined) {
      precio_compra = localBook.precio_compra;
    }
    
    let precio_venta_estimado = localBook.precioVenta;
    if (precio_venta_estimado === undefined && localBook.precio_venta_estimado !== undefined) {
      precio_venta_estimado = localBook.precio_venta_estimado;
    }
    
    // Fecha de compra - manejar ambos formatos
    let fecha_compra = localBook.fechaCompra;
    if (fecha_compra === undefined && localBook.fecha_compra !== undefined) {
      fecha_compra = localBook.fecha_compra;
    }
    
    const real_photos = localBook.realPhotos || localBook.real_photos || [];
    const fecha_registro = localBook.fechaRegistro || localBook.fecha_registro || new Date().toISOString();
    const biblioteca_id = localBook.biblioteca_id || localBook.library_id;
    
    // Convertir biblioteca_id a número si es string
    let bibliotecaIdNum = biblioteca_id;
    if (typeof biblioteca_id === 'string' && biblioteca_id.trim() !== '') {
        bibliotecaIdNum = parseInt(biblioteca_id, 10);
        if (isNaN(bibliotecaIdNum)) {
            bibliotecaIdNum = null;
        }
    } else if (typeof biblioteca_id !== 'number' || isNaN(biblioteca_id)) {
        bibliotecaIdNum = null;
    }
    
    const supabaseBook = {
      titulo: titulo,
      autor: autor,
      autores: autoresValue,
      isbn: isbn,
      editorial: editorial,
      anio_publicacion: anio_publicacion,
      descripcion: descripcion,
      portada_url: portada_url,
      precio_compra: precio_compra !== undefined ? parseFloat(precio_compra) : null,
      precio_venta_estimado: precio_venta_estimado !== undefined ? parseFloat(precio_venta_estimado) : null,
      fecha_compra: fecha_compra,
      real_photos: real_photos,
      fecha_registro: fecha_registro,
      biblioteca_id: bibliotecaIdNum
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

// Funciones globales para compatibilidad con app.js
// Estas funciones usan el contexto de app (app.supabase, app.currentUser)
async function obtenerBibliotecas() {
    if (typeof app === 'undefined' || !app.supabase || !app.currentUser) {
        // Si no hay supabase, devolver bibliotecas de IndexedDB
        try {
            console.log('obtenerBibliotecas: Usando IndexedDB (no hay supabase o usuario)');
            const libs = await storage.getAllLibrariesIndexedDB();
            return { data: libs, error: null };
        } catch (error) {
            console.error('obtenerBibliotecas: Error al obtener de IndexedDB:', error);
            return { data: [], error: error };
        }
    }
    
    try {
        console.log('obtenerBibliotecas: Consultando Supabase...');
        const { data, error } = await app.supabase
            .from('bibliotecas')
            .select('*')
            .eq('user_id', app.currentUser.id);
        
        if (error) throw error;
        console.log('obtenerBibliotecas: Obtenidas de Supabase:', data?.length || 0);
        return { data: data || [], error: null };
    } catch (error) {
        console.error('obtenerBibliotecas: Error consultando Supabase, probando IndexedDB:', error.message);
        // Fallback a IndexedDB
        try {
            const libs = await storage.getAllLibrariesIndexedDB();
            console.log('obtenerBibliotecas: Fallback a IndexedDB exitoso:', libs.length);
            return { data: libs, error: null };
        } catch (localError) {
            console.error('obtenerBibliotecas: Error en fallback a IndexedDB:', localError);
            return { data: [], error: error };
        }
    }
}

async function crearBiblioteca(nombre) {
    if (typeof app === 'undefined' || !app.supabase || !app.currentUser) {
        // Crear localmente
        try {
            const newLib = await storage.createLibrary(nombre, app.currentUser?.id);
            return { data: newLib, error: null };
        } catch (error) {
            return { data: null, error: error };
        }
    }
    
    try {
        const { data, error } = await app.supabase
            .from('bibliotecas')
            .insert([{ nombre: nombre.trim(), user_id: app.currentUser.id }])
            .select();
        
        if (error) throw error;
        return { data: data[0], error: null };
    } catch (error) {
        console.error('Error creando biblioteca:', error);
        return { data: null, error: error };
    }
}

async function obtenerLibros(bibliotecaId) {
    if (typeof app === 'undefined' || !app.supabase || !app.currentUser) {
        // Obtener de IndexedDB
        try {
            const books = await storage.getAllBooksIndexedDB();
            // Filtrar por biblioteca
            const filtered = books.filter(b => b.library_id === bibliotecaId || b.biblioteca_id === bibliotecaId);
            return { data: filtered, error: null };
        } catch (error) {
            return { data: [], error: error };
        }
    }
    
    try {
        const { data, error } = await app.supabase
            .from('libros')
            .select('*')
            .eq('biblioteca_id', bibliotecaId)
            .eq('user_id', app.currentUser.id)
            .order('fecha_registro', { ascending: false });
        
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        console.error('Error obteniendo libros:', error);
        return { data: [], error: error };
    }
}

// Funciones para manejo de fotos de libros
async function obtenerFotosLibro(libroId) {
    // Por ahora, las fotos reales se guardan como array en el propio libro
    // Esto es una simplificación - en el futuro podríamos tener una tabla separada
    try {
        const libro = await storage.getBookByIdIndexedDB(libroId);
        const fotos = libro?.real_photos || libro?.realPhotos || [];
        return { data: fotos.map((url, index) => ({ id: index, url, libro_id: libroId })), error: null };
    } catch (error) {
        return { data: [], error: error };
    }
}

async function subirFotosLibro(libroId, files) {
    // Convertir archivos a URLs (Base64 para demostración)
    const urls = [];
    for (const file of files) {
        const reader = new FileReader();
        const promise = new Promise((resolve) => {
            reader.onload = () => {
                urls.push({
                    url: reader.result,
                    name: file.name,
                    type: file.type
                });
                resolve();
            };
            reader.readAsDataURL(file);
        });
        await promise;
    }
    return { urls, error: null };
}

async function guardarFotosLibro(libroId, urls) {
    // Actualizar el libro con las URLs de las fotos
    try {
        const libro = await storage.getBookByIdIndexedDB(libroId);
        if (!libro) throw new Error('Libro no encontrado');
        
        libro.real_photos = urls.map(u => u.url);
        libro.realPhotos = urls.map(u => u.url);
        
        await storage.saveBookIndexedDB(libro);
        return { data: libro, error: null };
    } catch (error) {
        return { data: null, error: error };
    }
}

async function eliminarLibro(id) {
    try {
        await storage.deleteBook(id);
        return { error: null };
    } catch (error) {
        return { error: error };
    }
}
