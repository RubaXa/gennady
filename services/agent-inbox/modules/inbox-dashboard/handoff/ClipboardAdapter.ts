// @file: ClipboardAdapter — browser clipboard write with delivery acknowledgement.
// @consumers: ReviewHandoffControl
// @tasks: TSK-182

/**
 * @purpose Clipboard delivery outcome after a writeAndAcknowledge call.
 * @invariant 'denied' is returned for both PermissionError and SecurityError — never throws
 */
export type ClipboardDeliveryOutcome = 'success' | 'denied';

/**
 * @purpose Browser clipboard adapter: writes generated text and acknowledges delivery only after confirmed browser success.
 * @invariant Permission failure leaves the previous handoff baseline unchanged; retry is the only recovery path — no file fallback.
 * @invariant Uses Web Crypto API (navigator.clipboard), not node:crypto.
 */
export class ClipboardAdapter {
  /**
   * @purpose Write text to browser clipboard and return the delivery outcome.
   * @param text Handoff text to write.
   * @returns 'success' when navigator.clipboard.writeText resolves; 'denied' on any error.
   * @sideEffect Browser: navigator.clipboard.writeText
   */
  async writeAndAcknowledge(text: string): Promise<ClipboardDeliveryOutcome> {
    // #region START_CLIPBOARD_WRITE — failure mode: clipboard permission denied → 'denied' returned, baseline unchanged
    try {
      await navigator.clipboard.writeText(text);
      return 'success';
    } catch {
      return 'denied';
    }
    // #endregion END_CLIPBOARD_WRITE
  }
}
