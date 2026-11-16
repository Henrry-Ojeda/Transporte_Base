import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import {
  MapPin,
  Route,
  Truck,
  AlertTriangle,
  Navigation,
  Layers,
  RefreshCw,
  Clock,
  ShieldCheck,
  Edit3,
  X,
} from 'lucide-react';
import { mapaRutasApi, type CruceRutasDto, type FincaMapaDto, type ViajeGpsResumenDto } from '@/api/mapaRutas.api';
import { operacionesApi } from '@/api/operaciones.api';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { SearchableSelect, type SelectOption } from '@/components/common/SearchableSelect';
import { CamionSelect, ChoferSelect } from '@/components/selectors';
import { LeafletMapPicker } from '@/components/maps/LeafletMapPicker';
import { useAuthStore } from '@/stores/authStore';

const formatHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatHace7Dias = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const createCircleMarkerIcon = (color: string, label?: string) =>
  L.divIcon({
    className: 'custom-finca-marker',
    html: `<div style="display:flex;align-items:center;gap:4px;">
      <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>
      ${label ? `<span style="background:rgba(15,23,42,.82);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;">${label}</span>` : ''}
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [7, 7],
  });

const createCrossIcon = () =>
  L.divIcon({
    className: 'custom-cross-marker',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:13px;">✕</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export const MapaRutasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { hasTenantModule } = useAuthStore();

  const [fechaDesde, setFechaDesde] = useState(formatHace7Dias);
  const [fechaHasta, setFechaHasta] = useState(formatHoy);
  const [rutaId, setRutaId] = useState<string>('');
  const [camionId, setCamionId] = useState<string>('');
  const [choferId, setChoferId] = useState<string>('');

  const [mostrarFincas, setMostrarFincas] = useState(true);
  const [mostrarViajes, setMostrarViajes] = useState(true);
  const [mostrarCruces, setMostrarCruces] = useState(true);
  const [modoSatelite, setModoSatelite] = useState(false);

  const [tabActiva, setTabActiva] = useState<'viajes' | 'fincas' | 'cruces'>('viajes');
  const [viajeSeleccionado, setViajeSeleccionado] = useState<ViajeGpsResumenDto | null>(null);
  const [rutaOsrmInfo, setRutaOsrmInfo] = useState<{ distanciaKm: number; duracionMin: number } | null>(null);
  const [calculandoOsrm, setCalculandoOsrm] = useState(false);

  const [fincaEditando, setFincaEditando] = useState<FincaMapaDto | null>(null);
  const [editLat, setEditLat] = useState<number | null>(null);
  const [editLng, setEditLng] = useState<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const osrmLayerRef = useRef<L.Polyline | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);

  const { data: rutasLogistica = [] } = useQuery({
    queryKey: ['rutas-logistica-mapa'],
    queryFn: () => operacionesApi.getRutasLogistica(),
  });

  const rutasOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: 'Todas las Rutas Logísticas' },
      ...(Array.isArray(rutasLogistica) ? rutasLogistica : []).map((r: any) => ({
        value: String(r.id),
        label: r.nombre,
      })),
    ],
    [rutasLogistica]
  );

  const { data: analisis, isLoading, refetch } = useQuery({
    queryKey: ['mapa-rutas-analisis', fechaDesde, fechaHasta, rutaId, camionId, choferId],
    queryFn: () =>
      mapaRutasApi.obtenerAnalisis({
        fechaDesde,
        fechaHasta,
        rutaId: rutaId ? Number(rutaId) : undefined,
        camionId: camionId ? Number(camionId) : undefined,
        choferId: choferId ? Number(choferId) : undefined,
      }),
    enabled: hasTenantModule('MOD_MAPA_RUTAS'),
  });

  const guardarCoordsMutation = useMutation({
    mutationFn: ({ id, lat, lng }: { id: number; lat: number; lng: number }) =>
      mapaRutasApi.actualizarCoordenadasFinca(id, { latitud: lat, longitud: lng }),
    onSuccess: () => {
      toast.success('Coordenadas de finca actualizadas');
      setFincaEditando(null);
      queryClient.invalidateQueries({ queryKey: ['mapa-rutas-analisis'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
    },
    onError: () => toast.error('No se pudieron guardar las coordenadas'),
  });

  // Inicializar mapa OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [8.62, -71.15],
      zoom: 8,
    });

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri World Imagery' }
    );

    osm.addTo(map);
    osmLayerRef.current = osm;
    satLayerRef.current = sat;
    layersGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
      layersGroupRef.current = null;
    };
  }, []);

  // Cambiar capa OSM / Satélite
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !osmLayerRef.current || !satLayerRef.current) return;
    if (modoSatelite) {
      map.removeLayer(osmLayerRef.current);
      satLayerRef.current.addTo(map);
    } else {
      map.removeLayer(satLayerRef.current);
      osmLayerRef.current.addTo(map);
    }
  }, [modoSatelite]);

  // Renderizar capas en el mapa
  useEffect(() => {
    const map = mapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group || !analisis) return;

    group.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    if (mostrarFincas) {
      analisis.fincas
        .filter((f) => f.latitud != null && f.longitud != null)
        .forEach((f) => {
          const latlng: [number, number] = [Number(f.latitud), Number(f.longitud)];
          bounds.push(latlng);
          const color = f.rutaColor || '#0d9488';
          const marker = L.marker(latlng, { icon: createCircleMarkerIcon(color, f.nombre) });
          marker.bindPopup(`
            <div style="min-width:190px;font-family:sans-serif;">
              <div style="font-weight:800;font-size:13px;color:#0f172a;">${f.nombre}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;">Propietario: <b>${f.propietario || '-'}</b></div>
              <div style="font-size:11px;color:#475569;">Ruta: <b style="color:${color}">${f.rutaNombre || 'Sin ruta'}</b></div>
              <div style="font-size:11px;color:#475569;">Promedio: <b>${f.promedioLitrosDiarios} L/día</b></div>
              <div style="font-size:10px;color:#64748b;margin-top:4px;">${f.latitud}, ${f.longitud}</div>
            </div>
          `);
          marker.addTo(group);
        });
    }

    if (mostrarViajes) {
      analisis.viajes.forEach((v) => {
        if (!v.puntos || v.puntos.length === 0) return;
        const coords: [number, number][] = v.puntos.map((p) => [Number(p.latitud), Number(p.longitud)]);
        coords.forEach((c) => bounds.push(c));

        const isSelected = viajeSeleccionado?.controlRutaId === v.controlRutaId;
        const poly = L.polyline(coords, {
          color: isSelected ? '#dc2626' : v.rutaColor || '#2563eb',
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 0.95 : 0.75,
        });
        poly.bindPopup(`
          <div style="font-family:sans-serif;">
            <div style="font-weight:800;font-size:13px;">Ticket #${v.controlRutaId} (${v.estado})</div>
            <div style="font-size:11px;">Chofer: <b>${v.choferNombre}</b></div>
            <div style="font-size:11px;">Camión: <b>${v.camionPlaca || 'N/A'}</b></div>
            <div style="font-size:11px;">Distancia GPS: <b>${v.distanciaEstimadaKm} km</b> • ${v.duracionMinutos} min</div>
          </div>
        `);
        poly.addTo(group);

        v.puntos.forEach((p, idx) => {
          const ptColor = p.evento === 'REGISTRO_LITROS' ? '#16a34a' : idx === 0 ? '#2563eb' : '#64748b';
          const circle = L.circleMarker([Number(p.latitud), Number(p.longitud)], {
            radius: p.evento === 'REGISTRO_LITROS' ? 6 : 4,
            color: '#fff',
            weight: 1.5,
            fillColor: ptColor,
            fillOpacity: 0.95,
          });
          circle.bindPopup(`
            <div style="font-family:sans-serif;font-size:11px;">
              <b>Ticket #${v.controlRutaId}</b> — ${p.evento}<br/>
              ${p.fincaNombre ? `Finca: <b>${p.fincaNombre}</b><br/>` : ''}
              Hora: ${new Date(p.fechaHoraDispositivo).toLocaleString()}
            </div>
          `);
          circle.addTo(group);
        });
      });
    }

    if (mostrarCruces) {
      analisis.cruces.forEach((c) => {
        const latlng: [number, number] = [Number(c.latitud), Number(c.longitud)];
        bounds.push(latlng);
        const m = L.marker(latlng, { icon: createCrossIcon() });
        m.bindPopup(`
          <div style="font-family:sans-serif;">
            <div style="font-weight:800;color:#b45309;font-size:12px;">Punto de Cruce entre Rutas</div>
            <div style="font-size:11px;margin-top:3px;">${c.descripcion}</div>
          </div>
        `);
        m.addTo(group);
      });
    }

    if (bounds.length > 0 && !viajeSeleccionado) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 14 });
    }
  }, [analisis, mostrarFincas, mostrarViajes, mostrarCruces, viajeSeleccionado]);

  const calcularRutaCarreteraOSRM = async (viaje: ViajeGpsResumenDto) => {
    if (!viaje.puntos || viaje.puntos.length < 2) {
      toast.info('Se necesitan al menos 2 puntos GPS para calcular la ruta en carretera');
      return;
    }
    setViajeSeleccionado(viaje);
    setCalculandoOsrm(true);
    setRutaOsrmInfo(null);

    try {
      const coordsStr = viaje.puntos.map((p) => `${p.longitud},${p.latitud}`).join(';');
      const resp = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`
      );
      const json = await resp.json();
      if (json.code === 'Ok' && json.routes?.length > 0) {
        const route = json.routes[0];
        const latlngs: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        if (osrmLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(osrmLayerRef.current);
        }
        if (mapRef.current) {
          osrmLayerRef.current = L.polyline(latlngs, {
            color: '#9333ea',
            weight: 5,
            dashArray: '8, 6',
          }).addTo(mapRef.current);
          mapRef.current.fitBounds(osrmLayerRef.current.getBounds(), { padding: [40, 40] });
        }
        setRutaOsrmInfo({
          distanciaKm: Number((route.distance / 1000).toFixed(2)),
          duracionMin: Math.round(route.duration / 60),
        });
        toast.success('Ruta real por carretera calculada con OSRM');
      } else {
        toast.warning('OSRM no pudo trazar carretera entre estos puntos');
      }
    } catch {
      toast.error('Error consultando servicio gratuito OSRM');
    } finally {
      setCalculandoOsrm(false);
    }
  };

  const viajesCols: ColumnDef<ViajeGpsResumenDto>[] = [
    {
      header: 'Ticket',
      accessorKey: 'controlRutaId',
      cell: (row) => <span className="font-bold text-slate-800">#{row.controlRutaId}</span>,
    },
    {
      header: 'Fecha',
      accessorKey: 'fecha',
      cell: (row) => <span>{String(row.fecha).slice(0, 10)}</span>,
    },
    { header: 'Chofer', accessorKey: 'choferNombre' },
    { header: 'Camión', accessorKey: 'camionPlaca', cell: (row) => row.camionPlaca || '-' },
    { header: 'Ruta', accessorKey: 'rutaNombre', cell: (row) => row.rutaNombre || 'Modo Libre' },
    { header: 'Puntos', accessorKey: 'cantidadPuntos' },
    {
      header: 'Dist. (km)',
      accessorKey: 'distanciaEstimadaKm',
      cell: (row) => <span className="font-semibold text-teal-700">{row.distanciaEstimadaKm} km</span>,
    },
    {
      header: 'Tiempo',
      accessorKey: 'duracionMinutos',
      cell: (row) => <span>{row.duracionMinutos} min</span>,
    },
    {
      header: 'Acción',
      accessorKey: 'controlRutaId',
      cell: (row) => (
        <button
          type="button"
          onClick={() => calcularRutaCarreteraOSRM(row)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100"
        >
          <Navigation className="w-3.5 h-3.5" />
          Trazar Carretera
        </button>
      ),
    },
  ];

  const fincasCols: ColumnDef<FincaMapaDto>[] = [
    { header: 'Finca', accessorKey: 'nombre' },
    { header: 'Propietario', accessorKey: 'propietario' },
    { header: 'Ruta', accessorKey: 'rutaNombre', cell: (row) => row.rutaNombre || 'Sin ruta' },
    {
      header: 'Coordenadas',
      accessorKey: 'latitud',
      cell: (row) =>
        row.latitud != null && row.longitud != null ? (
          <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            {row.latitud}, {row.longitud}
          </span>
        ) : (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold">Sin GPS</span>
        ),
    },
    {
      header: 'Ubicar',
      accessorKey: 'id',
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setFincaEditando(row);
            setEditLat(row.latitud ?? null);
            setEditLng(row.longitud ?? null);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Fijar en Mapa
        </button>
      ),
    },
  ];

  const crucesCols: ColumnDef<CruceRutasDto>[] = [
    { header: 'Ruta A', accessorKey: 'rutaANombre' },
    { header: 'Ruta B', accessorKey: 'rutaBNombre' },
    {
      header: 'Proximidad',
      accessorKey: 'distanciaEntrePuntosMetros',
      cell: (row) => <span className="font-semibold text-amber-700">{row.distanciaEntrePuntosMetros} m</span>,
    },
    { header: 'Detalle', accessorKey: 'descripcion' },
    {
      header: 'Ver',
      accessorKey: 'latitud',
      cell: (row) => (
        <button
          type="button"
          onClick={() => mapRef.current?.setView([row.latitud, row.longitud], 15)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100"
        >
          <MapPin className="w-3.5 h-3.5" />
          Centrar
        </button>
      ),
    },
  ];

  const fincasGeoCount = analisis?.fincas.filter((f) => f.latitud != null && f.longitud != null).length ?? 0;
  const distanciaTotalKm =
    analisis?.viajes.reduce((acc, v) => acc + (v.distanciaEstimadaKm || 0), 0).toFixed(1) ?? '0.0';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-600" />
            Mapa de Rutas & GPS (OpenStreetMap)
          </h1>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Privacidad activa: solo se registran posiciones cuando el chofer tiene un ticket ABIERTO.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar Mapa
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Ruta Logística</label>
          <SearchableSelect options={rutasOptions} value={rutaId} onChange={(v) => setRutaId(v || '')} placeholder="Todas..." />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Camión</label>
          <CamionSelect value={camionId ? Number(camionId) : undefined} onChange={(v) => setCamionId(v ? String(v) : '')} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Chofer</label>
          <ChoferSelect value={choferId ? Number(choferId) : undefined} onChange={(v) => setChoferId(v ? String(v) : '')} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-teal-600" /> Fincas con GPS
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {fincasGeoCount} <span className="text-xs font-normal text-slate-400">/ {analisis?.fincas.length ?? 0}</span>
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-blue-600" /> Recorridos Capturados
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{analisis?.viajes.length ?? 0}</div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <Route className="w-4 h-4 text-emerald-600" /> Distancia Total GPS
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{distanciaTotalKm} km</div>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Cruces de Rutas
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{analisis?.cruces.length ?? 0}</div>
        </div>
      </div>

      {/* Controles de Capas + Mapa */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 cursor-pointer">
              <input type="checkbox" checked={mostrarFincas} onChange={(e) => setMostrarFincas(e.target.checked)} />
              Fincas
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 cursor-pointer">
              <input type="checkbox" checked={mostrarViajes} onChange={(e) => setMostrarViajes(e.target.checked)} />
              Recorridos GPS
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 cursor-pointer">
              <input type="checkbox" checked={mostrarCruces} onChange={(e) => setMostrarCruces(e.target.checked)} />
              Cruces entre Rutas
            </label>
          </div>
          <div className="flex items-center gap-2">
            {rutaOsrmInfo && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                <Clock className="w-3.5 h-3.5" />
                Carretera OSRM: {rutaOsrmInfo.distanciaKm} km • ~{rutaOsrmInfo.duracionMin} min
              </span>
            )}
            {calculandoOsrm && <span className="text-xs text-purple-600 font-semibold">Calculando carretera...</span>}
            <button
              type="button"
              onClick={() => setModoSatelite(!modoSatelite)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              <Layers className="w-3.5 h-3.5" />
              {modoSatelite ? 'OpenStreetMap' : 'Vista Satélite'}
            </button>
          </div>
        </div>

        <div ref={mapContainerRef} className="w-full h-[460px] rounded-xl border border-slate-300 z-0" />
      </div>

      {/* Tablas */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setTabActiva('viajes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tabActiva === 'viajes' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Recorridos de Viajes ({analisis?.viajes.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('fincas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tabActiva === 'fincas' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Fincas & Coordenadas ({analisis?.fincas.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('cruces')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tabActiva === 'cruces' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Cruces entre Rutas ({analisis?.cruces.length ?? 0})
          </button>
        </div>

        {tabActiva === 'viajes' && (
          <DataTable data={analisis?.viajes ?? []} columns={viajesCols} searchPlaceholder="Buscar ticket, chofer o camión..." exportFileName="recorridos_gps" />
        )}
        {tabActiva === 'fincas' && (
          <DataTable data={analisis?.fincas ?? []} columns={fincasCols} searchPlaceholder="Buscar finca o ruta..." exportFileName="fincas_coordenadas" />
        )}
        {tabActiva === 'cruces' && (
          <DataTable data={analisis?.cruces ?? []} columns={crucesCols} searchPlaceholder="Buscar cruce de rutas..." exportFileName="cruces_rutas" />
        )}
      </div>

      {/* Modal rápido para fijar coordenadas de finca */}
      {fincaEditando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900">Coordenadas GPS — {fincaEditando.nombre}</h3>
              <button type="button" onClick={() => setFincaEditando(null)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <LeafletMapPicker
              latitud={editLat}
              longitud={editLng}
              onChange={(lat, lng) => {
                setEditLat(lat);
                setEditLng(lng);
              }}
              height="320px"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Latitud</label>
                <input
                  type="number"
                  step="0.000001"
                  value={editLat ?? ''}
                  onChange={(e) => setEditLat(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Longitud</label>
                <input
                  type="number"
                  step="0.000001"
                  value={editLng ?? ''}
                  onChange={(e) => setEditLng(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFincaEditando(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={editLat == null || editLng == null || guardarCoordsMutation.isPending}
                onClick={() => {
                  if (editLat != null && editLng != null) {
                    guardarCoordsMutation.mutate({ id: fincaEditando.id, lat: editLat, lng: editLng });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50"
              >
                {guardarCoordsMutation.isPending ? 'Guardando...' : 'Guardar Coordenadas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
