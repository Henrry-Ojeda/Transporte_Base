using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using TrazaLac.Core.DTOs;
using TrazaLac.Core.Interfaces;

namespace TrazaLac.Infrastructure.Services
{
    public interface IGeminiOcrService
    {
        Task<ResultadoOcrRutaDto> ProcesarPlanillaImagenAsync(string base64Imagen, IEnumerable<FincaDto> fincasSistema);
        Task<OcrLactoscanResponseDto> ProcesarTicketLactoscanAsync(string base64Imagen);
    }

    public class GeminiOcrService : IGeminiOcrService
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiKey;
        private readonly ITenantService? _tenantService;

        public GeminiOcrService(IConfiguration configuration, HttpClient httpClient, ITenantService? tenantService = null)
        {
            _httpClient = httpClient;
            _tenantService = tenantService;
            _apiKey = configuration["Gemini:ApiKey"] 
                ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                ?? string.Empty;
        }

        public async Task<ResultadoOcrRutaDto> ProcesarPlanillaImagenAsync(string base64Imagen, IEnumerable<FincaDto> fincasSistema)
        {
            var fincasList = fincasSistema.Select(f => new { f.Id, f.Nombre }).ToList();
            var cleanBase64 = base64Imagen.Contains(",") ? base64Imagen.Split(',')[1] : base64Imagen;

            if (!string.IsNullOrWhiteSpace(_apiKey))
            {
                var modelEndpoints = new[]
                {
                    $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={_apiKey}",
                    $"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={_apiKey}",
                    $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={_apiKey}",
                    $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={_apiKey}"
                };

                var empresaNombre = _tenantService?.GetTenantName();
                if (string.IsNullOrWhiteSpace(empresaNombre)) empresaNombre = "EMPRESA DE TRANSPORTE";
                var promptText = $@"IMPORTANTE: Analiza minuciosamente la imagen de esta planilla de recolección de leche de '{empresaNombre}'.
TEN EN CUENTA QUE LA IMAGEN PUEDE ESTAR ROTADA 90° O ESTAR EN VERTICAL/HORIZONTAL. LÉELA EN LA ORIENTACIÓN CORRECTA.

REGLA CRÍTICA DE ALINEACIÓN FILA POR FILA (SECCIÓN MATERA):
- Recorre la columna 'MATERA' de arriba a abajo LÍNEA POR LÍNEA.
- CADA NOMBRE DE FINCA MANUSCRITO SE ALINEA RIGUROSAMENTE CON LOS LITROS DE SU MISMA LÍNEA HORIZONTAL.
- NO te saltes ninguna fila ni combines líneas. Si un nombre manuscrito es confuso (ej: 'Los ermano Aguirre', 'Kike', 'Canta claro', 'Jaguey Hondo', 'Puerto triunfo', 'Los Naranjos', 'Calle derecha', 'San gregorio', 'La Geita/Ceita', 'El paujil'), extrae el nombre manuscrito lealmente en esa posición exacta con sus litros.

1. Columna 'MATERA' (Fincas produciendo leche): Fincas donde se recolecta leche.
2. Columna 'RECEPTORIA' / 'RECEPTORA': Empresa/Planta receptora que recibe la leche (ej: 'PLANTA RECEPTORA A', 'QUESERA CENTRAL').

INSTRUCCIONES DE EXTRACCIÓN:
- En la lista ""items"", extrae ÚNICAMENTE las fincas de la columna 'MATERA' respetando el orden estricto de arriba hacia abajo.
- En la propiedad ""receptoraDetectada"", coloca la empresa leída en la columna 'RECEPTORIA' (ej: 'PLANTA RECEPTORA A - 4244 Lts'). NO la incluyas como finca de recolección.
- Observaciones: extrae cualquier nota como '3=17', '13-5', '14', '13', '17-23', '92-3', '12=6', '32=4', '3=28', etc. Si menciona 'acida' o 'ácida', coloca 'ÁCIDA'.

Lista de nombres de fincas en la base de datos para cotejar e identificar FincaId:
{JsonSerializer.Serialize(fincasList)}

Devuelve ÚNICAMENTE un JSON estricto con esta estructura (sin markdown ni explicaciones):
{{
  ""receptoraDetectada"": ""PLANTA RECEPTORA A (4244 Lts)"",
  ""items"": [
    {{
      ""fincaNombreDetectado"": ""Kike"",
      ""litros"": 174,
      ""observacion"": ""3=17"",
      ""tipoColumna"": ""MATERA""
    }},
    {{
      ""fincaNombreDetectado"": ""Los ermano Aguirre"",
      ""litros"": 923,
      ""observacion"": ""17-23"",
      ""tipoColumna"": ""MATERA""
    }}
  ]
}}";

                var requestPayload = new
                {
                    contents = new[]
                    {
                        new
                        {
                            parts = new object[]
                            {
                                new { text = promptText },
                                new
                                {
                                    inline_data = new
                                    {
                                        mime_type = "image/jpeg",
                                        data = cleanBase64
                                    }
                                }
                            }
                        }
                    }
                };

                foreach (var endpoint in modelEndpoints)
                {
                    try
                    {
                        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(35));
                        var jsonContent = new StringContent(JsonSerializer.Serialize(requestPayload), Encoding.UTF8, "application/json");
                        var response = await _httpClient.PostAsync(endpoint, jsonContent, cts.Token);

                        if (response.IsSuccessStatusCode)
                        {
                            var responseBody = await response.Content.ReadAsStringAsync();
                            using var doc = JsonDocument.Parse(responseBody);
                            var rawText = doc.RootElement
                                .GetProperty("candidates")[0]
                                .GetProperty("content")
                                .GetProperty("parts")[0]
                                .GetProperty("text")
                                .GetString();

                            Console.WriteLine($"[Gemini Vision Output - Endpoint {endpoint}]:\n{rawText}");

                            if (!string.IsNullOrWhiteSpace(rawText))
                            {
                                var jsonString = rawText.Trim();
                                if (jsonString.StartsWith("```json")) jsonString = jsonString.Substring(7);
                                if (jsonString.StartsWith("```")) jsonString = jsonString.Substring(3);
                                if (jsonString.EndsWith("```")) jsonString = jsonString.Substring(0, jsonString.Length - 3);
                                jsonString = jsonString.Trim();

                                using var parsedDoc = JsonDocument.Parse(jsonString);
                                var itemsList = new List<RutaItemOcrDto>();
                                string receptoraEncontrada = "";

                                if (parsedDoc.RootElement.ValueKind == JsonValueKind.Object)
                                {
                                    if (parsedDoc.RootElement.TryGetProperty("receptoraDetectada", out var recProp))
                                        receptoraEncontrada = recProp.GetString() ?? "";
                                    else if (parsedDoc.RootElement.TryGetProperty("receptora", out var recProp2))
                                        receptoraEncontrada = recProp2.GetString() ?? "";
                                }

                                JsonElement itemsElement = default;
                                if (parsedDoc.RootElement.ValueKind == JsonValueKind.Object && parsedDoc.RootElement.TryGetProperty("items", out itemsElement))
                                {
                                    // Ok
                                }
                                else if (parsedDoc.RootElement.ValueKind == JsonValueKind.Array)
                                {
                                    itemsElement = parsedDoc.RootElement;
                                }

                                if (itemsElement.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var elem in itemsElement.EnumerateArray())
                                    {
                                        string tipoCol = "MATERA";
                                        if (elem.TryGetProperty("tipoColumna", out var tcProp)) tipoCol = tcProp.GetString() ?? "MATERA";

                                        int? fId = null;
                                        if (elem.TryGetProperty("fincaId", out var fIdProp) && fIdProp.ValueKind == JsonValueKind.Number)
                                        {
                                            fId = fIdProp.GetInt32();
                                        }

                                        string fNombre = "";
                                        if (elem.TryGetProperty("fincaNombreDetectado", out var fnProp)) fNombre = fnProp.GetString() ?? "";
                                        else if (elem.TryGetProperty("matera", out var mProp)) fNombre = mProp.GetString() ?? "";
                                        else if (elem.TryGetProperty("finca", out var fProp)) fNombre = fProp.GetString() ?? "";
                                        else if (elem.TryGetProperty("nombre", out var nProp)) fNombre = nProp.GetString() ?? "";

                                        int lts = 0;
                                        if (elem.TryGetProperty("litros", out var lProp))
                                        {
                                            if (lProp.ValueKind == JsonValueKind.Number) lts = lProp.GetInt32();
                                            else if (lProp.ValueKind == JsonValueKind.String && int.TryParse(lProp.GetString(), out var parsedLts)) lts = parsedLts;
                                        }

                                        string obs = "";
                                        if (elem.TryGetProperty("observacion", out var obsProp)) obs = obsProp.GetString() ?? "";
                                        else if (elem.TryGetProperty("observaciones", out var obssProp)) obs = obssProp.GetString() ?? "";

                                        bool esAcida = false;
                                        if (elem.TryGetProperty("esAcida", out var acidaProp))
                                        {
                                            if (acidaProp.ValueKind == JsonValueKind.True) esAcida = true;
                                            else if (acidaProp.ValueKind == JsonValueKind.String && (acidaProp.GetString()?.ToLower().Contains("acid") ?? false)) esAcida = true;
                                        }
                                        if (!esAcida && (obs.ToLower().Contains("acid") || fNombre.ToLower().Contains("acid")))
                                        {
                                            esAcida = true;
                                        }

                                        // Si la fila está vacía sin nombre y sin litros, pasar a la siguiente inspección inmediatamente
                                        if (string.IsNullOrWhiteSpace(fNombre) && lts == 0) continue;

                                        // Si la fila fue detectada como RECEPTORIA, guardarla como receptoraDetectada y pasar a la siguiente
                                        if (tipoCol.ToUpper().Contains("RECEPTOR"))
                                        {
                                            if (string.IsNullOrWhiteSpace(receptoraEncontrada))
                                                receptoraEncontrada = $"{fNombre} ({lts} Lts)";
                                            continue;
                                        }

                                        // Búsqueda e inspección rápida por match directo, fuzzy o Levenshtein
                                        var fincaMatched = EncontrarFincaEnSistema(fId, fNombre, fincasSistema);
                                        int? matchedId = fincaMatched?.Id ?? fId;
                                        string displayNombre = fincaMatched != null ? fincaMatched.Nombre : fNombre;

                                        itemsList.Add(new RutaItemOcrDto
                                        {
                                            FincaId = matchedId,
                                            FincaNombreDetectado = displayNombre,
                                            Litros = lts,
                                            EsAcida = esAcida,
                                            Observacion = obs,
                                            TipoColumna = "MATERA",
                                            Confianza = 0.95m
                                        });
                                    }

                                    if (itemsList.Count > 0)
                                    {
                                        var msj = $"Inspección rápida completada: {itemsList.Count} fincas extraídas de la sección MATERA.";
                                        if (!string.IsNullOrWhiteSpace(receptoraEncontrada))
                                        {
                                            msj += $" Planta/Receptoría: {receptoraEncontrada}.";
                                        }
                                        msj += " Revisa la lista antes de guardar.";

                                        return new ResultadoOcrRutaDto
                                        {
                                            Items = itemsList,
                                            ReceptoraDetectada = receptoraEncontrada,
                                            Mensaje = msj
                                        };
                                    }
                                }
                            }
                        }
                        else
                        {
                            var errBody = await response.Content.ReadAsStringAsync();
                            Console.WriteLine($"[Gemini Vision API Error {response.StatusCode}]: {errBody}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[GeminiOcrService Exception - Endpoint {endpoint}]: {ex.Message}");
                    }
                }
            }

