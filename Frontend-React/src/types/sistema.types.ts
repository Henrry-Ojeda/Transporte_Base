export interface RolDto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  usuariosCount?: number;
}

export interface CrearRolDto {
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

export interface UsuarioDto {
  id: number;
  username: string;
  nombreUsuario?: string;
  nombreCompleto: string;
  email?: string;
  rol: string; // ADMIN, CHOFER, OPERADOR, LIQUIDADOR
  activo: boolean;
  telefono?: string;
  cedula?: string;
  permisoCrearViaje?: boolean;
  ultimoAcceso?: string;
  createdAt: string;
  camion?: {
    id?: number;
    placa?: string;
    capacidadLitros?: number;
  };
  camionId?: number;
  bancoNombre?: string;
  numeroCuenta?: string;
  cedulaPagoMovil?: string;
  telefonoPagoMovil?: string;
}

export interface GuardarUsuarioDto {
  nombreUsuario: string;
  password?: string;
  nombreCompleto: string;
  email?: string;
  rol: string;
  telefono?: string;
  cedula?: string;
  permisoCrearViaje?: boolean;
  activo: boolean;
  bancoNombre?: string;
  numeroCuenta?: string;
  cedulaPagoMovil?: string;
  telefonoPagoMovil?: string;
  tarifaPorLitro?: number;
  sueldoBase?: number;
  frecuenciaPago?: string;
  tipoPago?: string;
  camionId?: number;
}

export interface PermisoModuloDto {
  id?: number;
  rol: string;
  moduloCodigo: string;
  moduloNombre: string;
  puedeVer: boolean;
  puedeEditar: boolean;
  puedeAgregar: boolean;
  puedeEliminar: boolean;
}

export interface ConfiguracionSistemaDto {
  id?: number;
  clave: string;
  valor: string;
  descripcion?: string;
  categoria?: string;
}

export interface LogAuditoriaDto {
  id: number;
  usuarioId?: number;
  usuarioNombre?: string;
  modulo: string;
  accion: string;
  detalles: string;
  ipAddress?: string;
  fecha: string;
}

