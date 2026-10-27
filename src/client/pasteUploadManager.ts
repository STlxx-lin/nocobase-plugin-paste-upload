import { message } from 'antd';
import { extractFilesFromClipboard, isGenericScreenshotName, normalizeMimeType } from './clipboard';
import { validateFiles } from './validation';
import { findTargetFileInput, triggerUpload } from './uploader';
import { injectPasteUploadStyles, removePasteUploadStyles } from './styles';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

export interface PasteUploadManagerOptions {
  t?: (text: string, options?: any) => string;
  getLocale?: () => string;
  onError?: (msg: string) => void;
  onWarning?: (msg: string) => void;
  onSuccess?: (count: number) => void;
  disabled?: boolean;
  allowedMimeTypes?: string | string[];
  maxFileSize?: number;
}

function isNodeInDocument(node: Node | null): boolean {
  if (!node || typeof document === 'undefined') return false;
  if (document.contains(node)) return true;
  try {
    return node.getRootNode?.({ composed: true }) === document;
  } catch {
    return false;
  }
}

function isElementContentEditable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (typeof (el as any).isContentEditable === 'boolean') {
    return (el as any).isContentEditable;
  }
  let curr: HTMLElement | null = el;
  while (curr) {
    const ce = (curr as any).contentEditable ?? curr.getAttribute?.('contenteditable');
    if (ce !== undefined && ce !== null && ce !== 'inherit') {
      if (ce === false || ce === 'false') return false;
      if (ce === true || ce === 'true' || ce === '' || ce === 'plaintext-only') return true;
    }
    curr = curr.parentElement || (curr.parentNode && (curr.parentNode as any).host as HTMLElement) || null;
  }
  return false;
}

function isElementEditable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'file') return true;
  if (el.tagName === 'TEXTAREA') return true;
  return isElementContentEditable(el);
}

interface HandledFileMeta {
  name: string;
  size: number;
  type: string;
}

export class PasteUploadManager {
  private activeTarget: HTMLElement | null = null;
  private badgeElement: HTMLElement | null = null;
  public isDestroyed = false;
  private pulseTimer: any = null;
  private debounceTimer: any = null;
  private options: PasteUploadManagerOptions;
  private lastPasteTime = 0;
  private lastPasteTarget: HTMLElement | null = null;
  private lastHandledFiles: HandledFileMeta[] = [];

  private onMouseOverBound: (e: MouseEvent) => void;
  private onMouseOutBound: (e: MouseEvent) => void;
  private onPasteBound: (e: ClipboardEvent) => void;

  constructor(options: PasteUploadManagerOptions = {}) {
    this.options = options;
    this.onMouseOverBound = this.handleMouseOver.bind(this);
    this.onMouseOutBound = this.handleMouseOut.bind(this);
    this.onPasteBound = this.handlePaste.bind(this);

    // Global singleton protection across bundles (client & client-v2):
    // If a different active instance exists on globalThis, destroy it first
    // so we never retain duplicate document listeners or conflicting state.
    const g = getGlobalObj();
    if (g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ && g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ !== this) {
      try {
        g.__NOCOBASE_PASTE_UPLOAD_MANAGER__.destroy();
      } catch {}
    }
    g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ = this;

    if (typeof document !== 'undefined') {
      injectPasteUploadStyles();
      document.addEventListener('mouseover', this.onMouseOverBound as any, true);
      document.addEventListener('mouseout', this.onMouseOutBound as any, true);
      document.addEventListener('paste', this.onPasteBound as any, true);
    }
  }

  public updateOptions(options: Partial<PasteUploadManagerOptions>): void {
    this.options = { ...this.options, ...options };
    if (this.options.disabled && this.activeTarget) {
      this.deactivateTarget();
    }
  }

  public getOptions(): PasteUploadManagerOptions {
    return { ...this.options };
  }

  public getActiveTarget(): HTMLElement | null {
    return this.activeTarget;
  }

  public deactivate(): void {
    this.deactivateTarget();
  }

