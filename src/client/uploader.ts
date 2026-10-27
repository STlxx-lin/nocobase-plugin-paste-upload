/**
 * Locate the underlying HTMLInputElement for file upload within or associated with an element.
 */
export function findTargetFileInput(element: HTMLElement | null): HTMLInputElement | null {
  if (!element) return null;

  // 1. If element itself is an input[type="file"]
  if (
    (element instanceof HTMLInputElement || element.tagName === 'INPUT') &&
    (element as HTMLInputElement).type === 'file'
  ) {
    return element as HTMLInputElement;
  }

  // Check ShadowRoot if element has one
  if ((element as any).shadowRoot) {
    const shadowInput = (element as any).shadowRoot.querySelector('input[type="file"]');
    if (shadowInput) return shadowInput as HTMLInputElement;
  }
  if (element.querySelectorAll) {
    try {
      const children = element.querySelectorAll('*');
      for (let i = 0; i < children.length; i++) {
        const shadow = (children[i] as any).shadowRoot;
        if (shadow) {
          const shadowInput = shadow.querySelector('input[type="file"]');
          if (shadowInput) return shadowInput as HTMLInputElement;
        }
      }
    } catch {}
  }

  // 2. Search inside the element, isolating from nested child upload containers
  const inputs = Array.from(element.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  if (inputs.length > 0) {
    if (inputs.length === 1) {
      return inputs[0];
    }
    // Multiple inputs found (e.g. nested sub-tables/components)
    // Find the input that directly belongs to this container rather than a nested child container
    for (const input of inputs) {
      const containerOfInput = input.closest<HTMLElement>(
        '[data-paste-upload="true"], .nb-upload, .ant-upload-select, .ant-upload-drag, .ant-upload'
      );
      if (containerOfInput === element) {
        return input;
      }
    }
    for (const input of inputs) {
      const wrapper = input.closest<HTMLElement>('[data-paste-upload="true"]');
      if (wrapper === element) {
        return input;
      }
    }
    return inputs[0];
  }

  // 3. Search in closest upload container
  const container = element.closest<HTMLElement>(
    '.nb-upload, .ant-upload-select, .ant-upload-drag, .ant-upload, [data-paste-upload="true"]'
  );
  if (container && container !== element) {
    return findTargetFileInput(container);
  }

  return null;
}

/**
 * Dispatch files to the target upload component via its underlying input[type="file"].
 * Seamlessly integrates with Ant Design / rc-upload / NocoBase attachment flow.
 */
export function triggerUpload(target: HTMLElement, files: File[]): boolean {
  if (!target || !files || files.length === 0) {
    return false;
  }

  const fileInput = findTargetFileInput(target);

  if (fileInput) {
    const createFileListFallback = (fileList: File[]): any => {
      const list: any = [...fileList];
      list.item = (index: number) => fileList[index] || null;
      return list;
    };

    try {
      if (typeof DataTransfer !== 'undefined') {
        const dt = new DataTransfer();
        for (const file of files) {
          dt.items.add(file);
        }
        fileInput.files = dt.files;
      } else {
        Object.defineProperty(fileInput, 'files', {
          value: createFileListFallback(files),
          writable: true,
          configurable: true,
        });
      }
    } catch {
      Object.defineProperty(fileInput, 'files', {
        value: createFileListFallback(files),
        writable: true,
        configurable: true,
      });
    }

    // Safeguard against silent assignment failure in restricted web runtimes
    if (!fileInput.files || fileInput.files.length !== files.length) {
      try {
        Object.defineProperty(fileInput, 'files', {
          value: createFileListFallback(files),
          writable: true,
          configurable: true,
        });
      } catch {}
    }

    // Dispatch native change event which triggers rc-upload/antd's onChange handler
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    fileInput.dispatchEvent(changeEvent);
    return true;
  }

  // Fallback 1: Check React Props / Fiber (onChange, customRequest, onDrop) on target, container, or children
  try {
    const candidateEl =
      target.closest<HTMLElement>('.nb-upload, .ant-upload, .ant-upload-drag, [data-paste-upload]') || target;
    const candidates: HTMLElement[] = [target];
    if (candidateEl !== target) {
      candidates.push(candidateEl);
    }
    try {
      const children = candidateEl.querySelectorAll<HTMLElement>('*');
      for (let i = 0; i < Math.min(children.length, 10); i++) {
        candidates.push(children[i]);
      }
    } catch {}

    for (const el of candidates) {
      const fiberKey = Object.keys(el).find((k) =>
        k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')
      );
      if (fiberKey) {
        const fiberObj = (el as any)[fiberKey];
        const props = fiberObj?.memoizedProps || fiberObj;
        if (typeof props?.onChange === 'function') {
          props.onChange({ file: files[0], fileList: files });
          return true;
        }
        if (typeof props?.customRequest === 'function') {
          props.customRequest({ file: files[0], filename: files[0].name });
          return true;
        }
        if (typeof props?.onDrop === 'function') {
          props.onDrop(files);
          return true;
        }
      }
    }
  } catch {}

  // Fallback 2: If no file input found directly, dispatch synthetic drop event to the container
  try {
    const uploadArea = target.closest<HTMLElement>('.ant-upload, .ant-upload-drag') || target;
    if (typeof DataTransfer !== 'undefined') {
      const dt = new DataTransfer();
      for (const file of files) {
        dt.items.add(file);
      }
      let dropEvent: Event;
      try {
        if (typeof DragEvent !== 'undefined') {
          dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          });
        } else {
          dropEvent = new Event('drop', { bubbles: true, cancelable: true });
          (dropEvent as any).dataTransfer = dt;
        }
      } catch {
        dropEvent = new Event('drop', { bubbles: true, cancelable: true });
        (dropEvent as any).dataTransfer = dt;
      }
      uploadArea.dispatchEvent(dropEvent);
      return true;
    }
  } catch {
    // ignore drop fallback error
  }

  return false;
}
