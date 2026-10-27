import React from 'react';
import { getPasteUploadManager } from './pasteUploadManager';

export function withPasteUpload<P extends object = any>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  if (!WrappedComponent) {
    return WrappedComponent;
  }

  const WithPasteUpload = React.forwardRef<any, P>((props: any, ref: any) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const { rules, accept, multiple, disabled, readPretty } = props;

    // Clean up hover state and active target if component becomes disabled, readPretty, or unmounts
    React.useEffect(() => {
      const el = containerRef.current;
      const manager = getPasteUploadManager();
      const active = manager?.getActiveTarget();
      if ((disabled || readPretty) && manager && el && (active === el || el.contains(active))) {
        manager.deactivate();
      }
      return () => {
        const mgr = getPasteUploadManager();
        const curActive = mgr?.getActiveTarget();
        if (mgr && el && (curActive === el || el.contains(curActive))) {
          mgr.deactivate();
        }
      };
    }, [disabled, readPretty]);

    // If in read-only / preview mode, render original component directly
    if (readPretty) {
      return <WrappedComponent {...props} ref={ref} />;
    }

    const findRuleProp = (propNames: string[]) => {
      if (!rules) return undefined;
      for (const name of propNames) {
        if (rules[name] !== undefined) return rules[name];
      }
      if (Array.isArray(rules)) {
        for (const r of rules) {
          if (!r) continue;
          for (const name of propNames) {
            if (r[name] !== undefined) return r[name];
          }
        }
      }
      return undefined;
    };

    const maxSize =
      findRuleProp(['size', 'maxSize']) ||
      props.maxSize ||
      props.fileSize;

    const rawAccept =
      accept ||
      findRuleProp(['mimetype', 'mimeType', 'accept']) ||
      props.mimeType;

    const computedAccept = Array.isArray(rawAccept) ? rawAccept.join(',') : rawAccept;

    return (
      <div
        ref={containerRef}
        className="nb-paste-upload-container"
        data-paste-upload={disabled ? 'false' : 'true'}
        data-accept={computedAccept || undefined}
        data-max-size={maxSize !== undefined ? String(maxSize) : undefined}
        data-multiple={multiple !== undefined ? String(multiple) : undefined}
        style={{ display: 'inline-block', width: '100%', position: 'relative' }}
      >
        <WrappedComponent {...props} ref={ref} />
      </div>
    );
  }) as any;

  // Hoist all static properties (e.g. ReadPretty, Attachment, Dragger, etc.)
  Object.assign(WithPasteUpload, WrappedComponent);

  const componentName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  WithPasteUpload.displayName = `withPasteUpload(${componentName})`;

  return WithPasteUpload;
}
