; SpotyTangoDisplay Windows Installer
; Built with NSIS — https://nsis.sourceforge.io
; ROOT is passed in via /DROOT=... on the command line (absolute path to repo root)
; For local builds: makensis /DROOT=".." setup.nsi  (run from installer/ dir)

!ifndef ROOT
  !define ROOT ".."
!endif

Unicode True

!define APP_NAME     "SpotyTangoDisplay"
!define APP_VERSION  "latest"
!define INSTALL_DIR  "$LOCALAPPDATA\SpotyTangoDisplay"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpotyTangoDisplay"

Name          "${APP_NAME}"
OutFile       "${ROOT}\SpotyTangoDisplay-Setup.exe"
InstallDir    "${INSTALL_DIR}"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; ── Pages ──────────────────────────────────────────────────────────────────
Page instfiles

; ── Install ────────────────────────────────────────────────────────────────
Section "Main"

  SetOutPath "$INSTDIR"

  ; App files
  File "${ROOT}\relay.js"
  File "${ROOT}\relay-tray.ps1"
  File "${ROOT}\index.html"
  File "${ROOT}\display.html"
  File "${ROOT}\download.html"
  File "${ROOT}\favicon.png"
  File "${ROOT}\start-windows.bat"

  SetOutPath "$INSTDIR\js"
  File "${ROOT}\js\*.js"

  SetOutPath "$INSTDIR\css"
  File "${ROOT}\css\*.css"

  SetOutPath "$INSTDIR\data"
  File "${ROOT}\data\*.json"

  ; Reset working dir to install root before creating shortcut
  ; (NSIS uses $OUTDIR as the shortcut "Start in" folder)
  SetOutPath "$INSTDIR"

  ; Desktop shortcut → launches start-windows.bat
  CreateShortcut "$DESKTOP\SpotyTangoDisplay.lnk" \
    "cmd.exe" \
    '/c "$INSTDIR\start-windows.bat"' \
    "$INSTDIR\favicon.png" 0 \
    SW_SHOWNORMAL "" "Start SpotyTangoDisplay relay and open DJ control panel"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add/Remove Programs entry
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher"       "GuyMayer"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "NoModify"        "1"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "NoRepair"        "1"

  ; Launch after install
  Exec '"cmd.exe" /c "$INSTDIR\start-windows.bat"'

SectionEnd

; ── Uninstall ──────────────────────────────────────────────────────────────
Section "Uninstall"

  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\relay.js"
  Delete "$INSTDIR\relay-tray.ps1"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\display.html"
  Delete "$INSTDIR\download.html"
  Delete "$INSTDIR\favicon.png"
  Delete "$INSTDIR\start-windows.bat"
  Delete "$INSTDIR\js\*.js"
  Delete "$INSTDIR\css\*.css"
  Delete "$INSTDIR\data\*.json"
  RMDir  "$INSTDIR\js"
  RMDir  "$INSTDIR\css"
  RMDir  "$INSTDIR\data"
  RMDir  "$INSTDIR"

  Delete "$DESKTOP\SpotyTangoDisplay.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"

SectionEnd
