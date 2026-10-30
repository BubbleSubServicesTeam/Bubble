# Project memory

## Product intent & audience

- "Bubble" is a chat/messaging app (likely mobile-first PWA style) built with Vite + React.
- Features include group chats, 1:1 chats, saved/favorited messages, file sharing, wallpapers, notifications, and biometric/security options.
- Audience likely everyday users wanting a polished, production-ready messaging experience.

## Brand personality & voice

- Beautiful, non-cookie-cutter design aimed at production quality.
- Polished and feature-rich rather than minimal.

## Visual design & UX direction

- Uses Tailwind CSS classes, React hooks, Lucide React icons (per `.bolt/prompt`).
- Custom wallpapers with presets + upload capability.
- Chat messages should surface newest at top only when a new message arrives (not the other way around).
- Scroll-to-bottom button ("get to bottom") and auto-pin behaviors were broken; being fixed.
- Three-dot menu system for chat views (saved messages, all files, notification settings, alert tones).
- Download buttons next to photos/files in file-view mode.
- Profile-based contact settings (prioritize, silence, notification control).

## Decisions, constraints & rationale

- Duplicate `Bell` icon import in chat window caused preview to fail loading — fixed by removing duplicate.
- File detection was incorrectly labeling all files as GIFs; needs more specific file-type detection.
- Group chat wallpaper changes restricted to group creator only; 1:1 chats allow either participant.
- Security includes Face ID in addition to fingerprint and PIN (not replacing security flow).
- Silenced contacts: hide unread indicators, new messages go to bottom, no nudge, no push notifications.
- Prioritized contacts receive elevated messaging treatment.
- Saved messages: three-dot menu shows only saved messages (non-saved hidden), with revert option.

## Open questions & assumptions

- Repository connection to "make bubble a repository" — needs user to clarify which repo and platform (GitHub?).
- Auto-lock pin behavior: "auto put the pin up when off tab or after inactivity for one minute" — needs confirmation on exact trigger conditions.
- Map/fullscreen location sharing partly implemented but untested on mobile.
- Several features acknowledged but not yet started; user asked to prioritize.
- Alert tones: unclear if custom upload or preset selection is desired.