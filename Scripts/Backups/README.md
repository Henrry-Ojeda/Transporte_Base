# Respaldos Automáticos PROD — Transporte Base

Sistema de respaldos automáticos multi-tenant (respalda dinámicamente **todas** las bases de datos de usuario en SQL Server, incluyendo `DB_SAAS_MASTER`, `DB_PROD_CAMPO_VERDE`, `DB_PROD_TRANSPORTE_VERGEL_CARRILLO` y cualquier nuevo cliente SaaS).

## Cómo funciona
1. **En el VPS Contabo:** `/opt/sql_server/backup_databases.sh` corre todos los días vía `cron` (3:00 AM Venezuela / 07:00 UTC), genera respaldos `.bak.gz` en `/opt/sql_server/backups/YYYY-MM-DD/` y conserva los últimos 14 días.
2. **En tu Laptop (o cualquier otra laptop Windows):** `Descargar-Backups-PROD.ps1` descarga los archivos `.bak.gz` a la carpeta definida en `backup-config.json` (por defecto `C:\Backups\Transporte_PROD`) y conserva los últimos 30 días.

## Configurar en otra Laptop (3 pasos)
1. Asegúrate de tener acceso SSH por llave al VPS (`ssh root@84.247.178.194`).
2. Copia `backup-config.example.json` como `backup-config.json` y ajusta `localBackupDir` (y `sshKeyPath` si usas una llave distinta a `~/.ssh/id_ed25519`).
3. Ejecuta en PowerShell:
   ```powershell
   # Prueba inmediata (genera respaldo fresco en VPS y lo descarga):
   .\Descargar-Backups-PROD.ps1 -GenerarAhora

   # Programar descarga automática diaria a las 08:00 AM:
   .\Instalar-Tarea-Backup.ps1 -HoraDiaria "08:00"
   ```
