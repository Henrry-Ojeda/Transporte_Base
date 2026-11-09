export interface LoginDto {
  username: string;
  password: string;
}

export type PermisoAccion = 'VER' | 'EDITAR' | 'AGREGAR' | 'ELIMINAR';

export interface AuthUser {
  id: number;
  username: string;
  nombreCompleto: string;
  rol: string;
  esSuperAdmin?: boolean;
  fotoUrl?: string;
  permisoCrearViaje?: boolean;
  permisos: string[];
  modulosHabilitados?: string[];
  empresaCodigo?: string;
  empresaNombre?: string;
}

export interface LoginResponseDto {
  token: string;
  id: number;
  username: string;
  nombreCompleto: string;
  rol: string;
  esSuperAdmin?: boolean;
  fotoUrl?: string;
  permisoCrearViaje?: boolean;
  permisos: string[];
  modulosHabilitados?: string[];
  empresaCodigo?: string;
  empresaNombre?: string;
}

export interface PerfilUsuarioDto {
  id: number;
  username: string;
  nombreCompleto: string;
  rol: string;
  cedula?: string;
  telefono?: string;
  fotoUrl?: string;
  permisoCrearViaje?: boolean;
  bancoNombre?: string;
  bancoCuenta?: string;
  numeroCuenta?: string;
  pagoMovilCedula?: string;
  cedulaPagoMovil?: string;
  pagoMovilTelefono?: string;
  telefonoPagoMovil?: string;
}

export interface ActualizarPerfilDto {
  nombreCompleto: string;
  cedula?: string;
  telefono?: string;
  fotoUrl?: string;
  bancoNombre?: string;
  bancoCuenta?: string;
  numeroCuenta?: string;
  pagoMovilCedula?: string;
  cedulaPagoMovil?: string;
  pagoMovilTelefono?: string;
  telefonoPagoMovil?: string;
  passwordActual?: string;
  nuevoPassword?: string;
}

