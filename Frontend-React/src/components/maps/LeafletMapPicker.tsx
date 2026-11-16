import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, MapPin } from 'lucide-react';

interface LeafletMapPickerProps {
  latitud?: number | null;
  longitud?: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: string;
  label?: string;
}

const DEFAULT_CENTER: [number, number] = [8.62, -71.15]; // Occidente Venezuela (Zulia/Mérida/Táchira aprox)

const createPinIcon = (color = '#0d9488') =>
  L.divIcon({
    className: 'custom-leaflet-pin',
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:50%;background:#fff;transform:rotate(45deg);"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

export const LeafletMapPicker: React.FC<LeafletMapPickerProps> = ({
  latitud,
  longitud,
  onChange,
  height = '260px',
  label,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const [modoSatelite, setModoSatelite] = useState(false);
  const [buscandoGps, setBuscandoGps] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      latitud != null && longitud != null && !isNaN(latitud) && !isNaN(longitud)
        ? [latitud, longitud]
        : DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: latitud != null && longitud != null ? 14 : 7,
      attributionControl: true,
    });

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    });
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri Satellite' }
    );

    osm.addTo(map);
    osmLayerRef.current = osm;
    satLayerRef.current = sat;

    if (latitud != null && longitud != null && !isNaN(latitud) && !isNaN(longitud)) {
      markerRef.current = L.marker([latitud, longitud], { icon: createPinIcon() }).addTo(map);
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: createPinIcon() }).addTo(map);
      }
      onChange(lat, lng);
    });

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitud != null && longitud != null && !isNaN(latitud) && !isNaN(longitud)) {
      if (markerRef.current) {
        markerRef.current.setLatLng([latitud, longitud]);
      } else {
        markerRef.current = L.marker([latitud, longitud], { icon: createPinIcon() }).addTo(map);
      }
      map.setView([latitud, longitud], Math.max(map.getZoom(), 13));
    }
  }, [latitud, longitud]);

  const toggleCapa = () => {
    const map = mapRef.current;
    if (!map || !osmLayerRef.current || !satLayerRef.current) return;
    if (modoSatelite) {
      map.removeLayer(satLayerRef.current);
      osmLayerRef.current.addTo(map);
    } else {
      map.removeLayer(osmLayerRef.current);
      satLayerRef.current.addTo(map);
    }
    setModoSatelite(!modoSatelite);
  };

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) return;
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onChange(lat, lng);
        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 15);
        }
        setBuscandoGps(false);
      },
      () => setBuscandoGps(false),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-teal-600" />
          {label || 'Haz clic en el mapa (OpenStreetMap) para fijar la ubicación'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={usarMiUbicacion}
            disabled={buscandoGps}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
          >
            <Crosshair className="w-3 h-3" />
            {buscandoGps ? 'Ubicando...' : 'Mi Ubicación'}
          </button>
          <button
            type="button"
            onClick={toggleCapa}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
          >
            <Layers className="w-3 h-3" />
            {modoSatelite ? 'Mapa Calles' : 'Satélite'}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full rounded-xl border border-slate-300 overflow-hidden z-0"
      />
    </div>
  );
};
