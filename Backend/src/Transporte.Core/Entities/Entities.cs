namespace Transporte.Core.Entities;

public class Usuario
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string NombreCompleto { get; set; } = string.Empty;
    public string? Cedula { get; set; }
    public string? Telefono { get; set; }
    public string? VehiculoPlaca { get; set; }
    public int? CapacidadTanqueLitros { get; set; }
    public string Rol { get; set; } = "CHOFER";
    public int? RolId { get; set; }
    public bool PermisoCrearViaje { get; set; } = false;
    public bool Activo { get; set; } = true;
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Rol
{
    public int Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
}

public class Camion
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public string? ChoferNombre { get; set; }
    public string Placa { get; set; } = string.Empty;
    public int Compartimientos { get; set; } = 1;
    public decimal CapacidadLitros { get; set; }
    public string? MarcaModelo { get; set; }
    public string? Observaciones { get; set; }
    public bool Activo { get; set; } = true;
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Permiso
{
    public int Id { get; set; }
    public int ModuloId { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string Accion { get; set; } = string.Empty; // VER, CREAR, EDITAR, ELIMINAR, APROBAR
    public string? Descripcion { get; set; }
}

public class HistorialBcv
{
    public int Id { get; set; }
    public DateTime Fecha { get; set; }
    public decimal TasaDolarBs { get; set; }
    public string Fuente { get; set; } = "BCV";
    public string? Observacion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
}

public class TipoServicio
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty; // RUTA, TRANSPORTE
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
}

public class Banco
{
    public int Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public bool Activo { get; set; } = true;
}

public class Propietario
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? CedulaRIF { get; set; }
    public string? Telefono { get; set; }
    public string? Email { get; set; }
    public int? BancoId { get; set; }
    public string? NumeroCuenta { get; set; }
    public string? Observacion { get; set; }
    public string Estado { get; set; } = "ACTIVO";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
}

public class Finca
{
    public int Id { get; set; }
    public string? Codigo { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Propietario { get; set; } = string.Empty;
    public int? PropietarioId { get; set; }
    public string? CedulaRIF { get; set; }
    public string? Telefono { get; set; }
    public int? BancoId { get; set; }
    public string? NumeroCuenta { get; set; }
    public int? TipoServicioId { get; set; }
    public int? CompaniaId { get; set; }
    public decimal PrecioLitroUSD { get; set; }
    public decimal PrecioLitroAcidaUSD { get; set; } = 0.0000m;
    public bool TieneDosTiposLeche { get; set; } = false;
    public decimal? PrecioBufalaLitroUSD { get; set; } = 0.0000m;
    public bool Activo { get; set; } = true;
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Compania
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string? Encargado { get; set; }
    public string? Telefono { get; set; }
    public string? Direccion { get; set; }
    public int? TipoServicioId { get; set; }
    public string? TipoServicioNombre { get; set; }
    public decimal PrecioCompraLitroUSD { get; set; }
    public decimal? PrecioBufalaLitroUSD { get; set; }
    public decimal? PrecioAcidaLitroUSD { get; set; } = 0.0000m;
    public string DiaAperturaSemana { get; set; } = "Martes";
    public string DiaCierreSemana { get; set; } = "Lunes";
    public bool Activo { get; set; } = true;
    public bool IsDeleted { get; set; } = false;
    public bool EsPrincipal { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CicloOperativo
{
    public int Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string Estado { get; set; } = "ABIERTO"; // ABIERTO, EN_CIERRE, LIQUIDADO
    public DateTime? FechaCierre { get; set; }
    public int? CerradoPor { get; set; }
    public decimal? StockInicialTanques { get; set; }
    public decimal? StockFinalTanques { get; set; }
    public string? Observaciones { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class RutaRecoleccion
{
    public long Id { get; set; }
    public int CicloId { get; set; }
    public DateTime Fecha { get; set; }
    public int FincaId { get; set; }
    public int UsuarioId { get; set; } // Chofer
    public int Litros { get; set; }
    public bool EsAcida { get; set; } = false;
    public string TipoLeche { get; set; } = "VACA";
    public decimal PrecioLitroUSDAplicado { get; set; }
    public decimal TasaDolarBsAplicada { get; set; }
    public decimal SubtotalUSD { get; set; }
    public decimal SubtotalBs { get; set; }
    public string? Observacion { get; set; }
    public string? UuidLocal { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
    public DateTime? ModifiedAt { get; set; }
    public int? ModifiedBy { get; set; }
}

public class EntregaCompania
{
    public long Id { get; set; }
    public int CicloId { get; set; }
    public DateTime Fecha { get; set; }
    public int CompaniaId { get; set; }
    public int UsuarioId { get; set; }
    public int Litros { get; set; }
    public decimal PrecioVentaUSD { get; set; }
    public decimal TasaDolarBsAplicada { get; set; }
    public decimal SubtotalUSD { get; set; }
    public decimal SubtotalBs { get; set; }
    public string? TipoLeche { get; set; }
    public string? Observacion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
    public DateTime? ModifiedAt { get; set; }
    public int? ModifiedBy { get; set; }
}

public class ControlCompania
{
    public long Id { get; set; }
    public DateTime Fecha { get; set; }
    public int UsuarioId { get; set; }
    public int CompaniaId { get; set; }
    public int? CicloId { get; set; }
    public int LitrosDespachados { get; set; }
    public int? LitrosRecibidosCompania { get; set; }
    public int DiferenciaLitros { get; set; }
    public decimal PorcentajeMerma { get; set; }
    public string Estado { get; set; } = "EN VIA"; // EN VIA, DESPACHO
    public string? TipoLeche { get; set; }
    public string? Observacion { get; set; }
    public long? ControlRutaId { get; set; }
    public DateTime? FechaSalida { get; set; }
    public DateTime? FechaEntrega { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedBy { get; set; }
    public DateTime? ModifiedAt { get; set; }
    public int? ModifiedBy { get; set; }
}