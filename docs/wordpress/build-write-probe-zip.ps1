# Builds docs/wordpress/ams-write-probe.zip for wp-admin -> Plugins -> Upload.
#
# Same constraints as build-fast-api-zip.ps1: Compress-Archive writes backslash
# entry names on Windows, which WordPress's installer rejects, so entry names are
# written by hand with forward slashes under one top-level folder.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir  = Join-Path $root 'ams-write-probe'
$zipPath = Join-Path $root 'ams-write-probe.zip'
$files   = @('ams-write-probe.php', 'write.php')

foreach ($f in $files) {
    $p = Join-Path $srcDir $f
    if (-not (Test-Path $p)) { throw "missing source file: $p" }
    # A syntax error reaching the live site would be found the slow way.
    & php -l $p | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "php -l failed for $f" }
}

if (Test-Path $zipPath) { Remove-Item $zipPath }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($f in $files) {
        $entry  = $zip.CreateEntry("ams-write-probe/$f", [System.IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        $bytes  = [System.IO.File]::ReadAllBytes((Join-Path $srcDir $f))
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Dispose()
    }
} finally {
    $zip.Dispose()
}

$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
Write-Host "built $zipPath"
$verify.Entries | ForEach-Object { Write-Host ("  {0}  ({1} bytes)" -f $_.FullName, $_.Length) }
$verify.Dispose()
