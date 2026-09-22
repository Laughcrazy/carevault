# CareVault

A patient-controlled personal health record for markets where medical history is
scattered across hospitals, labs and pharmacies that don't talk to each other.
Photograph what you're given, the app reads it, and the whole history sits on one
timeline you can hand to a doctor for two hours and then take back.

Not telemedicine. No clinical advice. The app organises documents; the documents
remain the source of truth.

## Status — Step 1 of 7 complete

- [x] **Step 1** Expo scaffold, Expo Router with a route guard, Supabase auth, schema + RLS
- [ ] Step 2 Subject (dependent) management, offline cache
- [ ] Step 3 Capture and upload queue
- [ ] Step 4 Extraction Edge Function
- [ ] Step 5 Health Timeline
- [ ] Step 6 Inbound email intake
- [ ] Step 7 Share links, QR + PIN, doctor's web view

## Running it

```bash
npm install
cp .env.example .env        # fill in your Supabase project URL + anon key
npx supabase link --project-ref <ref>
npx supabase db push        # applies supabase/migrations/0001_init.sql
npx supabase gen types typescript --linked > src/lib/database.types.ts
npx expo start
```

In the Supabase dashboard, turn on email confirmation and set the redirect URL to
`carevault://` so magic links return to the app.

## How this is laid out

```
app/                      routes only — every file is a screen
  _layout.tsx             auth state → route guard. The only place redirects live.
  (auth)/                 sign-in, sign-up
  (app)/                  everything behind the session
src/
  lib/supabase.ts         the one client; session stored in Keychain/Keystore
  lib/secureStorage.ts    chunked SecureStore adapter (JWTs exceed the 2KB cap)
  providers/AuthProvider  session + the four auth actions
  components/ui/          Button, TextField, Screen
  theme/                  tokens
supabase/migrations/      schema, RLS, storage policies
```

## Decisions worth knowing about

**Subjects, not profiles.** Records belong to a *person* — you, your mother, your
child — not to an account. An account grants access to subjects. This makes the
eventual "transfer my father's records to my sister" and "my child turns 18"
flows a migration rather than a rewrite.

**The AI's output is a draft.** `extractions` carries a confidence score, a list
of fields the model was unsure about, and `verified_by_user_at`. Re-processing
adds a revision rather than overwriting, so you can always show what the app
displayed on the day a clinician saw it. Nothing extracted is rendered as fact
until a person has confirmed it, and the source page is always one tap away from
any extracted value.

**Share tokens are hashed at rest, and carry a PIN.** A QR code on a screen can
be photographed from across a room. Link plus a short PIN the patient reads
aloud means the photograph alone is worthless. Every view is logged so the
patient can see who opened their file.

**Inbound addresses are random.** `user123@inbound.…` is guessable, and a
guessable address is an unauthenticated write into someone's medical timeline.
Addresses are 18 hex characters, senders outside the allow-list land in
quarantine, and SPF/DKIM results are recorded.

**Consent is a column, not a checkbox in the onboarding flow.** Under the
Nigeria Data Protection Act 2023 health data is sensitive personal data. No file
is sent to a model before `ai_processing_consent_at` is set, and revoking it
stops processing without deleting what's already there.

**Session tokens live in the Keychain.** Not AsyncStorage. See
`src/lib/secureStorage.ts`.

## Not yet decided

See the notes accompanying this scaffold — data residency, model vendor terms,
and whether video gets an extraction path at all are open questions.
