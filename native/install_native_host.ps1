param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId
)

$hostName = 'com.eyetracker.server'
$scriptDir = $PSScriptRoot
$hostScript = Join-Path $scriptDir 'eyetracker_native_host.py'

$pythonExe = $null
try {
    $pythonExe = & py -3 -c "import sys; print(sys.executable)"
} catch { }
if (-not $pythonExe) {
    try {
        $pythonExe = & python -c "import sys; print(sys.executable)"
    } catch { }
}
if (-not $pythonExe) {
    Write-Error "Python 3 not found. Install Python and ensure it is on PATH."
    exit 1
}

$pythonExe = $pythonExe.Trim()
$cmdPath = Join-Path $scriptDir 'eyetracker_native_host.cmd'
$cmdContent = "@echo off`r`n`"" + $pythonExe + "`" `"" + $hostScript + "`"`r`n"
$cmdContent | Set-Content -Path $cmdPath -Encoding ASCII

$hostPath = (Resolve-Path $cmdPath).Path

$manifest = @{
    name = $hostName
    description = 'EyeTracker local server launcher'
    path = $hostPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifestDir = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\NativeMessagingHosts'
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null

$manifestPath = Join-Path $manifestDir "$hostName.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8

& reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\$hostName" /ve /t REG_SZ /d "$manifestPath" /f | Out-Null
& reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$hostName" /ve /t REG_SZ /d "$manifestPath" /f | Out-Null

Write-Host "Installed native host manifest at $manifestPath"
Write-Host "Registered native host for Chrome and Edge in HKCU"
Write-Host "If Chrome is open, reload the extension before testing."
