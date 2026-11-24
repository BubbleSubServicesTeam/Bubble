import { supabase } from './supabase';
import { translateText } from './translate';

/*
Live Call Translation.

Sender side:  speech recognition turns your microphone audio into text
              (finalized phrases only), each phrase is translated to the
              listener's language and broadcast over the call's existing
              signaling channel.
Receiver side: incoming phrases are translated for the local listener
               (skipping their secondary language), then spoken aloud with
               speech synthesis, ducking the call audio while speaking.

Everything rides the same broadcast channel the call already uses, so it
works identically for audio (WebRTC) and video (embedded page) calls.
*/

export type VoiceTranslationSignal =
  | { kind: 'vt_phrase'; callId: string; from: string; text: string; fromLang: string | null; seq: number };

export type ProfileLangInfo = {
  userId: string;
  nativeLanguage: string | null;
  secondaryLanguage: string | null;
};

const BCP47_OVERRIDES: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', hi: 'hi-IN', nl: 'nl-NL', ru: 'ru-RU', tr: 'tr-TR', sv: 'sv-SE', da: 'da-DK', no: 'nb-NO', fi: 'fi-FI', pl: 'pl-PL', cs: 'cs-CZ', el: 'el-GR', ro: 'ro-RO', hu: 'hu-HU', th: 'th-TH', vi: 'vi-VN', id: 'id-ID', ms: 'ms-MY', he: 'he-IL', uk: 'uk-UA', ca: 'ca-ES' };

export function toBcp47(lang: string | null | undefined): string {
  if (!lang) return 'en-US';
  return BCP47_OVERRIDES[lang] ?? lang;
}

function langBase(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const base = lang.split('-')[0].toLowerCase();
  return base.length === 2 ? base : null;
}

export type VoiceTranslationHandle = {
  stop: () => void;
  isSupported: () => boolean;
};

type StartParams = {
  callId: string;
  myUserId: string;
  isGroup: boolean;
  /** Everyone else on the call, with their language preferences. */
  peers: ProfileLangInfo[];
  /** Signaling sender — the call's existing broadcast channel. */
  sendSignal: (payload: VoiceTranslationSignal) => void;
  /** Register a listener for incoming translation phrases. */
  onSignal: (handler: (payload: VoiceTranslationSignal) => void) => () => void;
  /** Notified with the transcript line shown in the call UI. */
  onCaption?: (line: { text: string; mine: boolean; lang: string | null; id: number }) => void;
  /** Notified when speaking synthesized audio starts/stops (to duck call audio). */
  onSpeakingChange?: (speaking: boolean) => void;
};

/**
 * Starts live voice translation for the current call.
 * Returns a handle whose `stop()` ends recognition and playback.
 */
