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
    # Collect everything off the UI thread so the menu doesn't freeze
    $pid_      = if ($relay -and -not $relay.HasExited) { $relay.Id } else { "stopped" }
    $scriptRoot = $PSScriptRoot
    $logPath    = "$env:TEMP\SpotyTangoDisplay-relay.log"

    $job = Start-Job -ScriptBlock {
        param($scriptRoot, $logPath)
        $portOk    = $false
        $httpStatus = "n/a"
        try {
            $t = New-Object System.Net.Sockets.TcpClient
            $t.Connect("127.0.0.1", 3456); $t.Close(); $portOk = $true
        } catch {}
        if ($portOk) {
            try {
                $r = Invoke-WebRequest -Uri "http://localhost:3456/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                $httpStatus = "$($r.StatusCode) - $($r.RawContent.Length) bytes"
            } catch { $httpStatus = "ERROR: $($_.Exception.Message)" }
        }
        $ver   = try { (Get-Content "$scriptRoot\version.txt" -ErrorAction Stop).Trim() } catch { "unknown" }
        $nodeV = try { (& node --version 2>$null).Trim() } catch { "not found" }
        $log   = try { (Get-Content $logPath -Tail 30 -ErrorAction Stop) -join "`n" } catch { "(no log)" }
        [pscustomobject]@{
            portOk=$portOk; httpStatus=$httpStatus; ver=$ver; nodeV=$nodeV; log=$log
        }
    } -ArgumentList $scriptRoot, $logPath

    # Poll on a timer; show MessageBox on completion (stays off UI thread until ready)
    $debugTimer = New-Object System.Windows.Forms.Timer
    $debugTimer.Interval = 200
    $debugTimer.Add_Tick({
        if ($job.State -eq "Completed") {
            $debugTimer.Stop(); $debugTimer.Dispose()
            $d = Receive-Job $job; Remove-Job $job
            $port = if ($d.portOk) { "open" } else { "closed" }
            $msg  = "relay.js PID : $pid_`nPort 3456   : $port`nHTTP GET /  : $($d.httpStatus)`nVersion     : $($d.ver)`nNode        : $($d.nodeV)`nScriptRoot  : $scriptRoot`n`n--- relay log ---`n$($d.log)"
            [System.Windows.Forms.MessageBox]::Show($msg, "SpotyTangoDisplay Debug", `
                [System.Windows.Forms.MessageBoxButtons]::OK, `
                [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        } elseif ($job.State -eq "Failed") {
            $debugTimer.Stop(); $debugTimer.Dispose(); Remove-Job $job -Force
            [System.Windows.Forms.MessageBox]::Show("Debug collection failed.", "Debug", `
                [System.Windows.Forms.MessageBoxButtons]::OK, `
                [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        }
    })
    $debugTimer.Start()
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

# Open browser once relay responds to HTTP — give up after 30s and show error balloon
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$pollCount      = 0
$timer.Add_Tick({
    $pollCount++
    if ($pollCount -gt 60) {
        $timer.Stop()
        $tray.BalloonTipTitle = "SpotyTangoDisplay"
        $tray.BalloonTipText  = "Relay failed to start - right-click for Debug Info"
        $tray.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Error
        $tray.ShowBalloonTip(8000)
        return
    }
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3456/" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $timer.Stop()
            Start-Process "http://localhost:3456/"
        }
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
