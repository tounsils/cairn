<#
  Deploy the Cairn signup collector to AWS.

  Plain AWS CLI on purpose: no SAM, no CDK, no CloudFormation artifact bucket.
  Everything here is one resource you can see in the console and delete by
  running destroy.ps1. For a validation test that may be torn down in two
  weeks, that is the right trade.

  Creates:
    DynamoDB table        cairn-signups            (on-demand)
    SNS topic + email sub cairn-signups-notify
    IAM role + policy     cairn-signup-fn-role     (least privilege)
    Lambda + Function URL cairn-signup             (Node 20)

  Cost at validation scale: effectively zero. Well inside the perpetual free
  tier on all four services.

  Usage:
    .\deploy.ps1 -Profile default -NotifyEmail tounsils@gmail.com
#>

[CmdletBinding()]
param(
  [string]$Profile     = "default",
  [string]$Region      = "us-west-1",
  [string]$NotifyEmail = "tounsils@gmail.com",
  [string]$Origin      = "https://tounsils.github.io",
  [string]$Name        = "cairn-signup",
  [int]$MaxConcurrency = 3,
  [int]$LogRetentionDays = 14
)

$ErrorActionPreference = "Stop"
$Table = "$Name`s"
$Role  = "$Name-fn-role"
$Topic = "$Name-notify"
$here  = $PSScriptRoot

