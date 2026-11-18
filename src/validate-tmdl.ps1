param(
  [Parameter(Mandatory = $true)]
  [string]$ModelFolder
)

$ErrorActionPreference = 'Stop'

$dll = $null
$process = Get-Process PBIDesktop -ErrorAction SilentlyContinue | Select-Object -First 1
if ($process -and $process.Path) {
  $candidate = Join-Path (Split-Path $process.Path) 'Microsoft.PowerBI.Tabular.dll'
  if (Test-Path $candidate) { $dll = $candidate }
}

if (-not $dll) {
  $package = Get-AppxPackage -Name Microsoft.MicrosoftPowerBIDesktop -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if ($package -and $package.InstallLocation) {
    $candidate = Join-Path $package.InstallLocation 'bin\Microsoft.PowerBI.Tabular.dll'
    if (Test-Path $candidate) { $dll = $candidate }
  }
}

if (-not $dll) {
  $standard = 'C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.Tabular.dll'
  if (Test-Path $standard) { $dll = $standard }
}

if (-not $dll) {
  @{ ok = $false; skipped = $true; reason = 'Power BI Desktop was not found' } | ConvertTo-Json -Compress
  exit 0
}

try {
  Add-Type -Path $dll
  $model = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeModelFromFolder($ModelFolder)
  @{
    ok = $true
    tables = $model.Tables.Count
    relationships = $model.Relationships.Count
  } | ConvertTo-Json -Compress
} catch {
  @{
    ok = $false
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress
}
