using System;
using System.Collections.Generic;
using System.Linq;

namespace Transporte.Core.DTOs
{
    // =========================================================================
    // DTOs PARA MÓDULO DE REPORTES INTEGRAL
    // =========================================================================

    public class ReporteDiarioRowDto
    {
        public string Fecha { get; set; } = string.Empty;
        public int Litros { get; set; }
    }

    public class ReporteDiariosDto
    {
        public List<ReporteDiarioRowDto> DiarioRutas { get; set; } = new();
        public int TotalDiarioRutas { get; set; }
        public List<ReporteDiarioRowDto> DiarioReceptorias { get; set; } = new();
        public int TotalDiarioReceptorias { get; set; }
        public List<ReporteDiarioRowDto> DiarioTransporteRutas { get; set; } = new();
        public int TotalDiarioTransporteRutas { get; set; }
        public List<ReporteDiarioRowDto> DiarioTransporteReceptorias { get; set; } = new();
        public int TotalDiarioTransporteReceptorias { get; set; }
    }

    public class ReporteDetalleItemDto
    {
        public string Fecha { get; set; } = string.Empty;
        public int Litros { get; set; }
        public bool EsAcida { get; set; }
        public decimal PrecioLitroUSDAplicado { get; set; }
        public string? TipoLeche { get; set; } = "VACA";
        public string? Observacion { get; set; }
        public string? ChoferNombre { get; set; }
        public string? EntidadNombre { get; set; }
        public int? TicketId { get; set; }
        public int TotalLitrosFinca { get; set; }
        public int LitrosEntregados { get; set; }
        public int MermaLitros { get; set; }
        public decimal PorcentajeMerma { get; set; }
        public string? DestinoNombre { get; set; }
        public string? TipoDestino { get; set; }
    }

