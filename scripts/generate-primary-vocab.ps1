param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$HeadwordPath = (Join-Path $PSScriptRoot 'data\primary-level-2.txt'),
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\public\vocabularies\primary.json')
)

$ErrorActionPreference = 'Stop'
$expectedCount = 505

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
  throw "ECDICT CSV not found: $SourcePath"
}
if (-not (Test-Path -LiteralPath $HeadwordPath -PathType Leaf)) {
  throw "Primary headword list not found: $HeadwordPath"
}

$officialEntries = @(Get-Content -LiteralPath $HeadwordPath -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
if ($officialEntries.Count -ne $expectedCount) {
  throw "Primary headword list must contain exactly $expectedCount entries; found $($officialEntries.Count)"
}
if (@($officialEntries | Group-Object { $_.ToLowerInvariant() } | Where-Object Count -gt 1).Count) {
  throw 'Primary headword list contains duplicate entries'
}

function Get-LookupWord([string]$officialEntry) {
  if ($officialEntry -eq 'a / an') { return 'a' }
  return ($officialEntry -replace '\s*\(.*$', '').Trim()
}

$needed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($entry in $officialEntries) { [void]$needed.Add((Get-LookupWord $entry)) }

$rowsByWord = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
Import-Csv -LiteralPath $SourcePath | Where-Object { $needed.Contains($_.word.Trim()) } | ForEach-Object {
  $key = $_.word.Trim()
  if (-not $rowsByWord.ContainsKey($key) -or ($_.word -ceq $key -and $rowsByWord[$key].word -cne $key)) {
    $rowsByWord[$key] = $_
  }
}

$translationOverrides = @{
  'a / an' = @('art. 一（个）；任一（个）')
  'Miss' = @('n. 小姐（用于未婚女性姓氏或姓名前）')
  'Mr (AmE Mr.)' = @('n. 先生')
  'Mrs (AmE Mrs.)' = @('n. 夫人；太太')
  'Ms (AmE Ms.)' = @('n. 女士')
  'OK' = @('adj. 好；可以；行', 'adv. 好；可以')
  'PE (=physical education)' = @('n. 体育；体育课')
  'TV (=television)' = @('n. 电视；电视机')
  'z' = @('n. 字母 Z')
}
$phoneticOverrides = @{
  'ice cream' = "/ˈaɪs kriːm/"
}

$words = foreach ($officialEntry in $officialEntries) {
  $lookupWord = Get-LookupWord $officialEntry
  if (-not $rowsByWord.ContainsKey($lookupWord)) {
    throw "ECDICT entry not found for '$officialEntry' (lookup: '$lookupWord')"
  }
  $row = $rowsByWord[$lookupWord]
  $phonetic = $row.phonetic.Trim()
  if ($phonetic -and -not ($phonetic.StartsWith('/') -and $phonetic.EndsWith('/'))) {
    $phonetic = "/$phonetic/"
  }
  if ($phoneticOverrides.ContainsKey($officialEntry)) { $phonetic = $phoneticOverrides[$officialEntry] }
  $allTranslations = @($row.translation -split '\\r\\n|\\n|\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $generalTranslations = @($allTranslations | Where-Object { $_ -notmatch '^(?:[A-Za-z]+\.\s*)?\[[^\]]+\]' })
  $translations = if ($generalTranslations.Count) { $generalTranslations } else { $allTranslations }
  if ($translationOverrides.ContainsKey($officialEntry)) { $translations = $translationOverrides[$officialEntry] }
  if (-not $translations.Count) { throw "ECDICT entry '$lookupWord' has no Chinese translation" }

  [ordered]@{
    word = $officialEntry
    phonetic = $phonetic
    translations = @($translations)
  }
}

$document = [ordered]@{
  name = '小学课标词汇'
  description = '义务教育英语课程标准（2022年版）小学二级词汇'
  category = '基础英语'
  icon = '📙'
  wordCount = $words.Count
  version = '1.0.0'
  updatedAt = '2026-09-24'
  words = @($words)
}

$targetDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $targetDirectory)) { New-Item -ItemType Directory -Path $targetDirectory | Out-Null }
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, (($document | ConvertTo-Json -Depth 6) + [Environment]::NewLine), $utf8WithoutBom)
Write-Host "Generated $OutputPath ($($words.Count) words)"
