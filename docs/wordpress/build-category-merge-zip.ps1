Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $base 'ams-category-merge.zip'
$src  = Join-Path $base 'ams-category-merge\ams-category-merge.php'

if (Test-Path $dest) { Remove-Item $dest -Force }

$mode = [System.IO.Compression.ZipArchiveMode]::Create
$zip  = [System.IO.Compression.ZipFile]::Open($dest, $mode)
try {
  # Explicit forward-slash entry name: the ZIP spec requires '/', and PHP's
  # unzip treats a backslash as part of the filename, not a directory break.
  $entry  = $zip.CreateEntry('ams-category-merge/ams-category-merge.php')
  $out    = $entry.Open()
  $bytes  = [System.IO.File]::ReadAllBytes($src)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Close()
} finally {
  $zip.Dispose()
}

# Verify
$check = [System.IO.Compression.ZipFile]::OpenRead($dest)
$check.Entries | ForEach-Object { Write-Output ("ENTRY: " + $_.FullName + "  (" + $_.Length + " bytes)") }
$check.Dispose()
