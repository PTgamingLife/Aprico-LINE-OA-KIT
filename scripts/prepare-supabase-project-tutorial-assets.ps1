param(
 [Parameter(Mandatory=$true)][string]$SettingsScreenshot,
 [Parameter(Mandatory=$true)][string]$SettingsNavigationScreenshot,
 [Parameter(Mandatory=$true)][string]$FunctionsNavigationScreenshot,
 [Parameter(Mandatory=$true)][string]$ProjectsScreenshot,
 [Parameter(Mandatory=$true)][string]$FunctionsScreenshot,
 [Parameter(Mandatory=$true)][string]$SecretsScreenshot
)
# Same user-approved workflow as the Token captures: crop original pixels only.
# Originals, browser chrome, account header, usage and existing functions/secrets
# never enter public assets. The example project ID is a public project address.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$assetDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/tutorials/real'))
if (!(Test-Path -LiteralPath $assetDir -PathType Container)) { throw 'Asset directory not found' }
$shots=@(
 @{Source=$SettingsNavigationScreenshot;Name='supabase-project-settings-nav.png';X=8;Y=210;W=245;H=700},
 @{Source=$SettingsScreenshot;Name='supabase-general-nav.png';X=60;Y=210;W=320;H=200},
 @{Source=$SettingsScreenshot;Name='supabase-project-id.png';X=710;Y=550;W=860;H=90},
 @{Source=$FunctionsNavigationScreenshot;Name='supabase-functions-nav.png';X=8;Y=210;W=245;H=700},
 @{Source=$ProjectsScreenshot;Name='supabase-projects-toolbar.png';X=250;Y=260;W=1050;H=150},
 @{Source=$ProjectsScreenshot;Name='supabase-project-example-card.png';X=610;Y=420;W=330;H=220},
 @{Source=$FunctionsScreenshot;Name='supabase-functions-secrets-nav.png';X=60;Y=210;W=320;H=200},
 @{Source=$SecretsScreenshot;Name='supabase-secrets-empty-form.png';X=420;Y=270;W=1440;H=480}
)
foreach($shot in $shots){
 $original=[Drawing.Bitmap]::new([IO.Path]::GetFullPath($shot.Source))
 try{
  if($original.Width -ne 1920 -or $original.Height -notin @(1080,931)){throw 'Unexpected screenshot size; review crop boundaries first'}
  $rect=[Drawing.Rectangle]::new($shot.X,$shot.Y,$shot.W,$shot.H)
  $crop=$original.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try{$crop.Save((Join-Path $assetDir $shot.Name),[Drawing.Imaging.ImageFormat]::Png)}finally{$crop.Dispose()}
  [pscustomobject]@{Asset=$shot.Name;Width=$shot.W;Height=$shot.H}
 }finally{$original.Dispose()}
}
