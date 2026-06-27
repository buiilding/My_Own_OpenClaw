@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
bash.exe "%SCRIPT_DIR%python-in-env.sh" %*
