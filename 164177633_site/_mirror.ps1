param(
  [string]$Base = 'https://164177633.xyz/',
  [string]$Root = 'd:\roche\164177633_site\site',
  [int]$MaxFiles = 400
)

$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

New-Item -ItemType Directory -Force -Path $Root | Out-Null
$logPath = 'd:\roche\164177633_site\_mirror.log'
if (Test-Path $logPath) { Remove-Item $logPath -Force }
function Log([string]$s) {
  Write-Host $s
  Add-Content -LiteralPath $logPath -Value $s -Encoding UTF8
}

$extList = 'js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|json|webmanifest|wasm|mp3|mp4|webm|txt|xml|map'
$script:re = [regex]::new("[A-Za-z0-9_\-\./\\]+\.($extList)(?![A-Za-z0-9])", 'IgnoreCase')

$queue   = [System.Collections.Generic.Queue[string]]::new()
$seen    = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$okCount = 0
$fail    = New-Object System.Collections.ArrayList

function Seed([string]$p) {
  if (-not $p) { return }
  $p = $p.Trim() -replace '\\', '/'
  if ($p -match '^(https?:)?//') { return }
  $p = $p.TrimStart('.', '/')
  $p = ($p -split '[?#]')[0]
  if (-not $p) { return }
  if ($seen.Add($p)) { $queue.Enqueue($p) }
}

'index.html','location-override-fix.js','native-push-bridge.js','registerSW.js','manifest.webmanifest','pwa-icon.png','sw.js',
'assets/index-Bln7eOH8.js','assets/index-DKqPGtwn.css','assets/db-layer-CDcFHN6B.js',
'assets/vue-vendor--2_S-kdx.js','assets/ai-core-BB-N4fjb.js' | ForEach-Object { Seed $_ }

while ($queue.Count -gt 0 -and $okCount -lt $MaxFiles) {
  $rel = $queue.Dequeue()
  $url = $Base + $rel
  $out = Join-Path $Root ($rel -replace '/', '\')
  $dir = Split-Path $out -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45 -OutFile $out -ErrorAction Stop
    $len = (Get-Item -LiteralPath $out).Length
    $okCount++
    Log ("OK   {0,9}  {1}" -f $len, $rel)
  } catch {
    [void]$fail.Add($rel)
    Log ("FAIL              {0}  -- {1}" -f $rel, $_.Exception.Message)
    if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }
    continue
  }

  if ($rel -match '\.(js|mjs|css|html|json|webmanifest|map)$') {
    try {
      $text = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
      foreach ($m in $script:re.Matches($text)) { Seed $m.Value }
    } catch { Log ("SCANFAIL          {0}" -f $rel) }
  }
}

Log ''
Log "==== downloaded=$okCount  refs_seen=$($seen.Count)  failed=$($fail.Count) ===="
if ($fail.Count) { Log ('FAILED -> ' + ($fail -join ', ')) }

