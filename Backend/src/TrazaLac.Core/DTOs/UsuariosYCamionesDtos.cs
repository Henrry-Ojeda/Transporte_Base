using System;
using System.Collections.Generic;
using System.Linq;

namespace TrazaLac.Core.DTOs
{
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

}
