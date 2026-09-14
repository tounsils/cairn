# Collecting the signups

Two working backends. **Pick one.** Both implement the same rules, and those rules live in [`lib/signup.mjs`](lib/signup.mjs), which is the canonical statement of them and is unit tested.

---

## Recommendation: Apps Script

**Use [`apps-script/`](apps-script/SETUP.md). Three minutes, no credentials, free forever, nothing to tear down.**

The reasoning is proportionality. This test collects maybe a few hundred rows over two weeks, and then a human has to **read** them and count how many people named a crew. That is a spreadsheet job. Standing up DynamoDB, IAM, SNS and a Lambda to hold 100 rows is real infrastructure for a question that a Google Sheet answers better, and it leaves you with a public AWS endpoint and four resources to remember to delete.

There is also a smaller reason that matters today: **your AWS credentials do not currently work.** The `default` profile uses static access keys that have been rotated or revoked, and the only profile that authenticates (`dbc-prod`) is scoped to picture uploads and cannot create anything. The AWS path needs you to mint new keys first; the Apps Script path needs a browser tab.

## The AWS path, if you want it in your own infrastructure

[`aws/deploy.ps1`](aws/deploy.ps1) is complete and one command:

```powershell
cd infra/aws
.\deploy.ps1 -Profile default -NotifyEmail tounsils@gmail.com
```

It creates a DynamoDB table, an SNS topic with an email subscription, a least-privilege IAM role, and a Node 20 Lambda behind a Function URL, then prints the endpoint. Plain AWS CLI, no SAM or CDK, so there is nothing else to install. `export.ps1` reads the results and prints the verdict; `destroy.ps1` removes everything and **exports the data first**, because tearing down a test should not destroy what you ran it to collect.

Cost at this scale is effectively zero, inside the perpetual free tier on all four services.

**Blocked on:** new access keys. IAM → Users → your user → Security credentials → Create access key, then `aws configure`.

### Why a Function URL and not API Gateway

One fewer resource to create, pay for and reason about. Function URLs do CORS natively, which is the only thing API Gateway would have added here.

### Why SNS and not SES

SES starts in a sandbox that can only send to verified identities, so it needs an extra verification step for no benefit when the only recipient is you. SNS needs one subscription-confirmation click.

## Explicitly rejected: putting this on the digitalqrcard EC2 box

You suggested it, and it is the wrong shape for two reasons.

**Blast radius.** A public, unauthenticated POST endpoint sharing a host with a production app means anyone who decides to hammer the landing page degrades the real product. A Lambda with reserved concurrency caps its own damage; a shared EC2 instance does not.

**Sending reputation.** Notification mail from that box goes out under digitalqrcard's domain identity. Abuse of an open form endpoint would land on a domain that has actual customers.

A validation experiment should be disposable and isolated. Neither is true of a box running something real.

---

## What both backends do

| | |
|---|---|
| **Honeypot** | A `website` field, positioned off-screen rather than `display:none`, which bots increasingly detect. A filled one is discarded. |
| **Time trap** | A submission under two seconds after page load is treated as automated. Advisory, not security. |
| **Silent filtering** | A caught bot gets the same `200` a person gets. Telling a scraper it was filtered just teaches it what to change. |
| **Permissive email rules** | Strict RFC regexes reject real addresses. Every false rejection is a lost data point, and lost data points push toward killing an idea that was working. |
| **Control-char stripping** | A raw newline reaching a notification email is a header injection. This is a security property, not tidiness. |
| **Duplicate tolerance** | Second submission returns the same success and stores nothing new. The first answer wins, so a blank retry cannot erase the crew someone named. The endpoint never confirms who is on the list. |
| **`named_a_crew` at write time** | The metric the decision turns on is computed on arrival, so the verdict does not depend on re-reading free text later. "yes", "me" and "idk" do not count as naming a crew. |

## The bias, stated once

**When in doubt, accept.** Every rule above leans toward keeping a submission. A validation test that silently drops a real person's answer produces a false negative, and a false negative here means killing an idea that was actually working. That is a worse outcome than a few junk rows in a spreadsheet you are going to read by hand anyway.

## Gates

```bash
npm test     # 19 tests, 0 skipped — the signup rules
npm run lint # structural checks on the page and both backends
npm run check # both
```

`lint` is not cosmetic. It verifies that the two backends agree on the bot threshold and the timer rule, that no raw control bytes have crept into the source, that `FORM_ENDPOINT` is either empty or a real URL and never a half-typed value, and that **the distances on the crew board still match the pins on the map** — which a geography audience would notice immediately.
