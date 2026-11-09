/**
 * Utilidad para sincronizar el logo de la empresa como icono de la aplicación (PWA, Favicon y Apple Touch Icon)
 */
export const updateAppIcon = (logoUrl?: string, appTitle: string = 'Rutas de Leche') => {
  if (typeof document === 'undefined' || !logoUrl || !logoUrl.trim()) return;

  const cleanLogoUrl = logoUrl.trim();

  try {
    // 1. Favicon en el navegador (Pestaña)
    const existingFavicons = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
    if (existingFavicons.length > 0) {
      existingFavicons.forEach((el) => {
        el.href = cleanLogoUrl;
      });
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = cleanLogoUrl;
      document.head.appendChild(link);
    }

    // 2. Apple Touch Icon para iOS Safari ("Agregar a Pantalla de Inicio")
    let appleIcon = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = cleanLogoUrl;

    // 3. Manifest Dinámico PWA para teléfonos Android / Chrome ("Instalar Aplicación")
    const dynamicManifest = {
      name: appTitle,
      short_name: appTitle,
      description: 'Sistema de Gestión y Liquidación de Leche',
      start_url: '/movil',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      orientation: 'portrait',
      icons: [
        {
          src: cleanLogoUrl,
          sizes: '192x192 512x512',
          type: cleanLogoUrl.startsWith('data:image/svg') || cleanLogoUrl.endsWith('.svg')
            ? 'image/svg+xml'
            : 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    const blob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/manifest+json' });
    const manifestBlobUrl = URL.createObjectURL(blob);

    let manifestLink = document.querySelector<HTMLLinkElement>('#dynamic-manifest');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.id = 'dynamic-manifest';
      manifestLink.rel = 'manifest';
      
      // Remover manifest estático previo para que el navegador adopte el nuevo icono de inmediato
      const oldManifest = document.querySelector<HTMLLinkElement>("link[rel='manifest']:not(#dynamic-manifest)");
      if (oldManifest) {
        oldManifest.remove();
      }
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestBlobUrl;
  } catch (err) {
    console.error('Error al actualizar icono dinámico de la app:', err);
  }
};
