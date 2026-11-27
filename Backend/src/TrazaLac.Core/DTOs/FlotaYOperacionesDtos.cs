using System;
using System.Collections.Generic;
using System.Linq;

namespace TrazaLac.Core.DTOs
{
    // =====================================================================
    // DTOs para RUTAS LOGÍSTICAS (Planificación de Zonas/Rutas)
    // =====================================================================
    public class RutaLogisticaDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string Color { get; set; } = "#2563eb";
        public bool Activo { get; set; } = true;
        public int TotalFincasAsignadas { get; set; }
        public int TotalFincasHabituales { get; set; }
        public int TotalFincasAlternas { get; set; }
        public int? CamionPredeterminadoId { get; set; }
        public string? CamionPlaca { get; set; }
        public decimal? CapacidadCamionLitros { get; set; }
        public int? ChoferPredeterminadoId { get; set; }
        public string? ChoferNombre { get; set; }
        public int TotalLitrosEstimados { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ControlTanquesDiarioDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public int Tanque1Inicial { get; set; }
        public int Tanque2Inicial { get; set; }
        public int Tanque3Inicial { get; set; }
        public int Tanque4Inicial { get; set; }
        public int Tanque5Inicial { get; set; }
        public int TotalInicialLitros { get; set; }
        public bool AperturaConfirmada { get; set; }
        public int? AperturaConfirmadaPorId { get; set; }
        public string? AperturaConfirmadaPorNombre { get; set; }
        public DateTime? AperturaConfirmadaAt { get; set; }
        public int TotalEntradasRutasLitros { get; set; }
        public int TotalSalidasPlantasLitros { get; set; }
        public int Tanque1Final { get; set; }
        public int Tanque2Final { get; set; }
        public int Tanque3Final { get; set; }
        public int Tanque4Final { get; set; }
        public int Tanque5Final { get; set; }
        public int TotalFinalFisicoLitros { get; set; }
        public int TotalTeoricoLitros { get; set; }
        public int DiferenciaMermaLitros { get; set; }
        public bool CierreConfirmado { get; set; }
        public int? CierreConfirmadoPorId { get; set; }
        public string? CierreConfirmadoPorNombre { get; set; }
        public DateTime? CierreConfirmadoAt { get; set; }
        public string Estado { get; set; } = "BORRADOR";
        public string? FilasRecepcionJson { get; set; }
        public string? Observaciones { get; set; }
        public bool PuedeModificar { get; set; } = true;
    }

    public class AbonoSemanaItemDto
    {
        public int CicloId { get; set; }
        public decimal MontoUSD { get; set; }
    }

    public class GuardarAbonoCompaniaDto
    {
        public int CompaniaId { get; set; }
        public int? CicloId { get; set; }
        public DateTime? Fecha { get; set; }
        public decimal MontoUSD { get; set; }
        public decimal? MontoBs { get; set; }
        public decimal? TasaBcv { get; set; }
        public string? ReferenciaBancaria { get; set; }
        public int? BancoId { get; set; }
        public long? ControlCompaniaId { get; set; }
        public DateTime? FechaLecheAbonada { get; set; }
        public int? LitrosAbonados { get; set; }
        public string? Observaciones { get; set; }
        public string? TipoPago { get; set; } = "TRANSFERENCIA";
        public List<AbonoSemanaItemDto>? DistribucionSemanas { get; set; }
    }

    public class ActualizarPrecioDespachoItemDto
    {
        public long DespachoId { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public string? TipoLeche { get; set; }
    }

    public class ActualizarPreciosDespachosSemanaDto
    {
        public int CompaniaId { get; set; }
        public int CicloId { get; set; }
        public List<ActualizarPrecioDespachoItemDto> Items { get; set; } = new();
    }

    public class GuardarRutaLogisticaDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string Color { get; set; } = "#2563eb";
        public bool Activo { get; set; } = true;
        public int? CamionPredeterminadoId { get; set; }
        public int? ChoferPredeterminadoId { get; set; }
    }

