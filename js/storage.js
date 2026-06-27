const storage = {
  dbName: 'BiblioDB',
  dbVersion: 2,
  storeName: 'books',
  libraryStoreName: 'libraries',
  db: null,
  isSupabaseEnabled: false,
  supabaseClient: null,
  libraries: [],
  currentLibraryId: null,

  async init(supabaseClient = null) {
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
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('isbn', 'isbn', { unique: false });
          store.createIndex('titulo', 'titulo', { unique: false });
          store.createIndex('autor', 'autor', { unique: false });
          store.createIndex('fechaRegistro', 'fechaRegistro', { unique: false });
          store.createIndex('library_id', 'library_id', { unique: false });
          store.createIndex('user_id', 'user_id', { unique: false });
          console.log('Almacen de objetos "books" creado.');
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
        
        let query = client.from(this.libraryStoreName).select('*').order('nombre', { ascending: true });
        if (!auth.isAdmin()) {
          query = query.eq('user_id', userId);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        this.libraries = data.map(this.supabaseToLocalLibrary);
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
        const userId = auth.getUserId();
        let query = client.from(this.libraryStoreName).select('*').eq('id', libraryId);
        if (!auth.isAdmin()) {
          query = query.eq('user_id', userId);
        }
        const { data, error } = await query.single();
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
      const request = store.get(Number(libraryId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async createLibrary(nombre, userId = null, es_publica = false) {
    if (!userId && auth.getUser()) {
      userId = auth.getUserId();
    }
    if (!userId) throw new Error('Necesitas estar autenticado');

    const library = {
      nombre: nombre.trim(),
      user_id: userId,
      es_publica: es_publica,
      created_at: new Date().toISOString()
    };

    if (this.isSupabaseEnabled) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        const { data, error } = await client.from(this.libraryStoreName).insert(library).select();
        if (error) throw error;
        const newLib = this.supabaseToLocalLibrary(data[0]);
        this.libraries.push(newLib);
        await this.saveLibraryIndexedDB(newLib);
        if (this.libraries.length === 1) {
          this.saveCurrentLibrary(newLib);
        }
        return newLib;
      } catch (error) {
        return this.saveLibraryIndexedDB(library);
      }
    } else {
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
    return {
      id: sLib.id,
      nombre: sLib.nombre,
      user_id: sLib.user_id,
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
        const userId = auth.getUserId();
        let query = client.from(this.storeName).select('*').order('fechaRegistro', { ascending: false });
        if (libraryId) query = query.eq('library_id', libraryId);
        if (!auth.isAdmin()) query = query.eq('user_id', userId);
        const { data, error } = await query;
        if (error) throw error;
        await this.syncBooksToIndexedDB(data);
        return data.map(this.supabaseToLocalBook);
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
        const userId = auth.getUserId();
        let query = client.from(this.storeName).select('*').eq('id', id);
        if (!auth.isAdmin()) query = query.eq('user_id', userId);
        const { data, error } = await query.single();
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
      const request = store.get(Number(id));
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async saveBook(book) {
    if (!book.fechaRegistro) book.fechaRegistro = new Date().toISOString();
    book.precioCompra = book.precioCompra ? parseFloat(book.precioCompra) : null;
    book.precioVenta = book.precioVenta ? parseFloat(book.precioVenta) : null;
    book.realPhotos = book.realPhotos || [];
    
    if (!book.user_id && auth.getUser()) book.user_id = auth.getUserId();
    if (!book.library_id && this.currentLibraryId) book.library_id = this.currentLibraryId;

    if (this.isSupabaseEnabled && auth.getUser()) {
      try {
        const client = this.supabaseClient || auth.getClient();
        if (!client) throw new Error('Cliente no disponible');
        const supabaseBook = this.localToSupabaseBook(book);
        let result;
        if (book.id) {
          const { data, error } = await client.from(this.storeName).update(supabaseBook).eq('id', book.id).select();
          if (error) throw error;
          result = this.supabaseToLocalBook(data[0]);
        } else {
          const { data, error } = await client.from(this.storeName).insert(supabaseBook).select();
          if (error) throw error;
          result = this.supabaseToLocalBook(data[0]);
        }
        await this.saveBookIndexedDB(result);
        return result;
      } catch (error) {
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
        const userId = auth.getUserId();
        let query = client.from(this.storeName).delete().eq('id', id);
        if (!auth.isAdmin()) query = query.eq('user_id', userId);
        const { error } = await query;
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
      const request = store.delete(Number(id));
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
    return {
      id: sBook.id,
      titulo: sBook.titulo,
      autor: sBook.autor,
      isbn: sBook.isbn,
      editorial: sBook.editorial,
      anio: sBook.anio,
      descripcion: sBook.descripcion,
      portadaUrl: sBook.portada_url,
      precioCompra: sBook.precio_compra,
      precioVenta: sBook.precio_venta,
      fechaCompra: sBook.fecha_compra,
      realPhotos: sBook.real_photos || [],
      fechaRegistro: sBook.fecha_registro || new Date().toISOString(),
      user_id: sBook.user_id,
      library_id: sBook.library_id
    };
  },

  localToSupabaseBook(localBook) {
    return {
      id: localBook.id || undefined,
      user_id: localBook.user_id,
      library_id: localBook.library_id || this.currentLibraryId,
      titulo: localBook.titulo,
      autor: localBook.autor,
      isbn: localBook.isbn,
      editorial: localBook.editorial,
      anio: localBook.anio,
      descripcion: localBook.descripcion,
      portada_url: localBook.portadaUrl,
      precio_compra: localBook.precioCompra,
      precio_venta: localBook.precioVenta,
      fecha_compra: localBook.fechaCompra,
      real_photos: localBook.realPhotos,
      fecha_registro: localBook.fechaRegistro || new Date().toISOString()
    };
  }
};
