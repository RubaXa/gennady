const STREAMING_LINKS_REGEX =
  /(band\.link|zvonko\.link|music\.yandex|music\.apple|music\.youtube\.com|open\.spotify|vk\.com\/audio|vk\.com\/music|soundcloud\.com|youtube\.com\/watch|youtube\.com\/shorts|youtu\.be|deezer\.com|tidal\.com|boom\.ru|zvuk\.com)/iu;

const STRONG_KEYWORDS_REGEX =
  /(?:^|[^\p{L}])(альбом|трек|сингл|релиз|мини-альбом|лейбл|клип|песн|музык|концерт|плейлист|ремикс|микстейп|album|track|single|release|song|music|concert|playlist|mixtape|clip)(?:[a-zа-яё]+)?(?:[^\p{L}]|$)|(?:^|[^\p{L}])(ep|lp|remix)(?:[^\p{L}]|$)/iu;

const CONTEXT_KEYWORDS_REGEX =
  /(?:^|[^\p{L}])(хип-хоп|рэп|инди|фолк|электроник[ауие]|поп|рок|метал|металл|джаз|панк|r&b|хаус|дабстеп|техно|драм-н-бейс|drum[ -]?and[ -]?bass|hip-?hop|rap|indie|folk|electronic|pop|rock|metal|jazz|punk|house|dubstep|techno|noise|lo-?fi|lofi|ambient|synth|synthwave|vaporwave|shoegaze|dreampop|dream[ -]?pop|post-?punk|idm|drone|chillwave|alt-?pop|altpop|bedroom|бит|beat|вокал|vocal|сэмпл|sample|звучани[еяюи]|sound|вайб|vibe|сонграйт[\p{L}]*|гитар[\p{L}]*|guitar[\p{L}]*|барабан[\p{L}]*|drum[\p{L}]*|мелоди[\p{L}]*|melod[y\p{L}]*|аранжировк[\p{L}]*)(?:[^\p{L}]|$)/giu;

/**
 * @purpose Heuristic filter to detect whether free-form text is likely about music releases or sound.
 * @param text Input text to analyse.
 * @note Supports both Russian and English music-related heuristics.
 * @returns True if the text is likely about music, false otherwise.
 */
export function isLikelyAboutMusic(text: string): boolean {
  if (!text) {
    return false;
  }

  // Streaming links are very likely to contain music-related information
  if (STREAMING_LINKS_REGEX.test(text)) {
    return true;
  }

  const trimmed = text.trim();

  // Skip very short non-link messages
  if (trimmed.length < 40) {
    return false;
  }

  // Strong keywords that frequently appear in music-related texts
  if (STRONG_KEYWORDS_REGEX.test(text)) {
    return true;
  }

  // CONTEXT WORDS CHECK (genres, sound)
  // A single such word can be accidental ("What is our movie genre?").
  // Therefore we require at least TWO DIFFERENT words from this list.
  const matches = new Set<string>();

  for (const match of text.matchAll(CONTEXT_KEYWORDS_REGEX)) {
    const word = (match[1] || match[0]).toLowerCase();
    const normalizedWord = word.replace(/[аеиоуыэюя]$/u, '');

    matches.add(normalizedWord); // Add normalized word to the Set for uniqueness
    if (matches.size >= 2) {
      return true; // Found at least two different music-related terms
    }
  }

  return false;
}
