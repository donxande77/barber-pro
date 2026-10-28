# Backup do banco Barber Pro (Windows / PowerShell).
# Uso: .\scripts\backup.ps1                (usa o container "postgres" do docker-compose.yml)
#      .\scripts\backup.ps1 -Local         (usa o pg_dump instalado no Windows)
param(
  [switch]$Local,
  [string]$Database = "barberpro",
  [string]$User = "barber",
  [string]$OutDir = "backups"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$file = Join-Path $OutDir "barberpro_$stamp.dump"

if ($Local) {
  pg_dump -U $User -h localhost -F c -f $file $Database
} else {
  # O dump é gerado dentro do container e copiado (o pipe do PowerShell corromperia o arquivo binário)
  docker compose exec -T postgres pg_dump -U $User -F c -f /tmp/barberpro.dump $Database
  docker compose cp postgres:/tmp/barberpro.dump $file
}
Write-Host "Backup salvo em $file"

# Mantém os 30 backups mais recentes
Get-ChildItem $OutDir -Filter "barberpro_*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item
