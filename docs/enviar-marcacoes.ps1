# Envia para o app (servidor) as marcações da planilha Paineis.xlsx, sem precisar publicar o site.
# O celular de quem está na obra vê em até 30 segundos.
#
# Regras (para não apagar o que foi marcado no celular):
#  - "Data Montado" preenchida  -> etapa 1 (Montado);  "Data Levantado" preenchida -> etapa 2 (Levantado)
#  - Se o app já tem a peça na MESMA etapa ou mais avançada (Levantado, Conferido, Com problema), não envia nada.
#  - Se o app tem uma etapa menor marcada ANTES de a planilha ser salva, a planilha avança a peça
#    (mantém a observação e as fotos que já estavam lá). Se foi marcada no celular DEPOIS (ex.: alguém desfez), vale o celular.
#  - Apagar uma data na planilha NÃO desfaz a marcação no app (para desfazer, use o app).
#
# Uso:  powershell -ExecutionPolicy Bypass -File docs\enviar-marcacoes.ps1            (envia)
#       powershell -ExecutionPolicy Bypass -File docs\enviar-marcacoes.ps1 -Simular   (só mostra o que enviaria)
param(
  [string]$Planilha = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Paineis.xlsx'),
  [string]$Obra = 'amaggi',
  [string]$Url = 'https://campo3d.vercel.app',
  [string]$Autor = 'Planilha',
  [switch]$Simular
)
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
$raiz = Split-Path -Parent $PSScriptRoot
$log = Join-Path $raiz 'enviar.log'
function Log($m){ $l = '{0}  {1}' -f (Get-Date).ToString('dd/MM/yyyy HH:mm:ss'), $m; Write-Host $l; Add-Content -LiteralPath $log -Value $l -Encoding UTF8 }

try {
  # 1) Lê a planilha com o mesmo leitor do publicar.bat (grava num arquivo temporário)
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('campo3d-planilha-{0}.json' -f [Guid]::NewGuid().ToString('N'))
  & (Join-Path $PSScriptRoot 'planilha-paineis.ps1') -Planilha $Planilha -Saida $tmp | Out-Null
  if (-not (Test-Path -LiteralPath $tmp)) { Log 'Planilha não lida; nada enviado.'; exit 0 }
  $pj = Get-Content -LiteralPath $tmp -Raw -Encoding UTF8 | ConvertFrom-Json
  $plano = $pj.pecas
  # hora em que a planilha foi salva (horário do computador): uma marcação no celular feita DEPOIS disso vale mais
  $salva = [DateTimeOffset]::new([DateTime]::ParseExact($pj.atualizado, 'yyyy-MM-ddTHH:mm', $inv), [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::ParseExact($pj.atualizado, 'yyyy-MM-ddTHH:mm', $inv)))
  Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue

  # 2) Situação atual no app
  $base = $Url.TrimEnd('/')
  $atual = (Invoke-RestMethod -Uri "$base/api/etapas?obra=$Obra" -Method Get -TimeoutSec 30).pontos

  # 3) Compara e monta o que precisa ir
  $envio = New-Object Collections.Generic.List[object]
  foreach ($p in $plano.PSObject.Properties) {
    $code = $p.Name; $v = $p.Value
    $etapa = 0; $dia = $null
    if ($v.levantado) { $etapa = 2; $dia = $v.levantado } elseif ($v.montado) { $etapa = 1; $dia = $v.montado }
    if ($etapa -eq 0) { continue }
    $em = [DateTimeOffset]::ParseExact("$dia 12:00 -04:00", 'yyyy-MM-dd HH:mm zzz', $inv)
    $s = $null; if ($atual) { $s = $atual.PSObject.Properties[$code] }
    $nota = $null; $fotos = @()
    if ($s) {
      $s = $s.Value
      if ([int]$s.etapa -ge $etapa) { continue }          # app igual ou mais avançado (inclui Conferido e Problema)
      # PowerShell 7 já converte a data do JSON; o 5.1 (padrão do Windows) deixa como texto ISO
      if ($s.em -is [DateTime]) { $emApp = [DateTimeOffset]::new($s.em.ToUniversalTime(), [TimeSpan]::Zero) }
      else { $emApp = [DateTimeOffset]::Parse([string]$s.em, $inv, [Globalization.DateTimeStyles]::AssumeUniversal) }
      $limite = if ($salva -gt $em) { $salva } else { $em }
      if ($emApp -gt $limite) { continue }                # mexeram no celular depois de salvar a planilha (ex.: desfazer): vale o celular
      if ($emApp -ge $em) { $em = $emApp.AddSeconds(1) }  # a planilha avança a peça sobre a marcação menor e mais antiga
      $nota = $s.nota; if ($s.fotos) { $fotos = @($s.fotos) }
    }
    $envio.Add([ordered]@{ elemento = $code; etapa = $etapa; autor = $Autor; ambiente = 'excel';
      em = $em.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ', $inv); nota = $nota; fotos = $fotos })
  }

  if (-not $envio.Count) { Log 'Planilha e app já estão iguais. Nada a enviar.'; exit 0 }
  $lista = ($envio | ForEach-Object { '{0}={1}' -f $_.elemento, $(if ($_.etapa -eq 2) { 'Levantado' } else { 'Montado' }) }) -join ', '
  if ($Simular) { Log ("SIMULAÇÃO: enviaria {0} peça(s): {1}" -f $envio.Count, $lista); exit 0 }

  # 4) Envia em lotes
  $salvas = 0
  for ($i = 0; $i -lt $envio.Count; $i += 400) {
    $lote = $envio.GetRange($i, [Math]::Min(400, $envio.Count - $i))
    $corpo = @{ obra = $Obra; marcacoes = $lote } | ConvertTo-Json -Depth 5 -Compress
    $r = Invoke-RestMethod -Uri "$base/api/etapas" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) -TimeoutSec 60
    $salvas += [int]$r.salvas
  }
  Log ("Enviado ao app: {0} peça(s): {1}" -f $salvas, $lista)
} catch {
  Log ("ERRO ao enviar ao app: {0}" -f $_.Exception.Message)
  exit 1
}
