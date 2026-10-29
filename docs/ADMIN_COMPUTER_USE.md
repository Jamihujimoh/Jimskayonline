# Jimskay AI — General Windows Computer Use

Admin Mode now combines several layers instead of depending on mouse coordinates alone:

- `pcControl`: low-level Windows mouse, keyboard, window, screenshot, media, volume and guarded system control.
- `windowsUiAutomation`: semantic Windows UI Automation for accessible controls by name, AutomationId and control type.
- `browserAutomation`: visible Chromium automation with a persistent Jimskay AI browser profile for navigation, text inspection, selector-based interaction, tabs, waits and screenshots.
- Existing filesystem, process, clipboard, PowerShell, scheduling and authorized-download capabilities remain available.

The agent is instructed to inspect before acting, verify changed state, recover from failures, and prefer semantic UI controls over guessed coordinates.

If `JIMSKAY_BROWSER_DEBUG_URL` is configured, browser automation can attach to a Chromium debugging endpoint. Otherwise it starts a separate persistent Jimskay AI browser profile.

Browser automation does not bypass DRM, authentication controls, paywalls, hidden media URLs, or website download restrictions. Authorized downloads must use the site's normal UI.
