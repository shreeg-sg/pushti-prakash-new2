export class SecurityUtil {
  private static readonly ALLOWED_TAGS = new Set([
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'BR',
    'SPAN',
    'P',
    'UL',
    'OL',
    'LI',
    'A'
  ]);
  private static readonly SAFE_HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  private static readonly SAFE_COLOR_VALUE_REGEX = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]{3,20})$/;
  private static readonly SAFE_FONT_SIZE_VALUE_REGEX = /^\d+(\.\d+)?(px|rem|em|%)$/;

  /**
   * Strictly sanitizes remote HTML (banners & transcripts) to allow basic formatting
   * while stripping scripts, iframes, event handlers (onload/onerror/onclick), and unsafe styles.
   */
  public static sanitizeSafeHtml(rawHtml: string | undefined | null): string {
    if (!rawHtml || typeof rawHtml !== 'string') return '';

    if (typeof DOMParser === 'undefined') {
      return rawHtml.replace(/<[^>]*>/g, '');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    const cleanNode = (node: Node): void => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          if (!this.ALLOWED_TAGS.has(el.tagName)) {
            const textNode = doc.createTextNode(el.textContent || '');
            node.replaceChild(textNode, el);
            continue;
          }

          // Strip all attributes except validated inline color/font-size on SPAN and safe https href on A
          const attrs = Array.from(el.attributes);
          let hasSafeHref = false;
          for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            if (el.tagName === 'SPAN' && attrName === 'style') {
              const safeStyles: string[] = [];
              const rawColor = (el.style.color || '').trim();
              const rawSize = (el.style.fontSize || '').trim();
              if (rawColor && this.SAFE_COLOR_VALUE_REGEX.test(rawColor)) {
                safeStyles.push(`color: ${rawColor}`);
              }
              if (rawSize && this.SAFE_FONT_SIZE_VALUE_REGEX.test(rawSize)) {
                safeStyles.push(`font-size: ${rawSize}`);
              }
              if (safeStyles.length > 0) {
                el.setAttribute('style', safeStyles.join('; '));
              } else {
                el.removeAttribute('style');
              }
            } else if (el.tagName === 'A' && attrName === 'href') {
              const safeHref = this.sanitizeExternalUrl(attr.value, true);
              if (safeHref) {
                el.setAttribute('href', safeHref);
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
                hasSafeHref = true;
              } else {
                el.removeAttribute('href');
              }
            } else {
              el.removeAttribute(attr.name);
            }
          }
          if (el.tagName === 'A' && !hasSafeHref) {
            const textNode = doc.createTextNode(el.textContent || '');
            node.replaceChild(textNode, el);
            continue;
          }
          cleanNode(el);
        }
      }
    };

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  /**
   * Validates external URLs (prevents javascript:, data:, file:, or arbitrary scheme injection).
   */
  public static sanitizeExternalUrl(url: string | undefined | null, allowMailto = false): string {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') return parsed.toString();
      if (allowMailto && parsed.protocol === 'mailto:') return trimmed;
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Validates hex color codes from remote app_identity.json to prevent CSS injection.
   */
  public static sanitizeHexColor(hex: string | undefined | null, fallback = '#8B2635'): string {
    if (!hex || typeof hex !== 'string') return fallback;
    const clean = hex.trim();
    return this.SAFE_HEX_REGEX.test(clean) ? clean : fallback;
  }

  /**
   * Sanitizes URLs before interpolating into CSS url("...") to prevent quote/parenthesis breakout.
   */
  public static sanitizeCssUrl(url: string | undefined | null): string {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (!clean || /["'()\\\n\r<>]/.test(clean)) return '';
    if (/^(javascript|data|vbscript|file):/i.test(clean)) return '';
    return clean;
  }
}