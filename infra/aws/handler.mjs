/**
 * Cairn signup collector — AWS Lambda behind a Function URL.
 *
 * No API Gateway: a Function URL is a direct HTTPS endpoint with built-in
 * CORS, which is one fewer resource to create, pay for and reason about.
 *
 * Storage is DynamoDB on-demand and notification is SNS. SNS rather than SES
 * because SES starts in a sandbox that can only send to verified identities,
 * which is one more setup step for no benefit when the only recipient is you.
 *
 * The validation rules live in ../lib/signup.mjs and are unit tested. This
 * file is transport only: parse, delegate, persist, respond.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { LIMITS, buildSignup, namedACrew } from "./signup.mjs";

const TABLE = process.env.SIGNUPS_TABLE;
const TOPIC = process.env.NOTIFY_TOPIC_ARN;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const reply = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", ...cors },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? "POST";
  if (method === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (method === "GET") return reply(200, { ok: true, service: "cairn-signup" });
  if (method !== "POST") return reply(405, { ok: false, error: "use POST" });

  // Cap before parsing. An oversized body should cost a length check, not a
  // JSON parse of a megabyte someone sent on purpose.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : event.body ?? "";
  if (raw.length > LIMITS.body) return reply(413, { ok: false, error: "body too large" });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: "body must be JSON" });
  }

  const headers = event.headers ?? {};
  const built = buildSignup(payload, {
    userAgent: headers["user-agent"],
    country: headers["cloudfront-viewer-country"],
    now: new Date().toISOString(),
  });

  // A filtered bot gets the same shape a person gets. Telling a scraper it
  // was caught only teaches it what to change.
  if (!built.ok) {
    return built.silent
      ? reply(200, { ok: true })
      : reply(built.status, { ok: false, error: built.reason });
  }

  const record = built.record;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...record, namedACrew: namedACrew(record.crew) },
        // First answer wins. Someone submitting twice must not overwrite the
        // crew they named the first time with a blank second attempt.
        ConditionExpression: "attribute_not_exists(email)",
      })
    );
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") {
      // Already signed up. Same success response, so the endpoint cannot be
      // used to test whether an address is on the list.
      return reply(200, { ok: true });
    }
    console.error("dynamo put failed", err);
    return reply(500, { ok: false, error: "could not save that, try once more" });
  }

  // Notification is best-effort and must never fail a signup that is already
  // durably stored.
  if (TOPIC) {
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: TOPIC,
          Subject: `Cairn signup - ${record.crew ? record.crew.slice(0, 60) : "no crew named"}`,
          Message:
            `email : ${record.email}\n` +
            `crew  : ${record.crew || "(blank)"}\n` +
            `src   : ${record.src}\n` +
            `named : ${namedACrew(record.crew) ? "YES" : "no"}\n` +
            `when  : ${record.ts}\n`,
        })
      );
    } catch (err) {
      console.error("sns publish failed (signup was still saved)", err);
    }
  }

  return reply(200, { ok: true });
};
