$projectRoot = $PSScriptRoot
$uiDist = Join-Path $projectRoot "inspection-ui\dist"
$python = Join-Path $projectRoot "venv\Scripts\python.exe"
$logRoot = Join-Path $projectRoot "logs"
$pidPath = Join-Path $projectRoot ".inspection-copilot-pids.json"

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Test-LocalPort {
    param([int]$Port)

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Path $python)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Inspection Co-Pilot could not find its local runtime. Please reinstall the app.",
        "Inspection Co-Pilot"
    ) | Out-Null
    exit 1
}

if (-not (Test-Path $uiDist)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Inspection Co-Pilot could not find its built interface. Please reinstall the app.",
        "Inspection Co-Pilot"
    ) | Out-Null
    exit 1
}

$processIds = @{}

if (-not (Test-LocalPort -Port 8000)) {
    $backend = Start-Process `
        -FilePath $python `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000") `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logRoot "backend.log") `
        -RedirectStandardError (Join-Path $logRoot "backend-error.log") `
        -PassThru

    $processIds.backend = $backend.Id
}

if (-not (Test-LocalPort -Port 5173)) {
    $frontend = Start-Process `
        -FilePath $python `
        -ArgumentList @("-m", "http.server", "5173", "--bind", "0.0.0.0", "--directory", $uiDist) `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logRoot "frontend.log") `
        -RedirectStandardError (Join-Path $logRoot "frontend-error.log") `
        -PassThru

    $processIds.frontend = $frontend.Id
}

if ($processIds.Count -gt 0) {
    $processIds | ConvertTo-Json | Set-Content -Path $pidPath -Encoding UTF8
}

$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    if ((Test-LocalPort -Port 5173) -and (Test-LocalPort -Port 8000)) {
        Start-Process "http://localhost:5173/"
        exit 0
    }

    Start-Sleep -Milliseconds 500
}

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "Inspection Co-Pilot could not finish starting. Please contact the pilot administrator.",
    "Inspection Co-Pilot"
) | Out-Null
exit 1
