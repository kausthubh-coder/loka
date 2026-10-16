# Asks a browser window what Windows asks before every real mouse event (WM_NCHITTEST) at client points.
#   powershell -File scripts/window-hittest.ps1 -ProcId <browser pid> -Points "x,y;x,y"   (client px, physical:
#   CSS px times devicePixelRatio)
# Prints one number per point: 1 is the page (HTCLIENT), 2 the title bar (HTCAPTION), 0 nowhere. A sidebar point
# answering 2 gets no hover and turns every click into a window drag.
param([int]$ProcId, [string]$Points)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class LokaHit {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  public struct POINT { public int X, Y; }
}
"@
# Physical pixels, like the browser: without this Windows scales the points of a DPI-unaware PowerShell by the
# display's scale, and at 125% a point near the bottom of the sidebar lands below the window.
[LokaHit]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
$h = (Get-Process -Id $ProcId).MainWindowHandle
if ($h -eq 0) { "no window"; exit 1 }
foreach ($pt in $Points.Split(";")) {
  $xy = $pt.Split(",")
  $p = New-Object LokaHit+POINT
  $p.X = [int]$xy[0]; $p.Y = [int]$xy[1]
  [LokaHit]::ClientToScreen($h, [ref]$p) | Out-Null
  $l = [IntPtr]((($p.Y -band 0xFFFF) -shl 16) -bor ($p.X -band 0xFFFF))
  [LokaHit]::SendMessage($h, 0x0084, [IntPtr]0, $l).ToInt32()
}
