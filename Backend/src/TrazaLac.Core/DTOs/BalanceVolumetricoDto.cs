using System;
using System.Collections.Generic;

namespace TrazaLac.Core.DTOs
{
    public class BalanceVolumetricoDto
    {
        public int? CicloId { get; set; }
        public string? CodigoCiclo { get; set; }
        public DateTime? FechaInicio { get; set; }
        public DateTime? FechaFin { get; set; }

        // Métricas Globales
        public decimal StockInicialTanque { get; set; } = 0m;
        public decimal TotalRecolectadoFincas { get; set; }
        public decimal TotalEntradasTanque { get; set; }
        public decimal TotalSalidasTanque { get; set; }
        public decimal StockActualTanque { get; set; }
        public decimal TotalEntregasDirectas { get; set; }
        public decimal TotalComercializadoCompanias { get; set; }
        public decimal TotalMermaRuta { get; set; }
        public decimal DiferenciaDescuadre { get; set; } // 0.00 si está 100% cuadrado

        // Resumen de los 4 Procesos Operativos
        public ResumenProcesoDto Proceso1_FincaReceptoria { get; set; } = new();
        public ResumenProcesoDto Proceso2_FincaReceptoriaCompania { get; set; } = new();
        public ResumenProcesoDto Proceso3_FincaCompania { get; set; } = new();
        public ResumenProcesoDto Proceso4_ReceptoriaCompania { get; set; } = new();

        // Lista cronológica detallada de todos los movimientos (entradas, salidas, entregas)
        public List<MovimientoLecheDto> Movimientos { get; set; } = new();
    }

    public class ResumenProcesoDto
    {
        public int TipoProceso { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public decimal TotalLitros { get; set; }
        public int CantidadMovimientos { get; set; }
        public decimal PorcentajeDelTotal { get; set; }
        public string ImpactoTanque { get; set; } = "NEUTRO"; // "SUMA", "TRANSITO", "NEUTRO", "RESTA"
    }

    public class MovimientoLecheDto
    {
        public long Id { get; set; }
        public DateTime Fecha { get; set; }
        public int TipoProceso { get; set; } // 1, 2, 3 o 4
        public string TipoProcesoNombre { get; set; } = string.Empty;
        public string TicketReferencia { get; set; } = string.Empty;
        public string Conductor { get; set; } = string.Empty;
        public string? CamionPlaca { get; set; }
        public string Origen { get; set; } = string.Empty;
        public string Destino { get; set; } = string.Empty;
        public decimal LitrosEntradaTanque { get; set; }
        public decimal LitrosSalidaTanque { get; set; }
        public decimal LitrosEntregaDirecta { get; set; }
        public decimal SaldoTanque { get; set; }
        public decimal? LitrosVerificados { get; set; }
        public decimal? DiferenciaVerificacion { get; set; }
        public string? InfoVerificacion { get; set; }
        public string Estado { get; set; } = string.Empty;
        public string? Observacion { get; set; }
    }
}
