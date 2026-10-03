$ErrorActionPreference = 'Stop'

$dest = "c:\Users\kunal\OneDrive\Desktop\newtonite-operations-app.zip"
if (Test-Path $dest) {
    Remove-Item $dest -Force
}

$workspaceRoot = "c:\Users\kunal\OneDrive\Desktop\tumpa2"
$tempDir = Join-Path $env:TEMP "newtonite_zip_stage"

if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$allFiles = Get-ChildItem -Path $workspaceRoot -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](node_modules|\.next|dist|\.git|\.data)[\\/]' -and
    $_.Extension -ne '.zip'
}

Write-Host "Staging $($allFiles.Count) files..."

foreach ($file in $allFiles) {
    $relative = $file.FullName.Substring($workspaceRoot.Length).TrimStart('\', '/')
    $targetPath = Join-Path $tempDir $relative
    $parentDir = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $targetPath
}

Write-Host "Compressing to $dest..."
Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $dest -Force

# Mirror to workspace root as well
$workspaceZip = Join-Path $workspaceRoot "newtonite-operations-app.zip"
Copy-Item -LiteralPath $dest -Destination $workspaceZip -Force

Remove-Item $tempDir -Recurse -Force

$zipInfo = Get-Item $dest
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host "✅ Successfully created archive at:"
Write-Host "   1. $dest ($sizeMB MB)"
Write-Host "   2. $workspaceZip ($sizeMB MB)"
