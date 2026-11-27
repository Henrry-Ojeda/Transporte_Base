using System;
using System.Collections.Generic;
using System.Linq;

namespace TrazaLac.Core.DTOs
{
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

}
