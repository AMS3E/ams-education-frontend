# Builds docs/wordpress/ams-frontend-api.zip for wp-admin -> Plugins -> Upload.
#
# LAYOUT MATTERS. The zip that installed cleanly on 2026-07-31 held the single
# file `ams-frontend-api.php` at its ROOT, with no folder — WordPress then names
# the extracted folder after the ZIP, giving `plugins/ams-frontend-api/`. This
# script reproduces that byte-for-byte, because "Replace current with uploaded"
# only replaces when the resulting folder name matches the installed one. A zip
# named anything else installs a SECOND copy alongside the live plugin, which is
# exactly how the phantom `ams-frontend-api-1.7.5/` folder came to exist.
#
# Compress-Archive is NOT usable: on Windows it writes backslash entry names,
# which WordPress's installer rejects.
#
# THIS PLUGIN IS LOAD-BEARING for the whole public site, and the live copy has
# historically been hand-edited on the server (the /hero-embed frame-ancestors
# allow-list). Confirm the live file matches this source before uploading —
# see the pre-flight check in the session notes.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$src     = Join-Path $root 'ams-frontend-api.php'
$zipPath = Join-Path $root 'ams-frontend-api.zip'

if (-not (Test-Path $src)) { throw "missing source file: $src" }

# A syntax error reaching the live site would take the whole frontend down.
& php -l $src | Out-Null
if ($LASTEXITCODE -ne 0) { throw "php -l failed" }

$version = (Select-String -Path $src -Pattern '^\s*\*\s*Version:\s*(.+)$').Matches[0].Groups[1].Value.Trim()

if (Test-Path $zipPath) { Remove-Item $zipPath }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    $entry  = $zip.CreateEntry('ams-frontend-api.php', [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $bytes  = [System.IO.File]::ReadAllBytes($src)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Dispose()
} finally {
    $zip.Dispose()
}

$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
Write-Host "built $zipPath  (plugin version $version)"
$verify.Entries | ForEach-Object { Write-Host ("  {0}  ({1} bytes)" -f $_.FullName, $_.Length) }
$verify.Dispose()
