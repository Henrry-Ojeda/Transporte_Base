import React, { useState, useEffect, useRef } from 'react';
import { chatApi, type ChatResponseDto } from '@/api/chat.api';

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  problemas?: string[];
  sugerencias?: string[];
  timestamp: string;
}

const formatMarkdown = (texto: string): string => {
  if (!texto) return '';
  let html = texto;

  // Encabezados
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 12px 0 6px 0; color: #38bdf8; font-size: 14.5px; font-weight: 800; letter-spacing: -0.01em;">$1</h4>');
  html = html.replace(/^#### (.*$)/gim, '<h5 style="margin: 10px 0 4px 0; color: #a5f3fc; font-size: 13.5px; font-weight: 700;">$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 14px 0 8px 0; color: #60a5fa; font-size: 16px; font-weight: 800;">$1</h3>');

  // Negritas e itálicas
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em style="color: #cbd5e1;">$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(15, 23, 42, 0.6); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 12.5px; border: 1px solid rgba(56, 189, 248, 0.2); font-family: monospace;">$1</code>');

  // Listas con viñetas
  html = html.replace(/^[*-] (.*$)/gim, '<div style="display: flex; gap: 6px; margin-bottom: 4px;"><span style="color: #38bdf8; font-weight: 800;">&bull;</span><span>$1</span></div>');

  // Listas numeradas
  html = html.replace(/^(\d+)\. (.*$)/gim, '<div style="display: flex; gap: 8px; margin-bottom: 5px; align-items: flex-start;"><span style="background: #2563eb; color: #fff; font-size: 11px; font-weight: 800; min-width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-top: 2px;">$1</span><span>$2</span></div>');

  // Saltos de línea
  html = html.replace(/\n/g, '<br>');

  return html;
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-welcome',
    sender: 'bot',
    text: `¡Hola! 👋 Soy tu **Asistente Virtual y Analista de Datos** con Inteligencia Artificial.
Tengo conexión en tiempo real con la Base de Datos SQL (viajes, tickets, fincas, conductores, mermas, adelantos y balances).

¿Qué deseas consultar o evaluar hoy? Puedes pulsar una sugerencia o escribirme tu pregunta directa:`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

export const ChatAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('transporte_chat_history_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignorar error al leer localStorage
    }
    return INITIAL_MESSAGES;
  });
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Guardar mensajes en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('transporte_chat_history_v2', JSON.stringify(messages));
    } catch {
      // Ignorar error de almacenamiento
    }
  }, [messages]);

  // Scroll al final al agregar mensajes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Focus en el input cuando se abre el chat
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setLoading(true);

    try {
      const res: ChatResponseDto = await chatApi.analizar(text);

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: res.respuesta || 'Sin respuesta del sistema.',
        problemas: res.problemasDetectados,
        sugerencias: res.sugerencias,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'bot',
        text: `⚠️ **Error al consultar al Analista IA:** ${err?.response?.data?.details || err?.message || 'Error de conexión con el servidor.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('¿Reiniciar la conversación del Asistente IA?')) {
      setMessages(INITIAL_MESSAGES);
      try {
        localStorage.removeItem('transporte_chat_history_v2');
      } catch {}
    }
  };

  const quickPills = [
    { label: '📊 Diagnóstico General', prompt: '📊 ¿Cuál es el diagnóstico general del ciclo operativo actual?' },
    { label: '⚠️ Análisis de Mermas', prompt: '⚠️ HAZ UN ANALISIS SOBRE ESTA MERMA y detecta cuáles viajes tienen mayor descuadre' },
    { label: '🔍 Último ticket de Julio', prompt: 'Busca el último ticket de Julio' },
    { label: '💰 Adelantos Pendientes', prompt: '💰 Estado de adelantos y préstamos pendientes' },
    { label: '🧪 Leche Ácida', prompt: '🧪 Evaluar mermas por leche ácida o pérdida de calidad' },
  ];

  return (
    <div className="chatbot-container">
      {/* BOTÓN FLOTANTE TRIGGER */}
      <button
        type="button"
        className="chatbot-trigger-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Asistente Virtual IA (Analista de Datos)"
        aria-label="Abrir Asistente Virtual IA"
      >
        <div className="chatbot-trigger-icon">
          <i className="fa-solid fa-robot"></i>
        </div>
        <span className="chatbot-online-indicator"></span>
      </button>

      {/* VENTANA DEL CHAT */}
      <div className={`chatbot-window ${isOpen ? '' : 'hidden'}`}>
        {/* HEADER */}
        <div className="chatbot-header">
          <div className="chatbot-header-info">
            <div className="chatbot-avatar">
              <i className="fa-solid fa-brain"></i>
            </div>
            <div>
              <div className="chatbot-title">
                Analista de Datos Virtual
                <span className="chatbot-status-dot" title="En línea con acceso a la BD"></span>
              </div>
              <div className="chatbot-subtitle">Acceso en vivo a la Base de Datos SQL + Gemini IA</div>
            </div>
          </div>
          <div className="chatbot-header-actions">
            <button
              type="button"
              className="chatbot-action-btn"
              onClick={handleClearChat}
              title="Limpiar conversación"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
            <button
              type="button"
              className="chatbot-action-btn"
              onClick={() => setIsOpen(false)}
              title="Cerrar chat"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* HISTORIAL DE MENSAJES */}
        <div className="chatbot-messages">
          {messages.map((m) => (
            <div key={m.id} className={`chat-message ${m.sender}`}>
              {m.sender === 'bot' && (
                <div className="chat-avatar-mini">
                  <i className="fa-solid fa-robot"></i>
                </div>
              )}
              <div className="chat-bubble">
                <div className="chat-sender" style={{ color: m.sender === 'user' ? '#ffffff' : '#94a3b8' }}>
                  {m.sender === 'user' ? 'TÚ' : 'Analista de Datos IA'}
                </div>
                <div
                  className="chat-content"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(m.text) }}
                />

                {/* PROBLEMAS DETECTADOS */}
                {m.problemas && m.problemas.length > 0 && (
                  <div className="chatbot-alert-box" style={{ marginTop: '8px', padding: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px' }}>
                    <strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-triangle-exclamation"></i> Problemas Detectados:
                    </strong>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#fca5a5' }}>
                      {m.problemas.map((prob, idx) => (
                        <li key={idx}>{prob}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* RECOMENDACIONES / SUGERENCIAS */}
                {m.sugerencias && m.sugerencias.length > 0 && (
                  <div className="chatbot-tip-box" style={{ marginTop: '8px', padding: '10px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '8px' }}>
                    <strong style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-lightbulb"></i> Recomendaciones del Analista:
                    </strong>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#a7f3d0' }}>
                      {m.sugerencias.map((sug, idx) => (
                        <li key={idx}>{sug}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* INDICADOR DE CARGA */}
          {loading && (
            <div className="chat-message bot">
              <div className="chat-avatar-mini">
                <i className="fa-solid fa-brain"></i>
              </div>
              <div className="chat-bubble" style={{ background: '#1e293b', color: '#94a3b8' }}>
                <div className="chat-sender">Analista de Datos IA</div>
                <div className="chat-content" style={{ fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> Consultando Base de Datos SQL y analizando métricas con Gemini...
                </div>
              </div>
            </div>
          )}

          {/* SUGERENCIAS RÁPIDAS EN EL FOOTER DE MENSAJES */}
          {!loading && (
            <div className="chatbot-quick-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {quickPills.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-pill"
                  onClick={() => handleSendMessage(p.prompt)}
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#c7d2fe',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.9)';
                    e.currentTarget.style.color = '#c7d2fe';
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* FOOTER INPUT */}
        <div className="chatbot-footer">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="chatbot-input-form"
          >
            <input
              ref={inputRef}
              type="text"
              className="chatbot-input"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Pregunta al Analista de Datos..."
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="submit"
              className="chatbot-send-btn"
              disabled={loading || !inputVal.trim()}
              title="Enviar mensaje"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatAssistantWidget;
