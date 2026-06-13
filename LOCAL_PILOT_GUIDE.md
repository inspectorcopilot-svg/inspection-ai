# Inspection Co-Pilot Local Pilot Guide

## What This Pilot Is For

This local pilot lets an inspector test the full co-pilot workflow:

1. Start a titled inspection.
2. Record observations by voice or typing.
3. Attach photos to findings.
4. Review, approve, reject, or override findings.
5. Verify photo documentation.
6. Save the inspection.
7. Open the saved inspection on the desktop.
8. Copy approved blocks and download photos for external report software.

The app remains an inspection workflow assistant. It does not replace the
inspector's report software.

## Install Once

Before sharing an installed pilot folder, the pilot administrator must rotate
any development API key and exclude the local `.env` file from the copy.

Double-click:

```text
Install Inspection Co-Pilot.cmd
```

This creates two desktop shortcuts:

- `Inspection Co-Pilot`
- `Stop Inspection Co-Pilot`

## Start The Pilot

Double-click the `Inspection Co-Pilot` desktop shortcut. The local services
start quietly and the app opens automatically. No terminal commands are
required for ordinary use.

Use the `Stop Inspection Co-Pilot` desktop shortcut when the local pilot is
finished for the day.

For phone or tablet access, connect the device to the same Wi-Fi network as
the computer and open the computer's local IPv4 address with port `5173`.
For example: `http://192.168.1.25:5173/`.

Add that page to the phone or tablet home screen for quick access. This
same-Wi-Fi shortcut is the no-cost local pilot option. A standalone mobile
install still requires hosted HTTPS or a packaged mobile app.

If Windows Firewall asks for permission, allow access on private networks.

## Local Pilot Login

During installation, Windows asks the pilot administrator to choose a local
username and password. The inspector uses that login when the app opens.

These are local pilot credentials only. They are not a replacement for
production user accounts.

The admin login is for the owner/development workflow. The tester login is
for field testing with inspectors. Change the tester password before giving
it out by editing:

```text
users/tester/pilot_config.json
```

## First Login Walkthrough

The first successful login opens an optional walkthrough explaining the main
inspection workflow areas. The inspector can skip it at any time.

To replay the walkthrough later:

1. Open the profile icon.
2. Select `Help`.

## Field Workflow

1. Sign in with the current local pilot account.
2. Tap `New` and enter a working title such as the property address.
3. Record observations and attach photos as the inspection progresses.
4. Watch the status badge. `Online` means changes can save to the computer.
5. Use `Review` to approve, reject, or override findings.
6. Use `Complete` for readiness checks and approved copy/paste blocks.
7. Tap `Save for Desktop` before ending the field portion.

The backend also saves after observations, follow-up answers, photo uploads,
review decisions, and completion checks.

## Desktop Handoff

1. Open `http://localhost:5173/` on the computer.
2. Sign in.
3. Open the profile menu and choose `Load`.
4. Search by inspection title or address.
5. Open the saved inspection.
6. Use completion mode to copy approved blocks and download photos for the
   inspector's preferred report software.

## Back Up Local Pilot Data

Run:

```powershell
cd C:\inspection-ai
.\backup-local-data.ps1
```

The backup is written to `C:\inspection-ai\backups`.

## Important Pilot Limits

- The computer must remain on while the phone or tablet is in use.
- The field device and computer must stay on the same Wi-Fi network.
- This is a single local pilot account, not production authentication.
- Data is stored locally on the computer, not in cloud storage.
- Voice, camera, and clipboard behavior should be tested on the actual phone.
- Keep the inspector's normal process as the backup during pilot inspections.

## Suggested Test Pass

Before a live inspection, run one practice session:

1. Start a titled inspection.
2. Submit at least two observations.
3. Attach a photo.
4. Approve one finding and reject one finding.
5. Complete the readiness review.
6. Save for desktop.
7. Load the session from the desktop.
8. Paste a copy block into a temporary document.
9. Download a photo.
10. Run the local backup script.
