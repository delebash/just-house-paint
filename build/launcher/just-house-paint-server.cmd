@echo off
rem just-house-paint-server: the headless server, the app's own exe run as Node - the same server
rem and UI the desktop app runs, no window (app-structure.md Q.3).
rem The exe is justhousepaint.exe: a launcher never shares its name (Windows would resolve the
rem bare name to the GUI exe first - JustVoice's CreateProcessW trap).
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0justhousepaint.exe" "%~dp0resources\app.asar\node_modules\just-house-paint-server\src\serve.js" %*
