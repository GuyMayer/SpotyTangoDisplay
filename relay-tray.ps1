Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Singleton guard - only one instance allowed
$mutexName = "Global\SpotyTangoDisplayRelay"
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $mutex.WaitOne(0)) {
    [System.Windows.Forms.MessageBox]::Show(
        "SpotyTangoDisplay is already running.`nCheck the system tray.",
        "Already Running",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    exit
}

Set-Location $PSScriptRoot

# Start relay.js hidden
$relay = Start-Process `
    -FilePath "node" `
    -ArgumentList "relay.js" `
    -WorkingDirectory $PSScriptRoot `
    -PassThru `
    -WindowStyle Hidden

# Build a simple tray icon (16x16 purple square with white T)
$bmp = New-Object System.Drawing.Bitmap 16, 16
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::Purple, 0, 0, 16, 16)
$font = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Bold)
$g.DrawString("T", $font, [System.Drawing.Brushes]::White, 2, 1)
$g.Dispose()
$hIcon = $bmp.GetHicon()
$icon  = [System.Drawing.Icon]::FromHandle($hIcon)

# Tray icon
$tray         = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon    = $icon
$tray.Text    = "SpotyTangoDisplay - running on port 3456"
$tray.Visible = $true

# Context menu
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openItem.Text = "Open Control Panel"
$openItem.Font = New-Object System.Drawing.Font($openItem.Font, [System.Drawing.FontStyle]::Bold)
$openItem.Add_Click({ Start-Process "http://localhost:3456/" })

$sep = New-Object System.Windows.Forms.ToolStripSeparator

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Exit"
$exitItem.Add_Click({
    $tray.Visible = $false
    if ($relay -and -not $relay.HasExited) {
        Stop-Process -Id $relay.Id -Force -ErrorAction SilentlyContinue
    }
    $mutex.ReleaseMutex()
    [System.Windows.Forms.Application]::Exit()
})

$menu.Items.Add($openItem) | Out-Null
$menu.Items.Add($sep)      | Out-Null
$menu.Items.Add($exitItem) | Out-Null

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ Start-Process "http://localhost:3456/" })

# Balloon tip on startup
$tray.ShowBalloonTip(3000, "SpotyTangoDisplay", "Relay running - double-click to open.", [System.Windows.Forms.ToolTipIcon]::Info)

# Open browser after 1.5s
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
    $timer.Stop()
    Start-Process "http://localhost:3456/"
})
$timer.Start()

# Run message loop
[System.Windows.Forms.Application]::Run()
