# TTS / Voice Blueprint — persona-matched voiceover for generated video

**Status:** spec (not yet built) · **Authored:** 2026-07-21 · **Owner lane:** the "voicebox session"
**Companion:** the video-model registry (`scripts/lib/models/`) + rails (`scripts/lib/{seedance,wan,veo,kling,omni}.ts`, `model-ids.ts`)

## Goal
Give every generated clip a **bespoke voice that matches the persona / theme / setting / mood**, and lay the VO onto the (silent) generated video **perfectly aligned**. Local-first / DB-free, same as the rest of macro-pickle: rails call hosted APIs (or a local HTTP service) and write files to disk.

Two net-new capabilities the repo doesn't have yet: a **TTS rail** and an **A/V-sync (mux) core**. There is no ffmpeg/voice code today.

---

## 1. Model landscape (July 2026) — pick for steerability + timestamps, NOT raw leaderboard rank

The Artificial Analysis Speech Arena leaders (Qwen-Audio-3.0-TTS-Plus, Simba 3.2, Gemini 3.1 Flash TTS) win on *naturalness* but are weak/unverified on the two axes this use case needs: **natural-language persona steering** and **word-level timestamps**. Don't pick off the leaderboard.

| Model | Role | Persona/emotion control | Timestamps | Cloning | Access | Price |
|---|---|---|---|---|---|---|
| **ElevenLabs Eleven v3** | **Primary** | **Voice Design** (`/v1/text-to-voice/design`: describe a voice in plain English → production voice, 70+ langs) + inline audio tags `[excited]/[whispers]/[laughs]` | char-level native (`/with-timestamps`); **per-word** on fal (`timestamps:true`) + WaveSpeed; Forced Alignment fallback | Instant + Professional | `@elevenlabs/elevenlabs-js` **AND** fal `fal-ai/elevenlabs/tts/eleven-v3` | ~$100/1M chars (fal $0.10/1K) |
| **Hume Octave 2** | Hero-emotion / tight-sync co-primary | Voice-LLM: natural-language `description` per utterance (voice designed from the persona sentence) | **word AND phoneme** (`include_timestamp_types`) — best granularity, ideal for lip-sync | via voice design | official TS SDK (direct API) | ~$7.6–30/1M (verify) |
| **Inworld TTS 1.5 Max** | Budget/volume | markup tags `[happy]/[whispering]` | word-level | 5–15s | **on fal** | $5–26/1M |
| **MiniMax Speech 2.8 HD** | Volume + richest emotion | 7 emotion presets + sound tags + pause markers | sentence/word/streaming-word (`subtitle_enable`) | 5s | **on fal** | ~$100/1M |
| Cartesia Sonic 3.5 | Real-time only | weaker free-text design; auto-emotion | word (begin/end) | 3–10s | TS SDK | ~$49/1M |
| OpenAI gpt-4o-mini-tts | — | free-text `instructions` | **none in TTS** → forced-align | enterprise only | `openai` | ~$0.015/min |
| Google Gemini/Chirp 3 HD | — | NL style prompts | Chirp SSML `<mark>` only; Gemini native none | no | `@google/genai` (already here) | dual-cited |

**Recommendation:** primary **ElevenLabs v3** (maxes both axes in one vendor, and reachable via the fal client already in the repo); **Hume Octave 2** as the hero-emotion / phoneme-accurate engine; **Inworld/MiniMax** on fal for cheap volume.

