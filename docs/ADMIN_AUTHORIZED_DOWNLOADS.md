# Authorized Browser Downloads

Admin Mode supports an authorized browser-download workflow.

## Workflow
1. Open the target site in the normal browser.
2. Search for the requested content.
3. Inspect the visible page with the computer-use screenshot loop.
4. Use the website's own **Download** control only when it is available and the user is authorized to use it.
5. Do not extract hidden media URLs or bypass DRM, paywalls, authentication, or site download restrictions.
6. After the browser starts the download, call `waitForAuthorizedDownload` to watch the Windows Downloads folder and verify that a completed file appeared.

The verification tool only observes the local Downloads folder; it does not perform media extraction or restriction bypass.
