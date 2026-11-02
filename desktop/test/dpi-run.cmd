@echo off
rem ===========================================================================
rem  LED-ratio-Tool desktop - real Windows DPI acceptance launcher (TK-148)
rem ---------------------------------------------------------------------------
rem  Usage:
rem      desktop\test\dpi-run.cmd --expect=100
rem      desktop\test\dpi-run.cmd --expect=125
rem      desktop\test\dpi-run.cmd --expect=150
rem
rem  Exit codes (passed through unchanged):
rem      0 = all checks passed on that DPI tier
rem      1 = at least one check failed (real defect)
rem      3 = environment precondition not met (real scaleFactor != expect)
rem
rem  This wrapper ONLY calls node and forwards arguments.
rem  It does NOT change any system setting and does NOT fake the scale factor.
rem  See desktop\DPI-ACCEPTANCE.md for the switch / restore procedure.
rem ===========================================================================
setlocal
if "%~1"=="" goto usage
pushd "%~dp0.."
node test\dpi-acceptance.mjs %*
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%

:usage
echo.
echo  Missing argument. Usage:
echo      desktop\test\dpi-run.cmd --expect=100
echo      desktop\test\dpi-run.cmd --expect=125
echo      desktop\test\dpi-run.cmd --expect=150
echo.
exit /b 2
