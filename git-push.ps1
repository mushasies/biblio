<#
.SYNOPSIS
    Script compuesto para git: add, commit y push en un solo comando.
.DESCRIPTION
    Este script ejecuta git add ., git commit -m y git push origin main de forma secuencial.
    Si no se proporciona mensaje, usa un mensaje por defecto con la fecha.
.EXAMPLE
    .\git-push.ps1 "Mensaje del commit"
    .\git-push.ps1
#>

param (
    [string]$message = "Actualización de código - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Write-Host "📝 Agregando cambios..." -ForegroundColor Cyan
git add .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al hacer git add" -ForegroundColor Red
    Read-Host "Presione Enter para salir"
    exit 1
}

Write-Host "📝 Haciendo commit con mensaje: $message" -ForegroundColor Cyan
git commit -m "$message"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al hacer commit" -ForegroundColor Red
    Read-Host "Presione Enter para salir"
    exit 1
}

Write-Host "📤 Enviando cambios a origin/main..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al hacer push" -ForegroundColor Red
    Read-Host "Presione Enter para salir"
    exit 1
}

Write-Host "✅ Éxito: add, commit y push completados!" -ForegroundColor Green
Read-Host "Presione Enter para salir"
