; SpotyTangoDisplay Windows Installer
; Built with NSIS — https://nsis.sourceforge.io

Unicode True

!define APP_NAME     "SpotyTangoDisplay"
!define APP_VERSION  "latest"
!define INSTALL_DIR  "$LOCALAPPDATA\SpotyTangoDisplay"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpotyTangoDisplay"

Name          "${APP_NAME}"
OutFile       "SpotyTangoDisplay-Setup.exe"
InstallDir    "${INSTALL_DIR}"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; ── Pages ──────────────────────────────────────────────────────────────────
Page instfiles

; ── Install ────────────────────────────────────────────────────────────────
Section "Main"

  SetOutPath "$INSTDIR"

  ; App files
  File "..\relay.js"
  File "..\index.html"
  File "..\display.html"
  File "..\download.html"
  File "..\favicon.png"
  File "..\start-windows.bat"

  SetOutPath "$INSTDIR\js"
  File "..\js\*.js"

  SetOutPath "$INSTDIR\css"
  File "..\css\*.css"

  SetOutPath "$INSTDIR\data"
  File "..\data\*.json"

  ; Desktop shortcut → launches start-windows.bat
  CreateShortcut "$DESKTOP\SpotyTangoDisplay.lnk" \
    "cmd.exe" \
    '/c "$INSTDIR\start-windows.bat"' \
    "$INSTDIR\favicon.png" 0 \
    SW_NORMAL "" "Start SpotyTangoDisplay relay and open DJ control panel"

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
