@echo off
setlocal
cd /d "%~dp0"
start "Servidor Escola Missao" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0server.ps1"
