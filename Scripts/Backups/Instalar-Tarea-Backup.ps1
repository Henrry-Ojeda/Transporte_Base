<#
.SYNOPSIS
  Registra una Tarea Programada diaria en Windows para descargar los respaldos de PROD en esta laptop.
  Ejecutar una sola vez en cualquier laptop Windows donde se deseen recibir los respaldos automáticos.
#>
param(
  [string]$HoraDiaria = "08:00",
  [string]$NombreTarea = "TransporteBase-Backup-PROD-Diario"
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "Descargar-Backups-PROD.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "No se encontró $scriptPath"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $HoraDiaria
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $NombreTarea -Action $action -Trigger $trigger -Settings $settings -Description "Descarga automática diaria de respaldos SQL Server PROD de Transporte Base desde VPS Contabo." -Force | Out-Null

Write-Host "[OK] Tarea programada '$NombreTarea' instalada para ejecutarse diariamente a las $HoraDiaria (con StartWhenAvailable si la laptop estaba apagada)." -ForegroundColor Green
