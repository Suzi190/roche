param(
  [ValidateSet('site', 'readable')]
  [string]$Source = 'site'
)

# 把镜像下来的前端产物同步到 Capacitor 的 www 目录，并注入原生壳补丁
#   site     = 线上原始压缩产物（默认，最保险）
#   readable = prettier 反美化后的版本（便于二改，语法已验证 80/80 通过）

$ErrorActionPreference = 'Stop'

$map = @{
  'site'     = 'd:\roche\164177633_site\site'
  'readable' = 'd:\roche\164177633_site\readable'
}
$src = $map[$Source]
$dst = 'd:\roche\apk\www'

if (-not (Test-Path (Join-Path $src 'index.html'))) {
  throw "源目录缺少 index.html: $src"
}

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 失败，退出码 $LASTEXITCODE" }

# ---------- 注入 apk-shell.js（全屏安全区 / 返回手势 / 导入导出兜底） ----------
$shellSrc = Join-Path $PSScriptRoot 'shell\apk-shell.js'
if (-not (Test-Path $shellSrc)) { throw "缺少 $shellSrc" }
Copy-Item $shellSrc (Join-Path $dst 'apk-shell.js') -Force

$indexPath = Join-Path $dst 'index.html'
$html = [System.IO.File]::ReadAllText($indexPath)
if ($html -notmatch 'apk-shell\.js') {
  $tag = "<script src=`"./apk-shell.js`"></script>`r`n  "
  $anchor = $html.IndexOf('<script type="module"')
  if ($anchor -lt 0) { throw 'index.html 里找不到 <script type="module">，无法注入 apk-shell.js' }
  $html = $html.Insert($anchor, $tag)
  [System.IO.File]::WriteAllText($indexPath, $html, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host '已注入 apk-shell.js'
} else {
  Write-Host 'apk-shell.js 已存在，跳过注入'
}

$files = (Get-ChildItem $dst -Recurse -File).Count
Write-Host "已同步 $Source -> www （$files 个文件）"
Write-Host "下一步：npm run check  然后  npm run sync"

