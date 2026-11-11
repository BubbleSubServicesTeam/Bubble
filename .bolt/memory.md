# Project memory

## Product intent & audience

- “Bubble” is a Vite + React chat/messaging app intended to feel polished, reliable, and production-ready.
- Core use cases include 1:1 and group chats, replies, message selection, editing, saved messages, file sharing, translation, wallpapers, notifications, availability, and account/security settings.
- Users expect chats, drafts, authentication state, and message state to work consistently across phone and computer.

## Brand personality & voice

- Polished, capable, and feature-rich rather than generic or barebones.
- Chat and security flows should feel stable, immediate, trustworthy, and predictable.
- Empty states and fallback UI should feel intentionally designed rather than like default platform UI.

## Visual design & UX direction

- Preserve the existing Vite/React patterns and icon system; avoid unnecessary UI dependencies.
- The composer remains bottom-oriented, supports multi-line text, and should preserve drafts without awkward page scrolling.
- Chat opening should land at the bottom or last-read position without repeated loading states or visible jumps.
- Message selection and replies should retain and display the exact selected excerpt, with clear source-message context near the composer and sender/header.
- Editing needs a multi-line editor that preserves complete content for text, code, HTML, embeds, and similar message types.
- Menus must have reliable layering, hit targets, and dismiss behavior; three-dot menu options must remain clickable above any backdrop.
- Avatar and PIN-screen image states need loading and failure handling. Broken or absent images should use polished initials/colored fallbacks rather than black or generic-looking placeholders.
- File handling should accept and accurately identify broad file types, including PDFs and MIME types, with appropriate preview/download behavior.
- Settings should use selectable geographic controls (province/state and postal/ZIP data), support visibility controls for profile/location details, and expose availability prominently near the top.
- Favor responsive, accessible controls and explicit loading/error/empty states, especially for authentication, uploads, translation, chat menus, and settings.

## Decisions, constraints & rationale

- Reply selections retain the exact excerpt in the message model so sent replies and synchronization preserve what was selected.
- Editing is enabled for the user’s own text, code, HTML, and embed messages through a larger multi-line editor.
- A recent build passed after fixing avatar/PIN image fallbacks and removing an obsolete logo fallback import.
- PIN-screen profile images now show a loading state and fall back to richer initials when loading fails or no image exists.
- The three-dot menu layering issue was fixed so its options can be clicked; its action label is now “Copy invite link.”
- “Copy invite link” currently copies the existing chat link. A server-validated special link that automatically adds any account to a group without a separate invitation is not implemented and must not be represented as complete until authorization, abuse prevention, expiry/revocation, and membership behavior are defined.
- Password/PIN lock recovery must clear correctly after the alternate credential succeeds and remain cleared after reload; this behavior still needs verification.
- Email reset currently reports rate-limit exhaustion even when the user believes it is incorrect; reset-link delivery and rate-limit handling require investigation and a real fix.
- Draft synchronization across devices is required; local-only storage is insufficient.
- Very large files, including PDFs and files up to 20 GB, require dedicated resumable upload/storage behavior.
- Existing product rules: group wallpaper changes are creator-only; 1:1 wallpaper changes are available to either participant; silenced contacts suppress unread indicators, nudges, and push notifications; prioritized contacts receive elevated treatment.
- Existing security and message/file rules include saved-message filtering with revert, specific file-type detection, and Face ID alongside fingerprint/PIN security.

## Open questions & assumptions

- Email reset rate-limit source, cooldown/window, account/IP/device scope, provider response, and whether successful delivery is being recorded are unknown.
- Lock-state persistence and clearing behavior need tests for correct PIN/password entry, reload, app restart, tab switching, and failed attempts.
- Draft sync backend and conflict behavior across phone/computer are not verified.
- Composer auto-resize/scroll behavior and bottom anchoring during new messages, chat reopening, last-read restoration, and older-message reading need testing.
- Invite-link authorization, automatic group joining, link privacy, revocation, expiration, and abuse controls remain unspecified.
- Upload limits, resumability, progress, failure recovery, storage capacity, and actual 20 GB support are unspecified.
- Translation provider, supported languages, offline/error behavior, and message-level UI are unspecified.
- Random logout still needs investigation across session expiry, persistence, refresh, token renewal, and multi-device authentication.
- Province/state and ZIP/postal-code data sources, validation, country differences, and per-field visibility rules are unspecified.
- Long-chat performance still needs deeper profiling and optimization.
- Map/fullscreen location sharing, alert tones, and repository/platform integration remain partly implemented or unclear.