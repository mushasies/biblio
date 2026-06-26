/**
 * Autenticación para Biblio
 * 
 * NOTA IMPORTANTE: Este sistema usa una SERVICE KEY de Supabase expuesta en el frontend.
 * Esto NO es seguro para producción. Para producción, usa:
 * 1. Un backend propio que maneje la autenticación
 * 2. O el sistema de autenticación nativo de Supabase (supabase.auth)
 * 
 * La SERVICE KEY tiene permisos completos y puede acceder a todas las tablas,
 * incluso con RLS habilitado. NO la expongas en producción.
 */

let supabaseClient = null;

const auth = {
    // Datos del usuario actualmente logueado
    currentSession: null,
    
    /**
     * Inicializa el cliente Supabase
     * Usa la anon key para conexión normal, pero la service key para acceder a users
     */
    async initSupabase() {
        const supabaseUrl = localStorage.getItem('supabaseUrl');
        const supabaseAnonKey = localStorage.getItem('supabaseAnonKey');
        const supabaseServiceKey = localStorage.getItem('supabaseServiceKey');

        if (!supabaseUrl) {
            console.log('Supabase no configurado. Mostrando modal de configuración.');
            app.showSupabaseConfigModal();
            document.dispatchEvent(new Event('supabaseReady'));
            return;
        }

        try {
            // Usar service key si está disponible (para acceder a la tabla users)
            // de lo contrario, usar anon key (pero esto puede fallar con RLS)
            const keyToUse = supabaseServiceKey || supabaseAnonKey;
            console.log('Usando clave:', supabaseServiceKey ? 'SERVICE KEY' : 'ANON KEY');
            
            // Advertir si solo se usa anon key (puede fallar con RLS)
            if (!supabaseServiceKey && supabaseAnonKey) {
              console.warn('ADVERTENCIA: Usando ANON KEY. Para registrar usuarios, necesitas la SERVICE KEY o desactivar RLS en la tabla users.');
            }
            
            if (!keyToUse) {
                console.log('No hay clave configurada. Mostrando modal de configuración.');
                app.showSupabaseConfigModal();
                document.dispatchEvent(new Event('supabaseReady'));
                return;
            }
            
            // Esperar a que el evento supabaseReady se dispare (desde index.html)
            // Esto garantiza que Supabase esté completamente cargado
            if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
                await new Promise((resolve) => {
                    const maxWait = 15000; // 15 segundos máximo
                    const startTime = Date.now();
                    
                    const checkInterval = setInterval(() => {
                        const elapsed = Date.now() - startTime;
                        
                        // Verificar si Supabase está disponible
                        if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
                            clearInterval(checkInterval);
                            resolve();
                            return;
                        }
                        
                        // Verificar si el evento ya fue disparado
                        if (elapsed >= maxWait) {
                            clearInterval(checkInterval);
                            resolve(); // Continuar de todos modos después del timeout
                        }
                    }, 100);
                    
                    // También escuchar el evento por si acaso
                    const handler = () => {
                        clearInterval(checkInterval);
                        resolve();
                    };
                    document.addEventListener('supabaseReady', handler);
                });
            }
            
            // Verificar que createClient existe (última verificación)
            if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
                console.error('ERROR: window.supabase no está disponible o no tiene createClient');
                console.error('Tipo de window.supabase:', typeof window.supabase);
                throw new Error('La librería Supabase no se cargó correctamente. Verifica tu conexión a internet y recarga la página.');
            }
            
            supabaseClient = window.supabase.createClient(supabaseUrl, keyToUse);
            console.log('Supabase client inicializado con', supabaseServiceKey ? 'SERVICE KEY' : 'ANON KEY');
            
            // Inicializar el módulo de usuarios con el cliente Supabase
            users.init(supabaseClient);
            
            // Verificar si hay una sesión guardada en localStorage
            const savedUser = localStorage.getItem('biblio_user');
            if (savedUser) {
                try {
                    this.currentSession = JSON.parse(savedUser);
                    users.currentUser = this.currentSession;
                    console.log('Sesión recuperada:', this.currentSession);
                    app.handleAuthChange(this.currentSession);
                } catch (e) {
                    console.error('Error al recuperar sesión:', e);
                    localStorage.removeItem('biblio_user');
                }
            } else {
                // No hay sesión, mostrar modal de autenticación
                app.handleAuthChange(null);
            }
            
            document.dispatchEvent(new Event('supabaseReady'));
            
        } catch (error) {
            console.error('Error al inicializar Supabase:', error.message);
            alert('Error al conectar con Supabase. Por favor, revisa tus claves en la configuración.');
            app.showSupabaseConfigModal();
            document.dispatchEvent(new Event('supabaseReady'));
        }
    },
    
    // Iniciar sesión con email y contraseña (usando nuestro sistema)
    async signIn(email, password) {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        
        const result = await users.login(email, password);
        
        if (!result.success) {
            throw new Error(result.error || 'Error al iniciar sesión');
        }
        
        // Guardar sesión
        this.currentSession = result.user;
        users.currentUser = result.user;
        localStorage.setItem('biblio_user', JSON.stringify(result.user));
        
        console.log('Sesión iniciada con éxito:', result.user);
        return result.user;
    },
    
    // Registrar nuevo usuario (usando nuestro sistema)
    async signUp(email, password) {
        if (!supabaseClient) throw new Error('Supabase no inicializado.');
        
        // Verificar si estamos usando ANON KEY sin SERVICE KEY
        const supabaseServiceKey = localStorage.getItem('supabaseServiceKey');
        const supabaseAnonKey = localStorage.getItem('supabaseAnonKey');
        if (supabaseAnonKey && !supabaseServiceKey) {
          console.warn('ADVERTENCIA: Intentando registrar con ANON KEY. Esto fallará si RLS está activado en la tabla users.');
        }
        
        const result = await users.register(email, password);
        
        if (!result.success) {
            // Mejorar el mensaje de error para el usuario
            let errorMsg = result.error || 'Error en el registro';
            // Si el error sugiere problemas de permisos, mostrar guía clara
            if (errorMsg.includes('permisos') || errorMsg.includes('permission') || errorMsg.includes('RLS') || errorMsg.includes('denied')) {
              errorMsg = 'No se puede registrar el usuario. Necesitas configurar la SERVICE KEY de Supabase en la configuración. La anon key no tiene permisos para insertar usuarios.';
            }
            throw new Error(errorMsg);
        }
        
        // Guardar sesión automáticamente después del registro
        this.currentSession = result.user;
        users.currentUser = result.user;
        localStorage.setItem('biblio_user', JSON.stringify(result.user));
        
        console.log('Registro exitoso:', result.user);
        return result.user;
    },
    
    // Cerrar sesión
    async signOut() {
        users.logout();
        this.currentSession = null;
        localStorage.removeItem('biblio_user');
        console.log('Sesión cerrada.');
    },
    
    // Obtener la sesión actual
    getSession() {
        return this.currentSession;
    },
    
    // Obtener el usuario actual
    getUser() { 
        return users.getCurrentUser();
    },
    
    // Verificar si el usuario es admin
    isAdmin() {
        return users.isAdmin();
    },
    
    // Obtener el ID del usuario actual
    getUserId() {
        return users.getCurrentUserId();
    },
    
    // Función para realizar consultas a la base de datos de Supabase
    async from(tableName) {
        if (!supabaseClient) throw new Error('Supabase no inicializado o no configurado.');
        if (!this.getUser()) throw new Error('Usuario no autenticado.');
        return supabaseClient.from(tableName);
    },
    
    // Obtener el cliente Supabase (para usar en storage.js)
    getClient() {
        return supabaseClient;
    },
    
    // --- Funciones para gestión de usuarios (delegadas a users.js) ---
    
    async getAllUsers() {
        return users.getAllUsers();
    },
    
    async updateUserRole(userId, newRole) {
        return users.updateUserRole(userId, newRole);
    },
    
    async deleteUser(userId) {
        return users.deleteUser(userId);
    }
};
