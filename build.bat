
@echo off
setlocal
cd /d "%~dp0"

set "OUTPUT_DIR=out"

REM Build Chrome
if exist "%OUTPUT_DIR%\chrome" rmdir /s /q "%OUTPUT_DIR%\chrome"
mkdir "%OUTPUT_DIR%\chrome"
xcopy "src" "%OUTPUT_DIR%\chrome" /e /i /q /y >nul
copy /y "chrome\manifest.json" "%OUTPUT_DIR%\chrome\manifest.json" >nul

echo Built %OUTPUT_DIR%\chrome

REM Build Firefox (preserve existing out\firefox folder)
if not exist "%OUTPUT_DIR%\firefox" mkdir "%OUTPUT_DIR%\firefox"
xcopy "src" "%OUTPUT_DIR%\firefox" /e /i /q /y >nul
copy /y "firefox\manifest.json" "%OUTPUT_DIR%\firefox\manifest.json" >nul

echo Built %OUTPUT_DIR%\firefox

echo.
echo Done.
pause