@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PrismaStore - Instalacao

echo.
echo ==========================================
echo        PrismaStore - Instalacao
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo A pagina oficial sera aberta. Instale o Node.js LTS e execute este arquivo novamente.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

if not exist data mkdir data
if not exist backups mkdir backups

if not exist .env (
  copy /Y .env.example .env >nul
  echo Arquivo .env criado. O PrismaStore funciona sem Pix; para ativa-lo, preencha as credenciais Asaas depois.
)

echo.
echo Instalando dependencias do PrismaStore...
call npm install
if errorlevel 1 (
  echo.
  echo Falha ao instalar dependencias. Verifique a internet e tente novamente.
  pause
  exit /b 1
)

echo.
echo Criando inicializador na Area de Trabalho...
set "DESKTOP_LAUNCHER=%USERPROFILE%\Desktop\PrismaStore.cmd"
> "%DESKTOP_LAUNCHER%" echo @echo off
>> "%DESKTOP_LAUNCHER%" echo call "%CD%\INICIAR_PRISMASTORE.bat"
if errorlevel 1 (
  echo Aviso: nao foi possivel criar o inicializador na Area de Trabalho.
  echo Use INICIAR_PRISMASTORE.bat dentro da pasta do PrismaStore.
)

echo.
echo Instalacao concluida.
echo Use PrismaStore.cmd na Area de Trabalho ou INICIAR_PRISMASTORE.bat.
echo.
start "" "INICIAR_PRISMASTORE.bat"
exit /b 0
