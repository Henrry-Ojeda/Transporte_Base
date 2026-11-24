using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Dapper;
using Microsoft.Extensions.Configuration;
using Transporte.Core.DTOs;
using Transporte.Core.Entities;

namespace Transporte.Infrastructure.Repositories
{
    public interface IControlCompaniasRepository
    {
        Task<IEnumerable<ControlCompaniaDto>> ObtenerTodosAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, string? estado = null, int? usuarioId = null, int? companiaId = null, int? cicloId = null);
        Task<ControlCompaniaDto?> ObtenerPorIdAsync(long id);
        Task<ControlCompaniaDto?> ObtenerTicketActivoChoferAsync(int choferId);
        Task<IEnumerable<ControlCompaniaDto>> ObtenerTicketsActivosChoferAsync(int choferId, long? controlRutaId = null);
        Task<long> CrearDespachoAsync(CrearControlCompaniaDto dto, int creadoPor);
        Task<bool> ValidarYFinalizarEntregaAsync(long id, ValidarEntregaCompaniaDto dto, int modificadoPor);
        Task<bool> EditarDespachoAsync(long id, EditarControlCompaniaDto dto, int modificadoPor);
        Task<bool> EliminarDespachoAsync(long id, int modificadoPor);
        Task<ResumenTrazabilidadBufalaDto> ObtenerTrazabilidadBufalaAsync(DateTime? fechaDesde, DateTime? fechaHasta, int? cicloId, int? fincaId, int? companiaId, int? usuarioId, string? tipoServicio = null);
    }

    public class ControlCompaniasRepository : IControlCompaniasRepository
    {
        private readonly string _connectionString;

        public ControlCompaniasRepository(IConfiguration configuration, Transporte.Core.Interfaces.ITenantService? tenantService = null)
        {
            _connectionString = tenantService?.GetConnectionString() 
                ?? configuration.GetConnectionString("DefaultConnection")
                ?? configuration.GetConnectionString("BD_TRANSPORTE")
                ?? "Server=DESKTOP-0F548CM;Database=BD_TRANSPORTE_V2;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        public async Task<IEnumerable<ControlCompaniaDto>> ObtenerTodosAsync(DateTime? fecha = null, DateTime? fechaInicio = null, DateTime? fechaFin = null, string? estado = null, int? usuarioId = null, int? companiaId = null, int? cicloId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    ISNULL(c.TipoServicioId, 1) AS TipoServicioId,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    CASE 
                        WHEN cc.ControlRutaId IS NOT NULL THEN CONCAT(cc.ControlRutaId, '-', ROW_NUMBER() OVER (PARTITION BY cc.ControlRutaId ORDER BY cc.Id))
                        ELSE CAST(cc.Id AS VARCHAR(20))
                    END AS CodigoTicket,
                    CAST(ISNULL(c.EsPrincipal, 0) AS BIT) AS EsPrincipal,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE 1 = 1";

            var parameters = new DynamicParameters();

            if (cicloId.HasValue && cicloId.Value > 0)
            {
                var cicloFechas = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cId", new { cId = cicloId.Value });
                if (cicloFechas != null && cicloFechas.FechaInicio != null && cicloFechas.FechaFin != null)
                {
                    DateTime fIni = Convert.ToDateTime(cicloFechas.FechaInicio).Date;
                    DateTime fFin = Convert.ToDateTime(cicloFechas.FechaFin).Date;
                    query += " AND (cc.CicloId = @cicloId OR (cc.Fecha >= @fIniCiclo AND cc.Fecha <= @fFinCiclo))";
                    parameters.Add("cicloId", cicloId.Value);
                    parameters.Add("fIniCiclo", fIni);
                    parameters.Add("fFinCiclo", fFin);
                }
                else
                {
                    query += " AND cc.CicloId = @cicloId";
                    parameters.Add("cicloId", cicloId.Value);
                }
            }

            if (fecha.HasValue)
            {
                query += " AND cc.Fecha = @fecha";
                parameters.Add("fecha", fecha.Value.Date);
            }
            if (fechaInicio.HasValue && (!cicloId.HasValue || cicloId.Value <= 0))
            {
                query += " AND cc.Fecha >= @fechaInicio";
                parameters.Add("fechaInicio", fechaInicio.Value.Date);
            }
            if (fechaFin.HasValue && (!cicloId.HasValue || cicloId.Value <= 0))
            {
                query += " AND cc.Fecha <= @fechaFin";
                parameters.Add("fechaFin", fechaFin.Value.Date);
            }
            if (!string.IsNullOrWhiteSpace(estado) && estado != "TODOS")
            {
                query += " AND cc.Estado = @estado";
                parameters.Add("estado", estado.Trim());
            }
            if (usuarioId.HasValue && usuarioId.Value > 0)
            {
                query += " AND cc.UsuarioId = @usuarioId";
                parameters.Add("usuarioId", usuarioId.Value);
            }
            if (companiaId.HasValue && companiaId.Value > 0)
            {
                query += " AND cc.CompaniaId = @companiaId";
                parameters.Add("companiaId", companiaId.Value);
            }

            query += " ORDER BY cc.Id DESC";

            return await connection.QueryAsync<ControlCompaniaDto>(query, parameters);
        }

        public async Task<ControlCompaniaDto?> ObtenerPorIdAsync(long id)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    CASE 
                        WHEN cc.ControlRutaId IS NOT NULL THEN CONCAT(cc.ControlRutaId, '-', ROW_NUMBER() OVER (PARTITION BY cc.ControlRutaId ORDER BY cc.Id))
                        ELSE CAST(cc.Id AS VARCHAR(20))
                    END AS CodigoTicket,
                    CAST(ISNULL(c.EsPrincipal, 0) AS BIT) AS EsPrincipal,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.Id = @id";

            return await connection.QueryFirstOrDefaultAsync<ControlCompaniaDto>(query, new { id });
        }

        public async Task<ControlCompaniaDto?> ObtenerTicketActivoChoferAsync(int choferId)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT TOP 1
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE cc.UsuarioId = @choferId AND cc.Estado = 'EN VIA'
                ORDER BY cc.Id DESC";

            return await connection.QueryFirstOrDefaultAsync<ControlCompaniaDto>(query, new { choferId });
        }

        public async Task<IEnumerable<ControlCompaniaDto>> ObtenerTicketsActivosChoferAsync(int choferId, long? controlRutaId = null)
        {
            using var connection = new SqlConnection(_connectionString);
            var query = @"
                SELECT 
                    cc.Id,
                    cc.Fecha,
                    cc.UsuarioId,
                    u.NombreCompleto AS NombreConductor,
                    cc.CompaniaId,
                    c.Nombre AS NombreCompania,
                    cc.CicloId,
                    cc.LitrosDespachados,
                    cc.LitrosRecibidosCompania,
                    cc.DiferenciaLitros,
                    cc.PorcentajeMerma,
                    cc.Estado,
                    cc.TipoLeche,
                    cc.Observacion,
                    cc.FechaSalida,
                    cc.FechaEntrega,
                    cc.ControlRutaId,
                    CASE 
                        WHEN cc.ControlRutaId IS NOT NULL THEN CONCAT(cc.ControlRutaId, '-', ROW_NUMBER() OVER (PARTITION BY cc.ControlRutaId ORDER BY cc.Id))
                        ELSE CAST(cc.Id AS VARCHAR(20))
                    END AS CodigoTicket,
                    CAST(ISNULL(c.EsPrincipal, 0) AS BIT) AS EsPrincipal,
                    cc.FotoReciboUrl,
                    cc.CreatedAt
                FROM TB_CONTROL_COMPANIAS cc
                LEFT JOIN TB_USUARIOS u ON cc.UsuarioId = u.Id
                LEFT JOIN TB_COMPANIAS c ON cc.CompaniaId = c.Id
                WHERE (
                    (cc.UsuarioId = @choferId AND cc.Estado IN ('EN VIA', 'EN_TRANSITO', 'PENDIENTE'))
                    " + (controlRutaId.HasValue && controlRutaId.Value > 0 ? " OR (cc.ControlRutaId = @controlRutaId AND cc.Estado IN ('EN VIA', 'EN_TRANSITO', 'PENDIENTE')) " : "") + @"
                )
                ORDER BY cc.Id ASC";

            return await connection.QueryAsync<ControlCompaniaDto>(query, new { choferId, controlRutaId });
        }

        public async Task<long> CrearDespachoAsync(CrearControlCompaniaDto dto, int creadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var fecha = dto.Fecha ?? DateTime.Today;

            if (dto.UsuarioId <= 0 && dto.CamionId.HasValue && dto.CamionId.Value > 0)
            {
                dto.UsuarioId = await connection.ExecuteScalarAsync<int>(
                    "SELECT TOP 1 ISNULL(UsuarioId, 0) FROM TB_CAMIONES WHERE Id = @camionId",
                    new { camionId = dto.CamionId.Value });
            }

            if (dto.UsuarioId <= 0)
            {
                dto.UsuarioId = await connection.ExecuteScalarAsync<int>(
                    "SELECT TOP 1 Id FROM TB_USUARIOS WHERE UPPER(Rol) = 'CHOFER' AND Activo = 1 ORDER BY Id ASC");
            }

            if (dto.UsuarioId <= 0)
            {
                dto.UsuarioId = creadoPor;
            }

            // Buscar ciclo operativo vigente
            var cicloId = await connection.ExecuteScalarAsync<int?>(
                "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE Estado = 'ABIERTO' AND @fecha BETWEEN FechaInicio AND FechaFin ORDER BY Id DESC",
                new { fecha });

            // ValidaciÃ³n anti-duplicados para despachos a compaÃ±Ã­as (misma fecha, misma compaÃ±Ã­a y mismos litros despachados)
            var existeDuplicadoCC = await connection.ExecuteScalarAsync<long?>(
                @"SELECT TOP 1 Id 
                  FROM TB_CONTROL_COMPANIAS 
                  WHERE CAST(Fecha AS DATE) = CAST(@fecha AS DATE)
                    AND CompaniaId = @companiaId 
                    AND LitrosDespachados = @litrosDespachados
                    AND Estado <> 'CANCELADO'",
                new { fecha, companiaId = dto.CompaniaId, litrosDespachados = dto.LitrosDespachados });

            if (existeDuplicadoCC.HasValue)
            {
                throw new InvalidOperationException($"Ya existe el Ticket #{existeDuplicadoCC.Value} registrado el {fecha:dd/MM/yyyy} para esta compaÃ±Ã­a por {dto.LitrosDespachados:N0} Lts. Para modificar el conductor o datos, utiliza la opciÃ³n 'Editar' del ticket existente.");
            }

            var tipoLeche = string.IsNullOrWhiteSpace(dto.TipoLeche) ? "VACA" : dto.TipoLeche.Trim().ToUpper();
            var observacionFinal = string.IsNullOrWhiteSpace(dto.NumeroGuiaSADA)
                ? dto.Observacion
                : (string.IsNullOrWhiteSpace(dto.Observacion) ? $"GuÃ­a SADA: {dto.NumeroGuiaSADA.Trim()}" : $"[SADA: {dto.NumeroGuiaSADA.Trim()}] {dto.Observacion}".Trim());

            var query = @"
                INSERT INTO TB_CONTROL_COMPANIAS 
                (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, FechaSalida, CreatedAt, CreatedBy)
                VALUES 
                (@fecha, @usuarioId, @companiaId, @cicloId, @litrosDespachados, NULL, 0, 0.00, 'EN VIA', @tipoLeche, @observacion, GETDATE(), GETDATE(), @creadoPor);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);";

            var id = await connection.ExecuteScalarAsync<long>(query, new
            {
                fecha,
                usuarioId = dto.UsuarioId,
                companiaId = dto.CompaniaId,
                cicloId,
                litrosDespachados = dto.LitrosDespachados,
                tipoLeche,
                observacion = observacionFinal,
                creadoPor
            });

            // NotificaciÃ³n automÃ¡tica al chofer de salida a compaÃ±Ã­a
            if (id > 0 && dto.UsuarioId > 0)
            {
                try
                {
                    var compNombre = await connection.ExecuteScalarAsync<string>(
                        "SELECT Nombre FROM TB_COMPANIAS WHERE Id = @companiaId",
                        new { companiaId = dto.CompaniaId }) ?? "CompaÃ±Ã­a";

                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_NOTIFICACIONES_MOVIL (UsuarioId, Tipo, Titulo, Mensaje, FechaOperativa, ReferenciaId, Leido, CreatedAt)
                        VALUES (@UsuarioId, 'SALIDA_COMPANIA', @Titulo, @Mensaje, @FechaOperativa, @ReferenciaId, 0, GETDATE())",
                        new
                        {
                            UsuarioId = dto.UsuarioId,
                            Titulo = "ðŸ­ Salida a CompaÃ±Ã­a Asignada",
                            Mensaje = $"Tienes un traslado asignado a la compaÃ±Ã­a {compNombre} por {dto.LitrosDespachados:N0} Lts de leche {tipoLeche} para la fecha {fecha:dd/MM/yyyy}.",
                            FechaOperativa = fecha,
                            ReferenciaId = id
                        });
                }
                catch { /* Tolerante */ }
            }

            return id;
        }

        public async Task<bool> ValidarYFinalizarEntregaAsync(long id, ValidarEntregaCompaniaDto dto, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>(
                @"SELECT TOP 1 * FROM TB_CONTROL_COMPANIAS 
                  WHERE Id = @id OR ControlRutaId = @id 
                  ORDER BY CASE WHEN Id = @id THEN 1 ELSE 2 END, Id DESC", new { id });
            if (control == null) return false;
            long actualId = Convert.ToInt64(control.Id);
            id = actualId;

            int despachados = (int)(control.LitrosDespachados ?? 0);
            int recibidos = dto.Desgloses != null && dto.Desgloses.Count > 0 
                ? dto.Desgloses.Sum(d => d.LitrosRecibidos) 
                : (dto.LitrosRecibidosCompania > 0 
                    ? dto.LitrosRecibidosCompania 
                    : (dto.LitrosConfirmados.HasValue && dto.LitrosConfirmados.Value > 0 
                        ? dto.LitrosConfirmados.Value 
                        : (dto.Litros.HasValue && dto.Litros.Value > 0 ? dto.Litros.Value : despachados)));

            int diferencia = despachados - recibidos; // Falla
            decimal porcentaje = despachados > 0 ? Math.Round((decimal)diferencia / despachados * 100m, 2) : 0.00m;

            var cicloId = (int?)control.CicloId;
            if (!cicloId.HasValue || cicloId.Value <= 0)
            {
                cicloId = await connection.ExecuteScalarAsync<int?>(
                    "SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS WHERE @fecha BETWEEN FechaInicio AND FechaFin ORDER BY Id DESC",
                    new { fecha = (DateTime)control.Fecha });
                if (!cicloId.HasValue)
                {
                    cicloId = await connection.ExecuteScalarAsync<int?>("SELECT TOP 1 Id FROM TB_CICLOS_OPERATIVOS ORDER BY Id DESC");
                }
            }

            // Manejo de desgloses multi-destino / tipo de leche (BÃºfala, Vaca, etc.)
            if (dto.Desgloses != null && dto.Desgloses.Count > 1)
            {
                var primer = dto.Desgloses[0];
                var tipoPrimer = !string.IsNullOrWhiteSpace(primer.TipoLeche)
                    ? primer.TipoLeche.Trim().ToUpper()
                    : (!string.IsNullOrWhiteSpace(control.TipoLeche) ? control.TipoLeche : "VACA");
                var tipoPrefix0 = !string.IsNullOrWhiteSpace(tipoPrimer) ? $"[{tipoPrimer}] " : "";
                var obsFinal0 = $"{tipoPrefix0}{control.Observacion} | {primer.Observacion ?? dto.Observacion}".Trim(' ', '|');

                await connection.ExecuteAsync(@"
                    UPDATE TB_CONTROL_COMPANIAS
                    SET CompaniaId = @companiaId,
                        LitrosDespachados = @litrosDespacho,
                        LitrosRecibidosCompania = @recibidos,
                        DiferenciaLitros = 0,
                        PorcentajeMerma = 0.00,
                        Estado = 'FINALIZADO',
                        TipoLeche = @tipoPrimer,
                        FechaEntrega = GETDATE(),
                        Observacion = @obsFinal,
                        FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @modificadoPor
                    WHERE Id = @id",
                    new { companiaId = primer.CompaniaId > 0 ? primer.CompaniaId : control.CompaniaId, litrosDespacho = primer.LitrosRecibidos, recibidos = primer.LitrosRecibidos, tipoPrimer, obsFinal = obsFinal0, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

                // Registrar primera entrada en TB_ENTREGAS_COMPANIA
                if (cicloId.HasValue && cicloId.Value > 0)
                {
                    await connection.ExecuteAsync(@"
                        INSERT INTO TB_ENTREGAS_COMPANIA 
                        (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, CreatedAt, CreatedBy)
                        VALUES 
                        (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoPrimer, @obs, GETDATE(), @modificadoPor);",
                        new
                        {
                            cicloId = cicloId.Value,
                            companiaId = primer.CompaniaId > 0 ? primer.CompaniaId : control.CompaniaId,
                            usuarioId = control.UsuarioId,
                            fecha = control.Fecha,
                            litros = primer.LitrosRecibidos,
                            tipoPrimer,
                            obs = $"Entrega #{id} {tipoPrefix0.Trim()}. {primer.Observacion ?? dto.Observacion}".Trim(),
                            modificadoPor
                        });
                }

                // Insertar tickets adicionales para los demÃ¡s desgloses (ej: VACA, otra quesera)
                for (int i = 1; i < dto.Desgloses.Count; i++)
                {
                    var desg = dto.Desgloses[i];
                    if (desg.LitrosRecibidos <= 0) continue;

                    var tipoDesg = !string.IsNullOrWhiteSpace(desg.TipoLeche) ? desg.TipoLeche.Trim().ToUpper() : "VACA";
                    var tipoPrefix = !string.IsNullOrWhiteSpace(tipoDesg) ? $"[{tipoDesg}] " : "";
                    var obsExtra = $"{tipoPrefix}Desglose Ticket #{id} - {desg.Observacion ?? dto.Observacion}".Trim(' ', '|');
                    var targetCompId = desg.CompaniaId > 0 ? desg.CompaniaId : control.CompaniaId;

                    var extraId = await connection.ExecuteScalarAsync<long>(@"
                        INSERT INTO TB_CONTROL_COMPANIAS 
                        (Fecha, UsuarioId, CompaniaId, CicloId, LitrosDespachados, LitrosRecibidosCompania, DiferenciaLitros, PorcentajeMerma, Estado, TipoLeche, Observacion, ControlRutaId, FechaSalida, FechaEntrega, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy)
                        VALUES 
                        (@fecha, @usuarioId, @companiaId, @cicloId, @litros, @litros, 0, 0.00, 'FINALIZADO', @tipoDesg, @obs, @controlRutaId, @fechaSalida, GETDATE(), GETDATE(), @modificadoPor, GETDATE(), @modificadoPor);
                        SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                        new
                        {
                            fecha = control.Fecha,
                            usuarioId = control.UsuarioId,
                            companiaId = targetCompId,
                            cicloId = cicloId,
                            litros = desg.LitrosRecibidos,
                            tipoDesg,
                            obs = obsExtra,
                            controlRutaId = control.ControlRutaId,
                            fechaSalida = control.FechaSalida ?? control.Fecha,
                            modificadoPor
                        });

                    if (cicloId.HasValue && cicloId.Value > 0)
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoDesg, @obs, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId = cicloId.Value,
                                companiaId = targetCompId,
                                usuarioId = control.UsuarioId,
                                fecha = control.Fecha,
                                litros = desg.LitrosRecibidos,
                                tipoDesg,
                                obs = $"Entrega Desglose #{extraId} (Orig #{id}) {tipoPrefix.Trim()}. {desg.Observacion ?? dto.Observacion}".Trim(),
                                modificadoPor
                            });
                    }
                }

                return true;
            }

            // Desglose Ãºnico o validaciÃ³n estÃ¡ndar
            var tipoFinal = !string.IsNullOrWhiteSpace(dto.TipoLeche)
                ? dto.TipoLeche.Trim().ToUpper()
                : (dto.Desgloses != null && dto.Desgloses.Count == 1 && !string.IsNullOrWhiteSpace(dto.Desgloses[0].TipoLeche)
                    ? dto.Desgloses[0].TipoLeche.Trim().ToUpper()
                    : (!string.IsNullOrWhiteSpace(control.TipoLeche) ? control.TipoLeche : "VACA"));

            var tipoUnico = !string.IsNullOrWhiteSpace(tipoFinal) ? $"[{tipoFinal}] " : "";

            var obsFinal = string.IsNullOrWhiteSpace(dto.Observacion) 
                ? $"{tipoUnico}{control.Observacion}".Trim() 
                : $"{tipoUnico}{control.Observacion} | {dto.Observacion}".Trim(' ', '|');

            int targetComp = dto.Desgloses != null && dto.Desgloses.Count == 1 && dto.Desgloses[0].CompaniaId > 0
                ? dto.Desgloses[0].CompaniaId
                : control.CompaniaId;

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_COMPANIAS
                SET CompaniaId = @targetComp,
                    LitrosRecibidosCompania = @recibidos,
                    DiferenciaLitros = @diferencia,
                    PorcentajeMerma = @porcentaje,
                    Estado = 'FINALIZADO',
                    TipoLeche = @tipoFinal,
                    FechaEntrega = GETDATE(),
                    Observacion = @obsFinal,
                    FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @modificadoPor
                WHERE Id = @id",
                new { targetComp, recibidos, diferencia, porcentaje, tipoFinal, obsFinal, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

            var compDestino = await connection.ExecuteScalarAsync<string>("SELECT Nombre FROM TB_COMPANIAS WHERE Id = @companiaId", new { companiaId = targetComp }) ?? "CompaÃ±Ã­a";
            var compDestinoUpper = compDestino.Trim().ToUpperInvariant();
            bool esDestinoReceptoria = compDestinoUpper.Contains("RECEPTORIA") || compDestinoUpper.Contains("RECEPTORÃA") || compDestinoUpper.Contains("PLANTA PRINCIPAL");

            if (control.ControlRutaId != null && esDestinoReceptoria)
            {
                try
                {
                    long cRutaId = Convert.ToInt64(control.ControlRutaId);
                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET LitrosRecibidosReceptoria = @recibidos,
                            TotalLitrosReceptoria = @recibidos,
                            DiferenciaReceptoria = @diferencia,
                            DiferenciaLitros = @diferencia,
                            PorcentajeMerma = @porcentaje,
                            MermaTotalLitros = @diferencia,
                            ProcesoActualId = 4,
                            Estado = 'FINALIZADO',
                            FechaLlegadaReceptoria = ISNULL(FechaLlegadaReceptoria, GETDATE()),
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @modificadoPor
                        WHERE Id = @cRutaId AND Estado != 'FINALIZADO';",
                        new { recibidos, diferencia, porcentaje, modificadoPor, cRutaId });
                }
                catch { /* Tolerante */ }
            }

            // Registrar / actualizar automÃ¡ticamente en TB_ENTREGAS_COMPANIA para liquidaciones si existe un ciclo vÃ¡lido
            if (rows > 0 && cicloId.HasValue && cicloId.Value > 0)
            {
                try
                {
                    
                    // 1. Entrada a CompaÃ±Ã­a / Quesera (Positivo) con vinculaciÃ³n a ControlRutaId si aplica
                    var entregaExistenteId = await connection.ExecuteScalarAsync<long?>(
                        @"SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA 
                          WHERE ControlCompaniaId = @id
                            OR (ControlRutaId = @cRutaId AND @cRutaId IS NOT NULL AND ControlCompaniaId IS NULL AND CompaniaId = @targetComp)
                            OR (
                                Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@id AS VARCHAR) + '.%'
                                OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '.%'
                                OR Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@id AS VARCHAR) + '%'
                                OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                                OR Observacion LIKE 'Entrega #' + CAST(@id AS VARCHAR) + ' %'
                                OR Observacion LIKE '%Orig #' + CAST(@id AS VARCHAR) + ')%'
                            )",
                        new { id, targetComp, cRutaId = (long?)control.ControlRutaId });

                    var obsEntrega = $"Entrega validada desde Control CompaÃ±Ã­as #{id}. Falla: {diferencia:+0;-0;0} L. {tipoUnico}{dto.Observacion}".Trim();

                    if (entregaExistenteId.HasValue)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ENTREGAS_COMPANIA
                            SET CompaniaId = @targetComp,
                                Litros = @recibidos,
                                TipoLeche = @tipoFinal,
                                Observacion = @obsEntrega,
                                ControlCompaniaId = @id,
                                ControlRutaId = @cRutaId,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @entregaId;",
                            new { targetComp, recibidos, tipoFinal, obsEntrega, id, cRutaId = (long?)control.ControlRutaId, modificadoPor, entregaId = entregaExistenteId.Value });
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, ControlCompaniaId, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @usuarioId, @fecha, @litros, @tipoFinal, @obs, @cRutaId, @id, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId = cicloId.Value,
                                companiaId = targetComp,
                                usuarioId = (int)control.UsuarioId,
                                fecha = (DateTime)control.Fecha,
                                litros = recibidos,
                                tipoFinal,
                                obs = obsEntrega,
                                cRutaId = (long?)control.ControlRutaId,
                                id,
                                modificadoPor
                            });
                    }
                }
                catch
                {
                    // Evitar que un error auxiliar en liquidaciones bloquee el cierre del despacho
                }
            }

            // 2. Si este despacho proviene de un viaje de ruta (TB_CONTROL_RUTAS), sincronizar y finalizar automÃ¡ticamente el viaje padre
            if (rows > 0 && control.ControlRutaId != null)
            {
                try
                {
                    long cRutaId = (long)control.ControlRutaId;
                    var despachosRuta = await connection.QueryAsync<dynamic>(
                        "SELECT Id, LitrosRecibidosCompania, Estado FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @cRutaId",
                        new { cRutaId });

                    bool todosFinalizados = despachosRuta.All(d => (string)d.Estado == "FINALIZADO");
                    int totalRecibidoRuta = despachosRuta.Sum(d => (int)(d.LitrosRecibidosCompania ?? 0));

                    var viajePadre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                        "SELECT TotalLitrosFinca FROM TB_CONTROL_RUTAS WHERE Id = @cRutaId", new { cRutaId });
                    int totalFincas = (int)(viajePadre?.TotalLitrosFinca ?? 0);
                    int mermaRuta = totalFincas - totalRecibidoRuta;
                    string estadoRuta = todosFinalizados ? (mermaRuta == 0 ? "CUADRADO" : "FINALIZADO") : "RECEPCIONADO";
                    int procesoRuta = todosFinalizados ? 4 : 3;

                    await connection.ExecuteAsync(@"
                        UPDATE TB_CONTROL_RUTAS
                        SET CompaniaDestinoId = @targetComp,
                            LitrosEntregadosCompania = @totalRecibidoRuta,
                            TotalLitrosReceptoria = @totalRecibidoRuta,
                            DiferenciaLitros = @mermaRuta,
                            MermaTotalLitros = @mermaRuta,
                            ProcesoActualId = @procesoRuta,
                            Estado = @estadoRuta,
                            FechaEntregaCompania = GETDATE(),
                            ModifiedAt = GETDATE(),
                            ModifiedBy = @modificadoPor
                        WHERE Id = @cRutaId",
                        new { targetComp, totalRecibidoRuta, mermaRuta, procesoRuta, estadoRuta, modificadoPor, cRutaId });
                }
                catch
                {
                    // Registro silencioso si falla actualizaciÃ³n secundaria
                }
            }

            return rows > 0;
        }

        public async Task<bool> EditarDespachoAsync(long id, EditarControlCompaniaDto dto, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var control = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            if (control == null) return false;

            DateTime fecha = dto.Fecha ?? (DateTime)control.Fecha;
            int choferId = dto.UsuarioId ?? (int)control.UsuarioId;
            int companiaId = dto.CompaniaId ?? (int)control.CompaniaId;
            int despachados = dto.LitrosDespachados ?? (int)control.LitrosDespachados;
            int? recibidos = dto.LitrosRecibidosCompania ?? (int?)control.LitrosRecibidosCompania;
            string estado = dto.Estado ?? (string)control.Estado;
            string? observacion = dto.Observacion ?? (string?)control.Observacion;
            string tipoLeche = !string.IsNullOrWhiteSpace(dto.TipoLeche)
                ? dto.TipoLeche.Trim().ToUpper()
                : (control.TipoLeche != null ? (string)control.TipoLeche : "VACA");

            int diferencia = 0;
            decimal porcentaje = 0.00m;
            if (recibidos.HasValue)
            {
                diferencia = despachados - recibidos.Value;
                porcentaje = despachados > 0 ? Math.Round((Math.Abs(diferencia) * 100.0m) / despachados, 2) : 0.00m;
            }

            var rows = await connection.ExecuteAsync(@"
                UPDATE TB_CONTROL_COMPANIAS
                SET Fecha = @fecha,
                    UsuarioId = @choferId,
                    CompaniaId = @companiaId,
                    LitrosDespachados = @despachados,
                    LitrosRecibidosCompania = @recibidos,
                    DiferenciaLitros = @diferencia,
                    PorcentajeMerma = @porcentaje,
                    Estado = @estado,
                    TipoLeche = @tipoLeche,
                    Observacion = @observacion,
                    FotoReciboUrl = ISNULL(@fotoReciboUrl, FotoReciboUrl),
                    ModifiedAt = GETDATE(),
                    ModifiedBy = @modificadoPor
                WHERE Id = @id",
                new { fecha, choferId, companiaId, despachados, recibidos, diferencia, porcentaje, estado, tipoLeche, observacion, fotoReciboUrl = dto.FotoReciboUrl, modificadoPor, id });

            // Sincronizar SIEMPRE la fecha y datos en TB_ENTREGAS_COMPANIA si existe entrega vinculada
            if (rows > 0)
            {
                await connection.ExecuteAsync(@"
                    UPDATE TB_ENTREGAS_COMPANIA
                    SET Fecha = @fecha,
                        CompaniaId = @companiaId,
                        UsuarioId = @choferId,
                        ModifiedAt = GETDATE(),
                        ModifiedBy = @modificadoPor
                    WHERE ControlCompaniaId = @id",
                    new { fecha, companiaId, choferId, modificadoPor, id });
            }

            // Solo sincronizar CompaniaDestinoId en TB_CONTROL_RUTAS si no hay otros despachos mixtos activos

            if (rows > 0 && recibidos.HasValue && estado == "FINALIZADO" && control.CicloId != null)
            {
                try
                {
                    int cicloId = (int)control.CicloId;
                    var tipoUnico = !string.IsNullOrWhiteSpace(tipoLeche) ? $"[{tipoLeche}] " : "";
                    var obsEntrega = $"Entrega validada desde Control CompaÃ±Ã­as #{id}. Falla: {diferencia:+0;-0;0} L. {tipoUnico}{observacion}".Trim();

                    // Lo entregado a la compaÃ±Ã­a son los litros recibidos por la planta (o despachados si aÃºn no hay recepciÃ³n)
                    int litrosEntrega = (recibidos.HasValue && recibidos.Value > 0) ? recibidos.Value : despachados;

                    var entregaExistenteId = await connection.ExecuteScalarAsync<int?>(
                        @"SELECT TOP 1 Id FROM TB_ENTREGAS_COMPANIA 
                          WHERE ControlCompaniaId = @id
                             OR (ControlRutaId = @cRutaId AND @cRutaId IS NOT NULL AND ControlCompaniaId IS NULL)
                             OR (
                                 Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@id AS VARCHAR) + '%'
                                 OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                                 OR Observacion LIKE 'Entrega #' + CAST(@id AS VARCHAR) + ' %'
                                 OR Observacion LIKE '%Orig #' + CAST(@id AS VARCHAR) + ')%'
                             )",
                        new { id, cRutaId = (long?)control.ControlRutaId });

                    if (entregaExistenteId.HasValue)
                    {
                        await connection.ExecuteAsync(@"
                            UPDATE TB_ENTREGAS_COMPANIA
                            SET Litros = @litrosEntrega,
                                CompaniaId = @companiaId,
                                ControlCompaniaId = @id,
                                TipoLeche = @tipoLeche,
                                Observacion = @obsEntrega,
                                UsuarioId = @choferId,
                                Fecha = @fecha,
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @entregaId;",
                            new { litrosEntrega, companiaId, id, tipoLeche, obsEntrega, choferId, fecha, modificadoPor, entregaId = entregaExistenteId.Value });
                    }
                    else
                    {
                        await connection.ExecuteAsync(@"
                            INSERT INTO TB_ENTREGAS_COMPANIA 
                            (CicloId, CompaniaId, UsuarioId, Fecha, Litros, TipoLeche, Observacion, ControlRutaId, ControlCompaniaId, CreatedAt, CreatedBy)
                            VALUES 
                            (@cicloId, @companiaId, @choferId, @fecha, @litrosEntrega, @tipoLeche, @obs, @cRutaId, @id, GETDATE(), @modificadoPor);",
                            new
                            {
                                cicloId,
                                companiaId,
                                choferId,
                                fecha,
                                litrosEntrega,
                                tipoLeche,
                                obs = obsEntrega,
                                cRutaId = (long?)control.ControlRutaId,
                                id,
                                modificadoPor
                            });
                    }

                    // Si proviene de un viaje de ruta (TB_CONTROL_RUTAS), sincronizar viaje padre
                    if (control.ControlRutaId != null)
                    {
                        long cRutaId = (long)control.ControlRutaId;
                        var despachosRuta = await connection.QueryAsync<dynamic>(
                            "SELECT Id, LitrosRecibidosCompania, Estado FROM TB_CONTROL_COMPANIAS WHERE ControlRutaId = @cRutaId",
                            new { cRutaId });

                        bool todosFinalizados = despachosRuta.All(d => (string)d.Estado == "FINALIZADO");
                        int totalRecibidoRuta = despachosRuta.Sum(d => (int)(d.LitrosRecibidosCompania ?? 0));

                        var viajePadre = await connection.QueryFirstOrDefaultAsync<dynamic>(
                            "SELECT TotalLitrosFinca FROM TB_CONTROL_RUTAS WHERE Id = @cRutaId", new { cRutaId });
                        int totalFincas = (int)(viajePadre?.TotalLitrosFinca ?? 0);
                        int mermaRuta = totalFincas - totalRecibidoRuta;
                        string estadoRuta = todosFinalizados ? (mermaRuta == 0 ? "CUADRADO" : "FINALIZADO") : "RECEPCIONADO";
                        int procesoRuta = todosFinalizados ? 4 : 3;

                        await connection.ExecuteAsync(@"
                            UPDATE TB_CONTROL_RUTAS
                            SET LitrosEntregadosCompania = @totalRecibidoRuta,
                                TotalLitrosReceptoria = @totalRecibidoRuta,
                                DiferenciaLitros = @mermaRuta,
                                MermaTotalLitros = @mermaRuta,
                                ProcesoActualId = @procesoRuta,
                                Estado = @estadoRuta,
                                FechaEntregaCompania = GETDATE(),
                                ModifiedAt = GETDATE(),
                                ModifiedBy = @modificadoPor
                            WHERE Id = @cRutaId",
                            new { totalRecibidoRuta, mermaRuta, procesoRuta, estadoRuta, modificadoPor, cRutaId });
                    }
                }
                catch
                {
                    // Evitar que un fallo auxiliar bloquee la ediciÃ³n del despacho
                }
            }

            return rows > 0;
        }

        public async Task<bool> EliminarDespachoAsync(long id, int modificadoPor)
        {
            using var connection = new SqlConnection(_connectionString);
            var despacho = await connection.QueryFirstOrDefaultAsync<dynamic>("SELECT * FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            if (despacho != null)
            {
                int choferId = (int)despacho.UsuarioId;
                int companiaId = (int)despacho.CompaniaId;
                DateTime fecha = (DateTime)despacho.Fecha;
                await connection.ExecuteAsync(@"
                    DELETE FROM TB_ENTREGAS_COMPANIA 
                    WHERE ControlCompaniaId = @id
                       OR Observacion LIKE '%Control CompaÃ±Ã­as #' + CAST(@id AS VARCHAR) + '%'
                       OR Observacion LIKE '%Control Companias #' + CAST(@id AS VARCHAR) + '%'
                       OR (CompaniaId = @companiaId AND UsuarioId = @choferId AND CAST(Fecha AS DATE) = CAST(@fecha AS DATE))",
                    new { id, companiaId, choferId, fecha });
            }

            var rows = await connection.ExecuteAsync(
                "DELETE FROM TB_CONTROL_COMPANIAS WHERE Id = @id", new { id });
            return rows > 0;
        }

        public async Task<ResumenTrazabilidadBufalaDto> ObtenerTrazabilidadBufalaAsync(DateTime? fechaDesde, DateTime? fechaHasta, int? cicloId, int? fincaId, int? companiaId, int? usuarioId, string? tipoServicio = null)
        {
            using var connection = new SqlConnection(_connectionString);

            DateTime? fDesde = fechaDesde;
            DateTime? fHasta = fechaHasta;
            if (cicloId.HasValue && !fDesde.HasValue && !fHasta.HasValue)
            {
                var ciclo = await connection.QueryFirstOrDefaultAsync<CicloOperativo>(
                    "SELECT TOP 1 FechaInicio, FechaFin FROM TB_CICLOS_OPERATIVOS WHERE Id = @cicloId", new { cicloId });
                if (ciclo != null)
                {
                    fDesde = ciclo.FechaInicio;
                    fHasta = ciclo.FechaFin;
                }
            }

            var sql = @"
                SELECT 
                    r.Id,
                    r.Fecha,
                    ISNULL(cr.CicloId, DATEDIFF(WEEK, DATEFROMPARTS(YEAR(r.Fecha), 1, 1), r.Fecha) + 1) AS CicloId,
                    f.Id AS FincaId,
                    f.Nombre AS FincaNombre,
                    ISNULL(f.Propietario, f.Nombre) AS Propietario,
                    ISNULL(f.TipoServicioId, CASE WHEN comp.TipoServicioId = 2 THEN 2 ELSE 1 END) AS TipoServicioId,
                    ISNULL(ts.Nombre, CASE WHEN f.TipoServicioId = 2 OR comp.TipoServicioId = 2 THEN 'TRANSPORTE' ELSE 'RUTA' END) AS TipoServicio,
                    r.Litros AS LitrosFinca,
                    r.EsAcida,
                    ISNULL(r.TipoLeche, 'BUFALA') AS TipoLeche,
                    r.UsuarioId,
                    u.NombreCompleto AS ChoferNombre,
                    cr.Id AS ControlRutaId,
                    cc.Id AS ControlCompaniaId,
                    cc.CompaniaId AS CompaniaId,
                    ISNULL(comp.Nombre, CASE WHEN cc.CompaniaId IS NOT NULL THEN 'CompaÃ±Ã­a #' + CAST(cc.CompaniaId AS VARCHAR) ELSE 'Sin Asignar' END) AS CompaniaNombre,
                    CASE WHEN cc.CompaniaId = 5028 OR comp.Nombre LIKE '%RECEPTORIA%' THEN 1 ELSE 0 END AS EsTanqueReceptoria,
                    (
                        SELECT STRING_AGG(c_sal.Nombre + ' (' + CAST(cc_sal.LitrosDespachados AS VARCHAR) + ' L)', ', ')
                        FROM TB_CONTROL_COMPANIAS cc_sal
                        JOIN TB_COMPANIAS c_sal ON cc_sal.CompaniaId = c_sal.Id
                        WHERE (cc_sal.ControlRutaId = cr.Id AND cc_sal.CompaniaId <> 5028)
                           OR (cc_sal.ControlRutaId IS NULL AND cc_sal.Fecha = r.Fecha AND c_sal.Id <> 5028)
                    ) AS DestinosFinales,
                    cc.LitrosDespachados AS LitrosDespachadosCompania,
                    cc.LitrosRecibidosCompania AS LitrosRecibidosCompania,
                    cc.DiferenciaLitros AS DiferenciaLitros,
                    cc.PorcentajeMerma AS PorcentajeMerma,
                    ISNULL(cc.Estado, ISNULL(cr.Estado, 'FINALIZADO')) AS EstadoViaje,
                    ISNULL(r.Observacion, cc.Observacion) AS Observacion
                FROM TB_RUTAS_RECOLECCION r
                INNER JOIN TB_FINCAS f ON r.FincaId = f.Id
                LEFT JOIN TB_TIPO_SERVICIO ts ON f.TipoServicioId = ts.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON r.ControlRutaId = cr.Id
                INNER JOIN TB_USUARIOS u ON r.UsuarioId = u.Id
                OUTER APPLY (
                    SELECT TOP 1 cc2.Id, cc2.CompaniaId, cc2.LitrosDespachados, cc2.LitrosRecibidosCompania, cc2.DiferenciaLitros, cc2.PorcentajeMerma, cc2.Estado, cc2.Observacion
                    FROM TB_CONTROL_COMPANIAS cc2
                    WHERE (cc2.ControlRutaId = cr.Id AND (cc2.TipoLeche = 'BUFALA' OR cc2.Observacion LIKE '%BUFAL%' OR NOT EXISTS (SELECT 1 FROM TB_CONTROL_COMPANIAS cc3 WHERE cc3.ControlRutaId = cr.Id AND cc3.TipoLeche = 'BUFALA')))
                       OR (cc2.ControlRutaId IS NULL AND cc2.UsuarioId = r.UsuarioId AND cc2.Fecha = r.Fecha AND (cc2.TipoLeche = 'BUFALA' OR cc2.Observacion LIKE '%BUFAL%'))
                    ORDER BY CASE WHEN cc2.TipoLeche = 'BUFALA' THEN 1 ELSE 2 END, cc2.Id DESC
                ) cc
                LEFT JOIN TB_COMPANIAS comp ON cc.CompaniaId = comp.Id
                WHERE (r.TipoLeche = 'BUFALA' OR f.Nombre LIKE '%BUFAL%' OR (f.TieneDosTiposLeche = 1 AND r.TipoLeche = 'BUFALA'))
                  AND (@fDesde IS NULL OR r.Fecha >= @fDesde)
                  AND (@fHasta IS NULL OR r.Fecha <= @fHasta)
                  AND (@cicloId IS NULL OR cr.CicloId = @cicloId OR (r.Fecha >= @fDesde AND r.Fecha <= @fHasta))
                  AND (@fincaId IS NULL OR f.Id = @fincaId)
                  AND (@companiaId IS NULL OR cc.CompaniaId = @companiaId)
                  AND (@usuarioId IS NULL OR r.UsuarioId = @usuarioId)
                  AND (@tipoServicio IS NULL OR @tipoServicio = '' OR @tipoServicio = 'TODOS' OR ISNULL(ts.Nombre, CASE WHEN f.TipoServicioId = 2 OR comp.TipoServicioId = 2 THEN 'TRANSPORTE' ELSE 'RUTA' END) = @tipoServicio)

                UNION ALL

                -- Entregas directas de BÃºfala a compaÃ±Ã­as registradas en TB_ENTREGAS_COMPANIA
                SELECT 
                    e.Id,
                    e.Fecha,
                    ISNULL(e.CicloId, ISNULL(cr.CicloId, DATEDIFF(WEEK, DATEFROMPARTS(YEAR(e.Fecha), 1, 1), e.Fecha) + 1)) AS CicloId,
                    0 AS FincaId,
                    'ENTREGA DIRECTA EN PLANTA' AS FincaNombre,
                    ISNULL(u.NombreCompleto, u.Username) AS Propietario,
                    1 AS TipoServicioId,
                    'RUTA' AS TipoServicio,
                    e.Litros AS LitrosFinca,
                    CAST(0 AS BIT) AS EsAcida,
                    'BUFALA' AS TipoLeche,
                    e.UsuarioId,
                    ISNULL(u.NombreCompleto, u.Username) AS ChoferNombre,
                    e.ControlRutaId AS ControlRutaId,
                    e.ControlCompaniaId AS ControlCompaniaId,
                    e.CompaniaId AS CompaniaId,
                    ISNULL(comp.Nombre, 'CompaÃ±Ã­a #' + CAST(e.CompaniaId AS VARCHAR)) AS CompaniaNombre,
                    0 AS EsTanqueReceptoria,
                    comp.Nombre + ' (' + CAST(e.Litros AS VARCHAR) + ' L)' AS DestinosFinales,
                    e.Litros AS LitrosDespachadosCompania,
                    e.Litros AS LitrosRecibidosCompania,
                    0 AS DiferenciaLitros,
                    0.00 AS PorcentajeMerma,
                    'FINALIZADO' AS EstadoViaje,
                    e.Observacion
                FROM TB_ENTREGAS_COMPANIA e
                LEFT JOIN TB_COMPANIAS comp ON e.CompaniaId = comp.Id
                LEFT JOIN TB_USUARIOS u ON e.UsuarioId = u.Id
                LEFT JOIN TB_CONTROL_RUTAS cr ON e.ControlRutaId = cr.Id
                WHERE e.TipoLeche = 'BUFALA'
                  AND (@fDesde IS NULL OR e.Fecha >= @fDesde)
                  AND (@fHasta IS NULL OR e.Fecha <= @fHasta)
                  AND (@cicloId IS NULL OR e.CicloId = @cicloId OR (e.Fecha >= @fDesde AND e.Fecha <= @fHasta))
                  AND (@fincaId IS NULL)
                  AND (@companiaId IS NULL OR e.CompaniaId = @companiaId)
                  AND (@usuarioId IS NULL OR e.UsuarioId = @usuarioId)
                  AND (@tipoServicio IS NULL OR @tipoServicio = '' OR @tipoServicio = 'TODOS' OR @tipoServicio = 'RUTA')
                  AND NOT EXISTS (
                      SELECT 1 FROM TB_RUTAS_RECOLECCION r2 
                      WHERE r2.ControlRutaId = e.ControlRutaId AND (r2.TipoLeche = 'BUFALA' OR EXISTS (SELECT 1 FROM TB_FINCAS f2 WHERE f2.Id = r2.FincaId AND f2.Nombre LIKE '%BUFAL%'))
                  )

                ORDER BY Fecha DESC, Id DESC";

            var list = (await connection.QueryAsync<TrazabilidadBufalaItemDto>(sql, new
            {
                fDesde,
                fHasta,
                cicloId,
                fincaId,
                companiaId,
                usuarioId,
                tipoServicio
            })).ToList();

            var totalFincas = list.Sum(x => x.LitrosFinca);
            var totalLitrosRuta = list.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA").Sum(x => x.LitrosFinca);
            var totalLitrosTransporte = list.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE").Sum(x => x.LitrosFinca);
            
            // Total entregado consolidado por viaje/despacho para no duplicar sumas si varias fincas van al mismo ticket de entrega
            var despachosConControl = list
                .Where(x => x.ControlCompaniaId.HasValue && x.LitrosRecibidosCompania.HasValue)
                .GroupBy(x => x.ControlCompaniaId!.Value)
                .Select(g => g.First())
                .ToList();

            var entregasDirectas = list
                .Where(x => !x.ControlCompaniaId.HasValue && x.LitrosRecibidosCompania.HasValue)
                .ToList();

            var despachosUnicos = despachosConControl.Concat(entregasDirectas).ToList();

            var totalLitrosTanques = despachosUnicos
                .Where(x => x.EsTanqueReceptoria || (x.CompaniaNombre != null && x.CompaniaNombre.ToUpper().Contains("RECEPTOR")))
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalLitrosCompaniasDirectas = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")))
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalCompaniasDirectasRuta = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")) && (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA")
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalCompaniasDirectasTransporte = despachosUnicos
                .Where(x => !x.EsTanqueReceptoria && (x.CompaniaNombre == null || !x.CompaniaNombre.ToUpper().Contains("RECEPTOR")) && (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE")
                .Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalEntregado = despachosUnicos.Sum(x => x.LitrosRecibidosCompania ?? 0);
            if (totalEntregado == 0 && despachosUnicos.Count == 0)
            {
                // Fallback si no hay desgloses finales creados aÃºn
                totalEntregado = totalFincas;
            }

            var totalEntregadosRuta = despachosUnicos.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "RUTA").Sum(x => x.LitrosRecibidosCompania ?? 0);
            var totalEntregadosTransporte = despachosUnicos.Where(x => (x.TipoServicio ?? "RUTA").ToUpper() == "TRANSPORTE").Sum(x => x.LitrosRecibidosCompania ?? 0);

            var totalDif = totalFincas - totalEntregado;
            var pctMerma = totalFincas > 0 ? Math.Round((Math.Abs(totalDif) * 100.0m) / totalFincas, 2) : 0;

            var fincasActivas = list.Select(x => x.FincaId).Distinct().Count();
            var viajesCount = list.Where(x => x.ControlRutaId.HasValue).Select(x => x.ControlRutaId!.Value).Distinct().Count();
            var companiasCount = list.Where(x => x.CompaniaId.HasValue).Select(x => x.CompaniaId!.Value).Distinct().Count();

            return new ResumenTrazabilidadBufalaDto
            {
                TotalLitrosFincas = totalFincas,
                TotalLitrosRuta = totalLitrosRuta,
                TotalLitrosTransporte = totalLitrosTransporte,
                TotalLitrosEntregados = totalEntregado,
                TotalLitrosTanques = totalLitrosTanques,
                TotalLitrosCompaniasDirectas = totalLitrosCompaniasDirectas,
                TotalCompaniasDirectasRuta = totalCompaniasDirectasRuta,
                TotalCompaniasDirectasTransporte = totalCompaniasDirectasTransporte,
                TotalEntregadosRuta = totalEntregadosRuta,
                TotalEntregadosTransporte = totalEntregadosTransporte,
                TotalDiferenciaLitros = totalDif,
                PorcentajeMermaGlobal = pctMerma,
                CantidadFincasActivas = fincasActivas,
                CantidadViajes = viajesCount,
                CantidadCompaniasDestino = companiasCount,
                Detalle = list
            };
        }
    }

    // =========================================================================
    // INTERFACE & IMPLEMENTATION: INotificacionesRepository
    // =========================================================================
}
