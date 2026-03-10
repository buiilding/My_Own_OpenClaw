@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."

node "%REPO_ROOT%\scripts\docs-list.js" %*
