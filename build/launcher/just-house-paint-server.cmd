@echo off
rem just-house-paint-server: the headless server, the app's own exe run as Node - the same server
rem and UI the desktop app runs, no window (app-structure.md Q.3).
rem The exe is justhousepaint.exe: a launcher never shares its name (Windows would resolve the
rem bare name to the GUI exe first - JustVoice's CreateProcessW trap).
setlocal
set ELECTRON_RUN_AS_NODE=1
rem The OS's certificates trusted too (Node's NODE_USE_SYSTEM_CA): a network that inspects TLS
rem signs with a certificate only the OS knows. A value already set is kept.
if not defined NODE_USE_SYSTEM_CA set NODE_USE_SYSTEM_CA=1
"%~dp0justhousepaint.exe" "%~dp0resources\app.asar\node_modules\just-house-paint-server\src\serve.js" %*
