# TikTok Reporting Update v8

This keeps the existing reporting workflow and adds account reporting, case tracking, and the official Safety Enforcement Tool preparation/opening flow.

## Replace
- `tiktok-reporting.js`

## Keeps
- Existing `/report` endpoint
- Puppeteer reporting flow for videos
- Optional email reporting
- `/history` and `/health`

## Adds
- `POST /report` accepts `videoUrl`, `accountUrl`, or `targetUrl` and `reportData.targetType` (`video` or `account`)
- Account reporting using the same browser workflow
- `POST /official/case` to prepare an auditable case package
- `POST /official/open` to open TikTok Safety Enforcement Tool
- Case folders under `TIKTOK_CASE_ROOT` (default `./tiktok-cases`)
- Clear result status for web vs optional email submission

## Email configuration
Email reporting is now OFF unless:
- `TIKTOK_EMAIL_REPORTING=true`
- `TIKTOK_REPORT_RECIPIENTS` is set to a comma-separated list

Keep your existing `GOVERNMENT_EMAIL_USER` and `GOVERNMENT_EMAIL_PASS` only if your organization is authorized to use that mailbox.

The code does not claim government authority or bypass TikTok's authorization/login controls. The official Safety Enforcement Tool remains the authorized submission route for eligible officials/partners.

## Example video request
```json
{
  "videoUrl": "https://www.tiktok.com/@example/video/123456",
  "reportData": {
    "targetType": "video",
    "classification": "hate",
    "summary": "Describe the suspected policy violation factually.",
    "reasoning": "Provide the evidence and context.",
    "confidenceScore": 92
  }
}
```

## Example account request
```json
{
  "accountUrl": "https://www.tiktok.com/@example",
  "reportData": {
    "targetType": "account",
    "classification": "misleading",
    "summary": "Describe the account-level pattern factually.",
    "reasoning": "Reference the relevant public content."
  }
}
```

Always review evidence and classification before an official submission.
