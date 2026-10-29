# Le a planilha Paineis.xlsx e grava dados/paineis.json (peso e datas de cada painel).
# Roda sozinho no publicar.bat. Funciona com a planilha aberta no Excel (le a ultima versao SALVA).
# Colunas procuradas na linha 1 (qualquer ordem):
#   "Paineis" (codigo PV1-1...)  "Peso (kg)"  "Data" ou "Montado" (data da montagem)  "Levantado" (opcional)
# A planilha fica na pasta do Campo3D (Paineis.xlsx, ao lado do publicar.bat).
param(
  [string]$Planilha = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Paineis.xlsx'),
  [string]$Saida = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dados\paineis.json')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$inv = [Globalization.CultureInfo]::InvariantCulture

if (-not (Test-Path -LiteralPath $Planilha)) { Write-Host "Planilha nao encontrada: $Planilha (o app continua com a versao anterior)"; exit 0 }

$fs = [IO.File]::Open($Planilha, 'Open', 'Read', 'ReadWrite')
try {
  $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read)
  function LerXml($nome) {
    $e = $zip.GetEntry($nome); if (-not $e) { return $null }
    $r = New-Object IO.StreamReader($e.Open(), [Text.Encoding]::UTF8)
    try { [xml]$x = $r.ReadToEnd(); return $x } finally { $r.Close() }
  }
  # primeira aba da planilha
  $wb = LerXml 'xl/workbook.xml'; $rels = LerXml 'xl/_rels/workbook.xml.rels'
  $rid = @($wb.workbook.sheets.sheet)[0].GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $alvo = (@($rels.Relationships.Relationship) | Where-Object { $_.Id -eq $rid }).Target
  if ($alvo -like '/*') { $alvo = $alvo.TrimStart('/') } else { $alvo = 'xl/' + $alvo }
  $ws = LerXml $alvo
  $sst = LerXml 'xl/sharedStrings.xml'
  $textos = @(); if ($sst) { $textos = @($sst.sst.si | ForEach-Object { $_.InnerText }) }

  function Valor($c) {
    if ($null -eq $c) { return $null }
    $t = $c.GetAttribute('t')
    if ($t -eq 's') { return $textos[[int]$c.v] }
    if ($t -eq 'inlineStr') { return $c.is.InnerText }
    if ($c.v -ne $null) { return [string]$c.v }
    return $null
  }
  function LerData($v) {
    if ([string]::IsNullOrWhiteSpace($v)) { return $null }
    $n = 0.0
    if ([double]::TryParse($v, [Globalization.NumberStyles]::Float, $inv, [ref]$n)) { return [DateTime]::FromOADate($n).ToString('yyyy-MM-dd') }
    $d = [DateTime]::MinValue
    if ([DateTime]::TryParse($v, [Globalization.CultureInfo]'pt-BR', [Globalization.DateTimeStyles]::None, [ref]$d)) { return $d.ToString('yyyy-MM-dd') }
    return $null
  }

  $linhas = @($ws.worksheet.sheetData.row)
  $col = @{}
  foreach ($c in @($linhas[0].c)) {
    $letra = ($c.r -replace '\d', ''); $h = ([string](Valor $c)).ToLower()
    if (-not $col.cod -and $h -match 'pain') { $col.cod = $letra }
    elseif (-not $col.kg -and $h -match 'peso|kg') { $col.kg = $letra }
    elseif (-not $col.lev -and $h -match 'levant') { $col.lev = $letra }
    elseif (-not $col.mon -and $h -match 'montad|^data') { $col.mon = $letra }
  }
  if (-not $col.cod) { throw 'Nao achei a coluna "Paineis" na linha 1 da planilha' }

  $itens = New-Object Collections.Generic.List[string]
  for ($i = 1; $i -lt $linhas.Count; $i++) {
    $cel = @{}; foreach ($c in @($linhas[$i].c)) { $cel[($c.r -replace '\d', '')] = $c }
    $cod = [string](Valor $cel[$col.cod])
    if ($cod -notmatch '^\s*(PV1|PV2|TR|LJ1)\s*[-_ ]?\s*0*(\d+)') { continue }
    $code = '{0}-{1:D2}' -f $Matches[1], [int]$Matches[2]
    if ($code -in @('PV1-83', 'PV1-90')) { continue }   # retirados da obra (fabricados a mais por erro)
    $campos = @()
    if ($col.kg) { $n = 0.0; $v = Valor $cel[$col.kg]; if ($v -and [double]::TryParse($v, [Globalization.NumberStyles]::Float, $inv, [ref]$n)) { $campos += '"kg":' + [Math]::Round($n, 1).ToString($inv) } }
    if ($col.mon) { $d = LerData (Valor $cel[$col.mon]); if ($d) { $campos += '"montado":"' + $d + '"' } }
    if ($col.lev) { $d = LerData (Valor $cel[$col.lev]); if ($d) { $campos += '"levantado":"' + $d + '"' } }
    $itens.Add('    "' + $code + '":{' + ($campos -join ',') + '}')
  }
  $json = "{`n  ""fonte"":""Paineis.xlsx"",`n  ""atualizado"":""" + (Get-Item -LiteralPath $Planilha).LastWriteTime.ToString('yyyy-MM-ddTHH:mm') + """,`n  ""pecas"":{`n" + ($itens -join ",`n") + "`n  }`n}`n"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Saida) | Out-Null
  [IO.File]::WriteAllText($Saida, $json, (New-Object Text.UTF8Encoding($false)))
  Write-Host ("Planilha lida: {0} paineis -> {1}" -f $itens.Count, $Saida)
} finally { $fs.Close() }