    public class AsignarFincasRutaDto
    {
        public List<int> FincaIds { get; set; } = new();
        public List<int>? FincasHabitualesIds { get; set; }
        public List<int>? FincasAlternasIds { get; set; }
    }

    public class RecoleccionFincaResumenDto
    {
        public long RecoleccionId { get; set; }
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public long? ControlRutaId { get; set; }
        public string? TicketCodigo { get; set; }
        public int? ConductorId { get; set; }
        public string? ConductorNombre { get; set; }
        public string? CamionPlaca { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; }
        public string? TipoLeche { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class SolicitudRecoleccionExtraordinariaDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public int FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public int? RutaLogisticaId { get; set; }
        public string? RutaNombre { get; set; }
        public long? ControlRutaId { get; set; }
        public int ChoferSolicitanteId { get; set; }
        public string? ChoferSolicitanteNombre { get; set; }
        public string? CamionPlaca { get; set; }
        public string? Motivo { get; set; }
        public string Estado { get; set; } = "PENDIENTE";
        public int? AprobadoPorUsuarioId { get; set; }
        public string? AprobadoPorNombre { get; set; }
        public DateTime? FechaAprobacion { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CrearSolicitudExtraordinariaDto
    {
        public int FincaId { get; set; }
        public int? RutaLogisticaId { get; set; }
        public long? ControlRutaId { get; set; }
        public string? Motivo { get; set; }
    }

    public class ResponderSolicitudExtraordinariaDto
    {
        public bool Aprobar { get; set; }
    }

    // =====================================================================
    // DTOs para COMBUSTIBLE (Gasoil / Gasolina)
    // =====================================================================
    public class CombustibleInventarioDto
    {
        public int Id { get; set; }
        public string TipoCombustible { get; set; } = "GASOIL";
        public decimal StockActualLitros { get; set; }
        public decimal CapacidadTanqueAlmacen { get; set; }
        public decimal? CostoPromedioPorLitroUSD { get; set; }
        public decimal PorcentajeOcupado => CapacidadTanqueAlmacen > 0 
            ? Math.Round((StockActualLitros / CapacidadTanqueAlmacen) * 100m, 2) 
            : 0;
        public DateTime UpdatedAt { get; set; }
    }

    public class RegistrarCompraCombustibleDto
    {
        public string TipoCombustible { get; set; } = "GASOIL";
        public decimal Litros { get; set; }
        public decimal CostoPorLitroUSD { get; set; }
        public string? Proveedor { get; set; }
        public DateTime Fecha { get; set; }
        public string? Observaciones { get; set; }
    }

    public class RegistrarDespachoCombustibleDto
    {
        public int CamionId { get; set; }
        public string TipoCombustible { get; set; } = "GASOIL";
        public decimal Litros { get; set; }
        public long? ControlRutaId { get; set; }
        public decimal? OdometroKm { get; set; }
        public DateTime Fecha { get; set; }
        public string? Observaciones { get; set; }
    }

    public class CombustibleHistorialDto
    {
        public int Id { get; set; }
        public string TipoMovimiento { get; set; } = string.Empty; // COMPRA_INGRESO, DESPACHO_CAMION, AJUSTE
        public string TipoCombustible { get; set; } = string.Empty;
        public decimal Litros { get; set; }
        public decimal StockAnteriorLitros { get; set; }
        public decimal StockNuevoLitros { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public string? ChoferNombre { get; set; }
        public long? ControlRutaId { get; set; }
        public string? RutaNombre { get; set; }
        public decimal? OdometroKm { get; set; }
        public decimal CostoPorLitroUSD { get; set; }
        public string? Proveedor { get; set; }
        public string? Observaciones { get; set; }
        public DateTime Fecha { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    // =====================================================================
    // DTOs para MANTENIMIENTO DE CAMIONES & SINIESTROS
    // =====================================================================
    public class MantenimientoCamionDto
    {
        public int Id { get; set; }
        public int CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public string? MarcaModelo { get; set; }
        public string TipoEvento { get; set; } = string.Empty; // CAMBIO_ACEITE, CAUCHOS, PREVENTIVO, CORRECTIVO, MEJORA, SINIESTRO_CHOFER
        public string Titulo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public DateTime FechaEvento { get; set; }
        public decimal? OdometroKm { get; set; }
        public decimal? ProximoKmSugerido { get; set; }
        public DateTime? ProximaFechaSugerida { get; set; }
        public string? TallerOMecanico { get; set; }
        public string Estado { get; set; } = "RESUELTO"; // REPORTADO_CHOFER, PENDIENTE, EN_TALLER, RESUELTO, COMPLETADO, CANCELADO
        public string Urgencia { get; set; } = "MEDIA"; // BAJA, MEDIA, ALTA, CRITICA
        public string? FotoUrl { get; set; }
        public int? ReportadoPorChoferId { get; set; }
        public string? ChoferNombre { get; set; }
        public decimal CostoTotalUSD { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CrearMantenimientoCamionDto
    {
        public int CamionId { get; set; }
        public string TipoEvento { get; set; } = "PREVENTIVO";
        public string Titulo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public DateTime FechaEvento { get; set; }
        public decimal? OdometroKm { get; set; }
        public decimal? ProximoKmSugerido { get; set; }
        public DateTime? ProximaFechaSugerida { get; set; }
        public string? TallerOMecanico { get; set; }
        public string Estado { get; set; } = "RESUELTO";
        public string Urgencia { get; set; } = "MEDIA";
        public string? FotoUrl { get; set; }
        public decimal CostoTotalUSD { get; set; } = 0;
    }

    public class ReportarIncidenteChoferDto
    {
        public int CamionId { get; set; }
        public string Categoria { get; set; } = "MOTOR"; // MOTOR, LUCES, FRENOS, ACEITE, NEUMATICOS, TRANSMISION, OTRO
        public string Titulo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public string Urgencia { get; set; } = "MEDIA"; // BAJA, MEDIA, ALTA, CRITICA
        public decimal? OdometroKm { get; set; }
        public string? FotoUrl { get; set; }
    }

    public class ActualizarEstadoIncidenteDto
    {
        public string Estado { get; set; } = "EN_TALLER"; // PENDIENTE, EN_TALLER, RESUELTO, COMPLETADO, CANCELADO
        public string? TallerOMecanico { get; set; }
        public decimal? CostoTotalUSD { get; set; }
        public string? SolucionAplicada { get; set; }
    }

    public class ReportarSiniestroChoferDto
    {
        public int CamionId { get; set; }
        public string Titulo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public decimal? OdometroKm { get; set; }
        public DateTime FechaEvento { get; set; } = DateTime.Today;
    }

    // =====================================================================
    // DTOs para INVENTARIO DE REPUESTOS
    // =====================================================================
    public class RepuestoDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Categoria { get; set; } = "OTROS";
        public int StockActual { get; set; }
        public int StockMinimo { get; set; } = 1;
        public decimal CostoUnitarioUSD { get; set; }
        public string? UbicacionAlmacen { get; set; }
        public bool Activo { get; set; } = true;
        public DateTime CreatedAt { get; set; }
    }

    public class GuardarRepuestoDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Categoria { get; set; } = "OTROS";
        public int StockActual { get; set; }
        public int StockMinimo { get; set; } = 1;
        public decimal CostoUnitarioUSD { get; set; }
        public string? UbicacionAlmacen { get; set; }
        public bool Activo { get; set; } = true;
    }

    public class MovimientoRepuestoDto
    {
        public int Id { get; set; }
        public int RepuestoId { get; set; }
        public string? RepuestoCodigo { get; set; }
        public string? RepuestoNombre { get; set; }
        public string TipoMovimiento { get; set; } = string.Empty; // ENTRADA_COMPRA, SALIDA_MANTENIMIENTO, AJUSTE
        public int Cantidad { get; set; }
        public decimal CostoUnitarioUSD { get; set; }
        public int? MantenimientoId { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public DateTime Fecha { get; set; }
        public string? Observaciones { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class RegistrarMovimientoRepuestoDto
    {
        public int RepuestoId { get; set; }
        public string TipoMovimiento { get; set; } = "ENTRADA_COMPRA";
        public int Cantidad { get; set; }
        public decimal CostoUnitarioUSD { get; set; }
        public int? MantenimientoId { get; set; }
        public int? CamionId { get; set; }
        public DateTime Fecha { get; set; }
        public string? Observaciones { get; set; }
    }

    // =========================================================================
    // DTOs para NOTIFICACIONES MÓVIL (PUSH & IN-APP ALERTAS CHOFERES)
    // =========================================================================
    public class NotificacionMovilDto
    {
        public long Id { get; set; }
        public int UsuarioId { get; set; }
        public string Tipo { get; set; } = string.Empty; // 'RUTA_ASIGNADA' | 'SALIDA_COMPANIA' | 'AVISO_GENERAL'
        public string Titulo { get; set; } = string.Empty;
        public string Mensaje { get; set; } = string.Empty;
        public DateTime? FechaOperativa { get; set; }
        public long? ReferenciaId { get; set; }
        public bool Leido { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CrearNotificacionMovilDto
    {
        public int UsuarioId { get; set; }
        public string Tipo { get; set; } = "AVISO_GENERAL";
        public string Titulo { get; set; } = string.Empty;
        public string Mensaje { get; set; } = string.Empty;
        public DateTime? FechaOperativa { get; set; }
        public long? ReferenciaId { get; set; }
    }

    public class SuscripcionPushDto
    {
        public string Endpoint { get; set; } = string.Empty;
        public string P256dh { get; set; } = string.Empty;
        public string Auth { get; set; } = string.Empty;
        public string? UserAgent { get; set; }
        public int? UsuarioId { get; set; }
    }

    // =========================================================================
    // DTOs PARA PLANIFICACIÓN DE RUTAS - CHOFERES (ASIGNACIÓN DIARIA DE CAMIONES)
    // =========================================================================
    public class PlanificacionRutaChoferDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public int CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int CapacidadCamionLitros { get; set; }
        public int ConductorId { get; set; }
        public string? ConductorNombre { get; set; }
        public int? RutaLogisticaId { get; set; }
        public string? RutaLogisticaNombre { get; set; }
        public string? RutasIds { get; set; }
        public string FincasIds { get; set; } = string.Empty;
        public List<int> ListaFincasIds { get; set; } = new();
        public int TotalFincas { get; set; }
        public int LitrosEstimados { get; set; }
        public int PorcentajeOcupacion { get; set; }
        public string? Observacion { get; set; }
        public bool Activo { get; set; } = true;
        public long? ControlRutaId { get; set; }
        public string? EstadoTicket { get; set; }
        public int LitrosRecolectadosReal { get; set; }
        public List<int> FincasRecolectadasIds { get; set; } = new();
        public DateTime CreatedAt { get; set; }
    }

    public class GuardarPlanificacionRutaChoferDto
    {
        public int? Id { get; set; }
        public DateTime Fecha { get; set; }
        public int CamionId { get; set; }
        public int ConductorId { get; set; }
        public int? RutaLogisticaId { get; set; }
        public string? RutasIds { get; set; }
        public List<int> FincasIds { get; set; } = new();
        public int LitrosEstimados { get; set; }
        public string? Observacion { get; set; }
    }

    public class FincaPromedioDto
    {
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string? Propietario { get; set; }
        public int? RutaId { get; set; }
        public string? TipoLeche { get; set; }
        public int PromedioLitros { get; set; }
        public int DiasRecolectados15 { get; set; }
        public bool EsAlterna { get; set; } = false;
        public string? RutaPrincipalNombre { get; set; }
        public List<int> RutasAsignadasIds { get; set; } = new();
    }

    // =====================================================================
    // DTOs PARA MAPA DE RUTAS & GPS (OpenStreetMap - Solo Ticket Abierto)
    // =====================================================================
    public class RegistrarPuntoGpsDto
    {
        public long ControlRutaId { get; set; }
        public int? FincaId { get; set; }
        public decimal Latitud { get; set; }
        public decimal Longitud { get; set; }
        public decimal? PrecisionMetros { get; set; }
        public string Evento { get; set; } = "ENTRADA_APP"; // ENTRADA_APP | REGISTRO_LITROS | INICIO_VIAJE
        public DateTime? FechaHoraDispositivo { get; set; }
    }

    public class PuntoGpsViajeDto
    {
        public long Id { get; set; }
        public long ControlRutaId { get; set; }
        public int UsuarioId { get; set; }
        public string ChoferNombre { get; set; } = string.Empty;
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int? FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public decimal Latitud { get; set; }
        public decimal Longitud { get; set; }
        public decimal? PrecisionMetros { get; set; }
        public string Evento { get; set; } = string.Empty;
        public DateTime FechaHoraDispositivo { get; set; }
    }

    public class ViajeGpsResumenDto
    {
        public long ControlRutaId { get; set; }
        public DateTime Fecha { get; set; }
        public int UsuarioId { get; set; }
        public string ChoferNombre { get; set; } = string.Empty;
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int? RutaLogisticaId { get; set; }
        public string? RutaNombre { get; set; }
        public string? RutaColor { get; set; }
        public int ProcesoActualId { get; set; }
        public string Estado { get; set; } = string.Empty;
        public int TotalLitrosFinca { get; set; }
        public int CantidadPuntos { get; set; }
        public double DistanciaEstimadaKm { get; set; }
        public int DuracionMinutos { get; set; }
        public List<PuntoGpsViajeDto> Puntos { get; set; } = new();
    }

    public class FincaMapaDto
    {
        public int Id { get; set; }
        public string? Codigo { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public int? RutaId { get; set; }
        public string? RutaNombre { get; set; }
        public string? RutaColor { get; set; }
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public int PromedioLitrosDiarios { get; set; }
        public bool Activo { get; set; }
    }

    public class ActualizarCoordenadasFincaDto
    {
        public decimal Latitud { get; set; }
        public decimal Longitud { get; set; }
    }

    public class CruceRutasDto
    {
        public int RutaAId { get; set; }
        public string RutaANombre { get; set; } = string.Empty;
        public string? RutaAColor { get; set; }
        public int RutaBId { get; set; }
        public string RutaBNombre { get; set; } = string.Empty;
        public string? RutaBColor { get; set; }
        public decimal Latitud { get; set; }
        public decimal Longitud { get; set; }
        public string Descripcion { get; set; } = string.Empty;
        public double DistanciaEntrePuntosMetros { get; set; }
    }

    public class AnalisisRutasMapaDto
    {
        public List<FincaMapaDto> Fincas { get; set; } = new();
        public List<ViajeGpsResumenDto> Viajes { get; set; } = new();
        public List<CruceRutasDto> Cruces { get; set; } = new();
    }

    public class CrearEntradaTerceroDto
    {
        public DateTime Fecha { get; set; }
        public int? FincaId { get; set; }
        public string? NuevaFincaNombre { get; set; }
        public string? NuevaFincaPropietario { get; set; }
        public decimal? NuevaFincaPrecioLitro { get; set; }
        public int Litros { get; set; }
        public string? TipoLeche { get; set; }
        public string? Observacion { get; set; }
    }
}
