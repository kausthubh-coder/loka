# Posts mouse messages to a browser window, so input takes Chromium's own Win32 path (HWNDMessageHandler, views,
# then the page) instead of CDP's, which starts inside the page. The cursor doesn't move and the window needn't be
# in front, so it is safe on a desktop someone is using.
#   powershell -NoProfile -File scripts/window-input.ps1 -ProcId <browser pid> -Kind <move|click|rclick|drag|down|hold|up> -X <x> -Y <y> [-X2 <x> -Y2 <y>]
# X and Y are client coordinates in DIPs (CSS px at zoom 100%), not physical px: Chromium reads posted messages
# unscaled. down, hold (a move with the left button held) and up are a drag's parts, for a drive that looks between
# them (a user aims again when the list moves). window-hittest.ps1 is the other half of real input: what Windows asks before it sends these.
param([int]$ProcId, [string]$Kind, [int]$X, [int]$Y, [int]$X2 = 0, [int]$Y2 = 0)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class LokaInput { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }
"@
$h = (Get-Process -Id $ProcId).MainWindowHandle
if ($h -eq 0) { "no window"; exit 1 }
function At($px, $py) { [IntPtr]((([int]$py -band 0xFFFF) -shl 16) -bor ([int]$px -band 0xFFFF)) }
function Post($msg, $keys, $px, $py) { [LokaInput]::PostMessage($h, $msg, [IntPtr]$keys, (At $px $py)) | Out-Null }
# WM_MOUSEMOVE 0x200, WM_LBUTTONDOWN 0x201, WM_LBUTTONUP 0x202, WM_RBUTTONDOWN 0x204, WM_RBUTTONUP 0x205;
# wParam 1 is MK_LBUTTON held, 2 MK_RBUTTON.
switch ($Kind) {
  "move" { Post 0x200 0 $X $Y }
  "click" { Post 0x200 0 $X $Y; Start-Sleep -Milliseconds 40; Post 0x201 1 $X $Y; Start-Sleep -Milliseconds 60; Post 0x202 0 $X $Y }
  "rclick" { Post 0x200 0 $X $Y; Start-Sleep -Milliseconds 40; Post 0x204 2 $X $Y; Start-Sleep -Milliseconds 60; Post 0x205 0 $X $Y }
  "drag" {
    Post 0x200 0 $X $Y; Start-Sleep -Milliseconds 40; Post 0x201 1 $X $Y
    for ($i = 1; $i -le 12; $i++) { Start-Sleep -Milliseconds 30; Post 0x200 1 ($X + ($X2 - $X) * $i / 12) ($Y + ($Y2 - $Y) * $i / 12) }
    Start-Sleep -Milliseconds 80; Post 0x202 0 $X2 $Y2
  }
  "down" { Post 0x200 0 $X $Y; Start-Sleep -Milliseconds 40; Post 0x201 1 $X $Y }
  "hold" { Post 0x200 1 $X $Y }
  "up" { Post 0x200 1 $X $Y; Start-Sleep -Milliseconds 40; Post 0x202 0 $X $Y }
  default { "unknown -Kind $Kind (move, click, rclick, drag, down, hold, up)"; exit 1 }
}
"posted"
