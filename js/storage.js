const storage = {
  dbName: 'BiblioDB',
  dbVersion: 1,
  storeName: 'books',
  db: null,

  // Inicializar la Base de Datos IndexedDB
  init() {
    return new Promise((resolve, reject) => {
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
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Añadir marca de tiempo de registro si es un libro nuevo
      if (!book.id) {
        book.fechaRegistro = new Date().toISOString();
      }
      
      // Asegurarse de tipar correctamente los precios
      book.precioCompra = book.precioCompra ? parseFloat(book.precioCompra) : null;
      book.precioVenta = book.precioVenta ? parseFloat(book.precioVenta) : null;
      book.realPhotos = book.realPhotos || []; // Array de strings Base64 para fotos reales del libro

      // Si tiene ID, se actualiza; si no, se crea uno nuevo gracias a autoIncrement
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
    await this.checkDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }
};
