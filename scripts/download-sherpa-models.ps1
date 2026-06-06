$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sherpaRoot = Join-Path $root "public\models\sherpa"
$sttDir = Join-Path $sherpaRoot "stt\sherpa-onnx-whisper-tiny.en"
$ttsRoot = Join-Path $sherpaRoot "tts"
$ttsDir = Join-Path $ttsRoot "kokoro-en-v0_19"
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

$whisperBase = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny.en/resolve/main"
Get-ModelFile "$whisperBase/tiny.en-encoder.int8.onnx?download=true" (Join-Path $sttDir "tiny.en-encoder.int8.onnx")
Get-ModelFile "$whisperBase/tiny.en-decoder.int8.onnx?download=true" (Join-Path $sttDir "tiny.en-decoder.int8.onnx")
Get-ModelFile "$whisperBase/tiny.en-tokens.txt?download=true" (Join-Path $sttDir "tiny.en-tokens.txt")

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

$required = @(
  (Join-Path $sttDir "tiny.en-encoder.int8.onnx"),
  (Join-Path $sttDir "tiny.en-decoder.int8.onnx"),
  (Join-Path $sttDir "tiny.en-tokens.txt"),
  $kokoroRequired
)

$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing.Count -gt 0) {
  throw "Missing Sherpa model assets: $($missing -join ', ')"
}

if (Test-Path -LiteralPath $kokoroArchive) {
  Remove-Item -LiteralPath $kokoroArchive -Force
}

Write-Host "Sherpa STT/TTS models ready under $sherpaRoot"
