$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = Join-Path $Root ".runtime"
$ServerRuntime = Join-Path $Root "runtime"
$ServerLog = Join-Path $ServerRuntime "server.log"
$ServerErrorLog = Join-Path $ServerRuntime "server-error.log"
$Url = "http://127.0.0.1:8765"
$HealthUrl = "$Url/api/health"
$RequiredServiceVersion = "0.1.2"
$RequiredHistoryApiVersion = 1

New-Item -ItemType Directory -Force -Path $RuntimeRoot, $ServerRuntime | Out-Null

function Get-Health {
  try {
    return Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
  } catch {
    return $null
  }
}

function Test-Health {
  $response = Get-Health
  return (
    $null -ne $response -and
    $response.ok -eq $true -and
    $response.service -eq "playwright-flow-studio" -and
    $response.version -eq $RequiredServiceVersion -and
    $response.historyApiVersion -eq $RequiredHistoryApiVersion
  )
}

function Stop-OutdatedFlowStudio {
  $response = Get-Health
  if (
    $null -eq $response -or
    $response.ok -ne $true -or
    $response.service -ne "playwright-flow-studio" -or
    (
      $response.version -eq $RequiredServiceVersion -and
      $response.historyApiVersion -eq $RequiredHistoryApiVersion
    )
  ) {
    return
  }

  $connection = Get-NetTCPConnection `
    -LocalAddress "127.0.0.1" `
    -LocalPort 8765 `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return
  }

  $process = Get-CimInstance Win32_Process `
    -Filter "ProcessId=$($connection.OwningProcess)" `
    -ErrorAction SilentlyContinue
  if (
    $process -and
    $process.Name -eq "node.exe" -and
    $process.CommandLine -match "(^|\s|[\\/])server\.mjs(\s|$)"
  ) {
    Write-Host "Stopping outdated Playwright Flow Studio service..."
    Stop-Process -Id $connection.OwningProcess -Force
    Start-Sleep -Milliseconds 500
  }
}

function Get-NodeRuntime {
  $systemNode = Get-Command node -ErrorAction SilentlyContinue
  $systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($systemNode -and $systemNpm) {
    return @{
      Node = $systemNode.Source
      Npm = $systemNpm.Source
    }
  }

  $existingNode = Get-ChildItem -Path (Join-Path $RuntimeRoot "node") `
    -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($existingNode) {
    return @{
      Node = $existingNode.FullName
      Npm = Join-Path $existingNode.Directory.FullName "npm.cmd"
    }
  }

  Write-Host "Node.js not found. Downloading the latest official LTS portable runtime..."
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $index |
    Where-Object { $_.lts -and $_.files -contains "win-x64-zip" } |
    Select-Object -First 1
  if (-not $release) {
    throw "Unable to find a Windows x64 Node.js LTS release."
  }

  $version = $release.version
  $fileName = "node-$version-win-x64.zip"
  $downloadUrl = "https://nodejs.org/dist/$version/$fileName"
  $checksumUrl = "https://nodejs.org/dist/$version/SHASUMS256.txt"
  $archive = Join-Path $RuntimeRoot $fileName
  $nodeRoot = Join-Path $RuntimeRoot "node"

  Invoke-WebRequest -Uri $downloadUrl -OutFile $archive
  $checksums = Invoke-WebRequest -Uri $checksumUrl
  $expected = ($checksums.Content -split "`n" |
    Where-Object { $_ -match "\s+$([regex]::Escape($fileName))\s*$" } |
    Select-Object -First 1) -split "\s+"
  if (-not $expected[0]) {
    throw "Unable to read the Node.js checksum."
  }
  $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[0].ToLowerInvariant()) {
    throw "Node.js archive checksum verification failed."
  }

  New-Item -ItemType Directory -Force -Path $nodeRoot | Out-Null
  Expand-Archive -Path $archive -DestinationPath $nodeRoot -Force
  $node = Get-ChildItem -Path $nodeRoot -Filter node.exe -Recurse |
    Select-Object -First 1
  if (-not $node) {
    throw "Downloaded Node.js runtime does not contain node.exe."
  }

  return @{
    Node = $node.FullName
    Npm = Join-Path $node.Directory.FullName "npm.cmd"
  }
}

if (Test-Health) {
  Start-Process $Url
  Write-Host "Playwright Flow Studio is already running: $Url"
  exit 0
}

Stop-OutdatedFlowStudio

$runtime = Get-NodeRuntime
Push-Location $Root
try {
  & $runtime.Node --input-type=module -e "import('playwright')" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Playwright in the IDE directory..."
    & $runtime.Npm install playwright
    if ($LASTEXITCODE -ne 0) {
      throw "Playwright installation failed."
    }
  }

  Start-Process -FilePath $runtime.Node `
    -ArgumentList "server.mjs" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerLog `
    -RedirectStandardError $ServerErrorLog
} finally {
  Pop-Location
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (Test-Health) {
    Start-Process $Url
    Write-Host "Playwright Flow Studio started: $Url"
    exit 0
  }
  Start-Sleep -Milliseconds 300
}

throw "The local server did not become ready. Check $ServerErrorLog"
