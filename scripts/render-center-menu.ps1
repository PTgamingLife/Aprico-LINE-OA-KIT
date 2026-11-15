param([Parameter(Mandatory=$true)][string]$OutputPath,[switch]$Arches,[switch]$Puzzle)
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
# -Puzzle: interlocking jigsaw edges. Each inner edge has one knob: owner tile, target tile,
# direction (0 right, 90 down, 180 left, 270 up) and its position along the owner's edge.
# Knob circle r=30, centre 24px past the edge; tap areas stay the 3x2 rectangles.
$knobs=@(@(0,1,0,202),@(2,1,180,202),@(4,3,180,202),@(4,5,0,202),@(3,0,270,95),@(1,4,90,305),@(5,2,270,95))
function Get-Knob($k){
 $ox=($k[0]%3)*400;$oy=[Math]::Floor($k[0]/3)*405;$tx=($k[1]%3)*400;$ty=[Math]::Floor($k[1]/3)*405
 $sign=if($k[2] -in 0,90){1}else{-1}
 if($k[2] -in 0,180){$edge=[Math]::Max($ox,$tx);return @{cx=$edge+24*$sign;cy=$oy+$k[3];vertical=$true;edge=$edge;from=$oy}}
 $edge=[Math]::Max($oy,$ty);return @{cx=$ox+$k[3];cy=$edge+24*$sign;vertical=$false;edge=$edge;from=$ox}
}
try{
 for($i=0;$i -lt 6;$i++){
  $x=($i%3)*400;$y=[Math]::Floor($i/3)*405
  $brush=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($colors[$i]))
  $region=[Drawing.Region]::new([Drawing.RectangleF]::new($x+4,$y+4,392,397))
  if($Puzzle){
   $region.Dispose();$region=[Drawing.Region]::new([Drawing.RectangleF]::new($x,$y,400,405))
   foreach($k in $knobs){
    if($k[0] -ne $i -and $k[1] -ne $i){continue}
    $n=Get-Knob $k;$circle=[Drawing.Drawing2D.GraphicsPath]::new();$circle.AddEllipse($n.cx-30,$n.cy-30,60,60)
    if($k[0] -eq $i){$region.Union($circle)}else{$region.Exclude($circle)};$circle.Dispose()
   }
  }
  $graphics.FillRegion($brush,$region);$brush.Dispose()
  if($Arches){
   $graphics.SetClip($region)
   $pen=[Drawing.Pen]::new([Drawing.Color]::FromArgb(32,41,67,55),1.8)
   try{
    for($row=-1;$row -lt 5;$row++){
     for($col=-1;$col -lt 5;$col++){
      $tx=$x+$col*96;$ty=$y+$row*96
      foreach($inset in @(6,20,34)){
       $diameter=84-2*($inset-6);$left=$tx+$inset;$top=$ty+8+($inset-6)
       $graphics.DrawArc($pen,$left,$top,$diameter,$diameter,180,180)
       $mid=$top+$diameter/2
       $graphics.DrawLine($pen,$left,$mid,$left,$ty+92)
       $graphics.DrawLine($pen,$left+$diameter,$mid,$left+$diameter,$ty+92)
      }
     }
    }
   }finally{$pen.Dispose();$graphics.ResetClip()}
  }
  $region.Dispose()
  $graphics.FillEllipse($soft,$x+163,$y+48,74,74)
  $graphics.DrawString(('{0:D2}' -f ($i+1)),$number,$ink,[Drawing.RectangleF]::new($x+163,$y+48,74,74),$format)
  $graphics.DrawString($titles[$i],$font,$ink,[Drawing.RectangleF]::new($x+20,$y+143,360,132),$format)
  $graphics.DrawString($subtitles[$i],$small,$ink,[Drawing.RectangleF]::new($x+20,$y+305,360,45),$format)
 }
 if($Puzzle){
  # 8px cream seams: outer frame, inner edges with a gap where each knob crosses, knob arcs.
  $seam=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#fffef9'),8)
  try{
   $graphics.DrawRectangle($seam,0,0,1200,810)
   foreach($k in $knobs){
    $n=Get-Knob $k
    if($n.vertical){$len=405;$at=$n.cy-$n.from}else{$len=400;$at=$n.cx-$n.from}
    foreach($part in @(@(0,($at-18)),@(($at+18),$len))){
     $a=$n.from+$part[0];$b=$n.from+$part[1]
     if($n.vertical){$graphics.DrawLine($seam,$n.edge,$a,$n.edge,$b)}else{$graphics.DrawLine($seam,$a,$n.edge,$b,$n.edge)}
    }
    $graphics.DrawArc($seam,[single]($n.cx-30),[single]($n.cy-30),[single]60,[single]60,[single]($k[2]-143.13),[single]286.26)
   }
  }finally{$seam.Dispose()}
 }
 $bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)
}finally{$graphics.Dispose();$bitmap.Dispose();$ink.Dispose();$soft.Dispose();$font.Dispose();$small.Dispose();$number.Dispose();$format.Dispose()}
Get-Item -LiteralPath $OutputPath | Select-Object FullName,Length
