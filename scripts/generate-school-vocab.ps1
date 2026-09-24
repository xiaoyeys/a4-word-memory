param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\vocabularies')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
  throw "ECDICT CSV not found: $SourcePath"
}

$specs = @(
  @{ Tag = 'zk'; FileName = 'zhongkao.json'; Name = '中考核心词汇'; Description = '初中英语及中考常用词汇'; Category = '中学英语'; Icon = '📘' },
  @{ Tag = 'gk'; FileName = 'gaokao.json'; Name = '高考核心词汇'; Description = '高中英语及高考常用词汇'; Category = '中学英语'; Icon = '📗' }
)

$rows = Import-Csv -LiteralPath $SourcePath
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

foreach ($spec in $specs) {
  $tagPattern = '(?:^|\s)' + [regex]::Escape($spec.Tag) + '(?:\s|$)'
  $words = @($rows | Where-Object { $_.tag -match $tagPattern } | ForEach-Object {
    $phonetic = $_.phonetic.Trim()
    if ($phonetic -and -not ($phonetic.StartsWith('/') -and $phonetic.EndsWith('/'))) {
      $phonetic = "/$phonetic/"
    }
    $allTranslations = @($_.translation -split '\\r\\n|\\n|\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $generalTranslations = @($allTranslations | Where-Object { $_ -notmatch '^(?:[A-Za-z]+\.\s*)?\[[^\]]+\]' })
    $translations = if ($generalTranslations.Count) { $generalTranslations } else { $allTranslations }
    [ordered]@{
      word = $_.word.Trim()
      phonetic = $phonetic
      translations = @($translations)
    }
  })

  if (-not $words.Count) {
    throw "No entries found for tag '$($spec.Tag)'"
  }
  if (@($words | Where-Object { -not $_.word -or -not $_.translations.Count }).Count) {
    throw "Generated entries for '$($spec.Tag)' contain missing words or translations"
  }

  $document = [ordered]@{
    name = $spec.Name
    description = $spec.Description
    category = $spec.Category
    icon = $spec.Icon
    wordCount = $words.Count
    version = '1.0.0'
    updatedAt = '2026-09-24'
    words = $words
  }
  $targetPath = Join-Path $OutputDirectory $spec.FileName
  [System.IO.File]::WriteAllText($targetPath, (($document | ConvertTo-Json -Depth 6) + [Environment]::NewLine), $utf8WithoutBom)
  Write-Host "Generated $targetPath ($($words.Count) words)"
}
