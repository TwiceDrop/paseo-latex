@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "APP_EXECUTABLE=%RESOURCES_DIR%\..\PaseoLaTeX.exe"
if not exist "%APP_EXECUTABLE%" (
  echo Bundled Paseo LaTeX executable not found at %APP_EXECUTABLE% 1>&2
  exit /b 1
)
set "PASEO_HOME=%APPDATA%\Paseo LaTeX\daemon"
if not exist "%PASEO_HOME%\config.json" (
  if not exist "%PASEO_HOME%" mkdir "%PASEO_HOME%"
  copy /Y "%RESOURCES_DIR%\latex-daemon-config.json" "%PASEO_HOME%\config.json" >nul
)
set "PASEO_LISTEN=127.0.0.1:0"
set "ELECTRON_RUN_AS_NODE=1"
set "PASEO_NODE_ENV=production"
set "PASEO_DESKTOP_MANAGED=1"
set "PASEO_CLI=%~f0"
"%APP_EXECUTABLE%" --disable-warning=DEP0040 "%RESOURCES_DIR%\app.asar.unpacked\dist\daemon\node-entrypoint-runner.js" node-script "%RESOURCES_DIR%\app.asar\node_modules\@getpaseo\cli\dist\index.js" %*
exit /b %errorlevel%
