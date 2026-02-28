@echo off
chcp 65001 >nul
echo.
echo   LightningFlow — Instalador
echo   ===========================
echo.

docker info >nul 2>&1 || (
    echo   ERRO: Abre o Docker Desktop primeiro!
    echo   https://www.docker.com/products/docker-desktop/
    pause & exit /b 1
)

if not exist ".env" (
    python -c "import secrets; open('.env','w').write('DATABASE_URL=\"file:./data/lightningflow.db\"\nSESSION_SECRET=\"'+secrets.token_hex(32)+'\"\nRESET_SECRET=\"'+secrets.token_hex(32)+'\"\nPORT=3000\nNODE_ENV=production\n')"
    echo   Configuracao criada.
)

md data\data 2>nul
echo   A iniciar... (pode demorar 2-3 minutos)
docker compose up -d --build

echo.
echo   Pronto! Abre: http://localhost:3000
start http://localhost:3000
pause
