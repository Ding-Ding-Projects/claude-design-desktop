@echo off
setlocal
set "ROOT=%~dp0"
set "PS_ARGS=-NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\build-installer.ps1""
if /I "%~1"=="/s" set "PS_ARGS=%PS_ARGS% -Silent"
if /I "%~1"=="--silent" set "PS_ARGS=%PS_ARGS% -Silent"
powershell.exe %PS_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
