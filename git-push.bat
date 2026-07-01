@echo off
setlocal enabledelayedexpansion

:: Script compuesto para git: add, commit y push
:: Uso: git-push.bat "mensaje del commit"

set "commit_msg=%~1"

if "%commit_msg%"=="" (
    set "commit_msg=Actualizaci�n de c�digo - %date% %time%"
)

echo Agregando cambios...
git add .

if %errorlevel% neq 0 (
    echo Error al hacer git add
    pause
    exit /b 1
)

echo Haciendo commit con mensaje: "%commit_msg%"
git commit -m "%commit_msg%"

if %errorlevel% neq 0 (
    echo Error al hacer commit
    pause
    exit /b 1
)

echo Enviando cambios a origin/main...
git push origin main

if %errorlevel% neq 0 (
    echo Error al hacer push
    pause
    exit /b 1
)

echo �xito: add, commit y push completados!
pause