    public class ReporteEntidadResumenDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string? Propietario { get; set; }
        public string? CedulaRIF { get; set; }
        public int TipoServicioId { get; set; } = 1;
        public string TipoServicioNombre { get; set; } = "RUTA";
        public decimal PrecioLitroUSD { get; set; }
        public decimal PrecioBufalaLitroUSD { get; set; }
        public decimal PrecioLitroAcidaUSD { get; set; }
        public decimal TasaBcv { get; set; }
        public List<ReporteDetalleItemDto> Detalle { get; set; } = new();
        public int TotalLitros { get; set; }
        public int TotalLitrosVaca { get; set; }
        public int TotalLitrosBufala { get; set; }
        public int TotalLitrosAcida { get; set; }
        public decimal TotalUSDVaca { get; set; }
        public decimal TotalUSDBufala { get; set; }
        public decimal TotalUSDAcida { get; set; }
        public bool TieneBufala { get; set; }
        public bool TieneVaca { get; set; }
        public int TotalLitrosFinca { get; set; }
        public int TotalLitrosEntregados { get; set; }
        public int TotalMermaLitros { get; set; }
        public decimal PorcentajeMermaGlobal { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TotalBs { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public string? CuotasDetalle { get; set; }
        public decimal TotalNetoUSD => TotalUSD - TotalAdelantosUSD;
        public decimal TotalNetoBs => TotalBs - TotalAdelantosBs;
        public bool EsPagado { get; set; }
        public int? PagoId { get; set; }
        public DateTime? FechaPago { get; set; }
    }

    public class ReporteBancoFincaDto
    {
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public int? BancoId { get; set; }
        public string BancoNombre { get; set; } = string.Empty;
        public string? NumeroCuenta { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public int TotalLitros { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public decimal TasaBcv { get; set; }
        public decimal TotalNetoBs { get; set; }
        public bool EsPagado { get; set; }
        public int? PagoId { get; set; }
        public DateTime? FechaPago { get; set; }
    }

    public class ReporteRelacionChoferDetalleDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public int UsuarioId { get; set; }
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public int Litros { get; set; }
        public string TipoLeche { get; set; } = "VACA";
        public string Observacion { get; set; } = string.Empty;
        public int? TicketControlId { get; set; }
    }

    public class ReporteRelacionChoferDiarioDto
    {
        public string Fecha { get; set; } = string.Empty;
        public long? TicketId { get; set; }
        public int UsuarioId { get; set; }
        public int LitrosRuta { get; set; }
        public int LitrosQuesera { get; set; }
        public int Diferencia => LitrosQuesera - LitrosRuta;
        public string? Destino { get; set; }
        public string? Observacion { get; set; }
    }

    public class ReporteRelacionChoferDto
    {
        public int UsuarioId { get; set; }
        public string Chofer { get; set; } = string.Empty;
        public int LitrosRuta { get; set; }
        public int LitrosQuesera { get; set; }
        public int Diferencias => LitrosRuta - LitrosQuesera;
        public int TotalLitros => LitrosRuta + LitrosQuesera;
        public List<ReporteRelacionChoferDetalleDto> DetalleFincas { get; set; } = new();
        public List<ReporteRelacionChoferDiarioDto> DetalleDiario { get; set; } = new();
    }

    public class ReporteRelacionCompaniaDto
    {
        public int CompaniaId { get; set; }
        public string CompaniaNombre { get; set; } = string.Empty;
        public string Encargado { get; set; } = string.Empty;
        public string? Telefono { get; set; }
        public string? CedulaRIF { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public decimal? PrecioAcidaLitroUSD { get; set; }
        public string DiaAperturaSemana { get; set; } = "Martes";
        public string DiaCierreSemana { get; set; } = "Lunes";
        public int TipoServicioId { get; set; } = 1;
        public string TipoServicioNombre { get; set; } = "RUTA";
        public int TotalLitros { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TotalAbonosUSD { get; set; }
        public decimal TotalAbonosBs { get; set; }
        public decimal TasaBcv { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public decimal TotalNetoBs { get; set; }
        public decimal TotalNetoUSD { get; set; }
        public bool EsPagado { get; set; }
        public int? PagoId { get; set; }
        public DateTime? FechaPago { get; set; }
        public List<EntregaItemDto> EntregasDetalle { get; set; } = new();
    }

    // =========================================================================
    // DTOs PARA MÓDULO DE ADELANTOS Y ABONOS POR CICLOS OPERATIVOS
    // =========================================================================

    public class AdelantoDto
    {
        public int Id { get; set; }
        public string TipoEntidad { get; set; } = string.Empty; // 'FINCA' o 'RECEPTORIA'
        public int EntidadId { get; set; }
        public string EntidadNombre { get; set; } = string.Empty;
        public DateTime FechaSolicitud { get; set; }
        public int? SemanaInicioId { get; set; }
        public string? SemanaInicioNombre { get; set; }
        public decimal MontoTotalUSD { get; set; }
        public int NumeroCuotas { get; set; }
        public decimal MontoCuotaUSD { get; set; }
        public decimal MontoPagadoUSD { get; set; }
        public decimal MontoPendienteUSD { get; set; }
        public string Estado { get; set; } = "ACTIVO"; // 'ACTIVO', 'PAGADO', 'CANCELADO'
        public string? Observacion { get; set; }
        public List<AdelantoCuotaDto> Cuotas { get; set; } = new();
    }

    public class AdelantoCuotaDto
    {
        public int Id { get; set; }
        public int AdelantoId { get; set; }
        public int NumeroCuota { get; set; }
        public int? SemanaOperativaId { get; set; }
        public string? SemanaNombre { get; set; }
        public DateTime? FechaInicioSemana { get; set; }
        public DateTime? FechaFinSemana { get; set; }
        public decimal MontoCuotaUSD { get; set; }
        public decimal MontoCobradoUSD { get; set; }
        public decimal TasaBcvAplicada { get; set; }
        public decimal MontoCobradoBs { get; set; }
        public string Estado { get; set; } = "PENDIENTE"; // 'PENDIENTE', 'COBRADO', 'POSPUESTO'
        public string? Observacion { get; set; }
    }

    public class CuotaAdelantoItemDto
    {
        public int NumeroCuota { get; set; }
        public decimal MontoCuotaUSD { get; set; }
        public decimal? TasaBcvAplicada { get; set; }
        public int? SemanaOperativaId { get; set; }
    }

    public class CrearAdelantoDto
    {
        public string TipoEntidad { get; set; } = "FINCA"; // 'FINCA' o 'RECEPTORIA'
        public int EntidadId { get; set; }
        public DateTime? FechaSolicitud { get; set; }
        public int? SemanaInicioId { get; set; }
        public decimal MontoTotalUSD { get; set; }
        public int NumeroCuotas { get; set; } = 1;
        public decimal? TasaBcvInicial { get; set; }
        public string? Observacion { get; set; }
        public List<CuotaAdelantoItemDto>? CuotasPersonalizadas { get; set; }
    }

    public class ReestructurarCuotasDto
    {
        public List<CuotaAdelantoItemDto> NuevasCuotasPendientes { get; set; } = new();
    }

    public class ActualizarCuotaAdelantoDto
    {
        public decimal? MontoCuotaUSD { get; set; }
        public decimal? MontoCobradoUSD { get; set; }
        public decimal? TasaBcvAplicada { get; set; }
        public decimal? MontoCobradoBs { get; set; }
        public int? SemanaOperativaId { get; set; }
        public string? Estado { get; set; } // 'PENDIENTE', 'COBRADO', 'POSPUESTO'
        public string? Observacion { get; set; }
    }

    public class PosponerCuotaDto
    {
        public string? Motivo { get; set; }
        public int? SemanaOperativaIdDestino { get; set; }
    }

    public class DividirCuotaDto
    {
        public decimal MontoDescontarUSD { get; set; }
        public int? SemanaOperativaIdDestino { get; set; }
        public string? Motivo { get; set; }
    }


    public class ActualizarTasaAdelantosActivosDto
    {
        public string TipoEntidad { get; set; } = "FINCA";
        public decimal TasaBcv { get; set; }
    }

    public class MarcarPagoLiquidacionDto
    {
        public int FincaId { get; set; }
        public DateTime FechaDesde { get; set; }
        public DateTime FechaHasta { get; set; }
        public bool Pagado { get; set; }
        public decimal? TasaBcv { get; set; }
    }

    public class AbonoDetalleDto
    {
        public int Id { get; set; }
        public int AdelantoId { get; set; }
        public int NumeroCuota { get; set; }
        public string TipoEntidad { get; set; } = string.Empty;
        public int EntidadId { get; set; }
        public string EntidadNombre { get; set; } = string.Empty;
        public int? SemanaOperativaId { get; set; }
        public string? SemanaNombre { get; set; }
        public DateTime? FechaCobro { get; set; }
        public decimal MontoCuotaUSD { get; set; }
        public decimal MontoCobradoUSD { get; set; }
        public decimal TasaBcvAplicada { get; set; }
        public decimal MontoCobradoBs { get; set; }
        public string Estado { get; set; } = "COBRADO";
        public string? Observacion { get; set; }
        public string? ReferenciaComprobante { get; set; }
        public string? MetodoPago { get; set; }
        public decimal SaldoRestanteUSD { get; set; }
    }

    public class RegistrarAbonoDirectoDto
    {
        public int AdelantoId { get; set; }
        public decimal MontoAbonoUSD { get; set; }
        public decimal? TasaBcv { get; set; }
        public decimal? MontoAbonoBs { get; set; }
        public int? SemanaOperativaId { get; set; }
        public DateTime? FechaAbono { get; set; }
        public string? ReferenciaComprobante { get; set; }
        public string? MetodoPago { get; set; }
        public string? Observacion { get; set; }
    }

    public class ChatRequestDto
    {
        public string Mensaje { get; set; } = string.Empty;
    }

    public class ChatResponseDto
    {
        public string Respuesta { get; set; } = string.Empty;
        public List<string>? ProblemasDetectados { get; set; }
        public List<string>? Sugerencias { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.Now;
    }

    // =========================================================================
    // DTOs PARA DASHBOARD AVANZADO (5 GRÁFICOS)
    // =========================================================================

    public class DashboardAvanzadoDto
    {
        public List<TendenciaSemanaItemDto> TendenciaSemanas { get; set; } = new();
        public List<DesempenoConductorItemDto> DesempenoConductores { get; set; } = new();
        public List<LecheAcidaFincaItemDto> LecheAcidaFincas { get; set; } = new();
        public List<EntregaPlantaItemDto> EntregasPlantas { get; set; } = new();
        public List<AdelantoRiesgoItemDto> AdelantosRiesgo { get; set; } = new();
    }

    public class TendenciaSemanaItemDto
    {
        public int CicloId { get; set; }
        public string Semana { get; set; } = string.Empty;
        public decimal Recolectado { get; set; }
        public decimal Entregado { get; set; }
        public decimal Merma => Recolectado - Entregado;
    }

    public class DesempenoConductorItemDto
    {
        public string Conductor { get; set; } = string.Empty;
        public decimal Litros { get; set; }
        public int Viajes { get; set; }
        public int Fincas { get; set; }
    }

    public class LecheAcidaFincaItemDto
    {
        public string Finca { get; set; } = string.Empty;
        public decimal LitrosAcidos { get; set; }
    }

    public class EntregaPlantaItemDto
    {
        public string Planta { get; set; } = string.Empty;
        public decimal Litros { get; set; }
        public decimal Porcentaje { get; set; }
    }

    public class AdelantoRiesgoItemDto
    {
        public string Beneficiario { get; set; } = string.Empty;
        public decimal MontoPendienteUSD { get; set; }
        public decimal MontoTotalUSD { get; set; }
    }

}