  /**
   * Find whether the given element is inside a valid, enabled file upload component.
   */
  public findUploadContainer(element: HTMLElement | null): HTMLElement | null {
    if (this.options.disabled) return null;
    if (!element) return null;

    // Check if element is an editable text field (input, textarea, contenteditable)
    // If hovering directly over a form input/textarea/editor, do NOT treat as upload container
    if (isElementEditable(element)) {
      return null;
    }

    // 1. Check if element or any ancestor explicitly disabled paste upload
    const disabledContainer = element.closest<HTMLElement>(
      '[data-paste-upload="false"], .ant-upload-disabled, [disabled], [aria-disabled="true"]'
    );
    if (disabledContainer) {
      return null;
    }

    // 2. Prefer the explicit paste-upload wrapper container if present
    const explicitWrapper = element.closest<HTMLElement>('[data-paste-upload="true"]');
    if (explicitWrapper) {
      const input = findTargetFileInput(explicitWrapper);
      if (input && (input.disabled || input.hasAttribute('disabled'))) {
        return null;
      }
      return explicitWrapper;
    }

    // 3. Otherwise, check standard upload component selectors
    const match = element.closest<HTMLElement>(
      '.nb-upload, .ant-upload-select, .ant-upload-drag, .ant-upload'
    );
    if (!match) return null;

    const input = findTargetFileInput(match);
    if (input && (input.disabled || input.hasAttribute('disabled'))) {
      return null;
    }

    return match;
  }

  private handleMouseOver(e: MouseEvent) {
    if (this.isDestroyed || this.options.disabled) return;

    const target = e.target as HTMLElement | null;
    const uploadContainer = this.findUploadContainer(target);

    if (!uploadContainer) {
      // Hovered on something not in an upload component
      if (this.activeTarget && !this.activeTarget.contains(target as Node)) {
        this.deactivateTarget();
      }
      return;
    }

    // If still in the same active container, do nothing
    if (this.activeTarget === uploadContainer) {
      return;
    }

    // Switch to new upload container
    this.activateTarget(uploadContainer);
  }

  private handleMouseOut(e: MouseEvent) {
    if (this.isDestroyed || !this.activeTarget) return;

    // If activeTarget was detached or removed from DOM, clean up immediately
    if (typeof document !== 'undefined' && !isNodeInDocument(this.activeTarget)) {
      this.deactivateTarget();
      return;
    }

    // Only process mouseout if it originated from within the activeTarget
    const target = e.target as Node | null;
    if (target && !this.activeTarget.contains(target)) {
      return;
    }

    const related = e.relatedTarget as Node | null;
    // If moving within the active upload container, retain activation
    if (related && this.activeTarget.contains(related)) {
      return;
    }

    // Moved out of active container
    this.deactivateTarget();
  }

