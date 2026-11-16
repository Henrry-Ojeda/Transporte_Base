export interface CoordenadasGps {
  latitud: number;
  longitud: number;
  precisionMetros?: number;
}

export const esTicketAbiertoGps = (viaje: any): boolean => {
  if (!viaje) return false;
  if (typeof viaje.procesoActualId === 'number') {
    return viaje.procesoActualId === 1;
  }
  return String(viaje.estado || '').toUpperCase() === 'ABIERTO';
};

export const capturarGpsSilencioso = (timeoutMs = 3000): Promise<CoordenadasGps | null> => {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            latitud: Number(pos.coords.latitude.toFixed(6)),
            longitud: Number(pos.coords.longitude.toFixed(6)),
            precisionMetros: pos.coords.accuracy ? Number(pos.coords.accuracy.toFixed(1)) : undefined,
          });
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
};