function aws-cli { & aws @args --profile $Profile --region $Region --output json }
function say($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# --- 0. credentials -----------------------------------------------------------
say "Checking credentials"
$who = aws-cli sts get-caller-identity | ConvertFrom-Json
if (-not $who.Account) { throw "No valid credentials for profile '$Profile'." }
Write-Host "    account $($who.Account) as $($who.Arn)"
$AccountId = $who.Account

# --- 1. DynamoDB --------------------------------------------------------------
say "DynamoDB table: $Table"
$exists = $true
try { aws-cli dynamodb describe-table --table-name $Table | Out-Null } catch { $exists = $false }
if (-not $exists) {
  aws-cli dynamodb create-table `
    --table-name $Table `
    --attribute-definitions AttributeName=email,AttributeType=S `
    --key-schema AttributeName=email,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST | Out-Null
  aws-cli dynamodb wait table-exists --table-name $Table | Out-Null
  Write-Host "    created"
} else { Write-Host "    already exists" }

# --- 2. SNS -------------------------------------------------------------------
say "SNS topic: $Topic"
$TopicArn = (aws-cli sns create-topic --name $Topic | ConvertFrom-Json).TopicArn
Write-Host "    $TopicArn"
if ($NotifyEmail) {
  $subs = (aws-cli sns list-subscriptions-by-topic --topic-arn $TopicArn | ConvertFrom-Json).Subscriptions
  if (-not ($subs | Where-Object { $_.Endpoint -eq $NotifyEmail })) {
    aws-cli sns subscribe --topic-arn $TopicArn --protocol email --notification-endpoint $NotifyEmail | Out-Null
    Write-Host "    subscribed $NotifyEmail - CHECK YOUR INBOX AND CONFIRM, or no notifications arrive"
  } else { Write-Host "    $NotifyEmail already subscribed" }
}

# --- 3. IAM -------------------------------------------------------------------
say "IAM role: $Role"
$trust = @{
  Version   = "2012-10-17"
  Statement = @(@{ Effect = "Allow"; Principal = @{ Service = "lambda.amazonaws.com" }; Action = "sts:AssumeRole" })
} | ConvertTo-Json -Depth 8 -Compress

$roleExists = $true
try { aws-cli iam get-role --role-name $Role | Out-Null } catch { $roleExists = $false }
if (-not $roleExists) {
  aws-cli iam create-role --role-name $Role --assume-role-policy-document $trust | Out-Null
  aws-cli iam attach-role-policy --role-name $Role `
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole | Out-Null
  Write-Host "    created, waiting for IAM propagation"
  Start-Sleep -Seconds 12   # IAM is eventually consistent; Lambda create fails without this
} else { Write-Host "    already exists" }

# Least privilege: write to exactly one table, publish to exactly one topic.
$policy = @{
  Version   = "2012-10-17"
  Statement = @(
    @{ Effect = "Allow"; Action = @("dynamodb:PutItem"); Resource = "arn:aws:dynamodb:${Region}:${AccountId}:table/$Table" },
    @{ Effect = "Allow"; Action = @("sns:Publish");      Resource = $TopicArn }
  )
} | ConvertTo-Json -Depth 8 -Compress
aws-cli iam put-role-policy --role-name $Role --policy-name "$Name-write" --policy-document $policy | Out-Null
Write-Host "    inline policy applied"

# --- 4. package ---------------------------------------------------------------
say "Packaging"
$build = Join-Path $here "build"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Path $build | Out-Null
Copy-Item (Join-Path $here "handler.mjs") $build
Copy-Item (Join-Path $here "..\lib\signup.mjs") $build   # flattened; handler imports ./signup.mjs
$zip = Join-Path $here "$Name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $build "*") -DestinationPath $zip
Write-Host "    $([math]::Round((Get-Item $zip).Length / 1KB, 1)) KB"
# aws-sdk v3 is present in the Lambda Node 20 runtime, so nothing is bundled.

# --- 5. Lambda ----------------------------------------------------------------
say "Lambda: $Name"
$RoleArn = (aws-cli iam get-role --role-name $Role | ConvertFrom-Json).Role.Arn
$envVars = "Variables={SIGNUPS_TABLE=$Table,NOTIFY_TOPIC_ARN=$TopicArn,ALLOWED_ORIGIN=$Origin}"

$fnExists = $true
try { aws-cli lambda get-function --function-name $Name | Out-Null } catch { $fnExists = $false }
if ($fnExists) {
  aws-cli lambda update-function-code --function-name $Name --zip-file "fileb://$zip" | Out-Null
  aws-cli lambda wait function-updated --function-name $Name | Out-Null
  aws-cli lambda update-function-configuration --function-name $Name --environment $envVars | Out-Null
  Write-Host "    updated"
} else {
  aws-cli lambda create-function `
    --function-name $Name `
    --runtime nodejs20.x `
    --role $RoleArn `
    --handler handler.handler `
    --zip-file "fileb://$zip" `
    --timeout 10 `
    --memory-size 256 `
    --environment $envVars | Out-Null
  aws-cli lambda wait function-active --function-name $Name | Out-Null
  Write-Host "    created"
}

# A public endpoint with no ceiling is a blank cheque. Reserved concurrency is
# the cost cap: it bounds how fast anyone hammering the endpoint can spend your
# money. Three is ample for a landing page and holds the theoretical worst case
# (someone pinning it flat out for a month) to roughly $35 rather than $130.
aws-cli lambda put-function-concurrency --function-name $Name --reserved-concurrent-executions $MaxConcurrency | Out-Null
Write-Host "    concurrency capped at $MaxConcurrency"

# Lambda log groups default to NEVER EXPIRE, which is the classic way an AWS
# account quietly accrues storage charges for years. Create it explicitly with
# a retention policy rather than letting Lambda create it unbounded.
$logGroup = "/aws/lambda/$Name"
try { aws-cli logs create-log-group --log-group-name $logGroup | Out-Null } catch {}
aws-cli logs put-retention-policy --log-group-name $logGroup --retention-in-days $LogRetentionDays | Out-Null
Write-Host "    logs retained $LogRetentionDays days (default is forever)"

# --- 6. Function URL ----------------------------------------------------------
say "Function URL"
$corsCfg = "AllowOrigins=$Origin,AllowMethods=POST,AllowHeaders=content-type,MaxAge=86400"
$urlExists = $true
try { aws-cli lambda get-function-url-config --function-name $Name | Out-Null } catch { $urlExists = $false }
if ($urlExists) {
  $cfg = aws-cli lambda update-function-url-config --function-name $Name --auth-type NONE --cors $corsCfg | ConvertFrom-Json
} else {
  $cfg = aws-cli lambda create-function-url-config --function-name $Name --auth-type NONE --cors $corsCfg | ConvertFrom-Json
  aws-cli lambda add-permission --function-name $Name --statement-id FunctionURLAllowPublicAccess `
    --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE | Out-Null
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host "  Endpoint: $($cfg.FunctionUrl)"
Write-Host ""
Write-Host "  Next:"
Write-Host "    1. Confirm the SNS subscription email, or notifications never arrive."
Write-Host "    2. Put the endpoint in site/index.html:"
Write-Host "         const FORM_ENDPOINT = `"$($cfg.FunctionUrl)`";"
Write-Host "    3. Push. The Pages workflow deploys it."
Write-Host ""
Write-Host "  Read results:  .\export.ps1 -Profile $Profile"
Write-Host "  Tear down   :  .\destroy.ps1 -Profile $Profile"
