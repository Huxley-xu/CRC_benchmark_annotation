# SurgeBenchmark — Easiest Deploy (Firebase Hosting + Google Drive videos)

Goal: a small group of doctors can open a real URL, sign in with Google, and
review benchmarks. Videos stay on Google Drive.

---

## One-time setup (about 10 minutes)

### 1. Install the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 2. Confirm the project is linked

`.firebaserc` is already pointing to `gen-lang-client-0279472713`. Verify:

```bash
cd surgebenchmark
firebase projects:list
firebase use default
```

### 3. Enable Hosting in the Firebase Console

Go to <https://console.firebase.google.com> → your project →
**Build → Hosting → Get started**. Skip the "install CLI" step (already done),
click through to finish.

### 4. Make sure Google Sign-In is enabled

Console → **Authentication → Sign-in method** → enable **Google** if it isn't
already. The default `*.web.app` and `*.firebaseapp.com` domains are
pre-authorized.

### 5. Add each doctor to the reviewer allowlist

The `firestore.rules` only let users in the `allowedReviewers` collection
read/write. After a doctor signs in once (so Firebase creates their UID):

1. Console → **Authentication → Users** → copy the doctor's UID.
2. Console → **Firestore Database** → create collection `allowedReviewers` →
   Document ID = that UID → add fields like `email`, `name`, `role: "doctor"`.

Do this for yourself first so you can test.

---

## Deploy

From the `surgebenchmark/` folder:

```bash
npm install
npm run build
firebase deploy
```

Done. You'll get a URL like
`https://gen-lang-client-0279472713.web.app` — send it to your doctors.

To redeploy after edits, just rerun `npm run build && firebase deploy`.

---

## How doctors use it

1. Open the URL.
2. Click **Sign in with Google** — must use the email you allowlisted.
3. Pick a patient → review questions → approve / revise / flag.

If a doctor sees "permission denied" errors, they aren't in `allowedReviewers`.

---

## Google Drive video checklist (the #1 cause of "video won't play")

For **every video file**:

1. In Google Drive, right-click the file → **Share**.
2. "General access" → **Anyone with the link**.
3. Role: **Viewer**.
4. Copy the link (looks like
   `https://drive.google.com/file/d/<LONG_ID>/view?usp=sharing`).
5. Paste this URL into the app's video field.

The app auto-converts it to the embeddable `/preview` form. **Folders cannot
be played** — you must pick individual files.

> "Anyone with the link" means anyone who receives or guesses the URL can view.
> Fine for de-identified benchmark clips; not appropriate for raw PHI.

---

## Custom domain (optional)

Console → Hosting → **Add custom domain** → follow the DNS instructions.
HTTPS is provisioned automatically.

---

## Troubleshooting

| Symptom                                  | Fix                                                       |
| ---------------------------------------- | --------------------------------------------------------- |
| `Permission denied` reading patients     | Doctor's UID not in `allowedReviewers`.                   |
| Drive iframe shows Google sign-in wall   | File isn't shared as *Anyone with the link → Viewer*.     |
| "Folder URL Detected" panel              | You pasted a folder URL; pick a single video file.        |
| `firebase deploy` says "no project"      | Run `firebase use default` from the `surgebenchmark/` dir.|
| Blank page after deploy                  | Check browser console; usually a build/env issue.         |
