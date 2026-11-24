import apiClient from './client';
import type { LoginDto, LoginResponseDto, AuthUser, PerfilUsuarioDto, ActualizarPerfilDto } from '@/types';

export const authApi = {
  login: async (credentials: LoginDto): Promise<LoginResponseDto> => {
    const response = await apiClient.post<LoginResponseDto>('/auth/login', credentials);
    return response.data;
  },

  getTenantInfo: async (): Promise<{ codigo: string; nombre: string; logoUrl?: string; modulos: string[] }> => {
    const response = await apiClient.get<{ codigo: string; nombre: string; logoUrl?: string; modulos: string[] }>('/auth/tenant');
    return response.data;
  },

  getMe: async (): Promise<AuthUser> => {
    const response = await apiClient.get<AuthUser>('/auth/me');
    return response.data;
  },

  getPerfil: async (): Promise<PerfilUsuarioDto> => {
    const response = await apiClient.get<PerfilUsuarioDto>('/auth/perfil');
    return response.data;
  },

  updatePerfil: async (dto: ActualizarPerfilDto): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.put<{ success: boolean; message: string }>('/auth/perfil', dto);
    return response.data;
  },

  generarVinculacion: async (usuarioId: number): Promise<{
    codigo: string;
    fechaExpiracion: string;
    nombreCompleto: string;
    username: string;
    rol: string;
    empresaCodigo: string;
    empresaNombre: string;
  }> => {
    const response = await apiClient.post('/auth/generar-vinculacion', { usuarioId });
    return response.data;
  },

  vincularDispositivo: async (dto: { codigo: string; deviceId?: string; deviceInfo?: string }): Promise<{
    token: string;
    empresaCodigo: string;
    empresaNombre: string;
    empresaLogo?: string;
    id: number;
    username: string;
    nombreCompleto: string;
    rol: string;
    camionId?: number;
    placaCamion?: string;
    capacidadTanqueLitros: number;
    permisos: string[];
    modulosHabilitados: string[];
  }> => {
    const response = await apiClient.post('/auth/vincular-dispositivo', dto);
    return response.data;
  },
};

