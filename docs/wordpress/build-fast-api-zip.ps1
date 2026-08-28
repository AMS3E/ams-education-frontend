# Builds docs/wordpress/ams-fast-api.zip for wp-admin -> Plugins -> Upload.
#
# Compress-Archive is NOT usable here: on Windows it writes backslash entry
# names, which WordPress's installer rejects. Entry names are therefore written
# by hand with forward slashes, matching the layout of the ams-fast-probe zip
# that installed cleanly (one top-level folder holding the files).
#
# tests.php is deliberately EXCLUDED — it is a local harness, and every file in
# a plugin folder is publicly reachable over HTTP.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir  = Join-Path $root 'ams-fast-api'
$zipPath = Join-Path $root 'ams-fast-api.zip'
$files   = @('ams-fast-api.php', 'fast.php')

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
        $entry  = $zip.CreateEntry("ams-fast-api/$f", [System.IO.Compression.CompressionLevel]::Optimal)
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