> ⚠️ Empirical check before committing to v3 for tight sync: verify word-timestamp accuracy **on tag-generated audio** (`[laughs]`, SFX that isn't in the text). If shaky, use ElevenLabs Multilingual v2 on fal for exact-alignment lines, or recover timing via Forced Alignment. (Research flag D1.)

---

## 2. Voicebox repo — the free / local / Jay's-real-voice path

**Repo:** **`jamiepine/voicebox`** (MIT, commercial-OK, ~44k★). A local-first desktop voice studio wrapping **7 TTS engines** (Qwen3-TTS, Qwen CustomVoice, LuxTTS, Chatterbox Multilingual/Turbo, HumeAI TADA, Kokoro), 23 languages, 50+ voices, **zero-shot voice cloning**, emotion tags, per-profile "personality" rewrite, STT (Whisper), and post effects.

**Killer feature for us:** clone **Jay's actual voice** locally, free, unlimited — true persona match, not just text style.

**Integration rule — consume as an HTTP service, NEVER vendor it** (its backend is a persistent multi-GB torch server; the opposite shape of the lightweight PaddleOCR one-shot sidecar). Run standalone: `uvicorn backend.main:app --port 17493` (no Tauri app needed).

```
# one-time: create a cloned profile from a Jay voice sample → profile_id
POST http://127.0.0.1:17493/generate   { profile_id, text, engine, language }  → { generation_id }
GET  http://127.0.0.1:17493/audio/{generation_id}                               → WAV (FileResponse)
GET  http://127.0.0.1:17493/health      # gate the rail: no-op gracefully if Voicebox isn't running
# also exposes an MCP server at /mcp (voicebox.speak / .transcribe / .list_profiles)
```

**No native word-timestamps** → pair Voicebox output with forced alignment (§4). Watch-item: a `$VOICEBOX` token + cloud tier landed mid-2026, but the local path stays free/offline/un-gated.

---

## 3. Matching a voice to persona / theme / setting

Hybrid — the top models support all three mechanisms:

1. **Design-from-description** (most flexible): feed persona attributes as a sentence → get a voice. ElevenLabs Voice Design v3, Hume `description`, MiniMax Voice Design. *Best for "the voice must vary to match the persona."*
2. **Curated library keyed by persona** (deterministic, cache-friendly): map persona tags → a stored `voice_id`.
3. **Per-line emotion/style tags** (mood on a fixed identity): `[excited]`, `[whispers]`, MiniMax emotion presets.

**Pattern (fits the repo's brand model):** at persona-creation time **design once or select once, then PERSIST a `voiceId`** on the brand/persona JSON (`content/brands/*.json` gets `voice: { provider, voiceId, defaultStyle }`). At render time, inject **per-beat emotion tags** so mood tracks the scene while identity stays stable. Maps onto the Prompt Engine: brand supplies the voice identity; the scene/beat supplies the emotion. (e.g. a high-energy social persona vs a measured executive register → two designed voices.)

---

## 4. Sync + overlay — "unique audio, lined up perfectly"

1. **Word timestamps** — generate VO with them (ElevenLabs/Hume/Inworld/MiniMax). For engines without (OpenAI, Gemini native, **Voicebox**) → **ElevenLabs Forced Alignment** (audio+text → word times, 29 langs) or OSS **WhisperX**. This is the universal safety net.
2. **Fit VO to a fixed clip length** (no TTS does exact "N seconds" natively):
   a. char-budget the target (~14–16 chars/sec EN); b. generate; c. read **actual duration** (last word end-time, or `ffprobe`); d. fine-fit with the model `speed` param, or `ffmpeg atempo` (pitch-preserving, keep **0.9–1.1×**), or pad with trailing silence (`ffmpeg apad` / Hume `trailing_silence`).
3. **Mux** VO onto silent video:
   ```
   ffmpeg -i silent.mp4 -i vo.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest out.mp4
   # offset VO to a start beat: -af "adelay=1500|1500"
   ```
4. **Lip-sync — ONLY for talking-head clips.** For product / B-roll VO, skip it (just mux + caption-align). When lips must move: fal `fal-ai/sync-lipsync/v2/pro` (or `/v3`), `fal-ai/kling-video/lipsync/audio-to-video` (~$0.084/clip), or LatentSync — all via the existing `@fal-ai/client`.

---

## 5. Proposed build shape

```
scripts/lib/tts.ts        # provider-abstracted rail: provider ∈ elevenlabs|hume|fal|voicebox
                          #   generateSpeech(opts) → { wavPath, wordTimestamps[], durationSec }
                          #   designVoice(description) → voiceId   (ElevenLabs/Hume)
scripts/lib/av-sync.ts    # muxVoiceOntoVideo(video, vo, {offset, fitToLength}) via ffmpeg
                          #   alignWords(audio, text) → timestamps  (forced-align fallback)
scripts/lib/lipsync.ts    # OPTIONAL — fal sync-lipsync / kling-lipsync for talking-head
scripts/generate-vo.ts    # `pnpm vo` CLI: text|brief + persona → VO (+ optional mux onto a clip)
content/brands/*.json     # + "voice": { provider, voiceId, defaultStyle }
```

- Mirror the existing rail conventions: dry-run + cost line (paid TTS), paid-recovery, `withRetry`, files-to-disk.
- **Registry integration:** add a TTS/voice provider category to `scripts/lib/models/` so `pnpm models` lists voices + checks the new env keys (`ELEVENLABS_API_KEY`, `HUME_API_KEY`; fal/Google reuse existing).
- Persona voice design belongs upstream in the Prompt Engine / brand onboarding (`/pickle-brand`), producing a persisted `voiceId`.

---

## 6. Open items / confidence flags
- **D1** — ElevenLabs v3 word-alignment precision on audio-tag/SFX content: advertised, not empirically confirmed. Run the one-line generate-test first.
- **D2** — fal `timestamps` output field structure (start/end keys, units) not documented → verify the shape empirically.
- **D3** — No native word-timestamps: OpenAI TTS, Gemini native, Voicebox → forced-align required.
- **D4** — Pricing discrepancies (dual-cited): Gemini $18.3 vs $150/1M; Hume $7.6 vs $30/1M; Inworld $0.01/1K (fal learn page) vs $5–26/1M. Confirm on each provider's own page before volume.
- **D5** — MiniMax "#1 arena" is its own marketing; Artificial Analysis ranks Qwen #1.

## 7. Sources
- Speech Arena: https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice
- ElevenLabs Voice Design: https://elevenlabs.io/docs/api-reference/text-to-voice/design · with-timestamps: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps · Forced Alignment: https://elevenlabs.io/docs/overview/capabilities/forced-alignment
- Hume TTS timestamps: https://dev.hume.ai/docs/text-to-speech-tts/timestamps · voice: https://dev.hume.ai/docs/text-to-speech-tts/voice
- fal TTS roster: https://fal.ai/learn/tools/best-text-to-speech-apis · eleven-v3 API: https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3/api
- fal lip-sync: https://fal.ai/models/fal-ai/sync-lipsync/v2/pro · https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api
- Voicebox repo: `jamiepine/voicebox` (MIT)
- ffmpeg atempo: https://www.ffmpeg-micro.com/blog/ffmpeg-atempo-filter-change-audio-speed
