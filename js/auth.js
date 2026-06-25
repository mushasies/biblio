let supabaseClient = null;
let currentSession = null;

const auth = {
    // Inicializa el cliente Supabase y maneja la sesión
    async initSupabase() {
        // Verificar si Supabase está definido, si no, cargarlo dinámicamente
        if (typeof Supabase === 'undefined') {
            console.log('Supabase no está definido. Cargando dinámicamente...');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@supabase/supabase-js@1/dist/umd/supabase.js';
                script.onload = () => {
                    if (typeof Supabase !== 'undefined') {
                        console.log('Supabase cargado correctamente');
                        resolve();
                    } else {
                        reject(new Error('Supabase no se definió después de cargar el script'));
                    }
                };
                script.onerror = () => reject(new Error('Error al cargar Supabase'));
                document.head.appendChild(script);
            });
        }

        const supabaseUrl = localStorage.getItem('supabaseUrl');
        const supabaseAnonKey = localStorage.getItem('supabaseAnonKey');

        if (supabaseUrl && supabaseAnonKey) {
            try {
                supabaseClient = Supabase.createClient(supabaseUrl, supabaseAnonKey);
                console.log('Supabase client inicializado.');

                // Escuchar cambios de autenticación
                supabaseClient.auth.onAuthStateChange((event, session) => {
                    console.log('Auth state changed:', event, session);
                    currentSession = session;
                    app.handleAuthChange(session?.user);
                });

                // Comprobar la sesión actual al inicio
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) throw error;
                currentSession = data.session;
                app.handleAuthChange(data.session?.user);

                document.dispatchEvent(new Event('supabaseReady'));

            } catch (error) {
                console.error('Error al inicializar Supabase:', error.message);
                alert('Error al conectar con Supabase. Por favor, revisa tus claves en la configuración.');
                app.showSupabaseConfigModal();
            }
        } else {
            console.log('Supabase no configurado. Mostrando modal de configuración.');
            app.showSupabaseConfigModal();
        }
        // Siempre anunciar que Supabase está listo (incluso si no está configurado,
        // para que la app pueda mostrar el modal de configuración)
        document.dispatchEvent(new Event('supabaseReady'));
    },

    // Iniciar sesión con email y contraseña
    async signIn(email, password) {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        console.log('Sesión iniciada con éxito.');
    },

    // Registrar nuevo usuario con email y contraseña
    async signUp(email, password) {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        alert('¡Registro exitoso! Por favor, verifica tu email para activar tu cuenta.');
    },

    // Iniciar sesión con Google
    async signInWithGoogle() {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin } // Redirigir a la URL actual después del login
        });
        if (error) throw error;
    },

    // Cerrar sesión
    async signOut() {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        console.log('Sesión cerrada.');
    },

    // Obtener la sesión actual
    getSession() {
        return currentSession;
    },

    // Obtener el usuario actual
    getUser() {
        return currentSession?.user || null;
    },

    // Función para realizar consultas a la base de datos de Supabase
    async from(tableName) {
        if (!supabaseClient) throw new Error('Supabase no inicializado o no configurado.');
        if (!currentSession?.user) throw new Error('Usuario no autenticado.');
        return supabaseClient.from(tableName);
    }
};
