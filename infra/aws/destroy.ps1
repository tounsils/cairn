<#
  Remove everything deploy.ps1 created.

  Exports the signups first. Tearing down a validation test should not be the
  thing that destroys the data you ran it to collect.

  Usage: .\destroy.ps1 -Profile default
#>

[CmdletBinding()]
param(
  [string]$Profile = "default",
  [string]$Region  = "us-west-1",
  [string]$Name    = "cairn-signup"
)

$ErrorActionPreference = "Continue"
$Table = "$Name`s"
$Role  = "$Name-fn-role"

function aws-cli { & aws @args --profile $Profile --region $Region --output json }

Write-Host "==> Backing up signups before deleting anything" -ForegroundColor Cyan
try {
  & (Join-Path $PSScriptRoot "export.ps1") -Profile $Profile -Region $Region -Table $Table -Out "signups-final.csv"
} catch {
  Write-Host "    export failed: $_" -ForegroundColor Yellow
  $ans = Read-Host "    Continue and delete anyway? (yes/no)"
  if ($ans -ne "yes") { Write-Host "Aborted."; exit 1 }
}

Write-Host "==> Deleting Lambda + Function URL" -ForegroundColor Cyan
try { aws-cli lambda delete-function-url-config --function-name $Name | Out-Null } catch {}
try { aws-cli lambda delete-function --function-name $Name | Out-Null } catch {}

Write-Host "==> Deleting IAM role" -ForegroundColor Cyan
try { aws-cli iam delete-role-policy --role-name $Role --policy-name "$Name-write" | Out-Null } catch {}
try {
  aws-cli iam detach-role-policy --role-name $Role `
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole | Out-Null
} catch {}
try { aws-cli iam delete-role --role-name $Role | Out-Null } catch {}

Write-Host "==> Deleting SNS topic" -ForegroundColor Cyan
try {
  $arn = (aws-cli sns create-topic --name "$Name-notify" | ConvertFrom-Json).TopicArn
  aws-cli sns delete-topic --topic-arn $arn | Out-Null
} catch {}

Write-Host "==> Deleting DynamoDB table" -ForegroundColor Cyan
try { aws-cli dynamodb delete-table --table-name $Table | Out-Null } catch {}

Write-Host ""
Write-Host "Torn down. Data saved to signups-final.csv (gitignored)." -ForegroundColor Green
