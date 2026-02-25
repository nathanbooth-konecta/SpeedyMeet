# SpeedyMeet

A Chrome extension that automatically redirects Google Meet links to the Google Meet PWA, providing a unified experience with simplified tab management.

## How It Works

SpeedyMeet detects when you click on a Google Meet link and automatically redirects the meeting to the PWA window. Here is the redirect flow:

1. **Background service worker detects** a Meet URL is opened in a regular tab
2. **Message sent to PWA content script** with the meeting code
3. **PWA navigates** to the correct meeting room
4. **Originating tab closes** automatically, keeping your browser clean

If the PWA is not open, the extension displays a badge indicator (!) on the toolbar to remind you.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the SpeedyMeet folder
6. The extension icon will appear in your toolbar

## Usage

1. **Open the Google Meet PWA** first (via the installed web app or `meet.google.com`)
2. **Click any Google Meet link** in your browser
3. The meeting will automatically open in the PWA and the original tab will close

When the PWA is not running, a red badge with `!` appears on the extension icon as a visual reminder.

## Permissions

SpeedyMeet uses the following permissions:

- **scripting** — Allows the extension to inject content scripts on meet.google.com to detect redirects and manage tab closure
- **storage** — Stores the PWA window ID in session storage to track which window contains the active PWA instance
- **host_permissions** for `https://meet.google.com/*` — Enables interception and redirection of Meet URLs

The `tabs` permission was intentionally removed to minimize install warnings. The `host_permissions` grant provides sufficient tab URL access for matching domains.

## Security

SpeedyMeet includes several security measures to ensure safe operation:

- **Hostname validation** — All URLs are validated to confirm they target `meet.google.com`
- **Sender verification** — Message handlers verify that all messages originate from the extension itself (`sender.id === chrome.runtime.id`)
- **Meeting code format validation** — Only valid Google Meet paths matching the pattern `xxx-xxxx-xxx` or known routes like `/new` and `/lookup/` are accepted
- **Explicit Content Security Policy** — The manifest specifies a strict CSP that blocks inline scripts and disallows unsafe operations
- **Minimal permissions** — The extension only requests the specific permissions needed for core functionality

## Architecture

SpeedyMeet consists of three main components:

- **background.js** — A service worker that monitors tab updates, detects Meet URLs, manages the PWA window, and handles inter-component messaging
- **contentScript.js** — Injected on all meet.google.com pages. It has two modes:
  - When running in the PWA: listens for redirect messages, validates the meeting path, and navigates to the correct room
  - When running in a regular tab: displays a notice when redirection occurs
- **popup.html / popup.js / popup.css** — The extension popup that displays usage instructions and provides a link to the GitHub issues page

## Limitations and Notes

- **PWA must be open** — SpeedyMeet only redirects when the Google Meet PWA is running. If it's closed, you'll see a `!` badge reminder
- **No redirect during active calls** — If you're already on a call in the PWA, the extension will not redirect a new link to prevent interruption
- **authuser parameter** — The extension appends `authuser=0` by default to ensure the correct Google account is used (unless already present in the URL)

## Contributing

Found a bug or have a feature request? Please open an issue on GitHub:

https://github.com/rexfm/SpeedyMeet/issues
