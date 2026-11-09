import apiClient from './client';

export interface ChatResponseDto {
  respuesta: string;
  problemasDetectados?: string[];
  sugerencias?: string[];
  timestamp?: string;
}

export const chatApi = {
  analizar: async (mensaje: string): Promise<ChatResponseDto> => {
    // Timeout extendido a 120 segundos para consultas analíticas profundas con IA y SQL
    const res = await apiClient.post<ChatResponseDto>('/chat/analizar', { mensaje }, { timeout: 120000 });
    return res.data;
  },

  getSugerencias: async (): Promise<string[]> => {
    const res = await apiClient.get<string[]>('/chat/sugerencias', { timeout: 30000 });
    return Array.isArray(res.data) ? res.data : [];
  },
};

export default chatApi;
