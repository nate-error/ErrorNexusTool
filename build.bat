@echo off
setlocal
cd /d "%~dp0"

set "OUTPUT_DIR=out"

for %%T in (chrome firefox) do (
    if exist "%OUTPUT_DIR%\%%T" rmdir /s /q "%OUTPUT_DIR%\%%T"
    mkdir "%OUTPUT_DIR%\%%T"
    xcopy "src" "%OUTPUT_DIR%\%%T" /e /i /q /y >nul
    copy /y "%%T\manifest.json" "%OUTPUT_DIR%\%%T\manifest.json" >nul
    echo Built %OUTPUT_DIR%\%%T
)

echo Zipping...

for %%T in (chrome firefox) do (
    if exist "%OUTPUT_DIR%\%%T.zip" del "%OUTPUT_DIR%\%%T.zip"
    tar -a -c -f "%OUTPUT_DIR%\%%T.zip" -C "%OUTPUT_DIR%\%%T" *
)

echo.
echo Done.
pause