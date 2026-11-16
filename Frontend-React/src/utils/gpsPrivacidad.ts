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

const intentarGetPosition = (highAccuracy: boolean, timeoutMs: number): Promise<CoordenadasGps | null> => {
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
        { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
};

export const capturarGpsSilencioso = async (timeoutMs = 3000): Promise<CoordenadasGps | null> => {
  const high = await intentarGetPosition(true, timeoutMs);
  if (high) return high;
  // Fallback para laptops/PCs sin chip GPS (ubicación por Wi-Fi/red)
  return await intentarGetPosition(false, Math.max(timeoutMs, 3500));
};
