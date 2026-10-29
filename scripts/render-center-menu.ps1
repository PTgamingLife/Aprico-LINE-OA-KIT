param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
if(Test-Path -LiteralPath $OutputPath){throw 'Output already exists; keep the existing image'}
$bitmap=[Drawing.Bitmap]::new(1200,810)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([Drawing.ColorTranslator]::FromHtml('#fffef9'))
$colors=@('#BDD0BE','#DDD5BC','#B9CCCF','#D4C2B8','#C9C1D6','#E7C5A8')
$titles=@("打造我的`nLINE OA","開始建置","查看其他使用者`n的使用方式","聯絡專員","AI 官方內容`n中文版教學","小遊戲專區")
$subtitles=@('把點子變成互動','一步一步完成','看看別人怎麼玩','聊聊你的想法','輕鬆學會 AI','休息一下，玩一局')
$ink=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#294337'))
$soft=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(150,255,254,249))
$font=[Drawing.Font]::new('Microsoft JhengHei',25,[Drawing.FontStyle]::Bold)
$small=[Drawing.Font]::new('Microsoft JhengHei',14)
$number=[Drawing.Font]::new('Arial',21,[Drawing.FontStyle]::Bold)
$format=[Drawing.StringFormat]::new()
$format.Alignment=[Drawing.StringAlignment]::Center
$format.LineAlignment=[Drawing.StringAlignment]::Center
try{
 for($i=0;$i -lt 6;$i++){
  $x=($i%3)*400;$y=[Math]::Floor($i/3)*405
  $brush=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($colors[$i]))
  $graphics.FillRectangle($brush,$x+4,$y+4,392,397);$brush.Dispose()
  $graphics.FillEllipse($soft,$x+163,$y+48,74,74)
  $graphics.DrawString(('{0:D2}' -f ($i+1)),$number,$ink,[Drawing.RectangleF]::new($x+163,$y+48,74,74),$format)
  $graphics.DrawString($titles[$i],$font,$ink,[Drawing.RectangleF]::new($x+20,$y+143,360,132),$format)
  $graphics.DrawString($subtitles[$i],$small,$ink,[Drawing.RectangleF]::new($x+20,$y+305,360,45),$format)
 }
 $bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)
}finally{$graphics.Dispose();$bitmap.Dispose();$ink.Dispose();$soft.Dispose();$font.Dispose();$small.Dispose();$number.Dispose();$format.Dispose()}
Get-Item -LiteralPath $OutputPath | Select-Object FullName,Length
