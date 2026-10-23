@echo off
cd /d "%~dp0"
if not exist .git (
  echo A pasta ainda nao esta ligada ao GitHub. Rode primeiro o ligar-github.bat.
  echo A pasta ainda nao esta ligada ao GitHub. > publicar.log
  pause
  exit /b
)
echo Enviando para o GitHub... aguarde.
call :enviar > publicar.log 2>&1
type publicar.log
echo.
echo Concluido. Pode fechar esta janela.
pause
exit /b

:enviar
echo === %date% %time%
git add -A
git commit -m "Atualizacao obra Amaggi"
git push origin main
git log --oneline -3
exit /b
