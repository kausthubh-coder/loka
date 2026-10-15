# Lists a process's visible top-level windows ("WINDOW:<title>" lines) and, with -Out, saves the pixels of the first
# one whose title contains -Match (else the first one) with PrintWindow, which works without bringing it to the front.
# Used by verify-browser.mjs.
#   powershell -NoProfile -File scripts/window.ps1 -ProcId <pid> [-Out <file.png>] [-Match <text>]
param([int]$ProcId, [string]$Out = "", [string]$Match = "")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public class LokaWindow {
	public delegate bool EnumProc(IntPtr h, IntPtr p);
	[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
	[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
	[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
	[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
	[DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
	public struct RECT { public int L, T, R, B; }
	public static List<KeyValuePair<IntPtr, string>> Of(uint target) {
		var found = new List<KeyValuePair<IntPtr, string>>();
		EnumWindows((h, p) => {
			uint pid; GetWindowThreadProcessId(h, out pid);
			if (pid != target || !IsWindowVisible(h)) return true;
			var s = new StringBuilder(512); GetWindowText(h, s, 512);
			if (s.Length > 0) found.Add(new KeyValuePair<IntPtr, string>(h, s.ToString()));
			return true;
		}, IntPtr.Zero);
		return found;
	}
}
"@
$windows = [LokaWindow]::Of([uint32]$ProcId)
if ($windows.Count -eq 0) { Write-Output "NO-WINDOW"; exit 1 }
foreach ($w in $windows) { Write-Output "WINDOW:$($w.Value)" }
if ($Out -ne "") {
	$pick = $windows | Where-Object { $Match -ne "" -and $_.Value.Contains($Match) } | Select-Object -First 1
	if ($null -eq $pick) { $pick = $windows[0] }
	$r = New-Object LokaWindow+RECT
	[LokaWindow]::GetWindowRect($pick.Key, [ref]$r) | Out-Null
	$bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$dc = $g.GetHdc()
	# 2 = PW_RENDERFULLCONTENT, which Chromium's GPU-drawn windows need.
	[LokaWindow]::PrintWindow($pick.Key, $dc, 2) | Out-Null
	$g.ReleaseHdc($dc)
	$bmp.Save($Out)
	Write-Output "SHOT:$($pick.Value) ($($r.R - $r.L)x$($r.B - $r.T))"
}
