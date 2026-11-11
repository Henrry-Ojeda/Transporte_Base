Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  SUBIENDO Y REINICIANDO BACKEND EN VPS (84.247.178.194)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$zipPath = Join-Path $PSScriptRoot "Transporte.API.zip"
Write-Host "1. Subiendo Transporte.API.zip al servidor..." -ForegroundColor Yellow
scp $zipPath root@84.247.178.194:/opt/

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo al subir el archivo por SCP. Verifica tu clave de root." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n2. Descomprimiendo, actualizando contenedor y reiniciando api_transporte..." -ForegroundColor Yellow
ssh -t root@84.247.178.194 "unzip -o /opt/Transporte.API.zip -d /opt/transporte-api/ && docker cp /opt/transporte-api/. api_transporte:/app/ && docker restart api_transporte && echo '' && echo '>>> BACKEND ACTUALIZADO Y REINICIADO CON EXITO <<<'"

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  PROCESO COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green


