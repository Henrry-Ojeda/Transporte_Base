<#
.SYNOPSIS
  Descarga respaldos comprimidos (.bak.gz) de todas las bases de datos de PROD desde el VPS Contabo hacia esta laptop.
  Portable a cualquier laptop Windows editando backup-config.json.

.PARAMETER ConfigPath
  Ruta opcional a un archivo JSON de configuración (por defecto: backup-config.json en la misma carpeta).

.PARAMETER GenerarAhora
  Si se indica, ejecuta primero /opt/sql_server/backup_databases.sh en el VPS para generar respaldos frescos antes de descargar.
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "backup-config.json"),
  [switch]$GenerarAhora
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  $examplePath = Join-Path $PSScriptRoot "backup-config.example.json"
  if (Test-Path -LiteralPath $examplePath) {
    Copy-Item -LiteralPath $examplePath -Destination $ConfigPath
    Write-Host "[Backup] Se creó $ConfigPath desde la plantilla. Edita localBackupDir si deseas otra ruta." -ForegroundColor Yellow
  } else {
    throw "No se encontró el archivo de configuración: $ConfigPath"
  }
}

$cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$vpsTarget = "$($cfg.vpsUser)@$($cfg.vpsHost)"
$localRoot = $cfg.localBackupDir
$retentionDays = if ($cfg.localRetentionDays -and [int]$cfg.localRetentionDays -gt 0) { [int]$cfg.localRetentionDays } else { 30 }

$sshArgs = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
if ($cfg.sshKeyPath -and (Test-Path -LiteralPath $cfg.sshKeyPath)) {
  $sshArgs += @("-i", $cfg.sshKeyPath)
}

if (-not (Test-Path -LiteralPath $localRoot)) {
  New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
}

if ($GenerarAhora) {
  Write-Host "[Backup] Generando respaldo fresco en VPS ($vpsTarget)..." -ForegroundColor Cyan
  & ssh @sshArgs $vpsTarget "bash $($cfg.vpsBackupScript)"
  if ($LASTEXITCODE -ne 0) { throw "Falló la generación de respaldo en el VPS (exit $LASTEXITCODE)." }
}

Write-Host "[Backup] Consultando carpeta más reciente en $($cfg.vpsBackupDir)..." -ForegroundColor Cyan
$latestFolder = (& ssh @sshArgs $vpsTarget "ls -1 $($cfg.vpsBackupDir) | sort | tail -n 1").Trim()
if (-not $latestFolder) {
  throw "No se encontraron respaldos en $($cfg.vpsBackupDir). Ejecuta con -GenerarAhora."
}

$destFolder = Join-Path $localRoot $latestFolder
if (-not (Test-Path -LiteralPath $destFolder)) {
  New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
}

Write-Host "[Backup] Descargando respaldos del día '$latestFolder' en '$destFolder'..." -ForegroundColor Cyan
& scp @sshArgs "${vpsTarget}:$($cfg.vpsBackupDir)/$latestFolder/*.bak.gz" "$destFolder\"
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga por SCP (exit $LASTEXITCODE)." }

$files = Get-ChildItem -LiteralPath $destFolder -Filter "*.bak.gz"
Write-Host "[Backup] Descarga completada ($($files.Count) archivos):" -ForegroundColor Green
$files | Select-Object Name, @{N='MB';E={[math]::Round($_.Length / 1MB, 2)}}, LastWriteTime | Format-Table -AutoSize

# Limpieza local por retención
$cutoff = (Get-Date).AddDays(-$retentionDays)
Get-ChildItem -LiteralPath $localRoot -Directory | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
  Write-Host "[Backup] Eliminando respaldo local antiguo (> $retentionDays días): $($_.Name)" -ForegroundColor DarkGray
  Remove-Item -LiteralPath $_.FullName -Recurse -Force
}

Write-Host "[Backup] OK -> $destFolder" -ForegroundColor Green
