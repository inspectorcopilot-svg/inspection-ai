$projectRoot = $PSScriptRoot
$uiRoot = Join-Path $projectRoot "inspection-ui"
$python = Join-Path $projectRoot "venv\Scripts\python.exe"

$localIp = (
    ipconfig |
        Select-String "IPv4" |
        ForEach-Object { ($_ -split ":")[-1].Trim() } |
        Where-Object { $_ -and $_ -notlike "127.*" } |
        Select-Object -First 1
)

Start-Process powershell.exe `
    -ArgumentList "-NoExit", "-Command", "& '$python' -m uvicorn main:app --reload --host 0.0.0.0 --port 8000" `
    -WorkingDirectory $projectRoot

Start-Process powershell.exe `
    -ArgumentList "-NoExit", "-Command", "npm.cmd run dev" `
    -WorkingDirectory $uiRoot

Write-Host ""
Write-Host "Inspection Co-Pilot is starting."
Write-Host "Desktop: http://localhost:5173/"

if ($localIp) {
    Write-Host "Phone or tablet: http://${localIp}:5173/"
    Write-Host "Use a device connected to the same Wi-Fi network."
} else {
    Write-Host "Could not detect a local-network address. Use this computer's IPv4 address with port 5173."
}

Write-Host ""
Write-Host "Keep the two service windows open during the inspection."
