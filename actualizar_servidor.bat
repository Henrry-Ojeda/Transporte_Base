@echo off
title Actualizar y Reiniciar Backend VPS
echo ========================================================
echo   SUBIENDO Y REINICIANDO BACKEND EN VPS (84.247.178.194)
echo ========================================================
echo.
echo 1. Subiendo Transporte.API.zip al servidor...
scp "%~dp0Transporte.API.zip" root@84.247.178.194:/opt/
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Fallo al subir el archivo por SCP. Verifica tu clave de root.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo 2. Descomprimiendo, actualizando contenedor y reiniciando api_transporte...
ssh -t root@84.247.178.194 "unzip -o /opt/Transporte.API.zip -d /opt/transporte-api/ && docker cp /opt/transporte-api/. api_transporte:/app/ && docker restart api_transporte && echo '' && echo '>>> BACKEND ACTUALIZADO Y REINICIADO CON EXITO <<<'"

echo.
echo ========================================================
echo   PROCESO COMPLETADO
echo ========================================================
pause


