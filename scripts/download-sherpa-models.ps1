$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sherpaRoot = Join-Path $root "public\models\sherpa"
$sttDir = Join-Path $sherpaRoot "stt\sherpa-onnx-whisper-small"
$ttsRoot = Join-Path $sherpaRoot "tts"
$ttsDir = Join-Path $ttsRoot "kokoro-en-v0_19"
$supertonicDir = Join-Path $ttsRoot "supertonic-3"
$tmpDir = Join-Path $root ".tmp\sherpa-models"

New-Item -ItemType Directory -Force -Path $sttDir, $ttsRoot, $tmpDir | Out-Null

function Get-ModelFile {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Url,
    [Parameter(Mandatory = $true)]
    [string] $OutputPath,
    [switch] $Force
  )

  if (-not $Force -and (Test-Path -LiteralPath $OutputPath) -and ((Get-Item -LiteralPath $OutputPath).Length -gt 0)) {
    Write-Host "exists $OutputPath"
    return
  }

  $partialPath = "$OutputPath.download"
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }

  Write-Host "curl $Url"
  curl.exe -L --fail --retry 3 --retry-delay 2 -o $partialPath $Url
  Move-Item -LiteralPath $partialPath -Destination $OutputPath -Force
}

# Multilingual (non-.en) Whisper small — covers English/French/Arabic (MSA), unlike
# the previous English-only tiny.en model.
$whisperBase = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main"
Get-ModelFile "$whisperBase/small-encoder.int8.onnx?download=true" (Join-Path $sttDir "small-encoder.int8.onnx")
Get-ModelFile "$whisperBase/small-decoder.int8.onnx?download=true" (Join-Path $sttDir "small-decoder.int8.onnx")
Get-ModelFile "$whisperBase/small-tokens.txt?download=true" (Join-Path $sttDir "small-tokens.txt")

$kokoroArchive = Join-Path $tmpDir "kokoro-en-v0_19.tar.bz2"
$kokoroRequired = @(
  (Join-Path $ttsDir "model.onnx"),
  (Join-Path $ttsDir "voices.bin"),
  (Join-Path $ttsDir "tokens.txt"),
  (Join-Path $ttsDir "espeak-ng-data")
)

$needsKokoroExtract = ($kokoroRequired | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -gt 0

if ($needsKokoroExtract) {
  Get-ModelFile "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2" $kokoroArchive -Force

  if (Test-Path -LiteralPath $ttsDir) {
    Remove-Item -LiteralPath $ttsDir -Recurse -Force
  }

  Write-Host "extract $kokoroArchive"
  tar -xjf $kokoroArchive -C $ttsRoot
}

# Supertonic 3 — multilingual (31-language, incl. French/Arabic) native TTS,
# used alongside Kokoro (English) and selected by output language.
$supertonicReleaseName = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
$supertonicArchive = Join-Path $tmpDir "$supertonicReleaseName.tar.bz2"
$supertonicRequired = @(
  (Join-Path $supertonicDir "duration_predictor.int8.onnx"),
  (Join-Path $supertonicDir "text_encoder.int8.onnx"),
  (Join-Path $supertonicDir "vector_estimator.int8.onnx"),
  (Join-Path $supertonicDir "vocoder.int8.onnx"),
  (Join-Path $supertonicDir "tts.json"),
  (Join-Path $supertonicDir "unicode_indexer.bin"),
  (Join-Path $supertonicDir "voice.bin")
)

$needsSupertonicExtract = ($supertonicRequired | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -gt 0

if ($needsSupertonicExtract) {
  Get-ModelFile "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$supertonicReleaseName.tar.bz2" $supertonicArchive -Force

  if (Test-Path -LiteralPath $supertonicDir) {
    Remove-Item -LiteralPath $supertonicDir -Recurse -Force
  }

  $supertonicExtractRoot = Join-Path $tmpDir "supertonic-3-extract"
  if (Test-Path -LiteralPath $supertonicExtractRoot) {
    Remove-Item -LiteralPath $supertonicExtractRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $supertonicExtractRoot | Out-Null

  Write-Host "extract $supertonicArchive"
  tar -xjf $supertonicArchive -C $supertonicExtractRoot

  $extractedDir = Get-ChildItem -LiteralPath $supertonicExtractRoot -Directory | Select-Object -First 1
  if (-not $extractedDir) {
    throw "Supertonic archive did not extract into a subdirectory as expected."
  }

  Move-Item -LiteralPath $extractedDir.FullName -Destination $supertonicDir -Force
  Remove-Item -LiteralPath $supertonicExtractRoot -Recurse -Force
}

$required = @(
  (Join-Path $sttDir "small-encoder.int8.onnx"),
  (Join-Path $sttDir "small-decoder.int8.onnx"),
  (Join-Path $sttDir "small-tokens.txt")
) + $kokoroRequired + $supertonicRequired

$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing.Count -gt 0) {
  throw "Missing Sherpa model assets: $($missing -join ', ')"
}

if (Test-Path -LiteralPath $kokoroArchive) {
  Remove-Item -LiteralPath $kokoroArchive -Force
}

if (Test-Path -LiteralPath $supertonicArchive) {
  Remove-Item -LiteralPath $supertonicArchive -Force
}

Write-Host "Sherpa STT/TTS models ready under $sherpaRoot"
