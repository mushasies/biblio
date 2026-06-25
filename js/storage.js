const storage = {
  dbName: 'BiblioDB',
  dbVersion: 1,
  storeName: 'books',
  db: null,
  isSupabaseEnabled: false, // Nuevo: Indica si Supabase está activo

  // Inicializar la Base de Datos IndexedDB (y Supabase si está configurado)
  async init() {
    // Inicializar IndexedDB (siempre se usa como caché o fallback)
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('Base de datos IndexedDB inicializada correctamente.');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          // Usamos un id autoincremental como clave primaria
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          
          // Crear índices para búsquedas o clasificaciones rápidas
          store.createIndex('isbn', 'isbn', { unique: false });
          store.createIndex('titulo', 'titulo', { unique: false });
          store.createIndex('autor', 'autor', { unique: false });
          store.createIndex('fechaRegistro', 'fechaRegistro', { unique: false });
          
          console.log('Almacén de objetos "books" creado con éxito.');
        }
      };
    });
  },

  // Asegurar que la BD esté inicializada antes de cualquier operación
  async checkDb() {
    if (!this.db) {
      await this.init();
    }
  },

  // Obtener todos los libros de la colección
  async getAllBooks() {
    if (this.isSupabaseEnabled && auth.getUser()) {
      // Si Supabase está habilitado y el usuario logueado, usar Supabase
      try {
        const client = auth.getClient();
        if (!client) throw new Error('Cliente Supabase no disponible');
        
        const { data, error } = await client.from(this.storeName).select('*').order('fechaRegistro', { ascending: false });
        if (error) throw error;
        
        // Actualizar IndexedDB con los datos de Supabase para caché offline
        await this.syncToIndexedDB(data);
        return data.map(this.supabaseToLocalBook); // Adaptar formato si es necesario
      } catch (error) {
        console.error("Error al obtener libros de Supabase:", error.message);
        // En caso de error, intentar con IndexedDB como fallback
        return this.getAllBooksIndexedDB();
      }
    } else {
      // Si no hay Supabase o no está logueado, usar IndexedDB
      return this.getAllBooksIndexedDB();
    }
  },

  async getAllBooksIndexedDB() {
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  // Obtener un libro específico por su ID
  async getBook(id) {
    if (this.isSupabaseEnabled && auth.getUser()) {
      try {
        const client = auth.getClient();
        if (!client) throw new Error('Cliente Supabase no disponible');
        
        const { data, error } = await client.from(this.storeName).select('*').eq('id', id).single();
        if (error) throw error;
        
        return this.supabaseToLocalBook(data);
      } catch (error) {
        console.error("Error al obtener libro de Supabase:", error.message);
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

  // Guardar (añadir o actualizar) un libro
  async saveBook(book) {
    // Preparar el objeto book para IndexedDB y Supabase
    if (!book.fechaRegistro) {
      book.fechaRegistro = new Date().toISOString();
    }
    book.precioCompra = book.precioCompra ? parseFloat(book.precioCompra) : null;
    book.precioVenta = book.precioVenta ? parseFloat(book.precioVenta) : null;
    book.realPhotos = book.realPhotos || [];

    if (this.isSupabaseEnabled && auth.getUser()) {
      // Si Supabase está activo, guardar en la nube
      try {
        const client = auth.getClient();
        if (!client) throw new Error('Cliente Supabase no disponible');
        
        const supabaseBook = this.localToSupabaseBook(book, auth.getUser().id);
        
        let result;
        if (book.id) {
          // Actualizar en Supabase
          const { data, error } = await client.from(this.storeName).update(supabaseBook).eq('id', book.id).select();
          if (error) throw error;
          result = this.supabaseToLocalBook(data[0]);
        } else {
          // Insertar en Supabase
          const { data, error } = await client.from(this.storeName).insert(supabaseBook).select();
          if (error) throw error;
          result = this.supabaseToLocalBook(data[0]);
        }

        // También guardar en IndexedDB para mantener caché offline
        await this.saveBookIndexedDB(result);
        return result;
      } catch (error) {
        console.error("Error al guardar en Supabase:", error.message);
        // Fallback a IndexedDB
        return this.saveBookIndexedDB(book);
      }

    } else {
      // Si no hay Supabase o no está logueado, solo guardar en IndexedDB
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
        book.id = e.target.result; // Asignar el ID generado o existente al objeto
        resolve(book);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  // Eliminar un libro por su ID
  async deleteBook(id) {
    if (this.isSupabaseEnabled && auth.getUser()) {
      // Eliminar de Supabase
      try {
        const client = auth.getClient();
        if (!client) throw new Error('Cliente Supabase no disponible');
        
        const { error } = await client.from(this.storeName).delete().eq('id', id);
        if (error) throw error;
        
        // También eliminar de IndexedDB
        await this.deleteBookIndexedDB(id);
        return true;
      } catch (error) {
        console.error("Error al eliminar de Supabase:", error.message);
        // Fallback a IndexedDB
        return this.deleteBookIndexedDB(id);
      }
    } else {
      // Eliminar solo de IndexedDB
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

  // Sincronizar todos los libros de Supabase a IndexedDB
  async syncToIndexedDB(supabaseBooks) {
    await this.checkDb();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    // Limpiar IndexedDB antes de resincronizar (o podrías hacer merges más complejos)
    await store.clear();

    for (const sBook of supabaseBooks) {
      const localBook = this.supabaseToLocalBook(sBook);
      store.put(localBook);
    }
    console.log(`Sincronizados ${supabaseBooks.length} libros de Supabase a IndexedDB.`);
  },

  // Adaptar el formato de libro de Supabase al formato local
  supabaseToLocalBook(supabaseBook) {
    return {
      id: supabaseBook.id,
      titulo: supabaseBook.titulo,
      autor: supabaseBook.autor,
      isbn: supabaseBook.isbn,
      editorial: supabaseBook.editorial,
      anio: supabaseBook.anio,
      descripcion: supabaseBook.descripcion,
      portadaUrl: supabaseBook.portada_url,
      precioCompra: supabaseBook.precio_compra,
      precioVenta: supabaseBook.precio_venta,
      fechaCompra: supabaseBook.fecha_compra,
      realPhotos: supabaseBook.real_photos || [],
      fechaRegistro: supabaseBook.fecha_registro || new Date().toISOString(),
      // No incluimos user_id en el objeto local directamente para abstraer la capa de autenticación
    };
  },

  // Adaptar el formato de libro local al formato de Supabase
  localToSupabaseBook(localBook, userId) {
    return {
      id: localBook.id || undefined, // Supabase genera el ID si no existe
      user_id: userId,
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
      fecha_registro: localBook.fechaRegistro || new Date().toISOString(),
    };
  }
};
