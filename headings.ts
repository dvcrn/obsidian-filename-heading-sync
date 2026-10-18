const stockIllegalSymbols = /[\\/:|#^[\]]/g;

function regExpEscape(str: string): string {
  return String(str).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

export interface HeadingSettings {
  userIllegalSymbols: string[];
  spaceReplacementCharacter: string;
}

export function generateFilenameFromHeading(
  heading: string,
  settings: Pick<
    HeadingSettings,
    'userIllegalSymbols' | 'spaceReplacementCharacter'
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

  return text.trim();
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
 * The value to store in the title property: the heading when the filename
 * cannot represent it exactly, otherwise null (the property is not needed).
 */
export function titlePropertyValue(
  heading: string,
  filename: string,
): string | null {
  const title = heading.trim();
  return title === filename ? null : title;
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
    'userIllegalSymbols' | 'spaceReplacementCharacter'
  >,
): boolean {
  return (
    generateFilenameFromHeading(heading, settings) ===
    generateFilenameFromHeading(filename, settings)
  );
}
