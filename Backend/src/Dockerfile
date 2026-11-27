# Etapa de compilación
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copiar todos los proyectos (API, Core, Infrastructure, etc.)
COPY . .

# Restaurar y compilar desde el proyecto principal
RUN dotnet restore "TrazaLac.API/TrazaLac.API.csproj"
RUN dotnet publish "TrazaLac.API/TrazaLac.API.csproj" -c Release -o /app/publish

# Etapa de producción
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .

# Expone el puerto
EXPOSE 8080
ENTRYPOINT ["dotnet", "TrazaLac.API.dll"]