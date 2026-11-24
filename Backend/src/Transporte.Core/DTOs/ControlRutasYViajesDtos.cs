using System;
using System.Collections.Generic;
using System.Linq;

namespace Transporte.Core.DTOs
{
    // =====================================================================
    // DTOs para TB_CONTROL_RUTAS (Control / Cuadre Diario por Chofer)
    // =====================================================================

    public class ControlRutaDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public int UsuarioId { get; set; }
        public string? NombreConductor { get; set; }
        public int? CicloId { get; set; }
        public int TotalLitrosFinca { get; set; }
        public int TotalLitrosReceptoria { get; set; }
        public int DiferenciaLitros { get; set; }
        public decimal PorcentajeMerma { get; set; }
        public string Estado { get; set; } = "PENDIENTE";
        public int? ProcesoActualId { get; set; }
        public string? CodigoProceso { get; set; }
        public string? NombreProceso { get; set; }
        public string? ColorProceso { get; set; }
        public string? IconoProceso { get; set; }

        // Campos logísticos de viaje y mermas por tramo
        public string? TipoDestino { get; set; }
        public int? LitrosRecibidosReceptoria { get; set; }
        public int? DiferenciaReceptoria { get; set; }
        public int LitrosCargadosAdicional { get; set; }
        public int? CompaniaDestinoId { get; set; }
        public string? NombreCompaniaDestino { get; set; }
        public int? LitrosEntregadosCompania { get; set; }
        public int? DiferenciaCompania { get; set; }
        public int? MermaTotalLitros { get; set; }
        public DateTime? FechaLlegadaReceptoria { get; set; }
        public DateTime? FechaEntregaCompania { get; set; }
        public int? CerradoPor { get; set; }
        public string? NombreCerradoPor { get; set; }
        public int TotalFincas { get; set; }

