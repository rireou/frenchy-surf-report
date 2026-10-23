@echo off
setlocal
cd /d "%~dp0..\.."
if errorlevel 1 exit /b 1
if not defined FRENCHY_RESEARCH_HOME set "FRENCHY_RESEARCH_HOME=%CD%\..\frenchy-research-private"
node "research\memory\preview.mjs" "%FRENCHY_RESEARCH_HOME%" 4188
if errorlevel 1 (
 echo Preview startup failed. Please keep this error visible.
 pause
 exit /b 1
)
