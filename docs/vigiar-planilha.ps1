# Fica rodando (janela minimizada) e, toda vez que a Paineis.xlsx é salva, envia as marcações ao app.
# Iniciado pelo sincronizar.bat. Para parar, feche a janela "Campo3D - sincronizando planilha".
param([string]$Planilha = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Paineis.xlsx'))
$Host.UI.RawUI.WindowTitle = 'Campo3D - sincronizando planilha'
$enviar = Join-Path $PSScriptRoot 'enviar-marcacoes.ps1'
Write-Host "Vigiando $Planilha. Cada vez que você salvar, as marcações vão para o app."
$ultima = $null
if (Test-Path -LiteralPath $Planilha) { $ultima = (Get-Item -LiteralPath $Planilha).LastWriteTimeUtc }
& $enviar -Planilha $Planilha            # sincroniza uma vez ao abrir
while ($true) {
  Start-Sleep -Seconds 10
  if (-not (Test-Path -LiteralPath $Planilha)) { continue }
  $agora = (Get-Item -LiteralPath $Planilha).LastWriteTimeUtc
  if ($agora -ne $ultima) {
    Start-Sleep -Seconds 3              # deixa o Excel terminar de gravar
    $ultima = (Get-Item -LiteralPath $Planilha).LastWriteTimeUtc
    & $enviar -Planilha $Planilha
  }
}
