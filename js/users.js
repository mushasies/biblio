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
    console.log('NOTA: Asegúrate de que la tabla "users" en Supabase tenga los campos: id, email, password_hash, role');
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
      
      // Verificar si es el primer usuario (para asignar rol admin)
      let isFirstUser = false;
      try {
        const { data: existingUsers, error: countError } = await this.supabaseClient
          .from('users')
          .select('id')
          .limit(1);
        
        if (!countError) {
          isFirstUser = !existingUsers || existingUsers.length === 0;
        }
      } catch (err) {
        console.warn('No se pudo verificar si hay usuarios existentes, asumiendo que no es el primero:', err);
        // Si hay error al contar, asumimos que no es el primero por seguridad
        isFirstUser = false;
      }
      
      // Insertar usuario en Supabase con el rol adecuado
      const { data, error } = await this.supabaseClient
        .from('users')
        .insert([
          { 
            email, 
            password_hash: passwordHash,
            role: isFirstUser ? 'admin' : 'user'
          }
        ])
        .select();
      
      if (error) {
        console.error('Error al registrar usuario:', error);
        if (error.code === '23505') {
          return { success: false, error: 'Este email ya está registrado' };
        }
        return { success: false, error: error.message || 'Error al registrar usuario' };
      }
      
      if (!data || !data[0]) {
        return { success: false, error: 'No se recibió datos del usuario registrado' };
      }
      
      const newUser = data[0];
      console.log('Usuario registrado:', newUser, '(Rol:', isFirstUser ? 'ADMIN' : 'USER', ')');
      
      return { 
        success: true, 
        user: { 
          id: newUser.id, 
          email: newUser.email,
          role: newUser.role || (isFirstUser ? 'admin' : 'user')
        } 
      };
      
    } catch (err) {
      console.error('Register error:', err);
      return { success: false, error: 'Error interno al registrar usuario' };
    }
  },
  
  /**
   * Iniciar sesión
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async login(email, password) {
    try {
      // Buscar usuario por email
      const { data, error } = await this.supabaseClient
        .from('users')
        .select('id, email, password_hash, role')
        .eq('email', email)
        .limit(1);
      
      if (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Error al buscar usuario' };
      }
      
      if (!data || data.length === 0) {
        return { success: false, error: 'Usuario no encontrado' };
      }
      
      const user = data[0];
      
      // Verificar contraseña
      const isValid = await this.verifyPassword(password, user.password_hash);
      
      if (!isValid) {
        return { success: false, error: 'Contraseña incorrecta' };
      }
      
      // Guardar usuario actual
      this.currentUser = {
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      };
      
      console.log('Login exitoso:', this.currentUser);
      
      return { 
        success: true, 
        user: this.currentUser 
      };
      
    } catch (err) {
      console.error('Login error:', err);
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
        .from('users')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error al obtener usuarios:', error);
        return { success: false, error: error.message };
      }
      
      return { success: true, users: data };
      
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
      const { error } = await this.supabaseClient
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) {
        console.error('Error al actualizar rol:', error);
        return { success: false, error: error.message };
      }
      
      return { success: true };
      
    } catch (err) {
      console.error('Update role error:', err);
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
        .from('users')
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
   * Hashear contraseña con bcrypt
   * Usa la librería bcrypt.js cargada desde CDN
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<string>} - Hash de la contraseña
   */
  async hashPassword(password) {
    // Esperar a que bcrypt esté disponible
    if (typeof bcrypt === 'undefined') {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/bcryptjs@2.4.3/dist/bcrypt.min.js';
        script.onload = resolve;
        script.onerror = () => resolve(); // Si falla, continuamos igual
        document.head.appendChild(script);
      });
    }
    
    // bcrypt.genSalt y bcrypt.hashSync
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    return hash;
  },
  
  /**
   * Verificar contraseña contra hash
   * @param {string} password - Contraseña en texto plano
   * @param {string} hash - Hash almacenado
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, hash) {
    if (typeof bcrypt === 'undefined') {
      // Si bcrypt no está cargado, intentar cargarlo
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/bcryptjs@2.4.3/dist/bcrypt.min.js';
        script.onload = resolve;
        script.onerror = () => resolve();
        document.head.appendChild(script);
      });
    }
    
    return bcrypt.compareSync(password, hash);
  }
};

// Inicializar bcrypt si ya está cargado
if (typeof bcrypt === 'undefined') {
  const bcryptScript = document.createElement('script');
  bcryptScript.src = 'https://unpkg.com/bcryptjs@2.4.3/dist/bcrypt.min.js';  
  document.head.appendChild(bcryptScript);
}
