@echo off
chcp 65001 >nul
cd /d "%~dp0monitor"
python -m vkt_monitor %*
if errorlevel 1 pause
