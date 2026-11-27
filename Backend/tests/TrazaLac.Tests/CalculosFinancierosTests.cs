using System;
using Xunit;

namespace TrazaLac.Tests;

public class CalculosFinancierosTests
{
    [Fact]
    public void Liquidacion_MixtaVacaBufalaYAcida_CalculaTotalesExactos()
    {
        int ltsVaca = 4106;
        decimal precioVaca = 0.93m;
        int ltsBufala = 535;
        decimal precioBufala = 1.25m;
        int ltsAcida = 120;
        decimal precioAcida = 0.65m;
        decimal tasaBcv = 911.6243m;

        decimal totalUsd = Math.Round((ltsVaca * precioVaca) + (ltsBufala * precioBufala) + (ltsAcida * precioAcida), 2);
        decimal totalBs = Math.Round(totalUsd * tasaBcv, 2);

        Assert.Equal(4565.33m, totalUsd);
        Assert.Equal(4161865.77m, totalBs);
    }

    [Fact]
    public void Liquidacion_ConAdelantoMayorAlMontoBruto_NoGeneraNetoNegativo()
    {
        decimal montoBrutoUsd = 500.00m;
        decimal deudaAdelantosUsd = 750.00m;

        decimal descuentoAplicado = Math.Min(montoBrutoUsd, deudaAdelantosUsd);
        decimal netoAPagar = montoBrutoUsd - descuentoAplicado;
        decimal saldoPendienteAdelanto = deudaAdelantosUsd - descuentoAplicado;

        Assert.Equal(500.00m, descuentoAplicado);
        Assert.Equal(0.00m, netoAPagar);
        Assert.Equal(250.00m, saldoPendienteAdelanto);
    }

    [Fact]
    public void MermaDeViaje_FincaVsReceptoria_CalculaDiferenciaYPorcentaje()
    {
        int litrosFinca = 4128;
        int litrosRecibidos = 4106;

        int merma = litrosFinca - litrosRecibidos;
        decimal pctMerma = Math.Round((Math.Abs(merma) * 100.0m) / litrosFinca, 2);

        Assert.Equal(22, merma);
        Assert.Equal(0.53m, pctMerma);
    }

    [Fact]
    public void DiferirLitros_DivideVolumenSinPerderLitrosNiNegativos()
    {
        int litrosOriginales = 1200;
        int litrosADiferir = 450;

        int litrosRestantesSemanaActual = litrosOriginales - litrosADiferir;

        Assert.Equal(750, litrosRestantesSemanaActual);
        Assert.Equal(litrosOriginales, litrosRestantesSemanaActual + litrosADiferir);
        Assert.True(litrosRestantesSemanaActual > 0);
    }
}
