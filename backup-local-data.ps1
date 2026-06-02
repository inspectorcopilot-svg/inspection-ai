$projectRoot = $PSScriptRoot
$backupRoot = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupRoot "inspection-copilot-backup-$timestamp.zip"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$pathsToBackup = @(
    (Join-Path $projectRoot "users"),
    (Join-Path $projectRoot "issue_photos")
) | Where-Object { Test-Path $_ }

if ($pathsToBackup.Count -eq 0) {
    Write-Host "No local Inspection Co-Pilot data was found to back up."
    exit 1
}

Compress-Archive -Path $pathsToBackup -DestinationPath $backupPath -CompressionLevel Optimal

Write-Host ""
Write-Host "Inspection Co-Pilot backup created:"
Write-Host $backupPath
