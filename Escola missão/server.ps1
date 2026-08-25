$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000
$url = "http://localhost:$port"

$laragonPhpExecutables = @()

if (Test-Path "C:\laragon\bin\php") {
    $laragonPhpExecutables = @(Get-ChildItem "C:\laragon\bin\php\*\php.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -ExpandProperty FullName)
}

$candidatePhpPaths = @()

$phpFromPath = Get-Command php.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
if ($phpFromPath) {
    $candidatePhpPaths += $phpFromPath
}

$candidatePhpPaths += @(
    "C:\xampp\php\php.exe",
    "C:\laragon\bin\php\php.exe",
    "C:\php\php.exe"
)

if ($laragonPhpExecutables.Count -gt 0) {
    $candidatePhpPaths += $laragonPhpExecutables
}

$candidatePhpPaths = @($candidatePhpPaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)

if (-not $candidatePhpPaths -or $candidatePhpPaths.Count -eq 0) {
    Write-Host ""
    Write-Host "PHP nao foi encontrado no computador." -ForegroundColor Red
    Write-Host "Instale um destes ambientes e execute este arquivo novamente:" -ForegroundColor Yellow
    Write-Host "- XAMPP"
    Write-Host "- Laragon"
    Write-Host "- PHP para Windows no PATH"
    Write-Host ""
    Write-Host "Depois disso, abra novamente este arquivo server.ps1." -ForegroundColor Yellow
    Read-Host "Pressione Enter para fechar"
    exit 1
}

$phpExe = [string]$candidatePhpPaths[0]

Write-Host ""
Write-Host "Usando PHP em: $phpExe" -ForegroundColor Green
Write-Host "Projeto: $projectRoot" -ForegroundColor Green
Write-Host "Servidor: $url" -ForegroundColor Green
Write-Host ""
Write-Host "Aguarde. O navegador sera aberto quando o servidor estiver pronto." -ForegroundColor Yellow
Write-Host "Mantenha esta janela aberta enquanto estiver usando o app." -ForegroundColor Yellow
Write-Host ""

Start-Job -ScriptBlock {
    param($targetUrl)
    Start-Sleep -Seconds 3
    Start-Process $targetUrl
} -ArgumentList $url | Out-Null

& $phpExe -S "localhost:$port" -t $projectRoot
