@echo off
setlocal
cd /d "%~dp0"

if not exist data mkdir data
if not exist backups mkdir backups

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado.
  echo Instale Node.js 24 LTS e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

if not exist .env (
  copy /Y .env.example .env >nul
  echo.
  echo Arquivo .env criado. Para ativar o Pix, preencha ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN.
  echo O painel pode iniciar sem essas credenciais, mas o Pix ficara desativado.
  echo.
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
