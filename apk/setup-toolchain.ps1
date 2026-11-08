#requires -Version 5.1
<#
  一次性工具链安装 + 出包脚本（全部装在 D:\roche\tools，不写系统目录、不需要管理员）

  前置：以下两个文件已下载到 D:\roche\tools\
    jdk21.zip          OpenJDK 21 Windows x64
    cmdline-tools.zip  Android SDK Command-line Tools

  用法：
    powershell -ExecutionPolicy Bypass -File setup-toolchain.ps1
    powershell -ExecutionPolicy Bypass -File setup-toolchain.ps1 -SkipBuild   # 只装环境
#>
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$Tools   = 'D:\roche\tools'
$JdkDir  = Join-Path $Tools 'jdk21'
$SdkDir  = Join-Path $Tools 'android-sdk'
$Proj    = 'D:\roche\apk'
$Android = Join-Path $Proj 'android'

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# ---------- 1. JDK ----------
Step '1/6 JDK 21'
if (-not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
  $zip = Join-Path $Tools 'jdk21.zip'
  if (-not (Test-Path $zip)) { throw "缺少 $zip" }
  Write-Host "解压 $zip ..."
  if (Test-Path $JdkDir) { Remove-Item $JdkDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $JdkDir | Out-Null
  tar.exe -xf $zip -C $JdkDir
  # zip 内可能带一层目录，压平
  $inner = Get-ChildItem $JdkDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') }
  if ($inner -and -not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
    Get-ChildItem $inner.FullName -Force | Move-Item -Destination $JdkDir -Force
    Remove-Item $inner.FullName -Recurse -Force
  }
}
$env:JAVA_HOME = $JdkDir
$env:PATH = (Join-Path $JdkDir 'bin') + ';' + $env:PATH
& (Join-Path $JdkDir 'bin\java.exe') -version 2>&1 | ForEach-Object { Write-Host "  $_" }

# ---------- 2. cmdline-tools ----------
Step '2/6 Android cmdline-tools'
$latest = Join-Path $SdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $latest)) {
  $zip = Join-Path $Tools 'cmdline-tools.zip'
  if (-not (Test-Path $zip)) { throw "缺少 $zip" }
  $tmp = Join-Path $Tools '_ct'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Write-Host "解压 $zip ..."
  tar.exe -xf $zip -C $tmp
  New-Item -ItemType Directory -Force -Path (Join-Path $SdkDir 'cmdline-tools') | Out-Null
  $src = Join-Path $tmp 'cmdline-tools'
  if (-not (Test-Path $src)) { $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName }
  if (Test-Path (Join-Path $SdkDir 'cmdline-tools\latest')) { Remove-Item (Join-Path $SdkDir 'cmdline-tools\latest') -Recurse -Force }
  Move-Item $src (Join-Path $SdkDir 'cmdline-tools\latest')
  Remove-Item $tmp -Recurse -Force
}
$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir

# ---------- 3. SDK 组件 ----------
Step '3/6 安装 SDK 组件（platform-tools / android-35 / build-tools 35）'
$sb = ('y' + [Environment]::NewLine) * 200
$sb | & $latest --sdk_root=$SdkDir --licenses 2>&1 | Select-Object -Last 3
& $latest --sdk_root=$SdkDir "platform-tools" "platforms;android-35" "build-tools;35.0.0" 2>&1 | Select-Object -Last 8

# ---------- 4. local.properties ----------
Step '4/6 写入 local.properties'
$sdkEsc = $SdkDir.Replace('\', '\\')
Set-Content -Path (Join-Path $Android 'local.properties') -Value "sdk.dir=$sdkEsc" -Encoding ASCII
Get-Content (Join-Path $Android 'local.properties')

# ---------- 5. build ----------
if ($SkipBuild) { Step '5/6 跳过构建'; exit 0 }

Step '5/6 cap sync'
Push-Location $Proj
try {
  node check-web.mjs
  npx cap sync android
} finally { Pop-Location }

Step '6/6 gradlew assembleDebug（首次会下 Gradle + 依赖，较慢）'
$env:GRADLE_USER_HOME = Join-Path $Tools 'gradle-home'
Push-Location $Android
try {
  & '.\gradlew.bat' assembleDebug --no-daemon
  $apk = Get-ChildItem 'app\build\outputs\apk\debug\*.apk' -ErrorAction SilentlyContinue
  if ($apk) {
    Write-Host "`n构建成功：" -ForegroundColor Green
    $apk | ForEach-Object { Write-Host ("  {0}  ({1:N1} MB)" -f $_.FullName, ($_.Length / 1MB)) }
    Write-Host "`n安装到手机：adb install -r `"$($apk[0].FullName)`""
  } else {
    Write-Host '未找到 APK，请检查上面的 gradle 输出' -ForegroundColor Yellow
  }
} finally { Pop-Location }
