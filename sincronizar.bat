@echo off
rem Deixa a planilha Paineis.xlsx ligada ao app: cada vez que voce salva, as marcacoes vao para o celular.
rem Pode colocar um atalho deste arquivo na pasta Inicializar do Windows (Win+R, shell:startup).
cd /d "%~dp0"
start "Campo3D - sincronizando planilha" /min powershell -NoProfile -ExecutionPolicy Bypass -File "docs\vigiar-planilha.ps1"
