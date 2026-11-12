export class SecurityUtil {
    private static readonly ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN', 'P']);
    private static readonly SAFE_HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  
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
  
            // Strip all attributes except safe inline color/font-size on SPAN
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              if (el.tagName === 'SPAN' && attr.name.toLowerCase() === 'style') {
                const safeStyles: string[] = [];
                if (el.style.color) safeStyles.push(`color: ${el.style.color}`);
                if (el.style.fontSize) safeStyles.push(`font-size: ${el.style.fontSize}`);
                if (safeStyles.length > 0) {
                  el.setAttribute('style', safeStyles.join('; '));
                } else {
                  el.removeAttribute('style');
                }
              } else {
                el.removeAttribute(attr.name);
              }
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
      if (/^(javascript|data|vbscript):/i.test(clean)) return '';
      return clean;
    }
  }