const scanner = {
  html5Qrcode: null,
  scannerId: 'interactive-reader',

  // Inicializar o activar el escáner de cámara
  async startScanner() {
    // Ocultar el marcador de posición y mostrar el área de lectura de cámara
    const placeholder = document.getElementById('reader-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    try {
      if (!this.html5Qrcode) {
        this.html5Qrcode = new Html5Qrcode(this.scannerId);
      }

      // Configuración óptima para códigos de barras EAN-13 (ISBN) y EAN-8
      const config = {
        fps: 15,
        qrbox: (width, height) => {
          // Un área alargada horizontal es ideal para códigos de barras de libros
          return {
            width: Math.min(width * 0.8, 400),
            height: Math.min(height * 0.4, 150)
          };
        },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8
        ]
      };

      // Iniciar cámara trasera preferentemente
      await this.html5Qrcode.start(
        { facingMode: 'environment' },
        config,
        (decodedText, decodedResult) => {
          // Éxito al escanear
          console.log(`Código escaneado con éxito: ${decodedText}`, decodedResult);
          this.handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Error continuo buscando (es normal mientras busca en el frame)
          // No loguear para evitar saturar la consola
        }
      );

    } catch (err) {
      console.error('Error al iniciar la cámara del escáner:', err);
      alert('No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios u opta por subir una foto.');
      this.stopScanner();
    }
  },

  // Detener el escáner de cámara y liberar recursos de hardware
  async stopScanner() {
    if (this.html5Qrcode) {
      try {
        if (this.html5Qrcode.isScanning) {
          await this.html5Qrcode.stop();
        }
      } catch (err) {
        console.error('Error al detener el escáner:', err);
      }
    }
    
    // Restaurar marcador de posición visual
    const placeholder = document.getElementById('reader-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
  },

  // Procesar código ISBN detectado
  handleScanSuccess(isbn) {
    this.stopScanner();
    
    // Reproducir un sonido breve de confirmación de escaneo (Beep) si es compatible
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, context.currentTime); // Tono agudo
      osc.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.1);
    } catch (e) {
      console.log('AudioContext no soportado para beep de escaneo.');
    }

    // Poner el ISBN en el input y buscar
    const isbnInput = document.getElementById('isbn-input');
    if (isbnInput) {
      isbnInput.value = isbn;
      // Disparar la búsqueda automática en la API
      app.lookupISBN(isbn);
    }
  },

  // Escanear a partir de un archivo subido (foto del código de barras de la galería)
  async scanFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log('Escaneando código de barras desde archivo...', file.name);
    
    // Crear una instancia temporal de Html5Qrcode si no existe
    const localQrcode = new Html5Qrcode('interactive-reader', { verbose: false });

    try {
      const decodedText = await localQrcode.scanFileV2(file, false);
      console.log('Código de barras detectado en archivo:', decodedText);
      
      // Pasar el código detectado
      this.handleScanSuccess(decodedText.decodedText);
    } catch (err) {
      console.error('Error al decodificar la imagen:', err);
      alert('No se pudo detectar un código de barras claro en la imagen proporcionada. Por favor, asegúrate de que el código esté bien enfocado e iluminado.');
    } finally {
      // Limpiar archivo del input para permitir subir el mismo archivo después si es necesario
      event.target.value = '';
    }
  }
};
