# 打包扩展为 zip，用于提交 Chrome Web Store / Edge Add-ons
# 用法： powershell -ExecutionPolicy Bypass -File pack.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 必须打包进 zip 的文件（运行所需）
$includeFiles = @(
    "manifest.json",
    "popup.html",
    "popup.css",
    "popup.js",
    "background.js"
)
$includeDirs = @("icons", "lib", "_locales")

# 排除（不上传进扩展包，商店审核不需要）
# - README.md, ATTRIBUTION.md, STORE_LISTING.md  开发文档
# - PRIVACY_POLICY.html                          要单独托管到 URL
# - generate-icons.ps1, pack.ps1                 构建脚本

# 校验必备文件
$missing = @()
foreach ($f in $includeFiles) {
    if (-not (Test-Path (Join-Path $scriptDir $f))) { $missing += $f }
}
foreach ($d in $includeDirs) {
    if (-not (Test-Path (Join-Path $scriptDir $d))) { $missing += "$d/" }
}
if ($missing.Count -gt 0) {
    Write-Host "缺少必需文件：" $missing -ForegroundColor Red
    exit 1
}

# 读取版本号用作 zip 名
$manifest = Get-Content (Join-Path $scriptDir "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$zipName = "web-converter-v$version.zip"
$zipPath = Join-Path $scriptDir $zipName

# 删除旧的 zip
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# 临时打包目录
$tempDir = Join-Path $env:TEMP ("ext_pack_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    # 复制必备文件到临时目录
    foreach ($f in $includeFiles) {
        Copy-Item (Join-Path $scriptDir $f) -Destination $tempDir
    }
    foreach ($d in $includeDirs) {
        Copy-Item (Join-Path $scriptDir $d) -Destination $tempDir -Recurse
    }

    # 打成 zip（临时目录内的内容作为根，不带外层目录）
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)

    Write-Host ""
    Write-Host "打包完成：" -ForegroundColor Green
    Write-Host "  $zipPath"
    Write-Host ""
    Write-Host "包含的文件：" -ForegroundColor Cyan
    Get-ChildItem -Path $tempDir -Recurse | ForEach-Object {
        $rel = $_.FullName.Substring($tempDir.Length + 1)
        Write-Host "  $rel"
    }
    Write-Host ""
    Write-Host "下一步：去开发者控制台上传这个 zip 文件。" -ForegroundColor Yellow
}
finally {
    # 清理临时目录
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
}
