$projectRoot = $PSScriptRoot
$pidPath = Join-Path $projectRoot ".inspection-copilot-pids.json"

if (-not (Test-Path $pidPath)) {
    exit 0
}

$processIds = Get-Content $pidPath | ConvertFrom-Json

@($processIds.backend, $processIds.frontend) |
    Where-Object { $_ } |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
