$ErrorActionPreference = 'Stop'
$researchProject = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$researchPrivate = if ($env:FRENCHY_RESEARCH_HOME) { [System.IO.Path]::GetFullPath($env:FRENCHY_RESEARCH_HOME) } else { [System.IO.Path]::GetFullPath((Join-Path $researchProject '../frenchy-research-private')) }
$researchNode = (Get-Command node -ErrorAction Stop).Source
$researchEntry = Join-Path $researchProject 'research/memory/preview.mjs'
if (!(Test-Path -LiteralPath (Join-Path $researchPrivate 'models/model-d-v1.json'))) {
    throw 'The private evidence folder is missing. The preview cannot start without the verified private research ledger.'
}
try {
    $researchHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4187/health' -TimeoutSec 2
    if ($researchHealth.privateResearchPreview -eq $true -and $researchHealth.productionWrites -eq $false) {
        foreach ($researchPage in 'research', 'observe') {
            $researchResponse = Invoke-WebRequest -Uri "http://127.0.0.1:4187/$researchPage" -UseBasicParsing -TimeoutSec 3
            if ($researchResponse.StatusCode -ne 200) { throw "The /$researchPage page did not respond successfully." }
        }
        Write-Host 'The private preview is already running and both pages respond.'
        Write-Host 'Research: http://127.0.0.1:4187/research'
        Write-Host 'Observe:  http://127.0.0.1:4187/observe'
        return
    }
} catch {
    # The foreground server below will report a port conflict or startup error explicitly.
}
Write-Host 'Starting the private preview. Keep this PowerShell window open; press Ctrl+C to stop.'
Write-Host 'Local only; no production writes or deployment. URLs appear only after both pages pass a readiness check.'
Push-Location -LiteralPath $researchProject
try {
    # Run in the foreground: startup errors stay visible and the shell waits for the server.
    & $researchNode $researchEntry $researchPrivate 4187
    if ($LASTEXITCODE -ne 0) { throw "Preview server exited with code $LASTEXITCODE. Read the error above." }
} finally {
    Pop-Location
}
