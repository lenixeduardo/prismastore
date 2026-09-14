@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado.
  echo Instale Node.js 24 LTS e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira inicializacao: instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar as dependencias. Verifique a internet e tente novamente.
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4173"
echo Iniciando PrismaStore...
call npm start
pause
