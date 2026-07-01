// =============================================
// FUNCIONES DE SUPABASE (API)
// =============================================

// Inicializar cliente de Supabase
function initSupabaseClient(url, anonKey) {
    return supabase.createClient(url, anonKey);
}

// =============================================
// BIBLIOTECAS
// =============================================

async function crearBiblioteca(nombre, descripcion = '') {
    const userId = app.currentUser?.id;
    if (!userId) return { data: null, error: new Error('Usuario no autenticado') };

    const { data, error } = await app.supabase
        .from('bibliotecas')
        .insert({
            user_id: userId,
            nombre: nombre,
            descripcion: descripcion
        })
        .select()
        .single();

    return { data, error };
}

async function obtenerBibliotecas() {
    const userId = app.currentUser?.id;
    if (!userId) return { data: [], error: null };

    const { data, error } = await app.supabase
        .from('bibliotecas')
        .select('*')
        .eq('user_id', userId)
        .order('nombre', { ascending: true });

    return { data: data || [], error };
}

async function eliminarBiblioteca(bibliotecaId) {
    const userId = app.currentUser?.id;
    if (!userId) return { error: new Error('Usuario no autenticado') };

    const { error } = await app.supabase
        .from('bibliotecas')
        .delete()
        .eq('id', bibliotecaId)
        .eq('user_id', userId);

    return { error };
}

// =============================================
// LIBROS
// =============================================

async function obtenerLibros(bibliotecaId = null) {
    const userId = app.currentUser?.id;
    if (!userId) return { data: [], error: null };

    let query = app.supabase
        .from('libros')
        .select('*, bibliotecas(nombre, id)');

    if (bibliotecaId) {
        // Verificar que la biblioteca pertenece al usuario
        const { data: bib } = await app.supabase
            .from('bibliotecas')
            .select('id')
            .eq('id', bibliotecaId)
            .eq('user_id', userId)
            .single();

        if (bib) {
            query = query.eq('biblioteca_id', bibliotecaId);
        } else {
            return { data: [], error: null };
        }
    } else {
        // Obtener todas las bibliotecas del usuario
        const { data: bibliotecas } = await obtenerBibliotecas();
        if (bibliotecas.length === 0) {
            return { data: [], error: null };
        }
        const bibliotecaIds = bibliotecas.map(b => b.id);
        query = query.in('biblioteca_id', bibliotecaIds);
    }

    const { data, error } = await query.order('fecha_registro', { ascending: false });
    return { data: data || [], error };
}

async function guardarLibro(libroData) {
    const userId = app.currentUser?.id;
    if (!userId) return { data: null, error: new Error('Usuario no autenticado') };

    // Asegurar que el libro pertenece a una biblioteca del usuario
    if (libroData.biblioteca_id) {
        const { data: bib } = await app.supabase
            .from('bibliotecas')
            .select('id')
            .eq('id', libroData.biblioteca_id)
            .eq('user_id', userId)
            .single();

        if (!bib) {
            return { data: null, error: new Error('Biblioteca no valida') };
        }
    } else {
        // Asignar la biblioteca actual
        libroData.biblioteca_id = app.currentBibliotecaId;
    }

    // Convertir autores de string a array
    if (libroData.autores && typeof libroData.autores === 'string') {
        libroData.autores = libroData.autores.split(',').map(a => a.trim()).filter(a => a);
    }

    // Convertir precios a numero
    libroData.precio_compra = parseFloat(libroData.precio_compra) || 0;
    libroData.precio_venta_estimado = parseFloat(libroData.precio_venta_estimado) || 0;

    const { data, error } = await app.supabase
        .from('libros')
        .upsert(libroData)
        .select()
        .single();

    return { data, error };
}

