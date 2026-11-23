@echo off
chcp 65001 > nul
cd /d "%~dp0"

if not exist node_modules (
  call npm install || goto :error
)
if not exist dist\web\index.html (
  call npm run build || goto :error
)
call npm start
goto :eof

:error
echo.
echo Spendprint를 준비하는 중에 문제가 생겼어요. 위의 메시지를 확인해 주세요.
pause
