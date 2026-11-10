import React, { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

/**
 * Monitor en Tiempo Real de Módulos SaaS Multi-Tenant.
 * Sondea periódicamente la API (/auth/tenant) para detectar si el SuperAdmin
 * enciende o apaga módulos (ej: MOD_ASISTENTE_IA, MOD_LECHE_BUFALA) en DB_SAAS_MASTER.
 * Si un módulo en uso se apaga, cierra la vista y emite la alerta "Por favor de recargar la pagina".
 */
export const TenantModuleMonitor: React.FC = () => {
  const syncModulosTenant = useAuthStore((s) => s.syncModulosTenant);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const prevModulosRef = useRef<string[]>(user?.modulosHabilitados || []);

  useEffect(() => {
    if (user?.modulosHabilitados) {
      prevModulosRef.current = user.modulosHabilitados;
    }
  }, [user?.modulosHabilitados]);

  useEffect(() => {
    // Solo sondear si hay sesión iniciada
    if (!isAuthenticated) return;

    // Sondeo inicial inmediato
    syncModulosTenant();

    // Intervalo cada 4 segundos para respuesta casi instantánea
    const timer = setInterval(async () => {
      try {
        const res = await syncModulosTenant();
        if (res.updated) {
          const { prevMods, newMods } = res;
          const normalizar = (list: string[]) => list.map((m) => m.toUpperCase());
          const p = normalizar(prevMods);
          const n = normalizar(newMods);

          // 1. Detectar si se deshabilitó el Asistente Virtual
          const teniaAsistente = p.some((m) => m === 'MOD_ASISTENTE_IA' || m === 'ASISTENTE_IA');
          const tieneAsistente = n.some((m) => m === 'MOD_ASISTENTE_IA' || m === 'ASISTENTE_IA');
          if (teniaAsistente && !tieneAsistente) {
            Swal.fire({
              icon: 'warning',
              title: 'Módulo Deshabilitado',
              html: `<b>El Asistente Virtual IA</b> ha sido deshabilitado para su empresa desde la plataforma SaaS.<br/><br/><span style="color:#e11d48;font-weight:800;font-size:15px;">Por favor de recargar la pagina</span>`,
              confirmButtonColor: '#0284c7',
              confirmButtonText: 'Entendido',
            });
          }

          // 2. Detectar si se deshabilitó Leche de Búfala
          const teniaBufala = p.some((m) => m === 'MOD_LECHE_BUFALA' || m === 'MOD_BUFALA');
          const tieneBufala = n.some((m) => m === 'MOD_LECHE_BUFALA' || m === 'MOD_BUFALA');
          if (teniaBufala && !tieneBufala) {
            const pathActual = window.location.pathname.toLowerCase();
            if (pathActual.includes('bufala')) {
              Swal.fire({
                icon: 'warning',
                title: 'Módulo Deshabilitado',
                html: `<b>El Módulo de Leche de Búfala</b> ha sido deshabilitado para su empresa desde SaaS.<br/><br/><span style="color:#e11d48;font-weight:800;font-size:15px;">Por favor de recargar la pagina</span>`,
                confirmButtonColor: '#0284c7',
                confirmButtonText: 'Ir a Inicio',
              }).then(() => {
                window.location.href = '/';
              });
            } else {
              toast.warning('El Módulo de Búfala ha sido desactivado en SaaS. Por favor de recargar la pagina.', { duration: 6000 });
            }
          }

          // 3. Aviso general si se agregó o quitó algún otro módulo
          const modulosQuitados = p.filter((m) => !n.includes(m));
          const modulosAgregados = n.filter((m) => !p.includes(m));

          if (modulosAgregados.length > 0) {
            toast.success(`Nuevos módulos habilitados en SaaS: ${modulosAgregados.join(', ')}`, { duration: 5000 });
          } else if (modulosQuitados.length > 0 && !teniaAsistente && !teniaBufala) {
            toast.warning('Se han actualizado los módulos de su empresa desde SaaS. Por favor de recargar la pagina.', { duration: 6000 });
          }
        }
      } catch (err) {
        console.warn('Error en TenantModuleMonitor:', err);
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [isAuthenticated, syncModulosTenant]);

  return null;
};

export default TenantModuleMonitor;

