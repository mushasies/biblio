# Scripts de Git para Biblio

## Comandos Compuestos creados

Se han creado dos scripts para automatizar el workflow de git:

### 1. git-push.bat (Batch - CMD)
Script de Windows batch para ejecutar add, commit y push.

**Uso:**
```cmd
git-push.bat "Mensaje del commit"
```

O sin mensaje (usará mensaje por defecto):
```cmd
git-push.bat
```

### 2. git-push.ps1 (PowerShell)
Script de PowerShell con mejor manejo de errores y colores.

**Uso:**
```powershell
.\git-push.ps1 "Mensaje del commit"
```

O sin mensaje:
```powershell
.\git-push.ps1
```

## Configuración de Alias de Git (Opcional)

Si prefieres usar un comando git directo, puedes configurar un alias:

### En CMD:
```cmd
git config --global alias.pushall "!f() { git add . && git commit -m \"$1\"; git push origin main; }; f"
```

Luego usa:
```cmd
git pushall "Mensaje del commit"
```

### En PowerShell:
```powershell
git config --global alias.pushall '!f() { git add . && git commit -m "$1"; git push origin main; }; f'
```

## ¿Qué hace cada script?

1. **git add .** - Agrega todos los cambios
2. **git commit -m "mensaje"** - Hace commit con el mensaje proporcionado
3. **git push origin main** - Envía los cambios al repositorio remoto

## Notas

- Los scripts asumen que estás en la rama `main`
- Si necesitas cambiar la rama, modifica `main` por tu rama en los scripts
- Los scripts verifican errores en cada paso y se detienen si algo falla
