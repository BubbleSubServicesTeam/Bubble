# Project memory

## Product intent & audience

- “Bubble” is a Vite + React chat/messaging app intended to feel polished, reliable, and production-ready.
- Core use cases include 1:1 and group chats, replies, message selection, editing, saved messages, file sharing, translation, wallpapers, notifications, and account/security settings.
- Users expect chats to work consistently across phone and computer, including synchronized drafts and message state.

## Brand personality & voice

- Polished, capable, and feature-rich rather than generic or barebones.
- Chat interactions should feel stable, immediate, and predictable, especially during composing, replying, scrolling, and switching conversations.

## Visual design & UX direction

- Use the existing Vite/React UI patterns and project icon system; avoid introducing unnecessary UI dependencies.
- The composer should remain visible at the bottom, expand for multi-line text without forcing awkward page scrolling, and preserve drafts.
- Chat opening should land at the bottom or last-read position without repeatedly displaying a loading state or visibly jumping.
- Message selection should use a familiar selected-text treatment and show the exact excerpt in a reply preview above the composer.
- Replies should clearly identify the source message and selected excerpt; a reply action should be available near the sender name/header where appropriate.
- Editing needs a multi-line editor that preserves full content for text, code, HTML, embeds, and similar message types.
- File views should support appropriate download actions and accurate file-type handling.
- Settings that require location information should use selectable country, city, and ZIP/postal-code controls.
- Favor responsive, accessible controls and clear loading/error states, particularly for chat, uploads, translation, and settings.

## Decisions, constraints & rationale

- Reply selections now retain the exact selected excerpt instead of only linking to the first selected message or discarding the text.
- The excerpt is stored in the message model so it can render in the sent reply and synchronize across devices.
- Editing is enabled for the user’s own text, code, HTML, and embed messages through a larger multi-line editor.
- The chat build was reported successful after applying the reply/edit changes and resolving nearby compile issues.
- Draft synchronization across devices is required; local-only storage is insufficient. The implementation still needs verification.
- The user prioritizes chat stability: bottom anchoring, composer behavior, switching chats, session persistence, and reduced glitches are more urgent than cosmetic work.
- Very large files, including PDFs and files up to 20 GB, require a dedicated upload/storage design; this has not been confirmed as implemented.
- Translation, random logout/session persistence, long-chat performance, and location selectors remain separate areas requiring focused work.
- Existing product rules: group wallpaper changes are creator-only; 1:1 wallpaper changes are available to either participant; silenced contacts suppress unread indicators, nudges, and push notifications; prioritized contacts receive elevated treatment.
- Existing message/file rules include saved-message filtering with revert, specific file-type detection rather than defaulting to GIF, and Face ID alongside fingerprint/PIN security.

## Open questions & assumptions

- Draft sync backend and conflict behavior across phone/computer are not yet verified.
- The exact composer auto-resize/scroll behavior and whether the page or only the input should scroll still need testing on mobile and desktop.
- “Always appear at the bottom” needs confirmation for new messages, chat reopening, last-read restoration, and when the user is reading older messages.
- The root cause and scope of chat glitches remain unresolved beyond the reported reply/edit changes.
- Upload limits, resumable uploads, progress, failure recovery, and storage support for 20 GB files are unspecified.
- Translation provider, supported languages, offline/error behavior, and message-level UI are unspecified.
- Random logout needs investigation into session expiry, persistence, refresh behavior, and multi-device authentication.
- Country/city/ZIP selection data source and validation rules are unspecified.
- Auto-lock behavior still needs confirmation for tab switching versus one minute of inactivity.
- Map/fullscreen location sharing remains partly implemented and untested on mobile.
- Alert tones and the repository/platform integration remain unclear.