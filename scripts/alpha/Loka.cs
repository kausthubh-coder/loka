// Loka.exe, the portable alpha's launcher: starts the browser in app\ with the Loka sidebar and Loka's own profile,
// so it never shares a profile with Helium, Chrome or a dev build. Built by scripts/package_alpha.mjs with the C#
// compiler that ships in Windows (.NET Framework 4), so packaging needs no Visual Studio.

using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

static class Loka
{
	// Helium's updater would read Helium's feed and offer to replace Loka with Helium. This points it at Loka's own
	// feed instead, which doesn't exist yet, so the alpha doesn't update itself; new builds come from GitHub releases.
	const string UpdateFeed = "https://raw.githubusercontent.com/kausthubh-coder/loka/main/updates/";

	[STAThread]
	static int Main(string[] args)
	{
		string root = AppDomain.CurrentDomain.BaseDirectory;
		string app = Path.Combine(root, "app");
		string chrome = Path.Combine(app, "chrome.exe");
		string profile = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Loka", "User Data");

		if (!File.Exists(chrome))
		{
			MessageBox.Show("Loka's files are missing: " + chrome + "\n\nUnzip the whole download and run Loka.exe from it.",
				"Loka", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return 1;
		}

		var flags = new[]
		{
			"--user-data-dir=" + profile,
			"--load-extension=" + Path.Combine(app, "loka-sidebar"),
			"--custom-update-server-url=" + UpdateFeed,
		}.Concat(args);

		try
		{
			Process.Start(new ProcessStartInfo(chrome, string.Join(" ", flags.Select(Quote)))
			{
				UseShellExecute = false,
				WorkingDirectory = app,
			});
			return 0;
		}
		catch (Exception e)
		{
			MessageBox.Show("Loka couldn't start: " + e.Message, "Loka", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return 1;
		}
	}

	/// Quotes one argument for Windows' command-line parser: around spaces, with inner quotes and the backslashes
	/// before them escaped.
	static string Quote(string arg)
	{
		if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return arg;
		var sb = new System.Text.StringBuilder("\"");
		int slashes = 0;
		foreach (char c in arg)
		{
			if (c == '\\') { slashes++; continue; }
			if (c == '"') sb.Append('\\', slashes * 2 + 1);
			else sb.Append('\\', slashes);
			slashes = 0;
			sb.Append(c);
		}
		sb.Append('\\', slashes * 2);
		return sb.Append('"').ToString();
	}
}
