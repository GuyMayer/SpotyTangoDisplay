Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Kill any previous tray instance (other powershell running relay-tray.ps1, not us)
try {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*relay-tray.ps1*' -and $_.ProcessId -ne $PID } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

# Kill any existing relay.js processes
try {
    $owned = Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue
    if ($owned) { Stop-Process -Id $owned.OwningProcess -Force -ErrorAction SilentlyContinue }
} catch {}
try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*relay.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Milliseconds 600

# Singleton guard (acquire after killing old instance)
$mutexName = "Global\SpotyTangoDisplayRelay"
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$mutex.WaitOne(2000) | Out-Null

Set-Location $PSScriptRoot

# Log file for relay stdout/stderr
$relayLog = "$env:TEMP\SpotyTangoDisplay-relay.log"

# Start relay.js via cmd.exe so redirection is handled by the shell (avoids PS buffer deadlock)
$relay = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/c node relay.js > `"$relayLog`" 2>&1" `
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
    $pid_       = if ($relay -and -not $relay.HasExited) { $relay.Id } else { "stopped" }
    $portOk     = $false
    $httpStatus = "n/a"
    try {
        $t = New-Object System.Net.Sockets.TcpClient
        $t.Connect("127.0.0.1", 3456); $t.Close(); $portOk = $true
    } catch {}
    if ($portOk) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3456/ping" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            $httpStatus = "$($r.StatusCode) OK"
        } catch { $httpStatus = "ERROR: $($_.Exception.Message)" }
    }
    $ver   = try { (Get-Content "$PSScriptRoot\version.txt" -ErrorAction Stop).Trim() } catch { "unknown" }
    $nodeV = try { (& node --version 2>$null).Trim() } catch { "not found" }
    $log   = try { (Get-Content "$env:TEMP\SpotyTangoDisplay-relay.log" -Tail 30 -ErrorAction Stop) -join "`n" } catch { "(no log)" }
    $port  = if ($portOk) { "open" } else { "closed" }
    $msg   = "relay.js PID : $pid_`nPort 3456   : $port`nHTTP GET /ping : $httpStatus`nVersion     : $ver`nNode        : $nodeV`nScriptRoot  : $PSScriptRoot`n`n--- relay log ---`n$log"
    [System.Windows.Forms.MessageBox]::Show($msg, "SpotyTangoDisplay Debug", `
        [System.Windows.Forms.MessageBoxButtons]::OK, `
        [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
})

$sep2 = New-Object System.Windows.Forms.ToolStripSeparator

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Exit"
$exitItem.Add_Click({
    $tray.Visible = $false
    # Kill cmd.exe wrapper + any node relay.js processes
    if ($relay -and -not $relay.HasExited) {
        Stop-Process -Id $relay.Id -Force -ErrorAction SilentlyContinue
    }
    try {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*relay.js*' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {}
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

# Poll for relay readiness in background — never block the UI thread
$pollJob = Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3456/ping" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return "ok" }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return "timeout"
}

$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    if ($pollJob.State -eq "Completed") {
        $timer.Stop()
        $result = Receive-Job $pollJob; Remove-Job $pollJob
        if ($result -eq "ok") {
            Start-Process "http://localhost:3456/"
        } else {
            $tray.BalloonTipTitle = "SpotyTangoDisplay"
            $tray.BalloonTipText  = "Relay failed to start - right-click for Debug Info"
            $tray.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Error
            $tray.ShowBalloonTip(8000)
        }
    } elseif ($pollJob.State -eq "Failed") {
        $timer.Stop()
        Remove-Job $pollJob -Force
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
