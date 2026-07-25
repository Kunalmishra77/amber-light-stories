"""Devanagari -> Roman (Hinglish) transliteration for on-screen captions.

The narration audio stays in Hindi — ElevenLabs reads the Devanagari fine. The
CAPTION is a different story: ffmpeg's drawtext has no Indic text shaping, so
conjuncts and pre-base matras render wrong ("सिर्फ" came out "सर्फ"). Burning
the caption in Roman script sidesteps shaping entirely and is what the client
asked for.

This is a pragmatic phonetic transliteration — readable Hinglish, not a
scholarly scheme. Text with no Devanagari (already Roman) passes through
untouched.
"""
from __future__ import annotations

# Independent vowels.
_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o",
}

# Dependent vowel signs (matras) that attach to a consonant.
_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o",
}

# Consonants -> base sound (the inherent "a" is added by the algorithm).
_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
    "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "r",
    "ढ़": "rh", "फ़": "f", "य़": "y",
}

_DIGITS = {"०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
           "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"}

_VIRAMA = "्"          # halant — suppresses the inherent vowel
_ANUSVARA = {"ं", "ँ", "ॅ"}  # nasal
_VISARGA = "ः"
_NUKTA = "़"
_DANDA = {"।": ".", "॥": "."}


def _is_consonant(ch: str) -> bool:
    return ch in _CONSONANTS


def to_hinglish(text: str) -> str:
    """Transliterate Devanagari in `text` to readable Roman (Hinglish).

    Consonants carry an inherent "a" unless followed by a matra or a virama.
    A crude schwa trim drops a trailing inherent "a" at word end, which reads
    more naturally ("roti", not "rotia"). Non-Devanagari characters pass
    through.
    """
    if not text:
        return text

    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]

        # Merge a following nukta into the base for the few nukta letters.
        if i + 1 < n and text[i + 1] == _NUKTA and (ch + _NUKTA) in _CONSONANTS:
            ch = ch + _NUKTA
            i += 1

        if ch in _CONSONANTS:
            out.append(_CONSONANTS[ch])
            # Look at what follows to decide the vowel.
            nxt = text[i + 1] if i + 1 < n else ""
            if nxt == _VIRAMA:
                # No vowel; the conjunct's next consonant follows.
                i += 2
                continue
            if nxt in _MATRAS:
                out.append(_MATRAS[nxt])
                i += 2
                continue
            # Inherent "a", unless this is the last letter of a word (schwa
            # deletion) — then drop it for a more natural read.
            after = text[i + 2] if i + 2 < n else ""
            at_word_end = (i + 1 >= n) or (not _is_consonant(nxt) and nxt not in _VOWELS
                                           and nxt not in _MATRAS and nxt != _VIRAMA
                                           and nxt not in _ANUSVARA)
            if not at_word_end:
                out.append("a")
            i += 1
            continue

        if ch in _VOWELS:
            out.append(_VOWELS[ch])
        elif ch in _MATRAS:
            out.append(_MATRAS[ch])
        elif ch in _ANUSVARA:
            out.append("n")
        elif ch == _VISARGA:
            out.append("h")
        elif ch in _DIGITS:
            out.append(_DIGITS[ch])
        elif ch in _DANDA:
            out.append(_DANDA[ch])
        elif ch == _VIRAMA:
            pass  # stray virama — ignore
        else:
            out.append(ch)  # spaces, punctuation, Latin, emoji
        i += 1

    return "".join(out)


def has_devanagari(text: str) -> bool:
    return any("ऀ" <= c <= "ॿ" for c in (text or ""))
