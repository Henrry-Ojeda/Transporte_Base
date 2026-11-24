using System;
using System.Collections.Generic;
using System.Linq;

namespace Transporte.Core.DTOs
{
    public class LoginDto
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponseDto
    {
        public string Token { get; set; } = string.Empty;
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public bool EsSuperAdmin { get; set; } = false;
        public string? FotoUrl { get; set; }
        public bool PermisoCrearViaje { get; set; } = false;
        public IEnumerable<string> Permisos { get; set; } = Enumerable.Empty<string>();
        public IEnumerable<string> ModulosHabilitados { get; set; } = Enumerable.Empty<string>();
        public string EmpresaCodigo { get; set; } = string.Empty;
        public string EmpresaNombre { get; set; } = string.Empty;
    }

    public class PerfilUsuarioDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string? FotoUrl { get; set; }
        public bool PermisoCrearViaje { get; set; } = false;
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public string? VehiculoPlaca { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class ActualizarPerfilDto
    {
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string? FotoUrl { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public string? PasswordActual { get; set; }
        public string? NuevoPassword { get; set; }
    }

    public class HistorialBcvDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public decimal TasaDolarBs { get; set; }
        public string? Fuente { get; set; }
        public string? Observacion { get; set; }
    }

    public class GuardarBcvDto
    {
        public DateTime Fecha { get; set; }
        public decimal TasaDolarBs { get; set; }
        public string? Fuente { get; set; }
        public string? Observacion { get; set; }
    }

    public class RegistrarBcvDto : GuardarBcvDto {}
    public class RegistrarTasaBcvDto : GuardarBcvDto {}

    public class EditarBcvDto
    {
        public DateTime? Fecha { get; set; }
        public decimal? TasaDolarBs { get; set; }
        public string? Fuente { get; set; }
        public string? Observacion { get; set; }
    }

    public class RegistrarRutaDto
    {
        public DateTime Fecha { get; set; }
        public int FincaId { get; set; }
        public int? ConductorId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public decimal? PrecioLitroUSDAplicado { get; set; }
        public string? UuidLocal { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
        public long? ControlRutaId { get; set; }
    }

    public class RegistrarRutaItemMasivoDto
    {
        public int FincaId { get; set; }
        public string? NombreFincaNuevo { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public decimal? PrecioLitroUSDAplicado { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
    }

    public class RegistrarRutasMasivoDto
    {
        public DateTime Fecha { get; set; }
        public int? ConductorId { get; set; }
        public long? ControlRutaId { get; set; }
        public List<RegistrarRutaItemMasivoDto> Items { get; set; } = new();

        // Soporte para completar flujo de entrega y recepción directa (choferes sin teléfono)
        public bool RegistrarEntrega { get; set; } = false;
        public int? CompaniaDestinoId { get; set; }
        public int? LitrosRecibidosPlanta { get; set; }
        public string? ObservacionEntrega { get; set; }
        public bool FinalizarInmediato { get; set; } = true;
    }

    public class RutaItemOcrDto
    {
        public int? FincaId { get; set; }
        public string? FincaNombreDetectado { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public string? Observacion { get; set; }
        public string? TipoColumna { get; set; } = "MATERA";
        public decimal Confianza { get; set; } = 1.0m;
    }

    public class ResultadoOcrRutaDto
    {
        public List<RutaItemOcrDto> Items { get; set; } = new();
        public string? ReceptoraDetectada { get; set; }
        public string? Mensaje { get; set; }
    }

    public class RutaItemDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public int? TipoServicioId { get; set; }
        public int? CompaniaId { get; set; }
        public string? CompaniaNombre { get; set; }
        public int ConductorId { get; set; }
        public string ConductorNombre { get; set; } = string.Empty;
        public int Litros { get; set; }
        public string? TipoLeche { get; set; } = "VACA";
        public bool TieneDosTiposLeche { get; set; }
        public bool EsAcida { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal TasaBcvUsada { get; set; }
        public decimal SubtotalUSD { get; set; }
        public bool PuedeModificar { get; set; }
        public string? Observacion { get; set; }
        public long? ControlRutaId { get; set; }
        public string? EstadoTicket { get; set; }
        public int? ProcesoTicketId { get; set; }
        public int? CicloId { get; set; }
        public int? CicloLiquidacionId { get; set; }
        public bool EsDiferido { get; set; }
        public long? RecoleccionOrigenId { get; set; }
        public int? LitrosOriginales { get; set; }
        public string? FotoComprobante { get; set; }
        public string? FotosEvidenciaJson { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? ModifiedAt { get; set; }
    }

    public class DiferirLitrosDto
    {
        public int LitrosDiferir { get; set; }
        public int? CicloDestinoId { get; set; }
        public string? Motivo { get; set; }
        public DateTime? FechaDestino { get; set; }
    }

    public class ModificarLitrosDto
    {
        public int NuevosLitros { get; set; }
    }

    public class BalanceMermaDto
    {
        public string? Fecha { get; set; }
        public int ConductorId { get; set; }
        public string NombreConductor { get; set; } = string.Empty;
        public int LitrosRecolectados { get; set; }
        public int LitrosEntregados { get; set; }
        public int MermaLitros { get; set; }
        public decimal PorcentajeMerma { get; set; }
    }

    public class PreLiquidacionDto
    {
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public int? BancoId { get; set; }
        public string BancoNombre { get; set; } = string.Empty;
        public string NumeroCuenta { get; set; } = string.Empty;
        // Banco del propietario (cuenta del productor, independiente de la finca)
        public int? PropietarioBancoId { get; set; }
        public string PropietarioBancoNombre { get; set; } = string.Empty;
        public int TotalLitros { get; set; }
        public int TotalLitrosBuenos { get; set; }
        public int TotalLitrosVaca { get; set; }
        public int TotalLitrosBufala { get; set; }
        public int TotalLitrosAcidos { get; set; }
        public bool TieneDosTiposLeche { get; set; } = false;
        public decimal PrecioLitroUSD { get; set; }
        public decimal PrecioLitroBufalaUSD { get; set; } = 1.02m;
        public decimal PrecioLitroAcidaUSD { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public string CuotasDetalle { get; set; } = string.Empty;
        public decimal OtrasDeduccionesBs { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public decimal TotalNetoBs { get; set; }
        public string? SemanasUnificadas { get; set; }
        public string? SemanasPendientes { get; set; }
        public int CantidadSemanasPendientes { get; set; }
        public string? SemanasPagadas { get; set; }
        public int CantidadSemanasPagadas { get; set; }
        public decimal DeudaRestanteUSD { get; set; }
        public decimal DeudaRestanteBs { get; set; }
        public bool EsPagado { get; set; } = false;
        public int? PagoId { get; set; }
        public DateTime? FechaPago { get; set; }
        public int? PropietarioId { get; set; }
        public decimal? PaidTasaBcv { get; set; }
        public decimal TasaBcv { get; set; }
        public decimal? PaidTotalBrutoBs { get; set; }
        public decimal? PaidTotalAdelantosBs { get; set; }
        public decimal? PaidOtrasDeduccionesBs { get; set; }
        public decimal? PaidTotalNetoBs { get; set; }
    }

    public class PreLiquidacionConsolidadaDto
    {
        public int PropietarioId { get; set; }
        public string PropietarioNombre { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public int? BancoId { get; set; }
        public string BancoNombre { get; set; } = string.Empty;
        public string NumeroCuenta { get; set; } = string.Empty;
        public int TotalFincas { get; set; }
        public string NombresFincas { get; set; } = string.Empty;
        public int TotalLitros { get; set; }
        public int TotalLitrosBuenos { get; set; }
        public int TotalLitrosAcidos { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public decimal OtrasDeduccionesBs { get; set; }
        public decimal TotalNetoBs { get; set; }
        public bool TodosPagados { get; set; } = false;
        public List<PreLiquidacionDto> Fincas { get; set; } = new();
    }

    public class PropietarioCuentaBancariaDto
    {
        public int Id { get; set; }
        public int PropietarioId { get; set; }
        public int BancoId { get; set; }
        public string? BancoNombre { get; set; }
        public string? BancoCodigo { get; set; }
        public string NumeroCuenta { get; set; } = string.Empty;
        public string? TipoCuenta { get; set; } = "CORRIENTE";
        public string? Titular { get; set; }
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public bool EsPrincipal { get; set; } = false;
        public bool Activo { get; set; } = true;
    }

    public class PropietarioDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string NombreCompleto => Nombre;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public int? BancoId { get; set; }
        public string BancoNombre { get; set; } = string.Empty;
        public string? NumeroCuenta { get; set; }
        public string? Observacion { get; set; }
        public string Estado { get; set; } = "ACTIVO";
        public bool Activo { get; set; } = true;
        public int TotalFincas { get; set; }
        public List<string> FincasNombres { get; set; } = new();
        public List<PropietarioCuentaBancariaDto> Cuentas { get; set; } = new();
    }

    public class CrearPropietarioDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public int? BancoId { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? Observacion { get; set; }
        public bool? Activo { get; set; } = true;
        public List<int>? FincaIds { get; set; }
        public List<PropietarioCuentaBancariaDto>? Cuentas { get; set; }
    }

    public class ActualizarPropietarioDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public int? BancoId { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? Observacion { get; set; }
        public string? Estado { get; set; }
        public bool? Activo { get; set; }
        public List<int>? FincaIds { get; set; }
        public List<PropietarioCuentaBancariaDto>? Cuentas { get; set; }
    }

    public class AsignarFincasPropietarioDto
    {
        public int PropietarioId { get; set; }
        public string? PropietarioNombre { get; set; }
        public string? CedulaRIF { get; set; }
        public int? BancoId { get; set; }
        public string? NumeroCuenta { get; set; }
        public List<int> FincaIds { get; set; } = new();
    }

    public class ProcesarPagoLiquidacionDto
    {
        public int FincaId { get; set; }
        public int? CicloId { get; set; }
        public string? CicloIds { get; set; }
        public bool Pagado { get; set; } = true;
        public decimal? TasaBcv { get; set; }
        public string? Observacion { get; set; }
    }

    public class PagoLiquidacionHistorialDto
    {
        public int Id { get; set; }
        public int CicloId { get; set; }
        public string CicloNombre { get; set; } = string.Empty;
        public DateTime FechaInicioCiclo { get; set; }
        public DateTime FechaFinCiclo { get; set; }
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string? Propietario { get; set; }
        public string? CedulaRIF { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public int TotalLitros { get; set; }
        public int TotalLitrosBuenos { get; set; }
        public int TotalLitrosAcidos { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal PrecioLitroAcidaUSD { get; set; }
        public decimal TotalUSD { get; set; }
        public decimal TasaBcv { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public string? CuotasDetalle { get; set; }
        public bool CanceladoTotalAdelanto { get; set; }
        public decimal OtrasDeduccionesBs { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public decimal TotalNetoBs { get; set; }
        public string EstadoPago { get; set; } = "PAGADO";
        public DateTime FechaPago { get; set; }
        public int? UsuarioId { get; set; }
        public string? Observacion { get; set; }
    }

    public class AjustarPreLiquidacionFincaDto
    {
        public int FincaId { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal? PrecioLitroBufalaUSD { get; set; }
        public decimal PrecioLitroAcidaUSD { get; set; }
        public decimal? TasaDolarBs { get; set; }
        public decimal? AdelantoCuotaBs { get; set; }
        public decimal? AdelantoCuotaUSD { get; set; }
        public decimal OtrasDeduccionesBs { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public int? CicloId { get; set; }
    }

    public class ActualizarTasaPendientesDto
    {
        public int? CicloId { get; set; }
        public string? CicloIds { get; set; }
        public decimal TasaBcv { get; set; }
    }

    public class CrearCicloDto
    {
        public string Codigo { get; set; } = string.Empty;
        public DateTime FechaInicio { get; set; }
        public DateTime FechaFin { get; set; }
        public decimal? StockInicialTanques { get; set; }
        public string? Observaciones { get; set; }
    }

    public class EditarCicloDto
    {
        public string Codigo { get; set; } = string.Empty;
        public DateTime FechaInicio { get; set; }
        public DateTime FechaFin { get; set; }
        public string? Observaciones { get; set; }
    }

    public class CerrarSemanaDto
    {
        public decimal? StockFinalTanques { get; set; }
    }

    public class Generar52SemanasDto
    {
        public int Anio { get; set; }
        public int DiaInicio { get; set; } = 2; // 2 = Martes
        public int DiaFin { get; set; } = 1;    // 1 = Lunes
        public DateTime? FechaPrimerInicio { get; set; }
    }

    public class Completar52SemanasDto
    {
        public int? Anio { get; set; }
    }

    public class SemanaDetalleDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public int NumeroSemana { get; set; }
        public int Anio { get; set; }
        public int Año => Anio;
        public DateTime FechaInicio { get; set; }
        public DateTime FechaFin { get; set; }
        public string Estado { get; set; } = string.Empty;
        public int TotalLitros { get; set; }
        public decimal TotalMontoUSD { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public int TotalFincasParticipantes { get; set; }
        public int TotalCompaniasParticipantes { get; set; }
        public string? Observaciones { get; set; }
        public decimal StockInicialTanques { get; set; } = 0m;
        public decimal? StockFinalTanques { get; set; }
    }

    public class ActualizarStockInicialDto
    {
        public decimal StockInicial { get; set; }
    }

    public class ResumenCierreCicloDto
    {
        public int CicloId { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public DateTime FechaInicio { get; set; }
        public DateTime FechaFin { get; set; }
        public decimal StockInicialTanques { get; set; }
        public decimal TotalRecolectadoFincas { get; set; }
        public decimal TotalEntregasReceptoria { get; set; }
        public decimal TotalDespachosCompanias { get; set; }
        public decimal TotalMerma { get; set; }
        public decimal BalanceCalculadoTanque { get; set; }
        public int? SiguienteCicloId { get; set; }
        public string? SiguienteCicloCodigo { get; set; }
        public DateTime? SiguienteCicloFechaInicio { get; set; }
        public DateTime? SiguienteCicloFechaFin { get; set; }
    }

    public class ValidacionActivacionCicloDto
    {
        public int CicloAActivarId { get; set; }
        public string CicloAActivarCodigo { get; set; } = string.Empty;
        public int? UltimoCicloCerradoId { get; set; }
        public string? UltimoCicloCerradoCodigo { get; set; }
        public decimal UltimoCicloCerradoStockFinal { get; set; }
        public int? CicloSiguienteEsperadoId { get; set; }
        public string? CicloSiguienteEsperadoCodigo { get; set; }
        public bool EsSecuenciaCorrecta { get; set; } = true;
        public string? MensajeAdvertencia { get; set; }
    }

    public class ActivarCicloRequestDto
    {
        public decimal? StockInicialPersonalizado { get; set; }
    }

    public class ChoferDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public string? VehiculoPlaca { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public string? CamionModelo { get; set; }
        public int? CapacidadLitros { get; set; }
        public decimal? TarifaPorLitro { get; set; }
        public decimal? SueldoBase { get; set; }
        public string? FrecuenciaPago { get; set; }
        public string? TipoPago { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public bool Activo { get; set; } = true;
        public DateTime? CreatedAt { get; set; }
    }

    public class EditarRutaDto
    {
        public DateTime? Fecha { get; set; }
        public int? Litros { get; set; }
        public int? NuevosLitros { get; set; }
        public int? ConductorId { get; set; }
        public int? FincaId { get; set; }
        public bool? EsAcida { get; set; }
        public string? TipoLeche { get; set; }
        public bool? EsDiferido { get; set; }
        public decimal? PrecioLitroUSDAplicado { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
    }

    public class RegistrarEntregaDto
    {
        public DateTime Fecha { get; set; }
        public int CompaniaId { get; set; }
        public int? ConductorId { get; set; }
        public int Litros { get; set; }
        public string? Observacion { get; set; }
    }

    public class EntregaItemDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public int CompaniaId { get; set; }
        public string CompaniaNombre { get; set; } = string.Empty;
        public string? Encargado { get; set; }
        public int? TipoServicioId { get; set; }
        public int ConductorId { get; set; }
        public string ConductorNombre { get; set; } = string.Empty;
        public string ChoferNombre { get; set; } = string.Empty;
        public int Litros { get; set; }
        public decimal PrecioVentaUSD { get; set; }
        public decimal TasaDolarBsAplicada { get; set; }
        public decimal SubtotalUSD { get; set; }
        public decimal SubtotalBs { get; set; }
        public bool PuedeModificar { get; set; }
        public string? Observacion { get; set; }
        public long? ControlRutaId { get; set; }
        public long? ControlCompaniaId { get; set; }
        public int? TotalLitrosOrigen { get; set; }
        public int? LitrosFinca { get; set; }
        public int? LitrosCargadosAdicional { get; set; }
        public int? DiferenciaLitros { get; set; }
        public decimal? PorcentajeMerma { get; set; }
        public string? TipoLeche { get; set; }
        public string? TipoDestino { get; set; }
        public string? EstadoViaje { get; set; }
    }

    public class EditarEntregaDto
    {
        public DateTime? Fecha { get; set; }
        public int? Litros { get; set; }
        public int? ConductorId { get; set; }
        public int? CompaniaId { get; set; }
        public decimal? PrecioVentaUSD { get; set; }
        public string? Observacion { get; set; }
    }

    public class TrazabilidadBufalaItemDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public int? CicloId { get; set; }
        public int FincaId { get; set; }
        public string FincaNombre { get; set; } = string.Empty;
        public string Propietario { get; set; } = string.Empty;
        public int? TipoServicioId { get; set; } = 1;
        public string TipoServicio { get; set; } = "RUTA"; // RUTA | TRANSPORTE
        public int LitrosFinca { get; set; }
        public bool EsAcida { get; set; }
        public string TipoLeche { get; set; } = "BUFALA";
        public int UsuarioId { get; set; }
        public string ChoferNombre { get; set; } = string.Empty;
        public long? ControlRutaId { get; set; }
        public long? ControlCompaniaId { get; set; }
        public int? CompaniaId { get; set; }
        public string? CompaniaNombre { get; set; }
        public int? LitrosDespachadosCompania { get; set; }
        public int? LitrosRecibidosCompania { get; set; }
        public int? DiferenciaLitros { get; set; }
        public decimal? PorcentajeMerma { get; set; }
        public bool EsTanqueReceptoria { get; set; }
        public string? DestinosFinales { get; set; }
        public string? EstadoViaje { get; set; }
        public string? Observacion { get; set; }
    }

    public class ResumenTrazabilidadBufalaDto
    {
        public int TotalLitrosFincas { get; set; }
        public int TotalLitrosRuta { get; set; }
        public int TotalLitrosTransporte { get; set; }
        public int TotalLitrosEntregados { get; set; }
        public int TotalLitrosTanques { get; set; }
        public int TotalLitrosCompaniasDirectas { get; set; }
        public int TotalCompaniasDirectasRuta { get; set; }
        public int TotalCompaniasDirectasTransporte { get; set; }
        public int TotalEntregadosRuta { get; set; }
        public int TotalEntregadosTransporte { get; set; }
        public int TotalDiferenciaLitros { get; set; }
        public decimal PorcentajeMermaGlobal { get; set; }
        public int CantidadFincasActivas { get; set; }
        public int CantidadViajes { get; set; }
        public int CantidadCompaniasDestino { get; set; }
        public List<TrazabilidadBufalaItemDto> Detalle { get; set; } = new();
    }

    // --- DTOS CATALOGOS: BANCOS, COMPANIAS, FINCAS ---
    public class BancoDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public bool Activo { get; set; } = true;
        public int FincasCount { get; set; }
    }

    public class CrearBancoDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public bool Activo { get; set; } = true;
    }

    public class EditarBancoDto
    {
        public string? Codigo { get; set; }
        public string? Nombre { get; set; }
        public bool? Activo { get; set; }
    }

    public class CrearCompaniaDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? Encargado { get; set; }
        public string? Telefono { get; set; }
        public string? Direccion { get; set; }
        public int? TipoServicioId { get; set; }
        public decimal PrecioCompraLitroUSD { get; set; }
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public decimal? PrecioAcidaLitroUSD { get; set; } = 0.0000m;
        public string DiaAperturaSemana { get; set; } = "Martes";
        public string DiaCierreSemana { get; set; } = "Lunes";
        public bool Activo { get; set; } = true;
        public bool EsPrincipal { get; set; } = false;
    }

    public class EditarCompaniaDto
    {
        public string? Nombre { get; set; }
        public string? Encargado { get; set; }
        public string? Telefono { get; set; }
        public string? Direccion { get; set; }
        public int? TipoServicioId { get; set; }
        public decimal? PrecioCompraLitroUSD { get; set; }
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public decimal? PrecioAcidaLitroUSD { get; set; }
        public string? DiaAperturaSemana { get; set; }
        public string? DiaCierreSemana { get; set; }
        public bool? Activo { get; set; }
        public string? Observacion { get; set; }
        public bool? EsPrincipal { get; set; }
    }

    public class ActualizarPrecioCompaniaDto
    {
        public decimal NuevoPrecioUSD { get; set; }
        public decimal? NuevoPrecioBufalaUSD { get; set; }
        public decimal? NuevoPrecioAcidaUSD { get; set; }
        public string? Observacion { get; set; }
    }

    public class FincaCuentaBancariaDto
    {
        public int Id { get; set; }
        public int FincaId { get; set; }
        public int BancoId { get; set; }
        public string? BancoNombre { get; set; }
        public string? BancoCodigo { get; set; }
        public string NumeroCuenta { get; set; } = string.Empty;
        public string? Titular { get; set; }
        public string? CedulaRIF { get; set; }
        public bool EsPrincipal { get; set; } = false;
        public bool Activo { get; set; } = true;
    }

    public class FincaDto
    {
        public int Id { get; set; }
        public string? Codigo { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int? PropietarioId { get; set; }
        public string Propietario { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public int? BancoId { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public int? TipoServicioId { get; set; }
        public string? TipoServicioNombre { get; set; }
        public int? CompaniaId { get; set; }
        public string? CompaniaNombre { get; set; }
        public int? RutaId { get; set; }
        public string? RutaNombre { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal PrecioLitroAcidaUSD { get; set; }
        public bool TieneDosTiposLeche { get; set; } = false;
        public decimal? PrecioBufalaLitroUSD { get; set; } = 0.0000m;
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public bool Activo { get; set; } = true;
        public bool IsDeleted { get; set; } = false;
        public int PromedioLitrosDiarios { get; set; } = 0;
        public int UltimoLitros { get; set; } = 0;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public List<FincaCuentaBancariaDto> Cuentas { get; set; } = new();
    }

    public class CrearFincaDto
    {
        public string? Codigo { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int? PropietarioId { get; set; }
        public string Propietario { get; set; } = string.Empty;
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public int? BancoId { get; set; }
        public string? NumeroCuenta { get; set; }
        public int? TipoServicioId { get; set; }
        public int? CompaniaId { get; set; }
        public int? RutaId { get; set; }
        public decimal PrecioLitroUSD { get; set; }
        public decimal PrecioLitroAcidaUSD { get; set; }
        public bool TieneDosTiposLeche { get; set; } = false;
        public decimal? PrecioBufalaLitroUSD { get; set; } = 0.0000m;
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public bool Activo { get; set; } = true;
        public List<FincaCuentaBancariaDto>? Cuentas { get; set; }
    }

    public class EditarFincaDto
    {
        public string? Codigo { get; set; }
        public string? Nombre { get; set; }
        public int? PropietarioId { get; set; }
        public string? Propietario { get; set; }
        public string? CedulaRIF { get; set; }
        public string? Telefono { get; set; }
        public int? BancoId { get; set; }
        public string? NumeroCuenta { get; set; }
        public int? TipoServicioId { get; set; }
        public int? CompaniaId { get; set; }
        public int? RutaId { get; set; }
        public decimal? PrecioLitroUSD { get; set; }
        public decimal? PrecioLitroAcidaUSD { get; set; }
        public bool? TieneDosTiposLeche { get; set; }
        public decimal? PrecioBufalaLitroUSD { get; set; }
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public bool? Activo { get; set; }
        public List<FincaCuentaBancariaDto>? Cuentas { get; set; }
    }

    public class ActualizarPrecioMasivoDto
    {
        public decimal NuevoPrecioUSD { get; set; }
        public bool SoloActivos { get; set; } = true;
        public string? Observacion { get; set; }
    }

    public class HistorialPrecioLogDto
    {
        public int Id { get; set; }
        public DateTime FechaRegistro { get; set; }
        public string TipoCambio { get; set; } = "MASIVO"; // "MASIVO" o "INDIVIDUAL"
        public int? FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public decimal PrecioAnterior { get; set; }
        public decimal PrecioNuevo { get; set; }
        public decimal Diferencia => PrecioNuevo - PrecioAnterior;
        public int CantidadFincasAfectadas { get; set; }
        public int? UsuarioId { get; set; }
        public string? UsuarioNombre { get; set; }
        public string? Observacion { get; set; }
    }

}
