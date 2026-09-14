<#
  Read the signups and print the numbers docs/validation.md decides on.
  Also writes a CSV so the free-text crew answers can be read individually,
  which is the part that actually matters.

  Usage: .\export.ps1 -Profile default
#>

[CmdletBinding()]
param(
  [string]$Profile = "default",
  [string]$Region  = "us-west-1",
  [string]$Table   = "cairn-signups",
  [string]$Out     = "signups.csv"
)

$ErrorActionPreference = "Stop"

$raw = & aws dynamodb scan --table-name $Table --profile $Profile --region $Region --output json | ConvertFrom-Json
$rows = @($raw.Items | ForEach-Object {
  [pscustomobject]@{
    ts      = $_.ts.S
    email   = $_.email.S
    crew    = $_.crew.S
    src     = if ($_.src.S) { $_.src.S } else { "direct" }
    named   = if ($_.namedACrew.BOOL) { "yes" } else { "no" }
    country = $_.country.S
  }
})

if ($rows.Count -eq 0) { Write-Host "No signups yet."; exit 0 }

# signups.csv is gitignored - it holds real email addresses.
$rows | Sort-Object ts | Export-Csv -Path $Out -NoTypeInformation -Encoding utf8

$total = $rows.Count
$named = @($rows | Where-Object { $_.named -eq "yes" }).Count
$warm  = @($rows | Where-Object { $_.src -match '^(personal|friends|family|linkedin)' }).Count
$pct   = [math]::Round(($named / $total) * 100, 1)

Write-Host ""
Write-Host "  total          $total"
Write-Host "  named a crew   $named ($pct%)"
Write-Host "  cold / warm    $($total - $warm) / $warm"
Write-Host ""
Write-Host "  by source:"
$rows | Group-Object src | Sort-Object Count -Descending |
  ForEach-Object { Write-Host ("    {0,-24} {1}" -f $_.Name, $_.Count) }

$verdict =
  if ($pct -lt 20)      { "KILL - they want a puzzle, not a crew (under 20% named one)" }
  elseif ($total -ge 100) { "BUILD - 100+ signups and the crew idea landed" }
  elseif ($total -ge 30)  { "THIN - real but weak. One rewrite, one new channel, two more weeks" }
  else                    { "NO SIGNAL YET - likely a traffic problem, not a concept verdict" }

Write-Host ""
Write-Host "  verdict: $verdict" -ForegroundColor Yellow
Write-Host "  csv    : $Out"
Write-Host ""
Write-Host "  Read the crew answers yourself. The percentage is the gate, but the" -ForegroundColor DarkGray
Write-Host "  sentences are where you find out what people think they are buying." -ForegroundColor DarkGray
