-- ============================================
-- CONFIGURACIÓN DE USUARIOS PARA BIBLIO
-- Ejecuta este SQL en tu dashboard de Supabase
-- ============================================

-- 1. Crear la tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',  -- 'user' o 'admin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear índice para búsquedas rápidas por email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Habilitar RLS en la tabla users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para la tabla users
-- Permitir registro (insertar nuevos usuarios)
CREATE POLICY "Allow user registration" ON users
  FOR INSERT WITH CHECK (true);

-- Permitir a los usuarios actualizar su propio perfil (pero NO la contraseña ni el rol)
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (
    auth.uid() = id 
    AND pg_has_role('authenticated', 'USAGE') 
    -- No permitir cambiar role ni password_hash
    AND (NEW.role = OLD.role OR NEW.role IS NULL)
    AND (NEW.password_hash = OLD.password_hash OR NEW.password_hash IS NULL)
  );

-- Permitir a los usuarios ver SU propio perfil
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT 
  USING (auth.uid() = id);

-- Permitir a los admins ver y gestionar todos los usuarios
CREATE POLICY "Admins can manage all users" ON users
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ============================================
-- CONFIGURACIÓN DE LA TABLA BOOKS (actualizada)
-- ============================================

-- Añadir columna user_id a la tabla books si no existe
ALTER TABLE books ADD COLUMN IF NOT EXISTS user_id UUID;

-- Crear índice para búsquedas por usuario
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);

-- Habilitar RLS en books (si no lo estaba ya)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- Políticas para books:
-- 1. Los usuarios pueden ver sus propios libros
CREATE OR REPLACE POLICY "Users can view own books" ON books
  FOR SELECT USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. Los usuarios pueden insertar sus propios libros
CREATE OR REPLACE POLICY "Users can insert own books" ON books
  FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Los usuarios pueden actualizar sus propios libros
CREATE OR REPLACE POLICY "Users can update own books" ON books
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Los usuarios pueden eliminar sus propios libros
CREATE OR REPLACE POLICY "Users can delete own books" ON books
  FOR DELETE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Los admins pueden hacer todo en books
CREATE OR REPLACE POLICY "Admins can do everything on books" ON books
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ============================================
-- FUNCIÓN PARA VERIFICAR SI ES EL PRIMER USUARIO
-- (para asignar rol admin automáticamente)
-- ============================================

CREATE OR REPLACE FUNCTION check_first_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Si es el primer usuario, asignar rol admin
  IF (SELECT COUNT(*) FROM users) = 0 THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para asignar admin al primer usuario
DROP TRIGGER IF EXISTS trg_first_user ON users;
CREATE TRIGGER trg_first_user
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_first_user();


-- ============================================
-- FUNCIÓN PARA OBTENER USER_ID A PARTIR DEL EMAIL
-- ============================================

CREATE OR REPLACE FUNCTION get_user_id_by_email(user_email TEXT)
RETURNS UUID AS $$
DECLARE
  user_id_val UUID;
BEGIN
  SELECT id INTO user_id_val 
  FROM users 
  WHERE email = user_email 
  LIMIT 1;
  
  RETURN user_id_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
