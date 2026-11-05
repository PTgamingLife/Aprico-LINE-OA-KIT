param(
 [Parameter(Mandatory=$true)][string]$EntryScreenshot,
 [Parameter(Mandatory=$true)][string]$ScopeScreenshot,
 [Parameter(Mandatory=$true)][string]$PermissionsScreenshot
)
# Deterministic cropping only; never copies a full source screenshot to public/.
# Run only with explicit permission to crop the supplied screenshots locally.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/tutorials/real'))
if (!(Test-Path -LiteralPath $assetDir -PathType Container)) { throw 'Asset directory not found' }
$shots = @(
 @{Source=$EntryScreenshot; Name='supabase-token-entry.png'; X=660; Y=250; W=900; H=425},
 @{Source=$ScopeScreenshot; Name='supabase-token-scope.png'; X=928; Y=158; W=978; H=854},
 @{Source=$PermissionsScreenshot; Name='supabase-token-permissions.png'; X=928; Y=158; W=978; H=854}
)
foreach ($shot in $shots) {
 $sourceImage = [Drawing.Bitmap]::new([IO.Path]::GetFullPath($shot.Source))
 try {
  if ($sourceImage.Width -ne 1920 -or $sourceImage.Height -ne 1080) { throw 'Unexpected screenshot size; review crop boundaries first' }
  $rect = [Drawing.Rectangle]::new($shot.X,$shot.Y,$shot.W,$shot.H)
  $cropImage = $sourceImage.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try { $cropImage.Save((Join-Path $assetDir $shot.Name),[Drawing.Imaging.ImageFormat]::Png) }
  finally { $cropImage.Dispose() }
  [pscustomobject]@{Asset=$shot.Name; Width=$shot.W; Height=$shot.H}
 } finally { $sourceImage.Dispose() }
}
