export interface FincaDto {
  id: number;
  codigo?: string;
  nombre: string;
  propietario?: string;
  propietarioId?: number;
  propietarioNombre?: string;
  rutaId?: number;
  rutaNombre?: string;
  precioLitroUSD: number;
  precioLitroAcidaUSD?: number;
  tieneDosTiposLeche?: boolean;
  precioBufalaLitroUSD?: number;
  tipoLeche?: string; // VACA, BUFALA
  telefono?: string;
  ubicacion?: string;
  activo: boolean;
  promedioLitrosDiarios?: number;
  ultimoLitros?: number;
  bancoNombre?: string;
  numeroCuenta?: string;
  pagoMovil?: string;
  cedulaRif?: string;
  tipoServicioId?: number;
  tipoServicioNombre?: string;
  companiaId?: number;
  companiaNombre?: string;
}

export interface GuardarFincaDto {
  codigo?: string;
  nombre: string;
  propietarioId?: number;
  rutaId?: number;
  tipoServicioId?: number;
  companiaId?: number;
  precioLitroUSD: number;
  precioLitroAcidaUSD?: number;
  tieneDosTiposLeche?: boolean;
  precioBufalaLitroUSD?: number;
  tipoLeche?: string;
  telefono?: string;
  ubicacion?: string;
  activo: boolean;
}

export interface PropietarioCuentaBancariaDto {
  id?: number;
  propietarioId?: number;
  bancoId: number;
  bancoNombre?: string;
  bancoCodigo?: string;
  numeroCuenta: string;
  tipoCuenta?: 'CORRIENTE' | 'AHORRO' | 'PAGO MOVIL' | string;
  titular?: string;
  cedulaRIF?: string;
  telefono?: string;
  esPrincipal: boolean;
  activo?: boolean;
}

export interface PropietarioDto {
  id: number;
  nombre?: string;
  nombreCompleto?: string;
  cedulaRif?: string;
  cedulaRIF?: string;
  telefono?: string;
  email?: string;
  bancoId?: number;
  bancoNombre?: string;
  numeroCuenta?: string;
  pagoMovilTelefono?: string;
  pagoMovilCedula?: string;
  pagoMovilBancoId?: number;
  estado?: string;
  activo: boolean;
  totalFincas?: number;
  fincasNombres?: string[];
  fincasAsignadas?: { id: number; nombre: string }[];
  cuentas?: PropietarioCuentaBancariaDto[];
}

export interface CrearPropietarioDto {
  nombreCompleto: string;
  cedulaRif: string;
  telefono?: string;
  email?: string;
  bancoId?: number;
  numeroCuenta?: string;
  pagoMovilTelefono?: string;
  pagoMovilCedula?: string;
  pagoMovilBancoId?: number;
  activo: boolean;
  fincaIds?: number[];
  cuentas?: PropietarioCuentaBancariaDto[];
}

export interface CompaniaDto {
  id: number;
  nombre: string;
  rif?: string;
  direccion?: string;
  telefono?: string;
  contacto?: string;
  encargado?: string;
  precioLitroUSD: number;
  activo: boolean;
}

export interface GuardarCompaniaDto {
  nombre: string;
  rif?: string;
  direccion?: string;
  telefono?: string;
  contacto?: string;
  precioLitroUSD: number;
  activo: boolean;
}

export interface BancoDto {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface ChoferDto {
  id: number;
  username?: string;
  nombreCompleto: string;
  cedula?: string;
  telefono?: string;
  email?: string;
  vehiculoPlaca?: string;
  camionId?: number;
  camionPlaca?: string;
  camionModelo?: string;
  capacidadLitros?: number;
  tarifaPorLitro?: number;
  sueldoBase?: number;
  frecuenciaPago?: string;
  tipoPago?: string;
  bancoNombre?: string;
  numeroCuenta?: string;
  cedulaPagoMovil?: string;
  telefonoPagoMovil?: string;
  activo: boolean;
  createdAt?: string;
}

export interface CamionDto {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  año?: number;
  capacidadLitros: number;
  odometroActualKm: number;
  usuarioId?: number;
  choferNombre?: string;
  estado?: 'ACTIVO' | 'INACTIVO' | 'MANTENIMIENTO' | string;
  activo: boolean;
}

export interface GuardarCamionDto {
  placa: string;
  marca: string;
  modelo: string;
  año?: number;
  capacidadLitros: number;
  odometroActualKm: number;
  usuarioId?: number;
  estado?: 'ACTIVO' | 'INACTIVO' | 'MANTENIMIENTO' | string;
  activo: boolean;
}

export interface EmpresaConfigDto {
  id?: number;
  nombre?: string;
  nombreEmpresa: string;
  rif: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logoUrl?: string;
  monedaPrincipal?: string;
  toleranciaMermaPct?: number;
}

