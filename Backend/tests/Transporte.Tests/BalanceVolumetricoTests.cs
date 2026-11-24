using System;
using Transporte.Core.Services;
using Xunit;

namespace Transporte.Tests
{
    public class BalanceVolumetricoTests
    {
        [Fact]
        public void Ordena_EntradasAntesQueSalidas_PorFechaYTicket_SinSaldoNegativoFicticio()
        {
            var fecha = new DateTime(2026, 11, 18);
            var items = new[]
            {
                // Ctrl #20577 tiene número menor que Ticket #21342, pero es Salida: debe ir DESPUÉS
                new MovimientoVolumetricoItem(1, fecha, TipoMovimientoSilo.SalidaPlanta, "Ctrl #20577", 8888, 0),
                new MovimientoVolumetricoItem(2, fecha, TipoMovimientoSilo.EntradaSilo, "Ticket #21342", 5825, 0),
                new MovimientoVolumetricoItem(3, fecha, TipoMovimientoSilo.EntradaSilo, "Ticket #21377", 1410, 0),
                new MovimientoVolumetricoItem(4, fecha, TipoMovimientoSilo.EntradaSilo, "Ticket #21378", 1653, 0),
            };

            var res = BalanceVolumetricoCalculator.Calcular(0, items, incluirDiferidos: false);

            Assert.Equal(8888, res.TotalEntradasNetas);
            Assert.Equal(8888, res.TotalSalidas);
            Assert.Equal(0, res.StockFinal);
            Assert.Equal(TipoMovimientoSilo.EntradaSilo, res.Movimientos[0].Tipo);
            Assert.Equal(TipoMovimientoSilo.SalidaPlanta, res.Movimientos[^1].Tipo);
            Assert.All(res.Movimientos, m => Assert.True(m.SaldoTanque >= 0));
        }

        [Fact]
        public void Permite_StockInicialNegativo_YSumaEntradasNetas()
        {
            var items = new[]
            {
                new MovimientoVolumetricoItem(1, new DateTime(2026, 11, 17), TipoMovimientoSilo.EntradaSilo, "Ticket #21341", 6946, 0),
                new MovimientoVolumetricoItem(2, new DateTime(2026, 11, 17), TipoMovimientoSilo.SalidaPlanta, "Ctrl #20576", 6946, 0),
            };

            var res = BalanceVolumetricoCalculator.Calcular(-500, items, incluirDiferidos: false);

            Assert.Equal(-500, res.StockFinal);
            Assert.Equal(6946, res.TotalEntradasNetas);
            Assert.Equal(6946, res.TotalSalidas);
        }

        [Fact]
        public void Excluye_LitrosDiferidos_CuandoConfigEstaApagada_YLosIncluyeCuandoSeEnciende()
        {
            var items = new[]
            {
                new MovimientoVolumetricoItem(10, new DateTime(2026, 11, 23), TipoMovimientoSilo.EntradaSilo, "Ticket #21409", 2164, 407),
            };

            var sinDiferidos = BalanceVolumetricoCalculator.Calcular(9322, items, incluirDiferidos: false);
            Assert.Equal(1757, sinDiferidos.TotalEntradasNetas);
            Assert.Equal(407, sinDiferidos.TotalDiferidos);
            Assert.Equal(11079, sinDiferidos.StockFinal);

            var conDiferidos = BalanceVolumetricoCalculator.Calcular(9322, items, incluirDiferidos: true);
            Assert.Equal(2164, conDiferidos.TotalEntradasNetas);
            Assert.Equal(11486, conDiferidos.StockFinal);
        }

        [Fact]
        public void Separa_Correctamente_RutaVsTransporte()
        {
            var items = new[]
            {
                new MovimientoVolumetricoItem(1, new DateTime(2026, 11, 23), TipoMovimientoSilo.EntradaSilo, "Ticket #100", 3000, 0, TipoServicioId: 1),
                new MovimientoVolumetricoItem(2, new DateTime(2026, 11, 23), TipoMovimientoSilo.EntregaDirecta, "Ctrl #200", 1500, 0, TipoServicioId: 2),
            };

            var res = BalanceVolumetricoCalculator.Calcular(0, items, incluirDiferidos: false);

            Assert.Equal(3000, res.TotalRuta);
            Assert.Equal(1500, res.TotalTransporte);
            Assert.Equal(3000, res.StockFinal); // Entrega directa no entra a silos
        }

        [Fact]
        public void Calcula_MermaYTolerancia_Exactamente()
        {
            var (litros, pct, excede) = BalanceVolumetricoCalculator.CalcularMerma(10000, 9800, 1.50m);
            Assert.Equal(200, litros);
            Assert.Equal(2.00m, pct);
            Assert.True(excede);

            var (_, pctOk, excedeOk) = BalanceVolumetricoCalculator.CalcularMerma(10000, 9900, 1.50m);
            Assert.Equal(1.00m, pctOk);
            Assert.False(excedeOk);
        }
    }
}
