import apiClient from './client';

export interface ChatResponseDto {
  respuesta: string;
  problemasDetectados?: string[];
  sugerencias?: string[];
  timestamp?: string;
}

export const chatApi = {
  analizar: async (mensaje: string): Promise<ChatResponseDto> => {
    const res = await apiClient.post<ChatResponseDto>('/chat/analizar', { mensaje });
    return res.data;
  },

  getSugerencias: async (): Promise<string[]> => {
    const res = await apiClient.get<string[]>('/chat/sugerencias');
    return Array.isArray(res.data) ? res.data : [];
  },
};

export default chatApi;
