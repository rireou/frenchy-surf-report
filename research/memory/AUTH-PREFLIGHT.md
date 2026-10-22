# Authentication verification before release

The production release check rejected its own submitted password with HTTP401. It attempted to use the production BEACH_CHECK_SECRET value returned by the hosting environment API as a login credential. This is an unsupported credential source: Netlify marks this variable secret and documents that non-development secret values are not readable through UI/API/CLI. Do not interpret a populated value field as a usable production password. See https://open-api.netlify.com/ (is_secret).

The request was a fresh login, before any cookie was created. In the unchanged observation-auth handler,401 on this POST means credential rejection; expired sessions do not participate in password verification. Origin failures use403 and unconfigured authentication uses503. Both the authentication handler and signing/cookie helper are identical between the rollback baseline and PR73. The owner's normal production browser session was independently verified through the actual endpoint: authenticated:true, configured:true, and observation history accessible. No password was reset and no session token was extracted.

The preview used a separately generated, explicitly known test credential. That explains why its login test could pass while the API-sourced production attempt failed. Production and preview secrets must remain independent. Do not copy a production secret into preview for testing.

## Corrected preflight

`auth-preflight.mjs` takes an explicit credential from a private local JSON file with a password field, or FRENCHY_AUTH_PASSWORD supplied to the process. Never put the password in a command-line argument, public file, commit, tool log or hosting API lookup. Hosting environment API objects are rejected as credential inputs. The tool has no hosting SDK, deployment, rollback, observation-write or storage-write operation.

```powershell
node research/memory/auth-preflight.mjs https://YOUR-APP-ORIGIN PRIVATE-CREDENTIAL-FILE
```

It verifies configuration, login, Secure/HttpOnly/Strict host-only cookie attributes, authenticated session reuse and logout. It refuses redirects and credential-bearing/insecure URLs. Results contain sanitized outcome codes and check names only, never password/cookie/body values. Missing credentials fail before network access. Credential rejection, CSRF/origin rejection, unavailable configuration and session rejection have different outcomes. Failure before deployment is a release gate; it is not evidence that the currently published site must be rolled back.

Run it before merging or publishing, using owner-provided credentials or independently confirm the owner's normal browser session. A successful read-only authenticated browser verification can establish access without copying the owner's password or cookie to a tool. Keep observation writes and research seeding outside this diagnostic.

This change fixes release diagnostics only. Application authentication, session lifetime, forecasts and observation storage are unchanged. Automatic collection remains disabled. Any next production release still requires the owner's separate approval.
