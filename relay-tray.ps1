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

$debugItem = New-Object System.Windows.Forms.ToolStripMenuItem
$debugItem.Text = "Debug Info"
$debugItem.Add_Click({
    $pid_  = if ($relay -and -not $relay.HasExited) { $relay.Id } else { "stopped" }
    $portOk = $false
    try {
        $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("127.0.0.1", 3456); $t.Close(); $portOk = $true
    } catch {}
    $ver   = try { (Get-Content "$PSScriptRoot\version.txt" -ErrorAction Stop).Trim() } catch { "unknown" }
    $nodeV = try { (& node --version 2>$null).Trim() } catch { "not found" }
    $msg   = "relay.js PID : $pid_`nPort 3456   : $(if ($portOk) { 'open' } else { 'closed' })`nVersion     : $ver`nNode        : $nodeV`nScriptRoot  : $PSScriptRoot"
    [System.Windows.Forms.MessageBox]::Show($msg, "SpotyTangoDisplay Debug", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
})

$sep2 = New-Object System.Windows.Forms.ToolStripSeparator

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
$menu.Items.Add($debugItem) | Out-Null
$menu.Items.Add($sep2)     | Out-Null
$menu.Items.Add($exitItem) | Out-Null

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ Start-Process "http://localhost:3456/" })

# Balloon tip on startup
$tray.ShowBalloonTip(3000, "SpotyTangoDisplay", "Relay running - double-click to open.", [System.Windows.Forms.ToolTipIcon]::Info)

# Open browser once relay is actually accepting connections (poll port 3456)
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 3456)
        $tcp.Close()
        $timer.Stop()
        Start-Process "http://localhost:3456/"
    } catch {
        # not ready yet - try again next tick
    }
})
$timer.Start()

# Check for updates in background (compare local version.txt vs GitHub)
$updateJob = Start-Job {
    try {
        $local  = (Get-Content "$using:PSScriptRoot\version.txt" -ErrorAction Stop).Trim()
        $remote = (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/GuyMayer/SpotyTangoDisplay/main/version.txt" -UseBasicParsing -TimeoutSec 10).Content.Trim()
        if ($remote -ne $local) { return $remote } else { return $null }
    } catch { return $null }
}

# Poll update job result (check every 5s, give up after 30s)
$updateTimer          = New-Object System.Windows.Forms.Timer
$updateTimer.Interval = 5000
$updateCheckCount     = 0
$updateTimer.Add_Tick({
    $updateCheckCount++
    if ($updateJob.State -eq "Completed") {
        $updateTimer.Stop()
        $newVer = Receive-Job $updateJob
        Remove-Job $updateJob
        if ($newVer) {
            $tray.BalloonTipTitle   = "SpotyTangoDisplay Update"
            $tray.BalloonTipText    = "Version $newVer available - click to install"
            $tray.BalloonTipIcon    = [System.Windows.Forms.ToolTipIcon]::Info
            $tray.ShowBalloonTip(8000)
            $tray.Add_BalloonTipClicked({ Start-Process "https://guymayer.github.io/SpotyTangoDisplay/download.html" })
        }
    } elseif ($updateCheckCount -ge 6) {
        $updateTimer.Stop()
        Remove-Job $updateJob -Force
    }
})
$updateTimer.Start()

# Run message loop
[System.Windows.Forms.Application]::Run()
