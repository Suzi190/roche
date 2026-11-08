# 用 d:\roche\pwa-icon.png 生成 Android 全套图标（不用 Android Studio / ImageMagick）
#   powershell -ExecutionPolicy Bypass -File d:\roche\apk\make-icons.ps1
param(
  [string]$Source = 'd:\roche\pwa-icon.png'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$res = 'd:\roche\apk\android\app\src\main\res'
if (-not (Test-Path $Source)) { throw "找不到图标源文件: $Source" }
if (-not (Test-Path $res)) { throw "找不到 res 目录: $res" }

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
Write-Host "源图标: $($src.Width)x$($src.Height) $($src.PixelFormat)"

# 采样左上角像素，作为自适应图标的背景色（渐变/纯色底都能贴合）
$probe = New-Object System.Drawing.Bitmap 1, 1
$pg = [System.Drawing.Graphics]::FromImage($probe)
$pg.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, 1, 1), (New-Object System.Drawing.Rectangle 0, 0, 8, 8), 'Pixel')
$pg.Dispose()
$bgPixel = $probe.GetPixel(0, 0)
$probe.Dispose()
$bgHex = '#{0:X2}{1:X2}{2:X2}' -f $bgPixel.R, $bgPixel.G, $bgPixel.B
Write-Host "自适应图标背景色: $bgHex"

function New-RoundedPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [double]$scale, [string]$shape) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $inner = [int][Math]::Round($size * $scale)
  $off = [int](($size - $inner) / 2)

  if ($shape -eq 'circle') {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($off, $off, $inner, $inner)
    $g.SetClip($path)
  } elseif ($shape -eq 'rounded') {
    $r = [int][Math]::Round($inner * 0.22)
    $g.SetClip((New-RoundedPath $off $off $inner $inner $r))
  }

  $g.DrawImage($src, $off, $off, $inner, $inner)
  $g.Dispose()
  return $bmp
}

function Save-Icon($bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$map = @{
  'mdpi'    = @{ launcher = 48;  fg = 108 }
  'hdpi'    = @{ launcher = 72;  fg = 162 }
  'xhdpi'   = @{ launcher = 96;  fg = 216 }
  'xxhdpi'  = @{ launcher = 144; fg = 324 }
  'xxxhdpi' = @{ launcher = 192; fg = 432 }
}

foreach ($density in $map.Keys) {
  $sizes = $map[$density]
  $dir = Join-Path $res "mipmap-$density"
  Save-Icon (New-Icon $sizes.launcher 1.0 'rounded') (Join-Path $dir 'ic_launcher.png')
  Save-Icon (New-Icon $sizes.launcher 1.0 'circle') (Join-Path $dir 'ic_launcher_round.png')
  # 自适应图标前景：108dp 画布，图标占 66%（安全区）
  Save-Icon (New-Icon $sizes.fg 0.66 'none') (Join-Path $dir 'ic_launcher_foreground.png')
  Write-Host "  mipmap-$density 完成"
}

# 自适应图标背景色
$bgFile = Join-Path $res 'values\ic_launcher_background.xml'
@"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$bgHex</color>
</resources>
"@ | Set-Content -Path $bgFile -Encoding UTF8

$src.Dispose()
Write-Host "`n完成：图标已写入 $res\mipmap-*" -ForegroundColor Green
