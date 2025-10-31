### SMS to ChatGPT - Cloudflare Worker (TypeScript)

Stateless SMS intake using Twilio and OpenAI Responses API. No server-side persistence. The Worker rebuilds a short transcript on each request and guides the user to a structured payload, then submits to your API.

## Endpoints
- POST `/api/sms` - Twilio webhook (application/x-www-form-urlencoded)
- GET `/test/external-api` - Test route to verify external API integration (returns mock payload and result)

## Setup
1) Buy/configure a Twilio number. Set Messaging webhook to `https://<your-worker>.workers.dev/api/sms`.
2) Set secrets:
   - `wrangler secret put OPENAI_API_KEY`
   - `wrangler secret put TWILIO_ACCOUNT_SID`
   - `wrangler secret put TWILIO_AUTH_TOKEN`
3) Adjust vars in `wrangler.toml`:
   - `TWILIO_NUMBER`, `EXTERNAL_API_URL`, `EXTERNAL_API_KEY`, `DEDICATED_PROMPT`, `VERIFY_TWILIO_SIGNATURE`
4) Local: `npm run dev`
5) Deploy: `npm run deploy`

## Notes
- Stateless by design - no storage. The Worker fetches the last 6 to 10 messages to reconstruct context.
- Keep `DEDICATED_PROMPT` short and directive.
- For production set `VERIFY_TWILIO_SIGNATURE` to `true`.
- SMS responses are concise and under 800 chars, one question at a time.

## Env vars
Defined in `wrangler.toml` (non-secrets):
- `VERIFY_TWILIO_SIGNATURE` (default "false")
- `TWILIO_NUMBER`
- `EXTERNAL_API_URL`
- `EXTERNAL_API_KEY` (optional)
- `DEDICATED_PROMPT`

Secrets to set via `wrangler secret`:
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

## Flow
- Verify Twilio signature if enabled.
- Rebuild transcript from Twilio Messages API.
- Call OpenAI Responses API with tools:
  - `ask_user({ question })`
  - `submit_if_ready({ payload })`
- Tools send SMS directly, or submit to your API when ready.

