using System;

namespace Transporte.Core.DTOs
{
    // =========================================================================
    // DTOs: PARÁMETROS DE CALIDAD DE LECHE (LÍMITES MÍN / MÁX + PRINCIPAL)
    // =========================================================================

    public class ParametroCalidadLecheDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string TipoLeche { get; set; } = "VACA";
        public bool EsPrincipal { get; set; }
        public bool Activo { get; set; } = true;

        public decimal? GrasaMin { get; set; }
        public decimal? GrasaMax { get; set; }
        public decimal? SngMin { get; set; }
        public decimal? SngMax { get; set; }
        public decimal? DensidadMin { get; set; }
        public decimal? DensidadMax { get; set; }
        public decimal? LactosaMin { get; set; }
        public decimal? LactosaMax { get; set; }
        public decimal? SalesMin { get; set; }
        public decimal? SalesMax { get; set; }
        public decimal? ProteinaMin { get; set; }
        public decimal? ProteinaMax { get; set; }
        public decimal? SolidosTotalesMin { get; set; }
        public decimal? SolidosTotalesMax { get; set; }
        public decimal? AguaAdicionadaMin { get; set; }
        public decimal? AguaAdicionadaMax { get; set; }
        public decimal? TemperaturaMin { get; set; }
        public decimal? TemperaturaMax { get; set; }
        public decimal? PuntoCongelacionMin { get; set; }
        public decimal? PuntoCongelacionMax { get; set; }
        public decimal? PhMin { get; set; }
        public decimal? PhMax { get; set; }
        public decimal? ConductividadMin { get; set; }
        public decimal? ConductividadMax { get; set; }

        public string? Observacion { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ModifiedAt { get; set; }
    }

    public class GuardarParametroCalidadLecheDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? TipoLeche { get; set; } = "VACA";
        public bool EsPrincipal { get; set; }
        public bool Activo { get; set; } = true;

        public decimal? GrasaMin { get; set; }
        public decimal? GrasaMax { get; set; }
        public decimal? SngMin { get; set; }
        public decimal? SngMax { get; set; }
        public decimal? DensidadMin { get; set; }
        public decimal? DensidadMax { get; set; }
        public decimal? LactosaMin { get; set; }
        public decimal? LactosaMax { get; set; }
        public decimal? SalesMin { get; set; }
        public decimal? SalesMax { get; set; }
        public decimal? ProteinaMin { get; set; }
        public decimal? ProteinaMax { get; set; }
        public decimal? SolidosTotalesMin { get; set; }
        public decimal? SolidosTotalesMax { get; set; }
        public decimal? AguaAdicionadaMin { get; set; }
        public decimal? AguaAdicionadaMax { get; set; }
        public decimal? TemperaturaMin { get; set; }
        public decimal? TemperaturaMax { get; set; }
        public decimal? PuntoCongelacionMin { get; set; }
        public decimal? PuntoCongelacionMax { get; set; }
        public decimal? PhMin { get; set; }
        public decimal? PhMax { get; set; }
        public decimal? ConductividadMin { get; set; }
        public decimal? ConductividadMax { get; set; }