        // Ruta Logística y Combustible
        public int? RutaLogisticaId { get; set; }
        public string? RutaLogisticaNombre { get; set; }
        public List<int>? RutasLogisticasIds { get; set; }
        public string? RutasLogisticasNombres { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int? CapacidadCamionLitros { get; set; }
        public decimal? CombustibleLitrosSalida { get; set; }
        public decimal? CombustibleLitrosLlegada { get; set; }
        public decimal? CombustibleConsumidoLitros { get; set; }
        public decimal? OdometroInicialKm { get; set; }
        public decimal? OdometroFinalKm { get; set; }
        public decimal? KmRecorridos { get; set; }

        public List<int>? FincasPlanificadasIds { get; set; }
        public string? Observacion { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class RegistrarControlRutaDto
    {
        public DateTime Fecha { get; set; }
        public int? UsuarioId { get; set; }      // Admin puede asignar; Chofer usa su propio Id
        public int? CicloId { get; set; }
        public int TotalLitrosFinca { get; set; }
        public int TotalLitrosReceptoria { get; set; }
        public int? ProcesoActualId { get; set; }
        public string? TipoDestino { get; set; }
        public int? RutaLogisticaId { get; set; }
        public decimal? CombustibleLitrosSalida { get; set; }
        public decimal? CombustibleLitrosLlegada { get; set; }
        public decimal? OdometroInicialKm { get; set; }
        public decimal? OdometroFinalKm { get; set; }
        public string? Observacion { get; set; }
    }

    public class EditarControlRutaDto
    {
        public DateTime? Fecha { get; set; }
        public int? UsuarioId { get; set; }
        public int? TotalLitrosFinca { get; set; }
        public int? TotalLitrosReceptoria { get; set; }
        public string? Estado { get; set; }       // PENDIENTE, CUADRADO, MERMA_EXCESIVA, CERRADO
        public int? ProcesoActualId { get; set; }
        public string? TipoDestino { get; set; }
        public int? LitrosRecibidosReceptoria { get; set; }
        public int? LitrosCargadosAdicional { get; set; }
        public int? CompaniaDestinoId { get; set; }
        public int? LitrosEntregadosCompania { get; set; }
        public int? RutaLogisticaId { get; set; }
        public decimal? CombustibleLitrosSalida { get; set; }
        public decimal? CombustibleLitrosLlegada { get; set; }
        public decimal? OdometroInicialKm { get; set; }
        public decimal? OdometroFinalKm { get; set; }
        public string? Observacion { get; set; }
    }

    public class RecalcularControlRutaDto
    {
        public DateTime? Fecha { get; set; }
        public int? UsuarioId { get; set; }
    }

    public class AsignarRutasTicketDto
    {
        public int? RutaLogisticaId { get; set; }
        public List<int>? RutasLogisticasIds { get; set; }
        public string? Observacion { get; set; }
    }

    public class ProcesoTicketDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public byte Orden { get; set; }
        public string? Color { get; set; }
        public string? Icono { get; set; }
        public bool Activo { get; set; }
    }

    public class CambiarProcesoTicketDto
    {
        public int ProcesoId { get; set; }
        public string? Observacion { get; set; }
    }

    public class HistorialProcesoTicketDto
    {
        public long Id { get; set; }
        public long ControlRutaId { get; set; }
        public int ProcesoId { get; set; }
        public string CodigoProceso { get; set; } = string.Empty;
        public string NombreProceso { get; set; } = string.Empty;
        public string? ColorProceso { get; set; }
        public string? IconoProceso { get; set; }
        public DateTime FechaCambio { get; set; }
        public int CambiadoPor { get; set; }
        public string? NombreUsuario { get; set; }
        public string? Observacion { get; set; }
    }

    // =====================================================================
    // DTOs para el Nuevo Flujo Logístico de Viajes (AGENTS_2)
    // =====================================================================

    public class CrearViajeDto
    {
        public DateTime? Fecha { get; set; }
        public int? ConductorId { get; set; }     // Admin puede asignar; Chofer usa su propio Id
        public int? ChoferId { get => ConductorId; set => ConductorId = value; }
        public int? UsuarioId { get => ConductorId; set => ConductorId = value; }
        public int? CamionId { get; set; }
        public int? RutaLogisticaId { get; set; } // Ruta asignada (Zona Sur, etc.)
        public List<int>? RutasLogisticasIds { get; set; } // Múltiples rutas combinadas
        public List<int>? FincaIds { get; set; } // Fincas personalizadas / modificadas para la ruta
        public decimal? OdometroInicialKm { get; set; }
        public string? Observacion { get; set; }
        public string? Observaciones { get => Observacion; set => Observacion = value; }
    }

    public class AgregarFincaViajeDto
    {
        public long ControlRutaId { get; set; }
        public int? ChoferId { get; set; }
        public int FincaId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public bool EsDiferido { get; set; } = false;
        public DateTime? Fecha { get; set; }
        public string? Hora { get; set; }
        public int? NumeroCompartimiento { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
        public string? FotosEvidenciaJson { get; set; }
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public decimal? PrecisionMetros { get; set; }
    }

    public class FincaPaqueteSyncDto
    {
        public int FincaId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public bool EsDiferido { get; set; } = false;
        public DateTime? Fecha { get; set; }
        public string? Hora { get; set; }
        public decimal? Temperatura { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
        public string? FotosEvidenciaJson { get; set; }
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public decimal? PrecisionMetros { get; set; }
    }

    public class SincronizarPaqueteTicketDto
    {
        public long? TicketId { get; set; }
        public string? LocalUuid { get; set; }
        public DateTime Fecha { get; set; }
        public int ChoferId { get; set; }
        public int? CamionId { get; set; }
        public string Modo { get; set; } = "LIBRE"; // "RUTA" | "LIBRE"
        public int? RutaLogisticaId { get; set; }
        public string? Observacion { get; set; }
        public List<FincaPaqueteSyncDto> Fincas { get; set; } = new();
    }

    public class ResultadoSyncPaqueteDto
    {
        public long TicketId { get; set; }
        public int FincasSincronizadas { get; set; }
        public bool CreadoNuevo { get; set; }
        public string Mensaje { get; set; } = string.Empty;
    }

    // =====================================================================
    // DTOs PARA CARGA MASIVA DE TICKETS DESDE EXCEL (SUPER ADMIN)
    // =====================================================================
    public class FlexibleDateTimeNullableConverter : System.Text.Json.Serialization.JsonConverter<DateTime?>
    {
        public override DateTime? Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options)
        {
            if (reader.TokenType == System.Text.Json.JsonTokenType.Null) return null;
            if (reader.TokenType == System.Text.Json.JsonTokenType.Number)
            {
                if (reader.TryGetDouble(out double num) && num > 30000 && num < 75000)
                {
                    return DateTime.FromOADate(num);
                }
                return null;
            }
            if (reader.TokenType == System.Text.Json.JsonTokenType.String)
            {
                var str = reader.GetString()?.Trim();
                if (string.IsNullOrWhiteSpace(str)) return null;

                if (double.TryParse(str, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double serial) && serial > 30000 && serial < 75000)
                {
                    return DateTime.FromOADate(serial);
                }

                if (DateTime.TryParse(str, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTime dtIso))
                {
                    return dtIso;
                }

                if (DateTime.TryParse(str, out DateTime dtLocal))
                {
                    return dtLocal;
                }
            }
            return null;
        }

        public override void Write(System.Text.Json.Utf8JsonWriter writer, DateTime? value, System.Text.Json.JsonSerializerOptions options)
        {
            if (value.HasValue)
                writer.WriteStringValue(value.Value.ToString("yyyy-MM-dd"));
            else
                writer.WriteNullValue();
        }
    }

    public class FlexibleDateTimeConverter : System.Text.Json.Serialization.JsonConverter<DateTime>
    {
        public override DateTime Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options)
        {
            if (reader.TokenType == System.Text.Json.JsonTokenType.Number)
            {
                if (reader.TryGetDouble(out double num) && num > 30000 && num < 75000)
                {
                    return DateTime.FromOADate(num);
                }
                return default;
            }
            if (reader.TokenType == System.Text.Json.JsonTokenType.String)
            {
                var str = reader.GetString()?.Trim();
                if (string.IsNullOrWhiteSpace(str)) return default;

                if (double.TryParse(str, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double serial) && serial > 30000 && serial < 75000)
                {
                    return DateTime.FromOADate(serial);
                }

                if (DateTime.TryParse(str, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTime dtIso))
                {
                    return dtIso;
                }

                if (DateTime.TryParse(str, out DateTime dtLocal))
                {
                    return dtLocal;
                }
            }
            return default;
        }

        public override void Write(System.Text.Json.Utf8JsonWriter writer, DateTime value, System.Text.Json.JsonSerializerOptions options)
        {
            writer.WriteStringValue(value.ToString("yyyy-MM-dd"));
        }
    }

    public class FilaValidarExcelDto
    {
        public int Index { get; set; }

        [System.Text.Json.Serialization.JsonConverter(typeof(FlexibleDateTimeNullableConverter))]
        public DateTime? Fecha { get; set; }
        public int FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public int ConductorId { get; set; }
        public string? ConductorNombre { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; }
        public string? TipoLeche { get; set; } = "VACA";
        public decimal? PrecioLitroUSDAplicado { get; set; }
        public string? Observacion { get; set; }
    }

    public class ValidarCargaMasivaExcelRequestDto
    {
        public List<FilaValidarExcelDto> Filas { get; set; } = new();
    }

    public class FilaResultadoValidacionDto
    {
        public int Index { get; set; }
        public bool EsValido { get; set; }
        public bool EsDuplicado { get; set; }
        public string? Mensaje { get; set; }
        public long? TicketExistenteId { get; set; }
        public string? TicketCodigo { get; set; }
        public string? TicketEstado { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int? CamionCapacidadLitros { get; set; }
    }

    public class ValidarCargaMasivaExcelResponseDto
    {
        public bool DataValida { get; set; }
        public int TotalFilas { get; set; }
        public int FilasValidas { get; set; }
        public int FilasDuplicadas { get; set; }
        public int FilasConError { get; set; }
        public string MensajeGeneral { get; set; } = string.Empty;
        public List<FilaResultadoValidacionDto> Resultados { get; set; } = new();
    }

    public class FilaEjecutarExcelDto
    {
        [System.Text.Json.Serialization.JsonConverter(typeof(FlexibleDateTimeConverter))]
        public DateTime Fecha { get; set; }
        public int FincaId { get; set; }
        public int ConductorId { get; set; }
        public int? CamionId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; }
        public string? TipoLeche { get; set; } = "VACA";
        public decimal? PrecioLitroUSDAplicado { get; set; }
        public string? Observacion { get; set; }
    }

    public class EjecutarCargaMasivaExcelRequestDto
    {
        public List<FilaEjecutarExcelDto> Filas { get; set; } = new();
    }

    public class ResumenTicketCreadoDto
    {
        public long TicketId { get; set; }
        public string? CodigoTicket { get; set; }
        public DateTime Fecha { get; set; }
        public int ConductorId { get; set; }
        public string? ConductorNombre { get; set; }
        public string? CamionPlaca { get; set; }
        public int TotalLitros { get; set; }
        public int CantidadFincas { get; set; }
    }

    public class EjecutarCargaMasivaExcelResponseDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int TicketsCreadosCount { get; set; }
        public int ParadasCreadasCount { get; set; }
        public int LitrosTotales { get; set; }
        public List<ResumenTicketCreadoDto> Tickets { get; set; } = new();
    }

