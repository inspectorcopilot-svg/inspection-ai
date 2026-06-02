$projectRoot = $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$pilotConfigPath = Join-Path $projectRoot "users\local_user\pilot_config.json"

if (-not (Test-Path $pilotConfigPath)) {
    $credential = Get-Credential `
        -UserName "pilot_inspector" `
        -Message "Choose the local Inspection Co-Pilot pilot login."

    if ($credential) {
        @{
            username = $credential.UserName
            password = $credential.GetNetworkCredential().Password
        } |
            ConvertTo-Json |
            Set-Content -Path $pilotConfigPath -Encoding UTF8
    }
}

function New-InspectionShortcut {
    param(
        [string]$Name,
        [string]$ScriptPath
    )

    $shortcutPath = Join-Path $desktop "$Name.lnk"
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
    $shortcut.Save()
}

New-InspectionShortcut `
    -Name "Inspection Co-Pilot" `
    -ScriptPath (Join-Path $projectRoot "launch-inspection-copilot.ps1")

New-InspectionShortcut `
    -Name "Stop Inspection Co-Pilot" `
    -ScriptPath (Join-Path $projectRoot "stop-inspection-copilot.ps1")

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
    "Inspection Co-Pilot is installed. Open it from the new desktop shortcut. No terminal commands are required.",
    "Inspection Co-Pilot"
) | Out-Null
