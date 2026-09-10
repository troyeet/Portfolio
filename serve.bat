@echo off
setlocal
cd /d "%~dp0"
set PORT=8000

echo.
echo   Serving the portfolio at http://localhost:%PORT%/
echo   Leave this window open. Press Ctrl+C when you are done.
echo.

py -3 -c "pass" >nul 2>&1
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/"
  py -3 -m http.server %PORT%
  goto :done
)

python -c "pass" >nul 2>&1
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :done
)

node -e "0" >nul 2>&1
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:%PORT%/"
  npx --yes http-server -p %PORT% -c-1 .
  goto :done
)

echo   No Python or Node found on this machine.
echo.
echo   Open preview-offline.html instead - it is a single file
echo   with the model built in and needs no server at all.
echo.
pause

:done
endlocal