    public class EnviarAReceptoriaDto
    {
        public string? Observacion { get; set; }
    }

    public class RecibirEnReceptoriaDto
    {
        public int LitrosRecibidos { get; set; }
        public string Accion { get; set; } = "DEJAR_EN_RECEPTORIA"; // "DEJAR_EN_RECEPTORIA" o "RECARGAR_Y_DESPACHAR"
        public int? LitrosCargadosAdicional { get; set; }
        public int? CompaniaDestinoId { get; set; }
        public string? Observacion { get; set; }
        public List<DestinoEnvioRutaDto>? Destinos { get; set; }
    }

    public class EntregarDirectoCompaniaDto
    {
        public int CompaniaDestinoId { get; set; }
        public int LitrosEntregados { get; set; }
        public string? Observacion { get; set; }
    }

    public class RegistrarEntregaPlantaDto
    {
        public int LitrosEntregados { get; set; }
        public string? Observacion { get; set; }
    }

    public class FinalizarViajeDto
    {
        public string? Observacion { get; set; }
    }

    public class RevertirProcesoViajeDto
    {
        public int NuevoProcesoId { get; set; } = 1; // 1 = ABIERTO / EN RUTA, 2 = RECEPCIONADO, 3 = EN VIA
        public string Motivo { get; set; } = string.Empty;
    }