        public string? Observacion { get; set; }
    }

    // =========================================================================
    // DTOs: EXÁMENES DE CALIDAD DE LECHE (LACTOSCAN S50 - NIVEL TICKET Y FINCA)
    // =========================================================================

    public class ExamenLecheDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public string? HoraPrueba { get; set; }
        public string NivelPrueba { get; set; } = "TICKET"; // TICKET | FINCA
        public long? ControlRutaId { get; set; }
        public long? ControlCompaniaId { get; set; }
        public long? RutaRecoleccionId { get; set; }
        public int? FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public int? ChoferId { get; set; }
        public string? NombreChofer { get; set; }
        public int? ParametroCalidadId { get; set; }
        public string? ParametroCalidadNombre { get; set; }
        public int? LitrosAsociados { get; set; }
        public string TipoLeche { get; set; } = "VACA";

        // Metadatos del equipo (Lactoscan S50)
        public string? Equipo { get; set; }
        public string? NumeroSerial { get; set; }
        public string? Calibracion { get; set; }

        // 12 Campos Lactoscan S50
        public decimal? GrasaPct { get; set; }
        public decimal? SngPct { get; set; }
        public decimal? Densidad { get; set; }
        public decimal? LactosaPct { get; set; }
        public decimal? SalesPct { get; set; }
        public decimal? ProteinaPct { get; set; }
        public decimal? SolidosTotalesPct { get; set; }
        public decimal? AguaAdicionadaPct { get; set; }
        public decimal? TemperaturaC { get; set; }
        public decimal? PuntoCongelacion { get; set; }
        public decimal? Ph { get; set; }
        public decimal? Conductividad { get; set; }

        public string Resultado { get; set; } = "APROBADA";
        public bool FueraDeRango { get; set; }
        public string? ImagenExamen { get; set; }
        public string? ImagenRecibo { get; set; }
        public string? Observacion { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? CreadoPorNombre { get; set; }
    }

    public class GuardarExamenLecheDto
    {
        public DateTime? Fecha { get; set; }
        public string? HoraPrueba { get; set; }
        public string? NivelPrueba { get; set; } = "TICKET"; // TICKET | FINCA
        public long? ControlRutaId { get; set; }
        public long? ControlCompaniaId { get; set; }
        public long? RutaRecoleccionId { get; set; }
        public int? FincaId { get; set; }
        public int? CamionId { get; set; }
        public int? ChoferId { get; set; }
        public int? ParametroCalidadId { get; set; }
        public int? LitrosAsociados { get; set; }
        public string? TipoLeche { get; set; } = "VACA";

        public string? Equipo { get; set; }
        public string? NumeroSerial { get; set; }
        public string? Calibracion { get; set; }

        public decimal? GrasaPct { get; set; }
        public decimal? SngPct { get; set; }
        public decimal? Densidad { get; set; }
        public decimal? LactosaPct { get; set; }
        public decimal? SalesPct { get; set; }
        public decimal? ProteinaPct { get; set; }
        public decimal? SolidosTotalesPct { get; set; }
        public decimal? AguaAdicionadaPct { get; set; }
        public decimal? TemperaturaC { get; set; }
        public decimal? PuntoCongelacion { get; set; }
        public decimal? Ph { get; set; }
        public decimal? Conductividad { get; set; }

        public string? Resultado { get; set; } = "APROBADA";
        public string? ImagenExamen { get; set; }
        public string? ImagenRecibo { get; set; }
        public string? Observacion { get; set; }
    }

    // =========================================================================
    // DTO: HISTORIAL INTEGRAL POR FINCA (RECOLECCIÓN + TICKET + CHOFER + EXAMEN)
    // =========================================================================

    public class HistorialIntegralFincaItemDto
    {
        public DateTime Fecha { get; set; }
        public string? HoraPrueba { get; set; }
        public long? ControlRutaId { get; set; }
        public long? RutaRecoleccionId { get; set; }
        public int FincaId { get; set; }
        public string? FincaNombre { get; set; }
        public int LitrosRecogidos { get; set; }
        public string TipoLeche { get; set; } = "VACA";
        public bool EsAcida { get; set; }
        public int? ChoferId { get; set; }
        public string? NombreChofer { get; set; }
        public int? CamionId { get; set; }
        public string? CamionPlaca { get; set; }
        public string? ObservacionRecoleccion { get; set; }

        // Datos de Examen (individual de la finca o heredado del ticket si no hubo individual)
        public long? ExamenId { get; set; }
        public string? NivelPrueba { get; set; } // FINCA | TICKET | SIN_EXAMEN
        public string? Equipo { get; set; }
        public string? NumeroSerial { get; set; }
        public string? Calibracion { get; set; }

        public decimal? GrasaPct { get; set; }
        public decimal? SngPct { get; set; }
        public decimal? Densidad { get; set; }
        public decimal? LactosaPct { get; set; }
        public decimal? SalesPct { get; set; }
        public decimal? ProteinaPct { get; set; }
        public decimal? SolidosTotalesPct { get; set; }
        public decimal? AguaAdicionadaPct { get; set; }
        public decimal? TemperaturaC { get; set; }
        public decimal? PuntoCongelacion { get; set; }
        public decimal? Ph { get; set; }
        public decimal? Conductividad { get; set; }

        public string? Resultado { get; set; }
        public bool FueraDeRango { get; set; }
        public string? ImagenExamen { get; set; }
        public string? ImagenRecibo { get; set; }
        public string? ObservacionExamen { get; set; }
    }

    // =========================================================================
    // DTO: OCR GEMINI PARA TICKET TÉRMICO LACTOSCAN S50
    // =========================================================================

    public class OcrLactoscanRequestDto
    {
        public string ImagenBase64 { get; set; } = string.Empty;
    }

    public class OcrLactoscanResponseDto
    {
        public bool Exito { get; set; }
        public string? Mensaje { get; set; }
        public string? HoraPrueba { get; set; }
        public string? FechaDetectada { get; set; }
        public string? Equipo { get; set; }
        public string? NumeroSerial { get; set; }
        public string? Calibracion { get; set; }
        public string? TipoLecheDetectado { get; set; }

        public decimal? GrasaPct { get; set; }
        public decimal? SngPct { get; set; }
        public decimal? Densidad { get; set; }
        public decimal? LactosaPct { get; set; }
        public decimal? SalesPct { get; set; }
        public decimal? ProteinaPct { get; set; }
        public decimal? SolidosTotalesPct { get; set; }
        public decimal? AguaAdicionadaPct { get; set; }
        public decimal? TemperaturaC { get; set; }
        public decimal? PuntoCongelacion { get; set; }
        public decimal? Ph { get; set; }
        public decimal? Conductividad { get; set; }
    }
}
