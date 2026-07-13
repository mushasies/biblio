/**
 * Sistema de Gestión de Usuarios para Biblio
 * - Registro y login con email + contraseña
 * - Hash de contraseñas con bcrypt
 * - Primer usuario registrado = admin
 * - Usa Supabase como backend (con service key para acceso directo)
 * 
 * NOTA DE SEGURIDAD: Este enfoque usa una service key expuesta en el frontend.
 * Para producción, se recomienda usar un backend propio o Supabase Auth.
 */

const users = {
  // Referencia al cliente Supabase (se establecerá desde auth.js)
  supabaseClient: null,
  
  // Datos del usuario actualmente logueado
  currentUser: null,
  
  // Inicializar con el cliente Supabase
  init(supabaseClient) {
    this.supabaseClient = supabaseClient;
    console.log('Users module initialized');
  },
  
  /**
   * Registrar un nuevo usuario
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async register(email, password) {
    try {
      // Validar email
      if (!email || !this.isValidEmail(email)) {
        return { success: false, error: 'Email no válido' };
      }
      
      // Validar contraseña (mínimo 6 caracteres)
      if (!password || password.length < 6) {
        return { success: false, error: 'La contraseña debe tener al menos 6 caracteres' };
      }
      
      // Hashear la contraseña
      const passwordHash = await this.hashPassword(password);
      
      // Insertar usuario en Supabase
      // NOTE: El primer usuario se creará con es_admin=true (manualmente o via trigger)
      console.log('Intentando registrar usuario con email:', email);
      const { data, error } = await this.supabaseClient
        .from('perfiles')
        .insert([
          { email, password_hash: passwordHash }
        ])
        .select();
      
      if (error) {
        console.error('Error al registrar usuario:', error);
        if (error.code === '23505') {
          return { success: false, error: 'Este email ya está registrado' };
        }
        // Mostrar más detalles del error
        const errorMsg = error.message || error.details || JSON.stringify(error) || 'Error al registrar usuario';
        console.error('Detalles del error:', error);
        
        // Mensaje de ayuda para errores comunes
        if (errorMsg.includes('RLS') || errorMsg.includes('permission') || errorMsg.includes('denied')) {
          return { success: false, error: 'Error de permisos. Asegúrate de: 1) Usar la SERVICE KEY (no la anon key), 2) Desactivar RLS en la tabla perfiles, o 3) Configurar políticas RLS para permitir INSERT.' };
        }
        
        return { success: false, error: errorMsg };
      }
      
      if (!data || !data[0]) {
        return { success: false, error: 'No se recibió datos del usuario registrado' };
      }
      
      const newUser = data[0];
      console.log('Usuario registrado:', newUser, '(Rol:', newUser.es_admin ? 'admin' : 'user', ')');
      
      return { 
        success: true, 
        user: { 
          id: newUser.id, 
          email: newUser.email,
          role: newUser.es_admin ? 'admin' : 'user'
        } 
      };
    } catch (err) {
      console.error('Register error:', err);
      // Intentar extraer más información del error
      let errorMsg = 'Error interno al registrar usuario';
      if (err.message) {
        errorMsg = err.message;
      }
      if (err.error) {
        errorMsg = err.error.message || err.error.details || JSON.stringify(err.error);
      }
      // Añadir sugerencia para errores de permisos
      if (errorMsg.includes('permission') || errorMsg.includes('denied') || errorMsg.includes('RLS')) {
        errorMsg = 'Error de permisos en la base de datos. SOLUCIÓN: Usa la SERVICE KEY de Supabase (no la anon key) o desactiva RLS en la tabla perfiles.';
      }
      return { success: false, error: errorMsg };
    }
  },
  
  /**
   * Iniciar sesión
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async login(email, password) {
    console.log('users.login: Iniciando login para email:', email);
    try {
      // Buscar usuario por email
      const { data, error } = await this.supabaseClient
        .from('perfiles')
        .select('id, email, password_hash, es_admin')
        .eq('email', email)
        .limit(1);
      
      if (error) {
        console.error('users.login: Error al buscar usuario:', error);
        return { success: false, error: 'Error al buscar usuario' };
      }
      
      if (!data || data.length === 0) {
        console.log('users.login: Usuario no encontrado');
        return { success: false, error: 'Usuario no encontrado' };
      }
      
      const user = data[0];
      console.log('users.login: Usuario encontrado:', user.id, user.email);
      
      // Verificar contraseña
      const isValid = await this.verifyPassword(password, user.password_hash);
      console.log('users.login: Contraseña válida:', isValid);
      
      if (!isValid) {
        console.log('users.login: Contraseña incorrecta');
        return { success: false, error: 'Contraseña incorrecta' };
      }
      
      // Guardar usuario actual
      this.currentUser = {
        id: user.id,
        email: user.email,
        role: user.es_admin ? 'admin' : 'user'
      };
      
      console.log('users.login: Login exitoso, usuario devuelto:', this.currentUser);
      
      return { 
        success: true, 
        user: this.currentUser 
      };
      
    } catch (err) {
      console.error('users.login: Error interno:', err);
      return { success: false, error: 'Error interno al iniciar sesión' };
    }
  },
  
  /**
   * Cerrar sesión
   */
  logout() {
    this.currentUser = null;
    console.log('Sesión cerrada');
  },
  
  /**
   * Obtener el usuario actual
   * @returns {object|null} - Objeto con {id, email, role} o null
   */
  getCurrentUser() {
    return this.currentUser;
  },
  
  /**
   * Verificar si el usuario actual es admin
   * @returns {boolean}
   */
  isAdmin() {
    return this.currentUser?.role === 'admin';
  },
  
  /**
   * Obtener el ID del usuario actual
   * @returns {string|null}
   */
  getCurrentUserId() {
    return this.currentUser?.id || null;
  },
  
  /**
   * Obtener todos los usuarios (solo para admin)
   * @returns {Promise<{success: boolean, users?: array, error?: string}>}
   */
  async getAllUsers() {
    if (!this.isAdmin()) {
      return { success: false, error: 'No tienes permisos de administrador' };
    }
    
    try {
      const { data, error } = await this.supabaseClient
        .from('perfiles')
        .select('id, email, es_admin, created_at')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error al obtener usuarios:', error);
        return { success: false, error: error.message };
      }
      
      // Convertir es_admin a role para mantener compatibilidad
      const usersWithRole = data.map(user => ({
        ...user,
        role: user.es_admin ? 'admin' : 'user'
      }));
      
      return { success: true, users: usersWithRole };
      
    } catch (err) {
      console.error('Get users error:', err);
      return { success: false, error: 'Error interno' };
    }
  },
  
  /**
   * Actualizar rol de usuario (solo para admin)
   * @param {string} userId - ID del usuario a actualizar
   * @param {string} newRole - Nuevo rol ('user' o 'admin')
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateUserRole(userId, newRole) {
    if (!this.isAdmin()) {
      return { success: false, error: 'No tienes permisos de administrador' };
    }
    
    if (!['user', 'admin'].includes(newRole)) {
      return { success: false, error: 'Rol no válido. Usa "user" o "admin"' };
    }
    
    try {
      // Convertir role a es_admin (boolean)
      const esAdminValue = newRole === 'admin';
      const { error } = await this.supabaseClient
        .from('perfiles')
        .update({ es_admin: esAdminValue })
        .eq('id', userId);
      
      if (error) {
        console.error('Error al actualizar rol:', error);
        return { success: false, error: error.message };
      }
      
      return { success: true };
      
    } catch (err) {
      console.error('Update es_admin error:', err);
      return { success: false, error: 'Error interno' };
    }
  },
  
  /**
   * Eliminar usuario (solo para admin)
   * @param {string} userId - ID del usuario a eliminar
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteUser(userId) {
    if (!this.isAdmin()) {
      return { success: false, error: 'No tienes permisos de administrador' };
    }
    
    try {
      const { error } = await this.supabaseClient
        .from('perfiles')
        .delete()
        .eq('id', userId);
      
      if (error) {
        console.error('Error al eliminar usuario:', error);
        return { success: false, error: error.message };
      }
      
      return { success: true };
      
    } catch (err) {
      console.error('Delete user error:', err);
      return { success: false, error: 'Error interno' };
    }
  },
  
  /**
   * Verificar si un email es válido
   * @param {string} email 
   * @returns {boolean}
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  /**
   * Hashear contraseña con SHA-256
   * Usa Web Crypto API (disponible en todos los navegadores modernos)
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<string>} - Hash de la contraseña
   */
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },
  
  /**
   * Verificar contraseña contra hash
   * @param {string} password - Contraseña en texto plano
   * @param {string} hash - Hash almacenado
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, hash) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return passwordHash === hash;
  }
};

// Exponer el objeto users globalmente
window.users = users;

// SHA-256 está disponible nativamente en todos los navegadores modernos
// No se necesita bcrypt.js
