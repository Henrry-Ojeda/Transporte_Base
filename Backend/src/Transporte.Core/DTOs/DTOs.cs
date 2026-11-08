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
        public int? CicloId { get; set; }
        public int? CicloLiquidacionId { get; set; }
        public bool EsDiferido { get; set; }
        public long? RecoleccionOrigenId { get; set; }
        public int? LitrosOriginales { get; set; }
        public string? FotoComprobante { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class DiferirLitrosDto
    {
        public int LitrosDiferir { get; set; }
        public int? CicloDestinoId { get; set; }
        public string? Motivo { get; set; }
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
        public bool Activo => Estado == "ACTIVO" || Estado == "1";
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
        public List<int>? FincaIds { get; set; }
        public List<PropietarioCuentaBancariaDto>? Cuentas { get; set; }
    }

    public class AsignarFincasPropietarioDto
    {
        public int PropietarioId { get; set; }
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

    // ==========================================
    // USUARIOS Y ROLES DTOs
    // ==========================================
    public class UsuarioDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string Rol { get; set; } = "CHOFER";
        public int? RolId { get; set; }
        public string? RolNombre { get; set; }
        public decimal TarifaPorLitro { get; set; }
        public decimal? SueldoBase { get; set; }
        public string? FrecuenciaPago { get; set; } = "Semanal";
        public string? TipoPago { get; set; } = "Variado";
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public bool PermisoCrearViaje { get; set; } = false;
        public bool Activo { get; set; } = true;
        public DateTime CreatedAt { get; set; }
        public CamionDto? Camion { get; set; }
    }

    public class CrearUsuarioDto
    {
        private string _username = string.Empty;
        public string Username 
        { 
            get => _username; 
            set => _username = value ?? string.Empty; 
        }
        public string? NombreUsuario 
        { 
            get => _username; 
            set { if (!string.IsNullOrWhiteSpace(value)) _username = value; } 
        }
        public string Password { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public string Rol { get; set; } = "CHOFER";
        public int? RolId { get; set; }
        public decimal? TarifaPorLitro { get; set; }
        public decimal? SueldoBase { get; set; }
        public string? FrecuenciaPago { get; set; } = "Semanal";
        public string? TipoPago { get; set; } = "Variado";
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public bool PermisoCrearViaje { get; set; } = false;
        public bool Activo { get; set; } = true;

        // Camión asignado si el rol es CHOFER
        public int? CamionId { get; set; }
        public string? Placa { get; set; }
        public int? Compartimientos { get; set; }
        public decimal? CapacidadLitros { get; set; }
        public string? MarcaModelo { get; set; }
        public string? ObservacionesCamion { get; set; }
    }

    public class EditarUsuarioDto
    {
        private string? _username;
        public string? Username 
        { 
            get => _username; 
            set => _username = value; 
        }
        public string? NombreUsuario 
        { 
            get => _username; 
            set { if (!string.IsNullOrWhiteSpace(value)) _username = value; } 
        }
        public string? NombreCompleto { get; set; }
        public string? Password { get; set; }
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public string? Rol { get; set; }
        public int? RolId { get; set; }
        public decimal? TarifaPorLitro { get; set; }
        public decimal? SueldoBase { get; set; }
        public string? FrecuenciaPago { get; set; }
        public string? TipoPago { get; set; }
        public string? BancoNombre { get; set; }
        public string? NumeroCuenta { get; set; }
        public string? CedulaPagoMovil { get; set; }
        public string? TelefonoPagoMovil { get; set; }
        public bool? PermisoCrearViaje { get; set; }
        public bool? Activo { get; set; }

        // Camión asignado si el rol es CHOFER
        public int? CamionId { get; set; }
        public string? Placa { get; set; }
        public int? Compartimientos { get; set; }
        public decimal? CapacidadLitros { get; set; }
        public string? MarcaModelo { get; set; }
        public string? ObservacionesCamion { get; set; }
    }

    public class CambiarPermisoCrearViajeDto
    {
        public bool PermisoCrearViaje { get; set; }
    }

    public class RolDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public bool Activo { get; set; } = true;
        public int UsuariosCount { get; set; }
    }

    public class CrearRolDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public bool Activo { get; set; } = true;
    }

    // ==========================================
    // CAMIONES DTOs
    // ==========================================
    public class CamionDto
    {
        public int Id { get; set; }
        public int? UsuarioId { get; set; }
        public string? ChoferNombre { get; set; }
        public string? ChoferCedula { get; set; }
        public string? ChoferTelefono { get; set; }
        public string Placa { get; set; } = string.Empty;
        public int Compartimientos { get; set; } = 1;
        public decimal CapacidadLitros { get; set; }
        public decimal CapacidadTanqueLitros { get; set; } = 0;
        public string TipoCombustible { get; set; } = "GASOIL";
        public decimal OdometroActualKm { get; set; } = 0;
        public string? MarcaModelo { get; set; }
        public string? Observaciones { get; set; }
        public string Estado { get; set; } = "ACTIVO"; // ACTIVO, INACTIVO, MANTENIMIENTO
        public bool Activo { get; set; } = true;
        public DateTime CreatedAt { get; set; }
    }

    public class CrearCamionDto
    {
        public int? UsuarioId { get; set; }
        public string Placa { get; set; } = string.Empty;
        public int Compartimientos { get; set; } = 1;
        public decimal CapacidadLitros { get; set; }
        public decimal CapacidadTanqueLitros { get; set; } = 0;
        public string TipoCombustible { get; set; } = "GASOIL";
        public decimal OdometroActualKm { get; set; } = 0;
        public string? MarcaModelo { get; set; }
        public string? Observaciones { get; set; }
        public string Estado { get; set; } = "ACTIVO";
        public bool Activo { get; set; } = true;
    }

    public class EditarCamionDto
    {
        public int? UsuarioId { get; set; }
        public string? Placa { get; set; }
        public int? Compartimientos { get; set; }
        public decimal? CapacidadLitros { get; set; }
        public decimal? CapacidadTanqueLitros { get; set; }
        public string? TipoCombustible { get; set; }
        public decimal? OdometroActualKm { get; set; }
        public string? MarcaModelo { get; set; }
        public string? Observaciones { get; set; }
        public string? Estado { get; set; }
        public bool? Activo { get; set; }
    }

    public class ActualizarEstadoCamionDto
    {
        public string Estado { get; set; } = "ACTIVO";
    }

    public class CambiarPasswordDto
    {
        public string? NuevaPassword { get; set; }
        public string? NuevoPassword { get; set; }
        public string? Password { get; set; }

        public string ObtenerPasswordValida()
        {
            if (!string.IsNullOrWhiteSpace(NuevaPassword)) return NuevaPassword.Trim();
            if (!string.IsNullOrWhiteSpace(NuevoPassword)) return NuevoPassword.Trim();
            if (!string.IsNullOrWhiteSpace(Password)) return Password.Trim();
            return string.Empty;
        }
    }

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
        public int FincaId { get; set; }
        public int Litros { get; set; }
        public bool EsAcida { get; set; } = false;
        public string? TipoLeche { get; set; } = "VACA";
        public bool EsDiferido { get; set; } = false;
        public DateTime? Fecha { get; set; }
        public int? NumeroCompartimiento { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
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
        public string Motivo { get; set; } = string.Empty;
    }

    public class EditarEntregaViajeAuditadoDto
    {
        public int CompaniaId { get; set; }
        public int Litros { get; set; }
        public string? Observacion { get; set; }
        public string? FotoComprobante { get; set; }
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
        public DateTime Fecha { get; set; }
    }

    // =========================================================================
    // DTOs PARA PAGOS A USUARIOS (CHOFERES, MATERA, PERSONAL), CRUD Y AUDITORÍA
    // =========================================================================

    public class PagoUsuarioDto
    {
        public int Id { get; set; }
        public int UsuarioId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string Rol { get; set; } = string.Empty;
        public int? CicloId { get; set; }
        public string? CicloCodigo { get; set; }
        public string TipoBeneficiario { get; set; } = "CHOFER";
        public DateTime FechaPago { get; set; }
        public decimal TotalLitros { get; set; }
        public decimal TarifaPorLitroUSD { get; set; }
        public decimal MontoFijoUSD { get; set; }
        public decimal TotalBrutoUSD { get; set; }
        public decimal TasaBcv { get; set; }
        public decimal TotalBrutoBs { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal TotalAdelantosBs { get; set; }
        public decimal DescuentoLecheUSD { get; set; }
        public decimal DescuentoLecheBs { get; set; }
        public string? ConceptoDescuentoLeche { get; set; }
        public decimal OtrasDeduccionesUSD { get; set; }
        public decimal OtrasDeduccionesBs { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public decimal TotalNetoUSD { get; set; }
        public decimal TotalNetoBs { get; set; }
        public string EstadoPago { get; set; } = "PAGADO";
        public string MetodoPago { get; set; } = "TRANSFERENCIA";
        public string? BancoDestino { get; set; }
        public string? NumeroReferencia { get; set; }
        public string? Observaciones { get; set; }
        public int? CreatedBy { get; set; }
        public string? CreadoPorNombre { get; set; }
        public DateTime CreatedAt { get; set; }
        public int? UpdatedBy { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class CrearPagoUsuarioDto
    {
        public int UsuarioId { get; set; }
        public int? CicloId { get; set; }
        public string TipoBeneficiario { get; set; } = "CHOFER";
        public DateTime? FechaPago { get; set; }
        public decimal TotalLitros { get; set; }
        public decimal TarifaPorLitroUSD { get; set; }
        public decimal MontoFijoUSD { get; set; }
        public decimal? TotalBrutoUSD { get; set; }
        public decimal? TasaBcv { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal DescuentoLecheUSD { get; set; }
        public string? ConceptoDescuentoLeche { get; set; }
        public decimal OtrasDeduccionesUSD { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public decimal? TotalNetoUSD { get; set; }
        public string EstadoPago { get; set; } = "PAGADO";
        public string MetodoPago { get; set; } = "TRANSFERENCIA";
        public string? BancoDestino { get; set; }
        public string? NumeroReferencia { get; set; }
        public string? Observaciones { get; set; }
        public List<int>? CuotasAdelantoIds { get; set; }
    }

    public class EditarPagoUsuarioDto
    {
        public decimal TotalLitros { get; set; }
        public decimal TarifaPorLitroUSD { get; set; }
        public decimal MontoFijoUSD { get; set; }
        public decimal? TotalBrutoUSD { get; set; }
        public decimal? TasaBcv { get; set; }
        public decimal TotalAdelantosUSD { get; set; }
        public decimal DescuentoLecheUSD { get; set; }
        public string? ConceptoDescuentoLeche { get; set; }
        public decimal OtrasDeduccionesUSD { get; set; }
        public string? ConceptoDeducciones { get; set; }
        public decimal? TotalNetoUSD { get; set; }
        public string EstadoPago { get; set; } = "PAGADO";
        public string MetodoPago { get; set; } = "TRANSFERENCIA";
        public string? BancoDestino { get; set; }
        public string? NumeroReferencia { get; set; }
        public string? Observaciones { get; set; }
        public string MotivoModificacion { get; set; } = string.Empty;
    }

    public class ItemCalculoPagoUsuarioDto
    {
        public int UsuarioId { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string? Cedula { get; set; }
        public string? Telefono { get; set; }
        public string Rol { get; set; } = "CHOFER";
        public decimal TarifaPorLitroUSD { get; set; }
        public decimal TotalLitrosRecolectados { get; set; }
        public decimal TotalLitrosEntregados { get; set; }
        public decimal TotalLitrosAcida { get; set; }
        public decimal TotalLitrosMerma { get; set; }
        public int TotalViajes { get; set; }
        public decimal MontoBrutoCalculadoUSD { get; set; }
        public decimal AdelantoPendienteTotalUSD { get; set; }
        public decimal CuotaAdelantoSugeridaUSD { get; set; }
        public List<CuotaAdelantoPendienteDto> CuotasPendientes { get; set; } = new();
        public bool YaLiquidadoEnCiclo { get; set; }
        public int? PagoIdExistente { get; set; }
        public string? EstadoPagoExistente { get; set; }
        public decimal? TotalNetoPagadoUSD { get; set; }
    }

    public class CuotaAdelantoPendienteDto
    {
        public int CuotaId { get; set; }
        public int AdelantoId { get; set; }
        public int NumeroCuota { get; set; }
        public decimal MontoCuotaUSD { get; set; }
        public string? Observacion { get; set; }
    }

    public class LogPagoUsuarioDto
    {
        public int Id { get; set; }
        public int? PagoUsuarioId { get; set; }
        public int? AdelantoId { get; set; }
        public int UsuarioId { get; set; }
        public string? BeneficiarioNombre { get; set; }
        public string Accion { get; set; } = string.Empty;
        public string Detalle { get; set; } = string.Empty;
        public int? UsuarioOperadorId { get; set; }
        public string? OperadorNombre { get; set; }
        public DateTime Fecha { get; set; }
    }

    // =========================================================================
    // DTOs PARA MÓDULOS, ACCIONES, PERMISOS Y MATRIZ RBAC
    // =========================================================================

    public class ModuloDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Icono { get; set; }
        public int Orden { get; set; }
        public bool Activo { get; set; }
        public int TotalPermisos { get; set; }
    }

    public class CrearModuloDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string? Icono { get; set; }
        public int Orden { get; set; }
        public bool Activo { get; set; } = true;
    }

    public class PermisoDto
    {
        public int Id { get; set; }
        public int ModuloId { get; set; }
        public string ModuloCodigo { get; set; } = string.Empty;
        public string ModuloNombre { get; set; } = string.Empty;
        public string? ModuloIcono { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Accion { get; set; } = "VER"; // VER, CREAR, EDITAR, ELIMINAR, APROBAR, EXPORTAR
        public string? Descripcion { get; set; }
        public bool Activo { get; set; }
        public int TotalRolesAsignados { get; set; }
    }

    public class CrearPermisoDto
    {
        public int ModuloId { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Accion { get; set; } = "VER";
        public string? Descripcion { get; set; }
        public bool Activo { get; set; } = true;
    }

    public class RolPermisoItemDto
    {
        public int PermisoId { get; set; }
        public string PermisoCodigo { get; set; } = string.Empty;
        public string PermisoNombre { get; set; } = string.Empty;
        public string Accion { get; set; } = string.Empty;
        public int ModuloId { get; set; }
        public string ModuloCodigo { get; set; } = string.Empty;
        public string ModuloNombre { get; set; } = string.Empty;
        public string? ModuloIcono { get; set; }
        public bool Concedido { get; set; }
    }

    public class MatrizRolDto
    {
        public int RolId { get; set; }
        public string RolCodigo { get; set; } = string.Empty;
        public string RolNombre { get; set; } = string.Empty;
        public string? RolDescripcion { get; set; }
        public List<int> PermisosAsignadosIds { get; set; } = new();
    }

    public class MatrizSeguridadCompletaDto
    {
        public List<RolDto> Roles { get; set; } = new();
        public List<ModuloDto> Modulos { get; set; } = new();
        public List<PermisoDto> Permisos { get; set; } = new();
        public List<MatrizRolDto> MatrizPorRol { get; set; } = new();
    }

    public class GuardarRolPermisosDto
    {
        public int RolId { get; set; }
        public List<int> PermisosIds { get; set; } = new();
    }

    public class ToggleRolPermisoDto
    {
        public int RolId { get; set; }
        public int PermisoId { get; set; }
        public bool Concedido { get; set; }
    }

    // =========================================================================
    // DTO PARA MEMBRETE Y CONFIGURACIÓN DE EMPRESA DE TRANSPORTE
    // =========================================================================

    public class EmpresaConfigDto
    {
        public int Id { get; set; } = 1;
        public string Nombre { get; set; } = "";
        public string? NombreEmpresa { get; set; }
        public string? Rif { get; set; } = "";
        public string? Direccion { get; set; } = "";
        public string? Telefono { get; set; } = "";
        public string? Email { get; set; } = "";
        public string? LogoUrl { get; set; } = "";
        public DateTime? FechaActualizacion { get; set; }
        public DateTime? FechaVencimientoLicencia { get; set; }
        public string? ModulosHabilitados { get; set; }
    }

    public class ActualizarLicenciaDto
    {
        public DateTime FechaVencimiento { get; set; }
    }

    // =========================================================================
    // DTOs PARA VINCULACIÓN SEGURA DE DISPOSITIVOS MÓVILES
    // =========================================================================

    public class GenerarCodigoVinculacionDto
    {
        public int UsuarioId { get; set; }
    }

    public class CodigoVinculacionResponseDto
    {
        public string Codigo { get; set; } = string.Empty;
        public DateTime FechaExpiracion { get; set; }
        public string NombreCompleto { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public string EmpresaCodigo { get; set; } = string.Empty;
        public string EmpresaNombre { get; set; } = string.Empty;
    }

    public class VincularDispositivoDto
    {
        public string Codigo { get; set; } = string.Empty;
        public string? DeviceId { get; set; }
        public string? DeviceInfo { get; set; }
    }

    public class VincularDispositivoResponseDto
    {
        public string Token { get; set; } = string.Empty;
        public string EmpresaCodigo { get; set; } = string.Empty;
        public string EmpresaNombre { get; set; } = string.Empty;
        public string? EmpresaLogo { get; set; }
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public bool PermisoCrearViaje { get; set; } = false;
        public int? CamionId { get; set; }
        public string? PlacaCamion { get; set; }
        public decimal CapacidadTanqueLitros { get; set; }
        public IEnumerable<string> Permisos { get; set; } = Enumerable.Empty<string>();
        public IEnumerable<string> ModulosHabilitados { get; set; } = Enumerable.Empty<string>();
    }

    // =========================================================================
    // DTOs PARA PARAMETRIZACIÓN Y CONFIGURACIÓN DINÁMICA
    // =========================================================================

    public class ParametroSistemaDto
    {
        public int Id { get; set; }
        public string Clave { get; set; } = string.Empty;
        public string Valor { get; set; } = string.Empty;
        public string TipoDato { get; set; } = "STRING";
        public string? Descripcion { get; set; }
        public string Categoria { get; set; } = "GENERAL";
        public DateTime FechaModificacion { get; set; }
        public string? ModificadoPor { get; set; }
    }

    public class GuardarParametroDto
    {
        public string Clave { get; set; } = string.Empty;
        public string Valor { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string? Categoria { get; set; }
    }

    public class ReporteConfigDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Titulo { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public string Categoria { get; set; } = "OPERATIVO";
        public string Icono { get; set; } = "fa-chart-line";
        public string EndpointApi { get; set; } = string.Empty;
        public string TipoComponente { get; set; } = "TABLA";
        public string PermisoRequerido { get; set; } = "REPORTES_VER";
        public int Orden { get; set; } = 1;
        public bool Activo { get; set; } = true;
    }

    public class DashboardWidgetDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Titulo { get; set; } = string.Empty;
        public string? Subtitulo { get; set; }
        public string TipoWidget { get; set; } = "KPI_CARD";
        public string EndpointDatos { get; set; } = string.Empty;
        public int AnchoColumnas { get; set; } = 6;
        public string ColorTema { get; set; } = "emerald";
        public string Icono { get; set; } = "fa-chart-pie";
        public string PermisoRequerido { get; set; } = "DASHBOARD_VER";
        public int Orden { get; set; } = 1;
        public bool Activo { get; set; } = true;
    }

    public class ModuloMenuDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public string Icono { get; set; } = string.Empty;
        public string? RutaVista { get; set; }
        public string? PermisoRequerido { get; set; }
        public bool EsMenuLateral { get; set; } = true;
        public string? BadgeTexto { get; set; }
        public int Orden { get; set; }
        public bool Activo { get; set; } = true;
    }

    public class TipoLecheDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public decimal FactorPrecio { get; set; } = 1.0000m;
        public bool EsAcida { get; set; } = false;
        public string ColorBadge { get; set; } = "#0284c7";
        public bool Activo { get; set; } = true;
        public int Orden { get; set; } = 1;
        public DateTime FechaCreacion { get; set; }
    }

    public class GuardarTipoLecheDto
    {
        public int? Id { get; set; }
        public string Codigo { get; set; } = string.Empty;
        public string Nombre { get; set; } = string.Empty;
        public decimal FactorPrecio { get; set; } = 1.0000m;
        public bool EsAcida { get; set; } = false;
        public string ColorBadge { get; set; } = "#0284c7";
        public bool Activo { get; set; } = true;
        public int Orden { get; set; } = 1;
    }

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

    public class GuardarAbonoCompaniaDto
    {
        public int CompaniaId { get; set; }
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
    }
}