export function startVoiceTranslation(params: StartParams): VoiceTranslationHandle {
  const captionIdRef = { current: 0 };
  let stopped = false;
  const spokenSeqs = new Set<number>();
  const synth = window.speechSynthesis;
  const recognition: any = null;

  const myLang = () => {
    const me = params.peers.find(p => p.userId === params.myUserId);
    return me?.nativeLanguage ?? null;
  };
  const mySecondary = () => {
    const me = params.peers.find(p => p.userId === params.myUserId);
    return me?.secondaryLanguage ?? null;
  };

  // ---- Playback (receiver side) ----

  function bestVoiceFor(lang: string): SpeechSynthesisVoice | null {
    if (!synth) return null;
    const target = toBcp47(lang);
    const voices = synth.getVoices();
    const exact = voices.find(v => v.lang.replace('_', '-').toLowerCase() === target.toLowerCase());
    if (exact) return exact;
    const base = lang.split('-')[0].toLowerCase();
    const partial = voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(base));
    return partial ?? null;
  }

  function duckCallAudio(duck: boolean) {
    params.onSpeakingChange?.(duck);
  }

  function speak(text: string, lang: string | null) {
    if (!synth || !text.trim()) return;
    const utter = new SpeechSynthesisUtterance(text);
    const bcp = toBcp47(lang);
    utter.lang = bcp;
    const voice = bestVoiceFor(lang ?? 'en');
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.onstart = () => duckCallAudio(true);
    utter.onend = () => duckCallAudio(false);
    utter.onerror = () => duckCallAudio(false);
    duckCallAudio(true);
    synth.speak(utter);
  }

  async function handleIncomingPhrase(p: Extract<VoiceTranslationSignal, { kind: 'vt_phrase' }>) {
    if (stopped || p.from === params.myUserId) return;
    if (spokenSeqs.has(p.seq)) return;
    spokenSeqs.add(p.seq);
    if (spokenSeqs.size > 200) { // keep the set bounded
      const it = spokenSeqs.values().next();
      if (!it.done) spokenSeqs.delete(it.value);
    }

    const listenerLang = myLang();
    if (!listenerLang) { speak(p.text, p.fromLang); return; }

    const senderBase = p.fromLang ? langBase(p.fromLang) : null;
    const listenerBase = langBase(listenerLang);
    const secondaryBase = langBase(mySecondary());

    // Speak the original voice when the phrase is already in a language the
    // listener understands (their language or their chosen secondary).
    const alreadyUnderstood =
      (senderBase !== null && senderBase === listenerBase) ||
      (senderBase !== null && secondaryBase !== null && senderBase === secondaryBase);

    if (alreadyUnderstood) {
      params.onCaption?.({ text: p.text, mine: false, lang: p.fromLang, id: ++captionIdRef.current });
      speak(p.text, p.fromLang);
      return;
    }

    const outcome = await translateText(p.text, listenerLang);
    const finalText = outcome.status === 'translated' ? outcome.result.translatedText : p.text;
    const outLang = outcome.status === 'translated' ? listenerLang : p.fromLang;
    params.onCaption?.({ text: finalText, mine: false, lang: outLang, id: ++captionIdRef.current });
    speak(finalText, outLang);
  }

  const offSignal = params.onSignal((payload) => {
    if (payload.kind === 'vt_phrase') void handleIncomingPhrase(payload);
  });

  // ---- Capture (sender side) ----

  const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  const supported = !!SR && !!synth;
  let rec: any = null;
  let active = false;
  let wantOn = true;
  let seq = Math.floor(Date.now() / 1000);
  const peerTargets = params.peers.filter(p => p.userId !== params.myUserId);

  function startRecognition() {
    if (!SR || active || stopped || !wantOn) return;
    active = true;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false; // finalized phrases only — stable translations
    r.maxAlternatives = 1;
    r.lang = toBcp47(myLang());
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) continue;
        const text = (res[0]?.transcript ?? '').trim();
        if (!text) continue;
        const payload: VoiceTranslationSignal = {
          kind: 'vt_phrase', callId: params.callId, from: params.myUserId,
          text, fromLang: myLang(), seq: ++seq,
        };
        params.sendSignal(payload);
        params.onCaption?.({ text, mine: true, lang: myLang(), id: ++captionIdRef.current });
      }
    };
    r.onend = () => {
      active = false;
      if (!stopped && wantOn) {
        // Chrome ends the session after silence; restart to keep listening.
        setTimeout(() => { if (!stopped && wantOn) startRecognition(); }, 300);
      }
    };
    r.onerror = (e: any) => {
      if (e?.error === 'no-speech' || e?.error === 'aborted') return;
      active = false;
    };
    try { r.start(); rec = r; } catch { active = false; }
  }

  function stopRecognition() {
    wantOn = false;
    try { rec?.stop(); } catch {}
    rec = null;
    active = false;
  }

  if (supported && peerTargets.length > 0) {
    startRecognition();
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stopRecognition();
      try { synth?.cancel(); } catch {}
      duckCallAudio(false);
      offSignal();
    },
    isSupported: () => supported,
  };
}
