# ==============================================================================
# GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION)
# Automated GitHub + Supabase + Vercel Deployment Script
# ==============================================================================
param(
    [string]$RepoName = "gt6-rafa-vice-city",
    [string]$SupabaseProjectRef = "zlucagunxgtzakncqtww",
    [string]$SupabaseUrl = $env:SUPABASE_URL,
    [string]$SupabaseAnonKey = $env:SUPABASE_ANON_KEY,
    [switch]$ApplySupabaseSchema,
    [switch]$CreateGitHubRepo,
    [switch]$DeployVercelProd
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host " 🌴 GT6 RAFA: FUGA DE VICE CITY - CLOUD DEPLOYMENT SETUP 🚔" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# 1. Verify Git & Commit
if (-not (Test-Path ".git")) {
    git init
}
git branch -M main

Write-Host "`n[1/4] Staging project files..." -ForegroundColor Yellow
git add .
$status = git status --porcelain
if ($status) {
    git commit -m "feat: GT6 Rafa Vice City 3D Police Chase (Supabase + Vercel)"
    Write-Host "✓ Committed project changes on branch 'main'." -ForegroundColor Green
} else {
    Write-Host "✓ Working tree is already clean." -ForegroundColor Green
}

# 2. GitHub Repository Creation / Push (Authenticated as nelson-jmsf)
if ($CreateGitHubRepo) {
    Write-Host "`n[2/4] Creating/Pushing GitHub repository '$RepoName'..." -ForegroundColor Yellow
    $remoteExists = git remote
    if ($remoteExists -notcontains "origin") {
        gh repo create $RepoName --public --source=. --remote=origin --push
    } else {
        git push -u origin main
    }
    Write-Host "✓ GitHub repository pushed!" -ForegroundColor Green
} else {
    Write-Host "`n[2/4] Skipping GitHub creation (pass -CreateGitHubRepo to create & push via gh CLI)." -ForegroundColor DarkGray
}

# 3. Supabase Schema & Environment Setup
if ($ApplySupabaseSchema -and $SupabaseProjectRef) {
    Write-Host "`n[3/4] Applying supabase/schema.sql to project '$SupabaseProjectRef'..." -ForegroundColor Yellow
    supabase db query --linked --project-ref $SupabaseProjectRef -f supabase/schema.sql
    Write-Host "✓ Applied supabase/schema.sql!" -ForegroundColor Green
}
if ($SupabaseUrl -and $SupabaseAnonKey) {
    Write-Host "Writing .env.local with Supabase credentials..." -ForegroundColor Yellow
    @(
        "SUPABASE_URL=$SupabaseUrl",
        "SUPABASE_ANON_KEY=$SupabaseAnonKey",
        "PORT=3000"
    ) | Set-Content -Path ".env.local" -Encoding UTF8
    Write-Host "✓ Saved .env.local" -ForegroundColor Green
} elseif (-not $ApplySupabaseSchema) {
    Write-Host "`n[3/4] Note: Pass -ApplySupabaseSchema (and/or -SupabaseUrl / -SupabaseAnonKey) to migrate Supabase." -ForegroundColor DarkGray
}

# 4. Vercel Deployment (Authenticated as nelson-jmsf)
if ($DeployVercelProd) {
    Write-Host "`n[4/4] Deploying to Vercel Production..." -ForegroundColor Yellow
    vercel --prod --yes
    Write-Host "✓ Deployed to Vercel Production!" -ForegroundColor Green
} else {
    Write-Host "`n[4/4] Ready to deploy! Run with -DeployVercelProd or execute 'vercel --prod --yes'." -ForegroundColor Cyan
}
