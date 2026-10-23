@echo off
cd /d "%~dp0"
echo Ligando a pasta ao GitHub (rodrigofblopes/campo3d)... aguarde.
call :ligar > publicar.log 2>&1
type publicar.log
echo.
echo Concluido. Daqui pra frente use o publicar.bat. Pode fechar esta janela.
pause
exit /b

:ligar
echo === %date% %time%
git --version
if not exist .git git init -b main
git config user.name "Rodrigo"
git config user.email "engrodrigofblopes@gmail.com"
git remote remove origin 2>nul
git remote add origin https://github.com/rodrigofblopes/campo3d.git
git fetch --depth 1 origin main
git reset origin/main
git branch --set-upstream-to=origin/main main
git add -A
git commit -m "Obra Amaggi: app de montagem de paineis LSF"
git push origin main
git log --oneline -3
exit /b
