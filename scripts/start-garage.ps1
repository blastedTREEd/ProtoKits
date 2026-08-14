$ErrorActionPreference = 'Stop'

$isLinked = (Test-Path -LiteralPath '.vercel/project.json' -PathType Leaf) -or
  (Test-Path -LiteralPath '.vercel/repo.json' -PathType Leaf)

if (-not $isLinked) {
  Write-Host 'Linking this folder to the Vercel project (one-time setup)...'
  & vercel link
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path -LiteralPath '.env.local' -PathType Leaf)) {
  Write-Host 'Downloading the Vercel development environment variables...'
  & vercel env pull .env.local
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& vercel dev --listen 5173
exit $LASTEXITCODE
