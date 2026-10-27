import { initPasteUploadManager } from './pasteUploadManager';
import { withPasteUpload } from './withPasteUpload';

/**
 * Shared initialization helper for both client (v1) and client-v2.
 * Eliminates duplicate schema component enhancement and i18n binding logic.
 */
export function setupPasteUploadPlugin(app: any): void {
  if (!app) return;

  // 1. Initialize global hover & paste listener with i18n
  const t = (key: string, options?: any) => {
    const i18n = app?.i18n;
    if (typeof i18n?.t === 'function') {
      const res = i18n.t(key, { ns: ['@nocobase/plugin-paste-upload', 'client'], ...options });
      if (res && res !== key) return res;
    }
    return undefined;
  };
  const getLocale = () =>
    app?.i18n?.language ||
    (typeof window !== 'undefined' ? localStorage.getItem('NOCOBASE_LOCALE') : '') ||
    'zh-CN';
  initPasteUploadManager({ t, getLocale });

  // 2. Wrap registered schema components if present
  const getComp = (name: string) => {
    const components = app?.components || {};
    if (components[name]) return components[name];
    if (typeof app?.getComponent === 'function') {
      try {
        return app.getComponent(name, false);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const originalAttachment = getComp('Upload.Attachment');
  const originalDragger = getComp('Upload.Dragger');
  const originalUpload = getComp('Upload');

  const enhancedComponents: Record<string, any> = {};
  if (originalUpload) {
    const wrappedUpload = withPasteUpload(originalUpload);
    if ((originalUpload as any).Attachment) {
      (wrappedUpload as any).Attachment = withPasteUpload((originalUpload as any).Attachment);
      enhancedComponents['Upload.Attachment'] = (wrappedUpload as any).Attachment;
    }
    if ((originalUpload as any).Dragger) {
      (wrappedUpload as any).Dragger = withPasteUpload((originalUpload as any).Dragger);
      enhancedComponents['Upload.Dragger'] = (wrappedUpload as any).Dragger;
    }
    enhancedComponents['Upload'] = wrappedUpload;
  }
  if (originalAttachment && !enhancedComponents['Upload.Attachment']) {
    enhancedComponents['Upload.Attachment'] = withPasteUpload(originalAttachment);
  }
  if (originalDragger && !enhancedComponents['Upload.Dragger']) {
    enhancedComponents['Upload.Dragger'] = withPasteUpload(originalDragger);
  }

  if (Object.keys(enhancedComponents).length > 0) {
    if (typeof app?.addComponents === 'function') {
      app.addComponents(enhancedComponents);
    } else if (app?.components && typeof app.components === 'object') {
      Object.assign(app.components, enhancedComponents);
    }
  }
}
