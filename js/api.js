const api = {
  // Limpiar caracteres no numéricos del ISBN (como guiones o espacios)
  cleanISBN(isbn) {
    if (!isbn) return '';
    return isbn.replace(/[^0-9X]/gi, '');
  },

  // Método unificado para buscar libro por ISBN en múltiples APIs
  async lookupBook(isbn) {
    const cleaned = this.cleanISBN(isbn);
    if (!cleaned) {
      throw new Error('El ISBN provisto no es válido.'); 
    }

    console.log(`Buscando ISBN: ${cleaned} en APIs externas...`);
    let bookData = null;

    // 1. Intentar primero con Google Books (suele ser la más completa en español)
    try {
      bookData = await this.fetchFromGoogleBooks(cleaned);
    } catch (err) {
      console.warn('Error consultando Google Books:', err);
    }

    // 2. Si no se encuentra o faltan datos clave, intentar con Open Library
    if (!bookData || !bookData.titulo) {
      try {
        const olData = await this.fetchFromOpenLibrary(cleaned);
        if (olData && olData.titulo) {
          // Fusionar o usar la info de Open Library
          bookData = { ...bookData, ...olData };
        }
      } catch (err) {
        console.warn('Error consultando Open Library:', err);
      }
    }

    if (!bookData || !bookData.titulo) {
      throw new Error('No se encontró información para este ISBN en las APIs públicas.');
    }

    return bookData;
  },

  // Consultar la API de Google Books
  async fetchFromGoogleBooks(isbn) {
    // Intentamos primero una búsqueda estricta por ISBN
    let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    let response = await fetch(url);
    if (!response.ok) throw new Error('Google Books API respondió con un error');
    
    let data = await response.json();
    
    // Si no hay resultados estrictos, intentamos una búsqueda general por el número
    if (!data.items || data.items.length === 0) {
      url = `https://www.googleapis.com/books/v1/volumes?q=${isbn}`;
      response = await fetch(url);
      if (response.ok) {
        data = await response.json();
      }
    }

    if (!data.items || data.items.length === 0) return null;

    const info = data.items[0].volumeInfo;
    
    // Normalizar datos de portada (Google Books provee enlaces HTTP, los convertimos a HTTPS si es necesario)
    let portadaUrl = '';
    if (info.imageLinks) {
      portadaUrl = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '';
      if (portadaUrl && portadaUrl.startsWith('http:')) {
        portadaUrl = portadaUrl.replace('http:', 'https:');
      }
    }

    return {
      titulo: info.title || '',
      autor: info.authors ? info.authors.join(', ') : '',
      editorial: info.publisher || '',
      anio: info.publishedDate ? info.publishedDate.substring(0, 4) : '',
      descripcion: info.description || '',
      portadaUrl: portadaUrl,
      isbn: isbn
    };
  },

  // Consultar la API de Open Library
  async fetchFromOpenLibrary(isbn) {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Open Library API respondió con un error');

    const data = await response.json();
    const key = `ISBN:${isbn}`;
    if (!data[key]) return null;

    const info = data[key];

    // Obtener la mejor resolución de portada de Open Library
    let portadaUrl = '';
    if (info.cover) {
      portadaUrl = info.cover.large || info.cover.medium || info.cover.small || '';
    }

    return {
      titulo: info.title || '',
      autor: info.authors ? info.authors.map(a => a.name).join(', ') : '',
      editorial: info.publishers ? info.publishers.map(p => p.name).join(', ') : '',
      anio: info.publish_date ? info.publish_date.match(/\d{4}/)?.[0] || '' : '',
      descripcion: (typeof info.notes === 'string') ? info.notes : '',
      portadaUrl: portadaUrl,
      isbn: isbn
    };
  }
};