            return new ResultadoOcrRutaDto
            {
                Items = new List<RutaItemOcrDto>(),
                Mensaje = "No se pudieron extraer registros automáticamente de la imagen. Por favor, verifica que la imagen sea legible o agrega las fincas manualmente."
            };
        }

        private FincaDto? EncontrarFincaEnSistema(int? fincaId, string nombreDetectado, IEnumerable<FincaDto> fincas)
        {
            if (fincaId.HasValue && fincaId.Value > 0)
            {
                var matchExacto = fincas.FirstOrDefault(f => f.Id == fincaId.Value);
                if (matchExacto != null) return matchExacto;
            }

            if (string.IsNullOrWhiteSpace(nombreDetectado)) return null;

            var norm = NormalizarTexto(nombreDetectado);
            if (string.IsNullOrWhiteSpace(norm)) return null;

            // 1. Coincidencia directa exacta o por subcadena de Finca
            var coincidencia = fincas.FirstOrDefault(f => 
                NormalizarTexto(f.Nombre) == norm ||
                NormalizarTexto(f.Nombre).Contains(norm) || 
                norm.Contains(NormalizarTexto(f.Nombre)));

            if (coincidencia != null) return coincidencia;

            // 2. Coincidencia por tokens de palabras clave en el nombre de la Finca
            var tokens = norm.Split(new[] { ' ', '.', ',', '-' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var token in tokens)
            {
                if (token.Length < 3) continue;
                var matchToken = fincas.FirstOrDefault(f => 
                    NormalizarTexto(f.Nombre).Contains(token));
                if (matchToken != null) return matchToken;
            }

            // 3. Coincidencia por distancia de Levenshtein (tolerancia a errores ortográficos)
            FincaDto? mejorMatch = null;
            int menorDistancia = int.MaxValue;

            foreach (var f in fincas)
            {
                var fNorm = NormalizarTexto(f.Nombre);
                int dist = CalcularDistanciaLevenshtein(norm, fNorm);
                if (dist <= 2 && dist < menorDistancia)
                {
                    menorDistancia = dist;
                    mejorMatch = f;
                }
            }

            if (mejorMatch != null) return mejorMatch;

            return null;
        }

        private int CalcularDistanciaLevenshtein(string s, string t)
        {
            if (string.IsNullOrEmpty(s)) return string.IsNullOrEmpty(t) ? 0 : t.Length;
            if (string.IsNullOrEmpty(t)) return s.Length;

            int n = s.Length;
            int m = t.Length;
            int[,] d = new int[n + 1, m + 1];

            for (int i = 0; i <= n; d[i, 0] = i++) { }
            for (int j = 0; j <= m; d[0, j] = j++) { }

            for (int i = 1; i <= n; i++)
            {
                for (int j = 1; j <= m; j++)
                {
                    int cost = (t[j - 1] == s[i - 1]) ? 0 : 1;
                    d[i, j] = Math.Min(
                        Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + cost);
                }
            }
            return d[n, m];
        }

        private string NormalizarTexto(string txt)
        {
            if (string.IsNullOrWhiteSpace(txt)) return string.Empty;
            var t = txt.ToUpper().Trim();
            t = t.Replace("Á", "A").Replace("É", "E").Replace("Í", "I").Replace("Ó", "O").Replace("Ú", "U");
            t = t.Replace("HERMANOS", "HNOS").Replace("HERMANO", "HNOS").Replace("ERMANOS", "HNOS").Replace("ERMANO", "HNOS");
            t = t.Replace("LOS HNOS", "HNOS").Replace("LOS ERMANOS", "HNOS").Replace("LOS ERMANO", "HNOS");
            t = t.Replace("JEITA", "GEITA").Replace("JITA", "GEITA").Replace("CEITA", "GEITA");
            t = t.Replace("CHIQUINQUIRA", "CHIQUINQUIRA").Replace("BUFALO", "BUFALA");
            return t.Trim();
        }

        public async Task<OcrLactoscanResponseDto> ProcesarTicketLactoscanAsync(string base64Imagen)
        {
            var result = new OcrLactoscanResponseDto { Exito = false };
            if (string.IsNullOrWhiteSpace(_apiKey))
            {
                result.Mensaje = "Gemini API Key no configurada en el servidor. Puedes ingresar los valores manualmente.";
                return result;
            }

            var cleanBase64 = base64Imagen.Contains(",") ? base64Imagen.Split(',')[1] : base64Imagen;
            var modelEndpoints = new[]
            {
                $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={_apiKey}",
                $"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={_apiKey}",
                $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={_apiKey}"
            };

            const string prompt = @"Eres un lector OCR de tickets térmicos de analizadores de leche (ej. Lactoscan S50 / Milkotester).
Extrae los valores exactos de la imagen y devuelve ÚNICAMENTE un JSON estricto sin markdown ni explicaciones.
Si un campo no aparece o es ilegible, devuelve null. Usa punto decimal (ej. 4.04, -0.542).
Estructura exacta:
{
  ""horaPrueba"": ""01:48:57"",
  ""fechaDetectada"": ""2026-08-18"",
  ""equipo"": ""Lactoscan S50"",
  ""numeroSerial"": ""048680"",
  ""calibracion"": ""Calibr 1 Vaca"",
  ""tipoLecheDetectado"": ""VACA"",
  ""grasaPct"": 4.04,
  ""sngPct"": 8.05,
  ""densidad"": 26.86,
  ""lactosaPct"": 4.68,
  ""salesPct"": 0.69,
  ""proteinaPct"": 2.94,
  ""solidosTotalesPct"": 12.09,
  ""aguaAdicionadaPct"": 0.00,
  ""temperaturaC"": 12.6,
  ""puntoCongelacion"": -0.542,
  ""ph"": 11.22,
  ""conductividad"": 4.72
}";

            var requestPayload = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new object[]
                        {
                            new { text = prompt },
                            new { inline_data = new { mime_type = "image/jpeg", data = cleanBase64 } }
                        }
                    }
                }
            };

            foreach (var endpoint in modelEndpoints)
            {
                try
                {
                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                    var jsonContent = new StringContent(JsonSerializer.Serialize(requestPayload), Encoding.UTF8, "application/json");
                    var response = await _httpClient.PostAsync(endpoint, jsonContent, cts.Token);
                    if (!response.IsSuccessStatusCode) continue;

                    var body = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(body);
                    var text = doc.RootElement
                        .GetProperty("candidates")[0]
                        .GetProperty("content")
                        .GetProperty("parts")[0]
                        .GetProperty("text")
                        .GetString();

                    if (string.IsNullOrWhiteSpace(text)) continue;

                    var cleanJson = text.Trim();
                    if (cleanJson.StartsWith("```"))
                    {
                        var firstBrace = cleanJson.IndexOf('{');
                        var lastBrace = cleanJson.LastIndexOf('}');
                        if (firstBrace >= 0 && lastBrace > firstBrace)
                            cleanJson = cleanJson.Substring(firstBrace, lastBrace - firstBrace + 1);
                    }

                    var parsed = JsonSerializer.Deserialize<OcrLactoscanResponseDto>(cleanJson, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (parsed != null)
                    {
                        parsed.Exito = true;
                        parsed.Mensaje = "Ticket Lactoscan leído con IA exitosamente.";
                        return parsed;
                    }
                }
                catch
                {
                    // Intentar siguiente modelo
                }
            }

            result.Mensaje = "No se pudo leer automáticamente el ticket. Verifica la nitidez de la foto o ingresa los valores manualmente.";
            return result;
        }
    }
}
