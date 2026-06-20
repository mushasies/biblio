const app = {
  books: [],
  currentPhotos: [], // Almacén temporal de fotos Base64 en el formulario actual

  // Inicializar la aplicación
  async init() {
    console.log('Iniciando Biblio App...');
    
    // 1. Inicializar Base de Datos
    try {
      await storage.init();
      await this.loadAndRenderBooks();
    } catch (err) {
      console.error('Error al iniciar storage/libros:', err);
    }

    // 2. Registrar Service Worker para soporte PWA y Offline
    this.registerServiceWorker();

    // 3. Configurar eventos de búsqueda y filtros
    document.getElementById('search-input')?.addEventListener('input', () => this.filterAndRenderBooks());
    document.getElementById('sort-select')?.addEventListener('change', () => this.filterAndRenderBooks());

    // 4. Inicializar iconos visuales de Lucide
    this.refreshIcons();
  },

  // Registrar el Service Worker
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('Service Worker registrado correctamente.', reg.scope))
          .catch((err) => console.warn('Error al registrar el Service Worker:', err));
      });
    }
  },

  // Actualizar los iconos de Lucide en el DOM
  refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  // Cargar libros desde storage y renderizar la interfaz
  async loadAndRenderBooks() {
    this.books = await storage.getAllBooks();
    this.filterAndRenderBooks();
  },

  // Calcular estadísticas de la colección y mostrarlas
  updateStatistics(filteredBooks) {
    const total = filteredBooks.length;
    
    let totalCompra = 0;
    let totalVenta = 0;

    filteredBooks.forEach(book => {
      if (book.precioCompra) totalCompra += book.precioCompra;
      if (book.precioVenta) totalVenta += book.precioVenta;
    });

    // Formateadores de moneda
    const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

    // Actualizar desktop
    const totalDesk = document.getElementById('stats-total-desktop');
    if (totalDesk) totalDesk.textContent = total;
    const compraDesk = document.getElementById('stats-compra-desktop');
    if (compraDesk) compraDesk.textContent = formatter.format(totalCompra);
    const ventaDesk = document.getElementById('stats-venta-desktop');
    if (ventaDesk) ventaDesk.textContent = formatter.format(totalVenta);

    // Actualizar móvil
    const totalMob = document.getElementById('stats-total-mobile');
    if (totalMob) totalMob.textContent = total;
    const compraMob = document.getElementById('stats-compra-mobile');
    if (compraMob) compraMob.textContent = formatter.format(totalCompra);
    const ventaMob = document.getElementById('stats-venta-mobile');
    if (ventaMob) ventaMob.textContent = formatter.format(totalVenta);
  },

  // Filtrar, ordenar y renderizar la colección de libros
  filterAndRenderBooks() {
    const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const sortBy = document.getElementById('sort-select')?.value || 'fechaRegistroDesc';

    // 1. Filtrar por término de búsqueda (título, autor, editorial o ISBN)
    let filtered = this.books.filter(book => {
      const matchTitulo = (book.titulo || '').toLowerCase().includes(query);
      const matchAutor = (book.autor || '').toLowerCase().includes(query);
      const matchEditorial = (book.editorial || '').toLowerCase().includes(query);
      const matchISBN = (book.isbn || '').includes(query);
      return matchTitulo || matchAutor || matchEditorial || matchISBN;
    });

    // 2. Ordenar según selección del usuario
    filtered.sort((a, b) => {
      if (sortBy === 'tituloAsc') {
        return (a.titulo || '').localeCompare(b.titulo || '');
      } else if (sortBy === 'autorAsc') {
        return (a.autor || '').localeCompare(b.autor || '');
      } else if (sortBy === 'precioCompraDesc') {
        return (b.precioCompra || 0) - (a.precioCompra || 0);
      } else {
        // Orden por fecha de registro descendente (por defecto)
        return new Date(b.fechaRegistro || 0) - new Date(a.fechaRegistro || 0);
      }
    });

    // 3. Renderizar las estadísticas basadas en los libros filtrados o en el total
    this.updateStatistics(this.books); // Estadísticas generales de toda la colección

    const booksGrid = document.getElementById('books-grid');
    const emptyState = document.getElementById('empty-state');
    const booksCount = document.getElementById('books-count');

    if (booksCount) booksCount.textContent = filtered.length;

    if (filtered.length === 0) {
      if (booksGrid) booksGrid.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (booksGrid) {
        booksGrid.classList.remove('hidden');
        booksGrid.innerHTML = ''; // Limpiar grid

        filtered.forEach(book => {
          const card = document.createElement('div');
          card.className = 'bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md transition cursor-pointer flex flex-col group';
          card.onclick = () => this.showDetailModal(book.id);

          // Determinar portada a mostrar (API o fotos reales subidas)
          let coverSrc = '';
          if (book.portadaUrl) {
            coverSrc = book.portadaUrl;
          } else if (book.realPhotos && book.realPhotos.length > 0) {
            coverSrc = book.realPhotos[0]; // Usar primera foto real del libro si no tiene de la API
          }

          const hasCover = coverSrc !== '';

          card.innerHTML = `
            <div class="aspect-[3/4] bg-slate-100 relative overflow-hidden flex items-center justify-center border-b border-slate-100 shrink-0">
              ${hasCover 
                ? `<img src="${coverSrc}" alt="Portada de ${book.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">`
                : `<div class="text-slate-300 flex flex-col items-center">
                     <i data-lucide="book" class="w-10 h-10"></i>
                     <span class="text-[10px] text-slate-400 mt-1">Sin portada</span>
                   </div>`
              }
              ${book.precioCompra 
                ? `<span class="absolute bottom-2 right-2 bg-slate-900/85 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                     ${book.precioCompra.toFixed(2)}€
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
                <span>${book.anio || ''}</span>
              </div>
            </div>
          `;

          booksGrid.appendChild(card);
        });

        this.refreshIcons();
      }
    }
  },

  // Abrir modal de añadir libro
  showAddBookModal(tab = 'scan') {
    const modal = document.getElementById('add-book-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.switchModalTab(tab);
      // Limpiar formulario y fotos
      document.getElementById('book-form')?.reset();
      document.getElementById('form-book-id').value = '';
      document.getElementById('isbn-input').value = '';
      this.currentPhotos = [];
      this.renderFormPhotosPreview();
    }
  },

  // Cerrar modal de añadir libro
  closeAddBookModal() {
    const modal = document.getElementById('add-book-modal');
    if (modal) {
      modal.classList.add('hidden');
      scanner.stopScanner();
    }
  },

  // Cambiar entre pestañas en el modal de añadir libro
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
      
      // Asegurarse de apagar la cámara si se pasa a manual
      scanner.stopScanner();
    }
  },

  // Consultar el ISBN mediante la API y autocompletar el formulario
  async lookupISBN(manualIsbn = null) {
    const isbnVal = manualIsbn || document.getElementById('isbn-input')?.value;
    if (!isbnVal) {
      alert('Ingresa un número de ISBN primero.');
      return;
    }

    // Mostrar feedback visual de búsqueda
    const btn = document.querySelector('button[onclick="app.lookupISBN()"]');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Buscando...</span>';
    this.refreshIcons();

    try {
      const bookData = await api.lookupBook(isbnVal);
      
      // Autocompletar formulario manual
      document.getElementById('form-titulo').value = bookData.titulo;
      document.getElementById('form-autor').value = bookData.autor;
      document.getElementById('form-isbn').value = bookData.isbn;
      document.getElementById('form-editorial').value = bookData.editorial;
      document.getElementById('form-anio').value = bookData.anio;
      document.getElementById('form-descripcion').value = bookData.descripcion;
      document.getElementById('form-portada-url').value = bookData.portadaUrl;

      // Cambiar de pestaña al formulario manual para que el usuario revise y agregue precios
      this.switchModalTab('manual');

    } catch (err) {
      console.error(err);
      alert(err.message || 'No se pudo encontrar el libro. Prueba a ingresarlo de manera manual.');
      // Ir a manual por comodidad
      this.switchModalTab('manual');
      document.getElementById('form-isbn').value = isbnVal;
    } finally {
      if (btn) btn.innerHTML = originalContent;
      this.refreshIcons();
    }
  },

  // Procesar fotos reales cargadas mediante archivo
  handleRealPhotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Convertir cada archivo a Base64
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentPhotos.push(e.target.result);
        this.renderFormPhotosPreview();
      };
      reader.readAsDataURL(file);
    });

    // Resetear valor del file input para permitir re-subidas si se quiere
    event.target.value = '';
  },

  // Renderizar la previsualización de las fotos reales adjuntadas en el formulario
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

  // Eliminar una foto de la lista temporal del formulario
  removeFormPhoto(index) {
    this.currentPhotos.splice(index, 1);
    this.renderFormPhotosPreview();
  },

  // Guardar o Actualizar el libro en la base de datos IndexedDB
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
      realPhotos: this.currentPhotos
    };

    if (bookId) {
      // Es una edición, mantener ID original y fecha de registro original
      bookToSave.id = Number(bookId);
      const originalBook = this.books.find(b => b.id === Number(bookId));
      if (originalBook) {
        bookToSave.fechaRegistro = originalBook.fechaRegistro;
      }
    }

    try {
      await storage.saveBook(bookToSave);
      this.closeAddBookModal();
      await this.loadAndRenderBooks();
      
      // Si el modal de detalle estaba abierto, lo actualizamos también
      const detailModal = document.getElementById('detail-book-modal');
      if (detailModal && !detailModal.classList.contains('hidden') && bookId) {
        this.showDetailModal(bookId);
      }

    } catch (err) {
      console.error('Error al guardar el libro:', err);
      alert('Hubo un error al guardar el libro en tu base de datos local.');
    }
  },

  // Mostrar la ficha técnica o modal de detalle del libro
  async showDetailModal(id) {
    try {
      const book = await storage.getBook(id);
      if (!book) return;

      const modal = document.getElementById('detail-book-modal');
      if (!modal) return;

      // Configurar datos en el modal de detalles
      document.getElementById('detail-titulo').textContent = book.titulo;
      document.getElementById('detail-autor').textContent = book.autor || 'Autor desconocido';
      document.getElementById('detail-isbn').textContent = book.isbn ? `ISBN: ${book.isbn}` : 'Sin ISBN registrado';
      document.getElementById('detail-editorial').textContent = book.editorial || '-';
      document.getElementById('detail-anio').textContent = book.anio || '-';
      document.getElementById('detail-descripcion').textContent = book.descripcion || 'No hay descripción disponible para este libro.';

      // Formatear precios y fecha de compra
      const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
      document.getElementById('detail-precio-compra').textContent = book.precioCompra ? formatter.format(book.precioCompra) : '-';
      document.getElementById('detail-precio-venta').textContent = book.precioVenta ? formatter.format(book.precioVenta) : '-';
      
      if (book.fechaCompra) {
        const parts = book.fechaCompra.split('-');
        const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : book.fechaCompra;
        document.getElementById('detail-fecha-compra').textContent = dateFormatted;
      } else {
        document.getElementById('detail-fecha-compra').textContent = '-';
      }

      // Configurar Portada de API
      const detailPortada = document.getElementById('detail-portada');
      const detailPortadaPlaceholder = document.getElementById('detail-portada-placeholder');
      
      if (book.portadaUrl) {
        detailPortada.src = book.portadaUrl;
        detailPortada.classList.remove('hidden');
        detailPortadaPlaceholder.classList.add('hidden');
      } else {
        detailPortada.classList.add('hidden');
        detailPortadaPlaceholder.classList.remove('hidden');
      }

      // Renderizar fotos reales adjuntadas
      const photosSection = document.getElementById('detail-real-photos-section');
      const photosGrid = document.getElementById('detail-real-photos-grid');
      
      if (book.realPhotos && book.realPhotos.length > 0) {
        photosSection.classList.remove('hidden');
        photosGrid.innerHTML = '';
        book.realPhotos.forEach((photoBase64, index) => {
          const imgContainer = document.createElement('div');
          imgContainer.className = 'aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative shadow-sm cursor-zoom-in group';
          imgContainer.onclick = () => this.fullscreenPhoto(photoBase64);

          imgContainer.innerHTML = `
            <img src="${photoBase64}" alt="Foto real ${index + 1}" class="w-full h-full object-cover group-hover:scale-105 transition">
          `;
          photosGrid.appendChild(imgContainer);
        });
      } else {
        photosSection.classList.add('hidden');
      }

      // Configurar botones de editar y eliminar
      const btnEdit = document.getElementById('btn-edit-book');
      if (btnEdit) {
        btnEdit.onclick = () => {
          this.closeDetailModal();
          this.editBook(book);
        };
      }

      const btnDelete = document.getElementById('btn-delete-book');
      if (btnDelete) {
        btnDelete.onclick = () => {
          if (confirm(`¿Estás seguro de que quieres eliminar "${book.titulo}" de tu biblioteca?`)) {
            this.deleteBook(book.id);
          }
        };
      }

      // Mostrar modal
      modal.classList.remove('hidden');
      this.refreshIcons();

    } catch (err) {
      console.error('Error al cargar detalle:', err);
    }
  },

  // Cerrar modal de detalles del libro
  closeDetailModal() {
    const modal = document.getElementById('detail-book-modal');
    if (modal) modal.classList.add('hidden');
  },

  // Preparar la edición del libro
  editBook(book) {
    this.showAddBookModal('manual');
    
    // Rellenar formulario con datos actuales
    document.getElementById('form-book-id').value = book.id;
    document.getElementById('form-titulo').value = book.titulo;
    document.getElementById('form-autor').value = book.autor || '';
    document.getElementById('form-isbn').value = book.isbn || '';
    document.getElementById('form-editorial').value = book.editorial || '';
    document.getElementById('form-anio').value = book.anio || '';
    document.getElementById('form-descripcion').value = book.descripcion || '';
    document.getElementById('form-portada-url').value = book.portadaUrl || '';

    document.getElementById('form-precio-compra').value = book.precioCompra || '';
    document.getElementById('form-precio-venta').value = book.precioVenta || '';
    document.getElementById('form-fecha-compra').value = book.fechaCompra || '';

    // Cargar fotos reales existentes
    this.currentPhotos = [...(book.realPhotos || [])];
    this.renderFormPhotosPreview();
  },

  // Eliminar un libro por completo
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

  // Mostrar una foto en pantalla completa (Zoom)
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

  // Desplazar al inicio suavemente (para móvil)
  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Arrancar la app cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