    // =====================================================================
    // DTOs para TB_CONTROL_COMPANIAS (Control de Salidas a Queseras / Compañías)
    // =====================================================================

    public class ControlCompaniaDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public int UsuarioId { get; set; }
        public string? NombreConductor { get; set; }
        public int CompaniaId { get; set; }
        public string? NombreCompania { get; set; }
        public int? TipoServicioId { get; set; } = 1;
        public int? CicloId { get; set; }
        public int LitrosDespachados { get; set; }
        public int? LitrosRecibidosCompania { get; set; }
        public int DiferenciaLitros { get; set; }
        public decimal PorcentajeMerma { get; set; }
        public string Estado { get; set; } = "EN VIA"; // EN VIA, DESPACHO
        public string? TipoLeche { get; set; } = "VACA";
        public string? Observacion { get; set; }
        public DateTime? FechaSalida { get; set; }
        public DateTime? FechaEntrega { get; set; }
        public long? ControlRutaId { get; set; }
        public string? CodigoTicket { get; set; }
        public bool? EsPrincipal { get; set; }
        public string? FotoReciboUrl { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CrearControlCompaniaDto
    {
        public DateTime? Fecha { get; set; }
        public int UsuarioId { get; set; }           // Chofer asignado o CHOFER OTRO
        public int? CamionId { get; set; }
        public int CompaniaId { get; set; }          // Compañía destino
        public int LitrosDespachados { get; set; }   // Litros de salida
        public string? TipoLeche { get; set; }       // VACA, BUFALO
        public string? Observacion { get; set; }
        public string? NumeroGuiaSADA { get; set; }
    }

    public class DesgloseEntregaCompaniaDto
    {
        public int CompaniaId { get; set; }
        public string? TipoLeche { get; set; } // BUFALA, VACA, etc.
        public int LitrosRecibidos { get; set; }
        public string? Observacion { get; set; }
    }

    public class ValidarEntregaCompaniaDto
    {
        public int LitrosRecibidosCompania { get; set; }
        public int? LitrosConfirmados { get; set; }
        public int? Litros { get; set; }
        public string? TipoLeche { get; set; }
        public string? Observacion { get; set; }
        public string? Observaciones { get; set; }
        public string? FotoReciboUrl { get; set; }
        public List<DesgloseEntregaCompaniaDto>? Desgloses { get; set; }
    }

    public class EditarControlCompaniaDto
    {
        public DateTime? Fecha { get; set; }
        public int? UsuarioId { get; set; }
        public int? CompaniaId { get; set; }
        public int? LitrosDespachados { get; set; }
        public int? LitrosRecibidosCompania { get; set; }
        public string? TipoLeche { get; set; }
        public string? Estado { get; set; }
        public string? Observacion { get; set; }
        public string? FotoReciboUrl { get; set; }
    }

    public class DestinoEnvioRutaDto
    {
        public int CompaniaId { get; set; }
        public int LitrosDespachados { get; set; }
        public int Litros { get; set; } // Alias para soportar "litros" o "litrosDespachados" desde Frontend
        public string? TipoLeche { get; set; }
        public string? NumeroGuiaSADA { get; set; }
        public string? Observacion { get; set; }
    }

    public class EnviarDesdeRutaACompaniaDto
    {
        public int? CompaniaId { get; set; }
        public int? ChoferId { get; set; }            // Opcional: si envía a otro chofer o a sí mismo
        public int? LitrosDespachados { get; set; }   // Opcional: si difiere del total en fincas
        public string? Observacion { get; set; }
        public List<DestinoEnvioRutaDto>? Destinos { get; set; }
    }

    public class TraspasarLecheDto
    {
        public long? TicketDestinoId { get; set; }     // ID del ticket ya creado si se asigna a uno existente
        public int? ChoferDestinoId { get; set; }       // ID del chofer destino (si se crea automáticamente)
        public DateTime? FechaDestino { get; set; }     // Fecha para el nuevo ticket (si se crea automáticamente)
        public int? LitrosTraspaso { get; set; }        // Litros a traspasar (opcional, por defecto todo el volumen disponible)
        public string? Observacion { get; set; }        // Motivo / observación del traspaso
    }

    public class ResultadoTraspasoDto
    {
        public long TicketOrigenId { get; set; }
        public long TicketDestinoId { get; set; }
        public string ChoferOrigenNombre { get; set; } = string.Empty;
        public string ChoferDestinoNombre { get; set; } = string.Empty;
        public int LitrosTraspasados { get; set; }
        public string Mensaje { get; set; } = string.Empty;
    }

    // =========================================================================
    // DTOs PARA MODIFICACIONES AUDITADAS EN CONTROL DE VIAJES Y BITÁCORA DE LOGS
    // =========================================================================

    public class EditarFincaViajeAuditadoDto
    {
        public int FincaId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; }
        public string? TipoLeche { get; set; }
        public bool EsDiferido { get; set; } = false;
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
        public string? FotosEvidenciaJson { get; set; }
        public string Motivo { get; set; } = string.Empty;
    }

    public class EditarEntregaViajeAuditadoDto
    {
        public int CompaniaId { get; set; }
        public int Litros { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
        public string? FotosEvidenciaJson { get; set; }
        public string Motivo { get; set; } = string.Empty;
    }

    public class LogModificacionControlDto
    {
        public long Id { get; set; }
        public long ControlRutaId { get; set; }
        public string TipoEntidad { get; set; } = string.Empty;
        public long? EntidadId { get; set; }
        public string TipoAccion { get; set; } = string.Empty;
        public string? ValoresAnteriores { get; set; }
        public string? ValoresNuevos { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public int UsuarioId { get; set; }
        public string? NombreUsuario { get; set; }
        public string? RolUsuario { get; set; }
        public DateTime Fecha { get; set; }
    }

}
