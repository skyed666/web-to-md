# 生成扩展图标 PNG（16/48/128）
# 使用 Windows 自带的 .NET System.Drawing，无需额外依赖
# 用法： powershell -ExecutionPolicy Bypass -File generate-icons.ps1

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir = Join-Path $scriptDir "icons"

if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

function New-Icon {
    param([int]$size)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint= [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 1. 透明背景
    $g.Clear([System.Drawing.Color]::Transparent)

    # 2. 紫色圆角方块（圆角半径按尺寸缩放）
    $radius = [int]($size * 0.22)
    $bgColor = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)  # #4f46e5
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath

    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)                       # 左上
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)               # 右上
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)       # 右下
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)               # 左下
    $path.CloseFigure()

    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillPath($brush, $path)
    $brush.Dispose()

    # 3. 白色字母 "M" 居中
    $fontSize = [int]($size * 0.62)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = [System.Drawing.Brushes]::White

    $strFmt = New-Object System.Drawing.StringFormat
    $strFmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $strFmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    # 微微上移以视觉居中
    $textRect = New-Object System.Drawing.RectangleF(0, -[float]($size * 0.04), $size, $size)
    $g.DrawString("M", $font, $white, $textRect, $strFmt)

    $font.Dispose()
    $g.Dispose()
    return $bmp
}

foreach ($s in 16, 48, 128) {
    $outPath = Join-Path $iconsDir "icon$s.png"
    $icon = New-Icon -size $s
    $icon.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()
    Write-Host "已生成: $outPath"
}

Write-Host "全部图标生成完成。"
