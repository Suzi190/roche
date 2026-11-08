#requires -Version 5.1
<#
  从国内镜像下载便携工具链（支持断点续传，可反复运行）
    D:\roche\tools\jdk21.zip          OpenJDK 21 Windows x64   (~192 MB)
    D:\roche\tools\cmdline-tools.zip  Android cmdline-tools    (~146.5 MB)
#>
$ErrorActionPreference = 'Continue'

$Tools = 'D:\roche\tools'
New-Item -ItemType Directory -Force -Path $Tools | Out-Null

$jobs = @(
  @{
    Name   = 'jdk21.zip'
    Url    = 'https://mirrors.huaweicloud.com/openjdk/21.0.2/openjdk-21.0.2_windows-x64_bin.zip'
    Expect = 192MB
  },
  @{
    Name   = 'cmdline-tools.zip'
    Url    = 'https://mirrors.cloud.tencent.com/AndroidSDK/commandlinetools-win-11076708_latest.zip'
    Expect = 146.5MB
  }
)

foreach ($j in $jobs) {
  $dst = Join-Path $Tools $j.Name
  $size = if (Test-Path $dst) { (Get-Item $dst).Length } else { 0 }
  if ($size -ge [int64]($j.Expect * 0.995)) {
    Write-Host "[$($j.Name)] 已完整 ($([math]::Round($size/1MB,1)) MB)，跳过"
    continue
  }
  Write-Host "[$($j.Name)] 从 $([math]::Round($size/1MB,1)) MB 处续传 ..."
  # -C - 续传；--retry 断开自动重试
  curl.exe -L -C - --retry 20 --retry-delay 3 --retry-all-errors --connect-timeout 20 `
           -o $dst $j.Url
  $now = (Get-Item $dst).Length
  Write-Host "[$($j.Name)] 现在 $([math]::Round($now/1MB,1)) MB / 约 $([math]::Round($j.Expect/1MB,0)) MB"
}

Write-Host "`n下载完成。下一步："
Write-Host "  powershell -ExecutionPolicy Bypass -File d:\roche\apk\setup-toolchain.ps1"