async function eliminarLibro(libroId) {
    const userId = app.currentUser?.id;
    if (!userId) return { error: new Error('Usuario no autenticado') };

    // Verificar que el libro pertenece al usuario
    const { data: libro } = await app.supabase
        .from('libros')
        .select('biblioteca_id, bibliotecas(user_id)')
        .eq('id', libroId)
        .single();

    if (!libro || libro.bibliotecas.user_id !== userId) {
        return { error: new Error('Libro no encontrado o no autorizado') };
    }

    const { error } = await app.supabase
        .from('libros')
        .delete()
        .eq('id', libroId);

    return { error };
}

async function buscarLibroPorISBN(isbn) {
    const { data, error } = await app.supabase
        .from('libros')
        .select('*')
        .eq('isbn', isbn)
        .single();

    return { data, error };
}

// =============================================
// FOTOS DE LIBROS
// =============================================

async function subirFotosLibro(libroId, files) {
    const userId = app.currentUser?.id;
    if (!userId) return { urls: [], error: new Error('Usuario no autenticado') };

    // Verificar que el libro pertenece al usuario
    const { data: libro } = await app.supabase
        .from('libros')
        .select('biblioteca_id, bibliotecas(user_id)')
        .eq('id', libroId)
        .single();

    if (!libro || libro.bibliotecas.user_id !== userId) {
        return { urls: [], error: new Error('Libro no encontrado o no autorizado') };
    }

    const urls = [];

    for (const file of files) {
        const fileName = `libro_${libroId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${file.name.split('.').pop()}`;

        const { data: uploadData, error: uploadError } = await app.supabase.storage
            .from('fotos-libros')
            .upload(fileName, file);

        if (uploadError) {
            console.error('Error al subir foto:', uploadError);
            continue;
        }

        const { data: urlData } = app.supabase.storage
            .from('fotos-libros')
            .getPublicUrl(fileName);

        if (urlData.publicUrl) {
            urls.push(urlData.publicUrl);
        }
    }

    return { urls, error: null };
}

async function guardarFotosLibro(libroId, urls) {
    if (!urls || urls.length === 0) return { error: null };

    // Eliminar fotos existentes (opcional)
    const { error: deleteError } = await app.supabase
        .from('fotos_libros')
        .delete()
        .eq('libro_id', libroId);

    if (deleteError) {
        console.error('Error al eliminar fotos existentes:', deleteError);
    }

    // Insertar nuevas fotos
    const fotosData = urls.map((url, index) => ({
        libro_id: libroId,
        url: url,
        orden: index
    }));

    const { error } = await app.supabase
        .from('fotos_libros')
        .insert(fotosData);

    return { error };
}

async function obtenerFotosLibro(libroId) {
    const { data, error } = await app.supabase
        .from('fotos_libros')
        .select('*')
        .eq('libro_id', libroId)
        .order('orden', { ascending: true });

    return { data: data || [], error };
}

// =============================================
// PERFILES
// =============================================

async function obtenerPerfil() {
    const userId = app.currentUser?.id;
    if (!userId || !app.supabase) return { data: null, error: null };

    try {
        const { data, error } = await app.supabase
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .single();

        return { data, error };
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        return { data: null, error: error.message };
    }
}

async function actualizarPerfil(perfilData) {
    const userId = app.currentUser?.id;
    if (!userId) return { data: null, error: new Error('Usuario no autenticado') };

    const { data, error } = await app.supabase
        .from('perfiles')
        .upsert({ ...perfilData, id: userId })
        .select()
        .single();

    return { data, error };
}

// =============================================
// ESTADISTICAS
// =============================================

async function obtenerEstadisticas(bibliotecaId = null) {
    const userId = app.currentUser?.id;
    if (!userId) return { data: null, error: null };

    let query = app.supabase
        .from('estadisticas_usuario')
        .select('*');

    if (bibliotecaId) {
        query = query.eq('biblioteca_id', bibliotecaId);
    }

    query = query.eq('user_id', userId);

    const { data, error } = await query;
    return { data: data?.[0] || null, error };
}
