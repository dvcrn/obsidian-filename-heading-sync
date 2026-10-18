const stockIllegalSymbols = /[\\/:|#^[\]]/g;

function regExpEscape(str: string): string {
  return String(str).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

export interface HeadingSettings {
  userIllegalSymbols: string[];
  spaceReplacementCharacter: string;
  /** Maximum UTF-8 bytes of the filename including ".md". 0 = no limit. */
  maxFilenameBytes?: number;
}

const ellipsis = '…';
const extensionBytes = '.md'.length;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Shorten the filename so that it plus ".md" fits into maxBytes. The cut is
 * made at a word boundary where possible, never inside a character, and is
 * marked with "…".
 */
export function truncateFilename(
  text: string,
  maxBytes: number,
  separator: string,
): string {
  if (!maxBytes || byteLength(text) + extensionBytes <= maxBytes) {
    return text;
  }

  const budget = maxBytes - extensionBytes - byteLength(ellipsis);
  let cut = '';
  let used = 0;
  // Iterating a string yields whole code points, so no character is split.
  for (const char of text) {
    used += byteLength(char);
    if (used > budget) {
      break;
    }
    cut += char;
  }

  // Prefer to end at a word boundary, unless that would drop the whole name.
  const boundary = cut.lastIndexOf(separator);
  if (boundary > 0) {
    cut = cut.slice(0, boundary);
  }
  while (separator && cut.endsWith(separator)) {
    cut = cut.slice(0, -separator.length);
  }

  return cut.trimEnd() + ellipsis;
}

export function generateFilenameFromHeading(
  heading: string,
  settings: Pick<
    HeadingSettings,
    'userIllegalSymbols' | 'spaceReplacementCharacter' | 'maxFilenameBytes'
  >,
): string {
  // Strip stock illegal symbols
  let text = heading.replace(stockIllegalSymbols, '');

  // Strip user-defined illegal symbols
  const escaped = settings.userIllegalSymbols.map((str) => regExpEscape(str));
  if (escaped.length > 0 && escaped.join('') !== '') {
    const userRegex = new RegExp(escaped.join('|'), 'g');
    text = text.replace(userRegex, '');
  }

  // Replace spaces with configured character
  if (settings.spaceReplacementCharacter) {
    text = text.replace(/ /g, settings.spaceReplacementCharacter);
  }

  return truncateFilename(
    text.trim(),
    settings.maxFilenameBytes ?? 0,
    settings.spaceReplacementCharacter || ' ',
  );
}

export function generateHeadingFromFilename(
  filename: string,
  settings: Pick<HeadingSettings, 'spaceReplacementCharacter'>,
): string {
  let text = filename;

  if (settings.spaceReplacementCharacter) {
    const escaped = regExpEscape(settings.spaceReplacementCharacter);
    text = text.replace(new RegExp(escaped, 'g'), ' ');
  }

  return text.trim();
}

/**
 * Whether the heading already corresponds to the filename. Headings may keep
 * characters that are stripped when generating filenames.
 */
export function headingMatchesFilename(
  heading: string,
  filename: string,
  settings: Pick<
    HeadingSettings,
    'userIllegalSymbols' | 'spaceReplacementCharacter' | 'maxFilenameBytes'
  >,
): boolean {
  return (
    generateFilenameFromHeading(heading, settings) ===
    generateFilenameFromHeading(filename, settings)
  );
}
