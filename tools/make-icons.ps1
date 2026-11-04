# 生成插件图标：蓝底白色的「树」形图案，输出到 extension\icons
# 用法：powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\extension\icons'
New-Item -ItemType Directory -Force $out | Out-Null

foreach ($s in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # 圆角背景
  $r = $s * 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
  $path.AddArc($s - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($s - 2 * $r, $s - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $path.AddArc(0, $s - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))), $path)

  # 树枝
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.4, $s * 0.085))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $x0 = $s * 0.31
  $g.DrawLine($pen, $x0, $s * 0.30, $x0, $s * 0.72)
  $g.DrawLine($pen, $x0, $s * 0.50, $s * 0.62, $s * 0.50)
  $g.DrawLine($pen, $x0, $s * 0.72, $s * 0.62, $s * 0.72)

  # 节点
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $d = [Math]::Max(3.2, $s * 0.2)
  foreach ($p in @(@(0.31, 0.27), @(0.69, 0.50), @(0.69, 0.72))) {
    $g.FillEllipse($white, $s * $p[0] - $d / 2, $s * $p[1] - $d / 2, $d, $d)
  }

  $bmp.Save((Join-Path $out "icon$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
Write-Output "icons written to $out"