  private translate(key: string, defaultText: string, params: Record<string, any> = {}): string {
    let text: string | undefined;
    if (this.options.t) {
      try {
        const res = this.options.t(key, params);
        if (res && res !== key) {
          text = res;
        }
      } catch {}
    }
    if (!text) {
      const locale =
        (this.options.getLocale ? this.options.getLocale() : '') ||
        (typeof window !== 'undefined' ? localStorage.getItem('NOCOBASE_LOCALE') : '') ||
        '';
      const isEn = Boolean(locale && locale.toLowerCase().startsWith('en'));
      const dict = (isEn ? enUS : zhCN) as Record<string, string>;
      text = dict[key] || defaultText || key;
    }
    for (const [k, v] of Object.entries(params)) {
      const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`\\{\\{${escapedK}\\}\\}`, 'g'), () => String(v));
    }
    return text;
  }

  private activateTarget(container: HTMLElement) {
    this.deactivateTarget();

    // Clean up any stale badges
    container.querySelectorAll('.nb-paste-upload-badge').forEach((el) => el.remove());

    this.activeTarget = container;
    container.classList.add('nb-paste-upload-hovering');

    // Create and attach the floating shortcut hint badge
    const isMac =
      typeof navigator !== 'undefined' &&
      /macintosh|mac os x/i.test(navigator.userAgent || '');
    const shortcut = isMac ? '⌘+V' : 'Ctrl+V';

    const badge = document.createElement('div');
    badge.className = 'nb-paste-upload-badge';
    badge.setAttribute('data-paste-upload-badge', 'true');
    badge.textContent = this.translate('Press {{shortcut}} to paste', `按 ${shortcut} 粘贴上传`, { shortcut });

    this.badgeElement = badge;
    container.appendChild(badge);
  }

  private deactivateTarget() {
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.activeTarget) {
      this.activeTarget.classList.remove('nb-paste-upload-hovering', 'nb-paste-upload-success-pulse');
      this.activeTarget = null;
    }
    if (this.badgeElement) {
      this.badgeElement.remove();
      this.badgeElement = null;
    }
  }

  private handlePaste(e: ClipboardEvent) {
    if (this.isDestroyed || this.options.disabled || !this.activeTarget) {
      return;
    }

    // Prevent duplicate handling from multiple listeners or bubbling
    if (e.defaultPrevented || (e as any).__nbPasteUploadHandled) {
      return;
    }

    // Check if active target is still in DOM
    if (!isNodeInDocument(this.activeTarget)) {
      this.deactivateTarget();
      return;
    }

    const eventTarget = e.target as HTMLElement | null;
    const activeEl = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

    // If paste occurs or focus is inside an open modal or drawer, but activeTarget is on the background page outside it:
    const modalSelector =
      '.ant-modal-root, .ant-modal-wrap, .ant-modal, .ant-drawer-open, .ant-drawer, [role="dialog"], dialog';
    const activeModalOrDrawer = activeEl?.closest?.(modalSelector) || eventTarget?.closest?.(modalSelector);
    if (activeModalOrDrawer && !activeModalOrDrawer.contains(this.activeTarget)) {
      this.deactivateTarget();
      return;
    }

    // If typing in an editable field:
    if (isElementEditable(eventTarget) || isElementEditable(activeEl)) {
      // 1. If user is focused on an editable element inside this.activeTarget (e.g. file rename/URL input),
      // NEVER hijack paste! Let native text paste work.
      if (
        (activeEl && this.activeTarget.contains(activeEl)) ||
        (eventTarget && this.activeTarget.contains(eventTarget))
      ) {
        return;
      }

      // 2. If user is focused on a contenteditable element anywhere (e.g. rich text editor),
      // the rich text editor handles its own paste (including image insertion). Do not hijack!
      if (isElementContentEditable(activeEl) || isElementContentEditable(eventTarget)) {
        return;
      }

      // 3. If user is focused on an input/textarea outside the upload component,
      // and clipboard has text data (including whitespace), let the text paste into the active input!
      let hasText = false;
      try {
        const plainText = e.clipboardData?.getData('text/plain');
        const htmlText = e.clipboardData?.getData('text/html');
        hasText = Boolean(plainText || htmlText);
      } catch {}
      if (hasText) {
        return;
      }
    }

    const files = extractFilesFromClipboard(e.clipboardData);

    // If no valid file is present (e.g. pure text, HTML, empty):
    // Silently ignore to avoid interrupting normal paste operations
    if (!files || files.length === 0) {
      return;
    }

    // Concurrency / rapid duplicate replay protection (key repeat, hardware debounce, RDP mirror):
    // If the same target received the exact same files within 300ms, swallow as a replay
    const now = Date.now();
    if (
      this.lastPasteTarget === this.activeTarget &&
      now - this.lastPasteTime < 300 &&
      this.areFilesEquivalent(files, this.lastHandledFiles)
    ) {
      this.lastPasteTime = now;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.lastPasteTarget = null;
        this.lastHandledFiles = [];
        this.debounceTimer = null;
      }, 500);

      (e as any).__nbPasteUploadHandled = true;
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      e.stopPropagation();
      return;
    }

    const target = this.activeTarget;
    const wrapper = target.closest<HTMLElement>('[data-paste-upload]') || target;
    const input = findTargetFileInput(target);

    // Check if target or any ancestor was dynamically disabled after hover
    const disabledContainer = target.closest<HTMLElement>(
      '[data-paste-upload="false"], .ant-upload-disabled, [disabled], [aria-disabled="true"]'
    );
    if (disabledContainer) {
      this.deactivateTarget();
      return;
    }

    // Check if input was dynamically disabled after hover
    if (input && (input.disabled || input.hasAttribute('disabled'))) {
      this.deactivateTarget();
      return;
    }

    // Valid files are present and target is valid: user explicitly hovered over the upload area to paste files!
    (e as any).__nbPasteUploadHandled = true;
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();

    // Extract configured restrictions from target, wrapper, and input (respecting live DOM mutations)
    const wrapperAccept =
      target.getAttribute('data-accept') ||
      wrapper.getAttribute('data-accept') ||
      null;
    const inputAccept = input?.accept || input?.getAttribute('accept') || null;

    const wrapperMaxSizeStr =
      target.getAttribute('data-max-size') ||
      wrapper.getAttribute('data-max-size');
    const inputMaxSizeStr =
      input?.getAttribute('data-max-size') ||
      (input as any)?.dataset?.maxSize;
    const wrapperMaxSize = wrapperMaxSizeStr ? parseInt(wrapperMaxSizeStr, 10) : null;
    const inputMaxSize = inputMaxSizeStr ? parseInt(inputMaxSizeStr, 10) : null;
    let maxSize: number | null = null;
    if (wrapperMaxSize !== null && inputMaxSize !== null) {
      maxSize = Math.min(wrapperMaxSize, inputMaxSize);
    } else {
      maxSize = wrapperMaxSize !== null ? wrapperMaxSize : inputMaxSize;
    }

    // Enforce manager-level maxFileSize if configured
    if (this.options.maxFileSize && this.options.maxFileSize > 0) {
      maxSize = maxSize !== null ? Math.min(maxSize, this.options.maxFileSize) : this.options.maxFileSize;
    }

    const multipleAttr =
      target.getAttribute('data-multiple') ||
      wrapper.getAttribute('data-multiple');
    let multiple = true;
    if (multipleAttr !== null && multipleAttr !== undefined) {
      if (multipleAttr === 'false') {
        multiple = false;
      }
    }
    // If input DOM element explicitly specifies multiple === false, strictly enforce single-file!
    if (input && input.multiple === false) {
      multiple = false;
    }

    // Validate files against wrapper restrictions
    const { validFiles, rejectedFiles, warning } = validateFiles(files, {
      accept: wrapperAccept,
      maxSize,
      multiple,
      t: this.translate.bind(this),
    });

    // If input has a live accept attribute that differs from wrapperAccept, also enforce it
    let finalValidFiles = validFiles;
    if (inputAccept && inputAccept.trim() && inputAccept !== wrapperAccept) {
      const inputValidation = validateFiles(validFiles, {
        accept: inputAccept,
        maxSize,
        multiple,
        t: this.translate.bind(this),
      });
      finalValidFiles = inputValidation.validFiles;
      if (inputValidation.rejectedFiles.length > 0) {
        for (const rej of inputValidation.rejectedFiles) {
          this.notifyError(rej.reason);
        }
      }
    }

    // If manager has allowedMimeTypes configured, also enforce it
    if (this.options.allowedMimeTypes) {
      const globalValidation = validateFiles(finalValidFiles, {
        accept: this.options.allowedMimeTypes,
        maxSize,
        multiple,
        t: this.translate.bind(this),
      });
      finalValidFiles = globalValidation.validFiles;
      if (globalValidation.rejectedFiles.length > 0) {
        for (const rej of globalValidation.rejectedFiles) {
          this.notifyError(rej.reason);
        }
      }
    }

    // Report rejected files
    if (rejectedFiles.length > 0) {
      for (const rej of rejectedFiles) {
        this.notifyError(rej.reason);
      }
    }

    // Report single-file warning if applicable (only if a file is actually kept for upload)
    if (warning && finalValidFiles.length > 0) {
      this.notifyWarning(warning);
    }

    // If valid files remain, trigger upload!
    if (finalValidFiles.length > 0) {
      const success = triggerUpload(target, finalValidFiles);
      if (success) {
        this.lastPasteTime = Date.now();
        this.lastPasteTarget = target;
        this.lastHandledFiles = finalValidFiles.map((f) => ({ name: f.name, size: f.size, type: f.type }));
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.lastPasteTarget = null;
          this.lastHandledFiles = [];
          this.debounceTimer = null;
        }, 500);

        // Trigger ripple pulse visual feedback
        if (this.pulseTimer) {
          clearTimeout(this.pulseTimer);
          this.pulseTimer = null;
        }
        target.classList.add('nb-paste-upload-success-pulse');
        this.pulseTimer = setTimeout(() => {
          target.classList.remove('nb-paste-upload-success-pulse');
          this.pulseTimer = null;
        }, 500);

        if (this.options.onSuccess) {
          this.options.onSuccess(finalValidFiles.length);
        }
      }
    }
  }

  private areFilesEquivalent(filesA: File[], filesB: HandledFileMeta[]): boolean {
    if (!filesA || !filesB || filesA.length !== filesB.length || filesA.length === 0) {
      return false;
    }
    for (let i = 0; i < filesA.length; i++) {
      const a = filesA[i];
      const b = filesB[i];
      if (a.size !== b.size) return false;

      const aNormType = normalizeMimeType(a.type, a.name);
      const bNormType = normalizeMimeType(b.type, b.name);
      if (aNormType !== bNormType) return false;

      const aGeneric = isGenericScreenshotName(a.name);
      const bGeneric = isGenericScreenshotName(b.name);
      if (aGeneric && bGeneric) {
        continue;
      }
      if (a.name.toLowerCase() !== b.name.toLowerCase()) {
        return false;
      }
    }
    return true;
  }

  private notifyError(msg: string) {
    if (this.options.onError) {
      this.options.onError(msg);
      return;
    }
    try {
      message.error(msg);
    } catch {
      console.error(msg);
    }
  }

  private notifyWarning(msg: string) {
    if (this.options.onWarning) {
      this.options.onWarning(msg);
      return;
    }
    try {
      message.warning(msg);
    } catch {
      console.warn(msg);
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.lastPasteTime = 0;
    this.lastPasteTarget = null;
    this.lastHandledFiles = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.deactivateTarget();

    if (typeof document !== 'undefined') {
      document.removeEventListener('mouseover', this.onMouseOverBound as any, true);
      document.removeEventListener('mouseout', this.onMouseOutBound as any, true);
      document.removeEventListener('paste', this.onPasteBound as any, true);
      removePasteUploadStyles();
    }

    const g = getGlobalObj();
    if (g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ === this) {
      g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ = null;
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __NOCOBASE_PASTE_UPLOAD_MANAGER__: PasteUploadManager | null | undefined;
}

const getGlobalObj = (): any => {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  return {};
};

export function initPasteUploadManager(options: PasteUploadManagerOptions = {}): PasteUploadManager {
  const g = getGlobalObj();
  const existing = g.__NOCOBASE_PASTE_UPLOAD_MANAGER__;
  if (existing && !existing.isDestroyed) {
    existing.updateOptions(options);
    return existing;
  }
  return new PasteUploadManager(options);
}

export function getPasteUploadManager(): PasteUploadManager | null {
  const g = getGlobalObj();
  return g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ || null;
}

export function destroyPasteUploadManager(): void {
  const g = getGlobalObj();
  if (g.__NOCOBASE_PASTE_UPLOAD_MANAGER__) {
    g.__NOCOBASE_PASTE_UPLOAD_MANAGER__.destroy();
    g.__NOCOBASE_PASTE_UPLOAD_MANAGER__ = null;
  }
}
