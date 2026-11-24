using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Transporte.Core.Services
{
    public enum TipoMovimientoSilo
    {
        StockInicial = 0,
        EntradaSilo = 1,
        EntregaDirecta = 2,
        SalidaPlanta = 3
    }

    public sealed record MovimientoVolumetricoItem(
        int Id,
        DateTime Fecha,
        TipoMovimientoSilo Tipo,
        string TicketReferencia,
        decimal LitrosBrutos,
        decimal LitrosDiferidos,
        int TipoServicioId = 1
    );

    public sealed record MovimientoVolumetricoCalculado(
        int Id,
        DateTime Fecha,
        TipoMovimientoSilo Tipo,
        string TicketReferencia,
        decimal EntradaNeta,
        decimal Salida,
        decimal Directa,
        decimal LitrosDiferidosAplicados,
        decimal SaldoTanque,
        int TipoServicioId
    );

    public sealed record ResumenBalanceVolumetrico(
        decimal StockInicial,
        decimal TotalEntradasBrutas,
        decimal TotalDiferidos,
        decimal TotalEntradasNetas,
        decimal TotalSalidas,
        decimal TotalDirectas,
        decimal StockFinal,
        decimal TotalRuta,
        decimal TotalTransporte,
        IReadOnlyList<MovimientoVolumetricoCalculado> Movimientos
    );

    /// <summary>
    /// Motor único de cálculo volumétrico (Entradas '+', Salidas '-', Diferidos, RUTA vs TRANSPORTE y Saldo Acumulado).
    /// </summary>
    public static class BalanceVolumetricoCalculator
    {
        public static int ExtractTicketNumber(string? ticketReferencia, int fallbackId)
        {
            if (!string.IsNullOrWhiteSpace(ticketReferencia))
            {
                var match = Regex.Match(ticketReferencia, @"\d+");
                if (match.Success && int.TryParse(match.Value, out int num))
                    return num;
            }
            return fallbackId;
        }

        public static ResumenBalanceVolumetrico Calcular(
            decimal stockInicial,
            IEnumerable<MovimientoVolumetricoItem> items,
            bool incluirDiferidos)
        {
            var ordered = items
                .OrderBy(m => m.Tipo == TipoMovimientoSilo.StockInicial ? 0 : 1)
                .ThenBy(m => m.Fecha.Date)
                .ThenBy(m => (int)m.Tipo) // Entradas (1) -> Directas (2) -> Salidas (3)
                .ThenBy(m => ExtractTicketNumber(m.TicketReferencia, m.Id))
                .ToList();

            decimal saldo = stockInicial;
            decimal entradasBrutas = 0;
            decimal totalDiferidos = 0;
            decimal entradasNetas = 0;
            decimal salidas = 0;
            decimal directas = 0;
            decimal totalRuta = 0;
            decimal totalTransporte = 0;

            var resultado = new List<MovimientoVolumetricoCalculado>(ordered.Count);

            foreach (var m in ordered)
            {
                if (m.Tipo == TipoMovimientoSilo.StockInicial)
                {
                    resultado.Add(new MovimientoVolumetricoCalculado(
                        m.Id, m.Fecha, m.Tipo, m.TicketReferencia, 0, 0, 0, 0, stockInicial, m.TipoServicioId));
                    continue;
                }

                decimal litrosAbs = Math.Abs(m.LitrosBrutos);
                decimal entrada = 0;
                decimal salida = 0;
                decimal directa = 0;
                decimal difAplicado = 0;

                if (m.Tipo == TipoMovimientoSilo.EntradaSilo)
                {
                    entradasBrutas += litrosAbs;
                    difAplicado = Math.Min(litrosAbs, Math.Max(0, m.LitrosDiferidos));
                    totalDiferidos += difAplicado;
                    entrada = incluirDiferidos ? litrosAbs : Math.Max(0, litrosAbs - difAplicado);
                    entradasNetas += entrada;

                    if (m.TipoServicioId == 2) totalTransporte += entrada;
                    else totalRuta += entrada;
                }
                else if (m.Tipo == TipoMovimientoSilo.SalidaPlanta)
                {
                    salida = litrosAbs;
                    salidas += salida;
                }
                else if (m.Tipo == TipoMovimientoSilo.EntregaDirecta)
                {
                    directa = litrosAbs;
                    directas += directa;
                    if (m.TipoServicioId == 2) totalTransporte += directa;
                    else totalRuta += directa;
                }

                saldo = saldo + entrada - salida;

                resultado.Add(new MovimientoVolumetricoCalculado(
                    m.Id,
                    m.Fecha,
                    m.Tipo,
                    m.TicketReferencia,
                    entrada,
                    salida,
                    directa,
                    difAplicado,
                    saldo,
                    m.TipoServicioId));
            }

            return new ResumenBalanceVolumetrico(
                StockInicial: stockInicial,
                TotalEntradasBrutas: entradasBrutas,
                TotalDiferidos: totalDiferidos,
                TotalEntradasNetas: entradasNetas,
                TotalSalidas: salidas,
                TotalDirectas: directas,
                StockFinal: saldo,
                TotalRuta: totalRuta,
                TotalTransporte: totalTransporte,
                Movimientos: resultado);
        }

        public static (decimal MermaLitros, decimal MermaPct, bool ExcedeTolerancia) CalcularMerma(
            decimal recolectadoOrigen,
            decimal entregadoDestino,
            decimal toleranciaPct)
        {
            if (recolectadoOrigen <= 0) return (0, 0, false);
            decimal merma = Math.Max(0, recolectadoOrigen - entregadoDestino);
            decimal pct = Math.Round((merma / recolectadoOrigen) * 100m, 2);
            return (merma, pct, pct > toleranciaPct);
        }
    }
}
