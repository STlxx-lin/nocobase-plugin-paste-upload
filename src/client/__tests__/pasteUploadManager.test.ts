import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PasteUploadManager } from '../pasteUploadManager';
import { setupPasteUploadPlugin } from '../pluginHelper';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    message: {
      ...actual.message,
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('PasteUploadManager lifecycle and interaction flow', () => {
  let manager: PasteUploadManager;
  let container: HTMLDivElement;
  let fileInput: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = '';

    // Create a simulated NocoBase upload component container
    container = document.createElement('div');
    container.className = 'nb-upload ant-upload-select';
    container.setAttribute('data-paste-upload', 'true');

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('accept', 'image/*');
    fileInput.multiple = true;
    container.appendChild(fileInput);

    document.body.appendChild(container);
    manager = new PasteUploadManager();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should activate visual indicator (class and badge) on mouseover', () => {
    const mouseOverEvt = new MouseEvent('mouseover', { bubbles: true });
    container.dispatchEvent(mouseOverEvt);

    expect(manager.getActiveTarget()).toBe(container);
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(true);

    const badge = container.querySelector('.nb-paste-upload-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('粘贴上传');
  });

  it('should deactivate and clean up visual indicator on mouseout to external element', () => {
    // 1. Mouse in
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(true);

    // 2. Mouse out to outside element
    const outsideDiv = document.createElement('div');
    document.body.appendChild(outsideDiv);

    const mouseOutEvt = new MouseEvent('mouseout', {
      bubbles: true,
      relatedTarget: outsideDiv,
    });
    container.dispatchEvent(mouseOutEvt);

    expect(manager.getActiveTarget()).toBeNull();
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(false);
    expect(container.querySelector('.nb-paste-upload-badge')).toBeNull();
  });

  it('should ignore disabled upload components on hover', () => {
    container.classList.add('ant-upload-disabled');

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBeNull();
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(false);
  });

  it('should capture screenshot paste event and trigger upload on hovered component', () => {
    // 1. Hover to activate
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    // 2. Spy on file input change event
    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    // 3. Create simulated screenshot file
    const screenshot = new File(['mock-img-data'], 'image.png', { type: 'image/png' });
    const mockClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => screenshot,
        },
      ],
      files: [] as File[],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Event should be handled & default prevented
    expect(pasteEvt.defaultPrevented).toBe(true);

    // Change event must have been dispatched to fileInput
    expect(changeSpy).toHaveBeenCalled();
    expect(fileInput.files?.length).toBe(1);
    expect(fileInput.files?.[0].type).toBe('image/png');
  });

  it('should handle batch pasting multiple files correctly', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img1 = new File(['img1'], 'photo1.png', { type: 'image/png' });
    const img2 = new File(['img2'], 'photo2.png', { type: 'image/png' });

    const mockClipboard = {
      items: [],
      files: [img1, img2],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(true);
    expect(changeSpy).toHaveBeenCalled();
    expect(fileInput.files?.length).toBe(2);
  });

  it('should silently ignore pure text clipboard and not prevent default', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const mockClipboard = {
      items: [
        {
          kind: 'string',
          type: 'text/plain',
          getAsString: (cb: (s: string) => void) => cb('plain text copy'),
          getAsFile: () => null,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Should NOT prevent default, should NOT trigger upload
    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should not trigger upload when mouse is not hovering over the component', () => {
    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img = new File(['data'], 'test.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    // Paste fired on document without hovering container
    document.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should clean up completely upon destroy', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(true);

    manager.destroy();

    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(false);
    expect(container.querySelector('.nb-paste-upload-badge')).toBeNull();

    // After destroy, mouseover should have no effect
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBeNull();
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(false);
  });

  it('should prioritize outer [data-paste-upload="true"] wrapper and enforce its data-max-size on hover of inner element', () => {
    // Structure: wrapper > antd-select > button
    const wrapper = document.createElement('div');
    wrapper.className = 'nb-paste-upload-container';
    wrapper.setAttribute('data-paste-upload', 'true');
    wrapper.setAttribute('data-max-size', '100'); // 100 bytes limit

    const innerSelect = document.createElement('div');
    innerSelect.className = 'ant-upload ant-upload-select';
    const innerInput = document.createElement('input');
    innerInput.type = 'file';
    const innerBtn = document.createElement('button');
    innerBtn.textContent = 'Upload Button';

    innerSelect.appendChild(innerInput);
    innerSelect.appendChild(innerBtn);
    wrapper.appendChild(innerSelect);
    document.body.appendChild(wrapper);

    // Hover directly on inner button
    innerBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // Must activate the outer wrapper
    expect(manager.getActiveTarget()).toBe(wrapper);

    // Paste file that exceeds 100 bytes (e.g. 500 bytes)
    const bigFile = new File([new Uint8Array(500)], 'overlimit.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => bigFile }],
      files: [],
    } as unknown as DataTransfer;

    const changeSpy = vi.fn();
    innerInput.addEventListener('change', changeSpy);

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    innerBtn.dispatchEvent(pasteEvt);

    // Should reject because wrapper's data-max-size is 100
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should ignore hover when inner element is inside disabled [data-paste-upload="false"] container', () => {
    const disabledWrapper = document.createElement('div');
    disabledWrapper.className = 'nb-paste-upload-container';
    disabledWrapper.setAttribute('data-paste-upload', 'false');

    const innerSelect = document.createElement('div');
    innerSelect.className = 'ant-upload ant-upload-select';
    const innerBtn = document.createElement('button');
    innerSelect.appendChild(innerBtn);
    disabledWrapper.appendChild(innerSelect);
    document.body.appendChild(disabledWrapper);

    innerBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBeNull();
  });

  it('should handle upload inside nested Modal / Drawer portals and cleanly switch targets', () => {
    // Background page upload
    const pageUpload = container;
    const pageInput = fileInput;

    // Simulated Ant Design Modal Dialog rendered in document.body
    const modalWrapper = document.createElement('div');
    modalWrapper.className = 'ant-modal-root';
    const modalUpload = document.createElement('div');
    modalUpload.className = 'nb-upload ant-upload-select';
    modalUpload.setAttribute('data-paste-upload', 'true');
    const modalInput = document.createElement('input');
    modalInput.type = 'file';
    modalUpload.appendChild(modalInput);
    modalWrapper.appendChild(modalUpload);
    document.body.appendChild(modalWrapper);

    const pageSpy = vi.fn();
    const modalSpy = vi.fn();
    pageInput.addEventListener('change', pageSpy);
    modalInput.addEventListener('change', modalSpy);

    // 1. Hover on modal upload
    modalUpload.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(modalUpload);

    // 2. Paste into modal
    const img = new File(['modal-img'], 'modal.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    modalUpload.dispatchEvent(pasteEvt);

    expect(modalSpy).toHaveBeenCalled();
    expect(pageSpy).not.toHaveBeenCalled();

    // 3. Close modal (remove from DOM)
    modalWrapper.remove();

    // 4. Hover back to page upload
    pageUpload.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(pageUpload);
  });

  it('should process rapid successive pastes concurrently without dropping files or crashing', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    // Simulate 3 rapid pastes (e.g. from clipboard history Win+V)
    for (let i = 1; i <= 3; i++) {
      const file = new File([`data-${i}`], `shot-${i}.png`, { type: 'image/png' });
      const mockClipboard = {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [],
      } as unknown as DataTransfer;

      const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvt.clipboardData = mockClipboard;
      container.dispatchEvent(pasteEvt);
    }

    expect(changeSpy).toHaveBeenCalledTimes(3);
  });

  it('should format badge with custom translation if provided in options', () => {
    // Destroy default manager first to prevent multiple global listeners
    manager.destroy();

    const customManager = new PasteUploadManager({
      t: (key: string, params?: any) => {
        if (key === 'Press {{shortcut}} to paste') {
          return `Custom [${params.shortcut}] Hint`;
        }
        return key;
      },
    });

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const badge = container.querySelector('.nb-paste-upload-badge');
    expect(badge?.textContent).toContain('Custom');
    expect(badge?.textContent).toContain('Hint');

    customManager.destroy();
  });

  it('should translate badge to English when getLocale returns en-US', () => {
    manager.destroy();

    const enManager = new PasteUploadManager({
      getLocale: () => 'en-US',
    });

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const badge = container.querySelector('.nb-paste-upload-badge');
    expect(badge?.textContent).toContain('Press');
    expect(badge?.textContent).toContain('to paste');

    enManager.destroy();
  });

  it('should not intercept paste or trigger upload when user is focused on an input/textarea inside the upload container', () => {
    // Sub-input inside upload container (e.g. file rename input or description)
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'ant-input';
    container.appendChild(textInput);

    // Hover over container
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    // Focus text input inside container
    textInput.focus();

    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => 'some copied text',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    textInput.dispatchEvent(pasteEvt);

    // Must NOT prevent default, must NOT trigger upload!
    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should not activate upload container when mouse is hovering directly over an editable input inside the container', () => {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    container.appendChild(textInput);

    textInput.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // findUploadContainer should return null when hovering directly on text input
    expect(manager.getActiveTarget()).toBeNull();
  });

  it('should not intercept paste when user is typing in an external input and pastes text', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const outsideInput = document.createElement('input');
    outsideInput.type = 'text';
    document.body.appendChild(outsideInput);
    outsideInput.focus();

    // Clipboard containing text as well as an image preview (common when copying from web/word)
    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: (type: string) => (type === 'text/plain' ? 'hello world' : ''),
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    outsideInput.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();

    outsideInput.remove();
  });

  it('should not intercept paste when user is focused on a contenteditable rich text editor', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.appendChild(editor);
    editor.focus();

    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    editor.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();

    editor.remove();
  });

  it('should strictly respect dynamically mutated fileInput.multiple = false on underlying DOM input', () => {
    // Wrapper says multiple=true, but someone dynamically sets fileInput.multiple = false
    container.setAttribute('data-multiple', 'true');
    fileInput.multiple = false;

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const warningSpy = vi.fn();
    manager.destroy();
    manager = new PasteUploadManager({ onWarning: warningSpy });
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const file1 = new File(['1'], 'f1.png', { type: 'image/png' });
    const file2 = new File(['2'], 'f2.png', { type: 'image/png' });
    const mockClipboard = {
      items: [],
      files: [file1, file2],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Because fileInput.multiple was set to false, only 1 file should be uploaded and a warning issued!
    expect(fileInput.files?.length).toBe(1);
    expect(fileInput.files?.[0].name).toBe('f1.png');
    expect(warningSpy).toHaveBeenCalled();
  });

  it('should strictly enforce dynamically mutated fileInput.accept property on underlying DOM input', () => {
    container.setAttribute('data-accept', 'image/*');
    // Dynamically restrict input to jpeg only
    fileInput.accept = 'image/jpeg';

    const errorSpy = vi.fn();
    manager.destroy();
    manager = new PasteUploadManager({ onError: errorSpy });
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const pngFile = new File(['png-data'], 'avatar.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => pngFile }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Rejected by dynamically set fileInput.accept
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should immediately abort paste and deactivate if fileInput.disabled = true is set dynamically after hover', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    // Dynamically disable the underlying input after hover
    fileInput.disabled = true;

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(manager.getActiveTarget()).toBeNull();
  });

  it('should correctly isolate inputs and trigger the outer input when outer container has a nested inner container', () => {
    // Outer upload container
    const outerWrapper = document.createElement('div');
    outerWrapper.className = 'nb-paste-upload-container';
    outerWrapper.setAttribute('data-paste-upload', 'true');
    const outerInput = document.createElement('input');
    outerInput.type = 'file';
    outerWrapper.appendChild(outerInput);

    // Inner nested upload container
    const innerWrapper = document.createElement('div');
    innerWrapper.className = 'nb-paste-upload-container';
    innerWrapper.setAttribute('data-paste-upload', 'true');
    const innerInput = document.createElement('input');
    innerInput.type = 'file';
    innerWrapper.appendChild(innerInput);

    outerWrapper.appendChild(innerWrapper);
    document.body.appendChild(outerWrapper);

    const outerSpy = vi.fn();
    const innerSpy = vi.fn();
    outerInput.addEventListener('change', outerSpy);
    innerInput.addEventListener('change', innerSpy);

    // Hover outer
    outerWrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(outerWrapper);

    const img = new File(['data'], 'test.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    outerWrapper.dispatchEvent(pasteEvt);

    // Outer input must receive change event, NOT inner input
    expect(outerSpy).toHaveBeenCalled();
    expect(innerSpy).not.toHaveBeenCalled();

    outerWrapper.remove();
  });

  it('should translate validation errors to English when getLocale returns en-US', () => {
    manager.destroy();
    const errorSpy = vi.fn();
    const enManager = new PasteUploadManager({
      getLocale: () => 'en-US',
      onError: errorSpy,
    });

    container.setAttribute('data-accept', 'image/png');
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const badFile = new File(['data'], 'wrong.pdf', { type: 'application/pdf' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => badFile }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    container.dispatchEvent(pasteEvt);

    expect(errorSpy).toHaveBeenCalled();
    const errMsg = errorSpy.mock.calls[0][0];
    expect(errMsg).toContain('File type not allowed');
    expect(errMsg).toContain('wrong.pdf');

    enManager.destroy();
  });

  it('should not activate upload container when hovering over a contenteditable div without explicit ="true" (e.g. contenteditable="")', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', '');
    container.appendChild(editor);

    editor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBeNull();

    editor.remove();
  });

  it('should not hijack paste when user copies pure whitespace into an external input', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const outsideInput = document.createElement('input');
    outsideInput.type = 'text';
    document.body.appendChild(outsideInput);
    outsideInput.focus();

    // Clipboard containing pure whitespace (spaces, tabs, newlines)
    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: (type: string) => (type === 'text/plain' ? '   \n\t  ' : ''),
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    outsideInput.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();

    outsideInput.remove();
  });

  it('should immediately abort paste and deactivate if container or ancestor is dynamically disabled after hover', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    // Dynamically mark container disabled via attribute
    container.setAttribute('data-paste-upload', 'false');

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(manager.getActiveTarget()).toBeNull();
  });

  it('should not display single-file warning if all pasted files are rejected by accept or size validation', () => {
    container.setAttribute('data-accept', 'image/png');
    container.setAttribute('data-multiple', 'false');

    const warningSpy = vi.fn();
    const errorSpy = vi.fn();
    manager.destroy();
    manager = new PasteUploadManager({
      onWarning: warningSpy,
      onError: errorSpy,
    });

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // Paste 2 files that are both invalid (.pdf)
    const pdf1 = new File(['1'], 'file1.pdf', { type: 'application/pdf' });
    const pdf2 = new File(['2'], 'file2.pdf', { type: 'application/pdf' });
    const mockClipboard = {
      items: [],
      files: [pdf1, pdf2],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Errors reported for invalid files
    expect(errorSpy).toHaveBeenCalledTimes(2);
    // Warning should NOT be shown because 0 files were valid for upload!
    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('should update options on subsequent initPasteUploadManager calls', async () => {
    const { initPasteUploadManager, destroyPasteUploadManager } = await import('../pasteUploadManager');
    destroyPasteUploadManager();

    const m1 = initPasteUploadManager({ getLocale: () => 'zh-CN' });
    expect(m1).toBeDefined();

    // Call again with new options
    const newT = vi.fn((key: string) => `translated:${key}`);
    const m2 = initPasteUploadManager({ t: newT });
    expect(m2).toBe(m1);

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(newT).toHaveBeenCalled();

    destroyPasteUploadManager();
  });

  it('should ensure triggerUpload is called exactly once and input receives exactly 1 file on single paste with dual-channel clipboard data', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const fileFromItems = new File(['binary-bytes'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000005,
    });
    const fileFromFiles = new File(['binary-bytes'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });

    const mockClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => fileFromItems,
        },
      ],
      files: [fileFromFiles],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(pasteEvt.defaultPrevented).toBe(true);
    expect(pasteEvt.__nbPasteUploadHandled).toBe(true);
    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(fileInput.files?.length).toBe(1);
  });

  it('should not process paste event if e.defaultPrevented is true or __nbPasteUploadHandled is true', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img = new File(['data'], 'test.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;

    // Case 1: defaultPrevented is true
    const pasteEvt1 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt1.clipboardData = mockClipboard;
    pasteEvt1.preventDefault();
    container.dispatchEvent(pasteEvt1);
    expect(changeSpy).not.toHaveBeenCalled();

    // Case 2: __nbPasteUploadHandled is true
    const pasteEvt2 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt2.clipboardData = mockClipboard;
    pasteEvt2.__nbPasteUploadHandled = true;
    container.dispatchEvent(pasteEvt2);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should maintain single global instance across multiple initPasteUploadManager calls without duplicate listeners', async () => {
    const { initPasteUploadManager, destroyPasteUploadManager } = await import('../pasteUploadManager');
    manager.destroy();
    destroyPasteUploadManager();

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    // Simulate bundle 1 (client) and bundle 2 (client-v2) initializing manager
    const managerClient = initPasteUploadManager({ getLocale: () => 'zh-CN' });
    const managerClientV2 = initPasteUploadManager({ getLocale: () => 'en-US' });

    expect(managerClient).toBe(managerClientV2);
    expect((globalThis as any).__NOCOBASE_PASTE_UPLOAD_MANAGER__).toBe(managerClient);

    // Filter document.addEventListener calls for 'paste'
    const pasteListenerRegistrations = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'paste'
    );
    // Even though initPasteUploadManager was called twice, paste listener was attached only once!
    expect(pasteListenerRegistrations.length).toBe(1);

    addEventListenerSpy.mockRestore();
    destroyPasteUploadManager();
  });

  it('should not mark __nbPasteUploadHandled as true if upload container or input is dynamically disabled', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    // Dynamically disable container before paste
    container.setAttribute('data-paste-upload', 'false');

    const file = new File(['mock'], 'image.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      files: [file],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    // Because container was disabled, the paste event was NOT handled by paste upload
    expect(pasteEvt.__nbPasteUploadHandled).toBeFalsy();
    expect(pasteEvt.defaultPrevented).toBe(false);
  });

  it('should trigger upload exactly once with 1 file for macOS Safari dual-channel screenshot', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const fileItems = new File(['safari-screenshot-bytes'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });
    const fileFiles = new File(['safari-screenshot-bytes'], 'Pasted Graphic.png', {
      type: 'image/png',
      lastModified: 1700000000008,
    });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => fileItems }],
      files: [fileFiles],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(fileInput.files?.length).toBe(1);
    expect(pasteEvt.defaultPrevented).toBe(true);
    expect(pasteEvt.__nbPasteUploadHandled).toBe(true);
  });

  it('should support fileInput.files.item(index) in FileList fallback mode when DataTransfer is unavailable', () => {
    // Save original DataTransfer
    const origDataTransfer = (globalThis as any).DataTransfer;
    // Temporarily delete DataTransfer to force fallback path
    delete (globalThis as any).DataTransfer;

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      files: [file],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;

    container.dispatchEvent(pasteEvt);

    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(fileInput.files).toBeDefined();
    expect(fileInput.files?.length).toBe(1);
    // Standard FileList item() API must be supported on fallback!
    expect(typeof (fileInput.files as any).item).toBe('function');
    expect((fileInput.files as any).item(0)).toBe(fileInput.files?.[0]);
    expect((fileInput.files as any).item(99)).toBeNull();

    // Restore DataTransfer
    (globalThis as any).DataTransfer = origDataTransfer;
  });

  it('should debounce rapid duplicate replay paste events on the same target within 300ms', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const img = new File(['duplicate-bytes'], 'image.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [img],
    } as unknown as DataTransfer;

    // First paste event (user presses Ctrl+V)
    const evt1 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    evt1.clipboardData = mockClipboard;
    container.dispatchEvent(evt1);

    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(evt1.defaultPrevented).toBe(true);

    // Second paste event arriving 20ms later (distinct event instance: key repeat or RDP replay)
    const evt2 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    evt2.clipboardData = mockClipboard;
    container.dispatchEvent(evt2);

    // MUST NOT trigger upload a second time!
    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(evt2.defaultPrevented).toBe(true);
    expect(evt2.__nbPasteUploadHandled).toBe(true);
  });

  it('should immediately deactivate target and ignore events when updateOptions sets disabled: true', () => {
    // 1. Mouse in and activate
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(true);
    expect(container.querySelector('.nb-paste-upload-badge')).not.toBeNull();

    // 2. Dynamically disable via updateOptions
    manager.updateOptions({ disabled: true });
    expect(manager.getOptions().disabled).toBe(true);
    expect(manager.getActiveTarget()).toBeNull();
    expect(container.classList.contains('nb-paste-upload-hovering')).toBe(false);
    expect(container.querySelector('.nb-paste-upload-badge')).toBeNull();

    // 3. Mouseover while disabled must not activate
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBeNull();

    // 4. Paste while disabled must not trigger upload
    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);
    const img = new File(['bytes'], 'image.png', { type: 'image/png' });
    const mockCb = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
    } as unknown as DataTransfer;
    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockCb;
    container.dispatchEvent(pasteEvt);
    expect(changeSpy).not.toHaveBeenCalled();

    // 5. Re-enable via updateOptions
    manager.updateOptions({ disabled: false });
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);
  });

  it('should enforce manager-level maxFileSize and allowedMimeTypes constraints', () => {
    const errorSpy = vi.fn();
    manager.updateOptions({
      onError: errorSpy,
      maxFileSize: 100, // 100 bytes limit
      allowedMimeTypes: 'image/png',
    });

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    // 1. Oversized file (> 100 bytes)
    const largeFile = new File(['a'.repeat(200)], 'large.png', { type: 'image/png' });
    const cb1 = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => largeFile }],
      files: [],
    } as unknown as DataTransfer;
    const evt1 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    evt1.clipboardData = cb1;
    container.dispatchEvent(evt1);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockClear();

    // 2. Disallowed MIME type (image/jpeg when manager requires image/png)
    const jpegFile = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    const cb2 = {
      items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => jpegFile }],
      files: [],
    } as unknown as DataTransfer;
    const evt2 = new Event('paste', { bubbles: true, cancelable: true }) as any;
    evt2.clipboardData = cb2;
    container.dispatchEvent(evt2);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should clean up detached target on mouseout if active container was removed from DOM', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    // Remove container from DOM
    container.remove();

    // Mouse moves outside
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: outside }));

    expect(manager.getActiveTarget()).toBeNull();
  });

  it('should strictly trigger 1 upload for Chinese macOS screenshot (屏幕快照)', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const itemFile = new File(['chinese-shot'], 'image.png', { type: 'image/png' });
    const fileFile = new File(['chinese-shot'], '屏幕快照 2026-10-27 12.00.00.png', {
      type: 'image/png',
      lastModified: 1700000000008,
    });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => itemFile }],
      files: [fileFile],
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    container.dispatchEvent(pasteEvt);

    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(fileInput.files?.length).toBe(1);
    expect(fileInput.files?.[0].type).toBe('image/png');
  });

  it('should activate upload container embedded inside contenteditable="false" card inside a contenteditable="true" rich text editor', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');

    const card = document.createElement('div');
    card.setAttribute('contenteditable', 'false');

    const uploadInCard = document.createElement('div');
    uploadInCard.className = 'nb-upload ant-upload-select';
    uploadInCard.setAttribute('data-paste-upload', 'true');
    const inputInCard = document.createElement('input');
    inputInCard.type = 'file';
    uploadInCard.appendChild(inputInCard);
    card.appendChild(uploadInCard);
    editor.appendChild(card);
    document.body.appendChild(editor);

    uploadInCard.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(uploadInCard);
    expect(uploadInCard.classList.contains('nb-paste-upload-hovering')).toBe(true);

    editor.remove();
  });

  it('should not trigger upload on background page when user pastes while focused inside an open modal', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const modal = document.createElement('div');
    modal.className = 'ant-modal-root';
    const modalInput = document.createElement('input');
    modalInput.type = 'text';
    modal.appendChild(modalInput);
    document.body.appendChild(modal);
    modalInput.focus();

    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    modalInput.dispatchEvent(pasteEvt);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(manager.getActiveTarget()).toBeNull();

    modal.remove();
  });

  it('should interpolate parameters when custom translation function returns a template string containing placeholders', () => {
    manager.destroy();

    const templateManager = new PasteUploadManager({
      t: (key: string) => {
        if (key === 'Press {{shortcut}} to paste') {
          return '按 {{shortcut}} 快捷粘贴';
        }
        return key;
      },
    });

    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const badge = container.querySelector('.nb-paste-upload-badge');
    expect(badge?.textContent).toContain('按');
    expect(badge?.textContent).toContain('快捷粘贴');
    expect(badge?.textContent).not.toContain('{{shortcut}}');

    templateManager.destroy();
  });

  it('should register enhanced components into app.components when app.addComponents is not available', () => {
    const mockApp = {
      components: {
        Upload: function MockUpload() {},
      },
    };

    setupPasteUploadPlugin(mockApp as any);
    expect(mockApp.components['Upload']).toBeDefined();
    expect((mockApp.components['Upload'] as any).displayName).toContain('withPasteUpload');
  });

  it('should isolate modal paste even when activeElement is document.body (unfocusable div clicked inside modal)', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const changeSpy = vi.fn();
    fileInput.addEventListener('change', changeSpy);

    const modal = document.createElement('div');
    modal.className = 'ant-modal';
    const modalBodyDiv = document.createElement('div');
    modalBodyDiv.textContent = 'Modal content';
    modal.appendChild(modalBodyDiv);
    document.body.appendChild(modal);

    // Active element is document.body (unfocused), but event target is modalBodyDiv
    const img = new File(['data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    modalBodyDiv.dispatchEvent(pasteEvt);

    expect(changeSpy).not.toHaveBeenCalled();
    expect(manager.getActiveTarget()).toBeNull();

    modal.remove();
  });

  it('should recognize detached contenteditable element correctly', () => {
    const detachedEditor = document.createElement('div');
    detachedEditor.setAttribute('contenteditable', 'true');

    // findUploadContainer should return null when element is editable even if detached
    expect(manager.findUploadContainer(detachedEditor)).toBeNull();
  });

  it('should trigger upload via React Fiber / props when file input is not present', () => {
    const fiberContainer = document.createElement('div');
    fiberContainer.className = 'nb-upload ant-upload-select';
    fiberContainer.setAttribute('data-paste-upload', 'true');

    const onChangeSpy = vi.fn();
    (fiberContainer as any)['__reactProps$mock'] = {
      onChange: onChangeSpy,
    };
    document.body.appendChild(fiberContainer);

    fiberContainer.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(fiberContainer);

    const img = new File(['fiber-img'], 'fiber-shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    fiberContainer.dispatchEvent(pasteEvt);

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy.mock.calls[0][0].fileList.length).toBe(1);

    fiberContainer.remove();
  });

  it('should release lastPasteTarget and lastHandledFiles after debounce interval to prevent memory retention', async () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const img = new File(['mem-data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    container.dispatchEvent(pasteEvt);

    // Immediately after paste, internal metadata exists
    expect((manager as any).lastPasteTarget).toBe(container);
    expect((manager as any).lastHandledFiles.length).toBe(1);
    // Crucially: it stores metadata, NOT the raw File blob instance
    expect((manager as any).lastHandledFiles[0] instanceof File).toBe(false);

    // Wait 550ms for debounce timer to fire
    await new Promise((resolve) => setTimeout(resolve, 550));

    expect((manager as any).lastPasteTarget).toBeNull();
    expect((manager as any).lastHandledFiles.length).toBe(0);
  });

  it('should suppress continuous key-repeat stream without multiple triggers, then allow paste after pause', async () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    let uploadCount = 0;
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    input.addEventListener('change', () => {
      uploadCount++;
    });

    const createPasteEvt = () => {
      const img = new File(['repeat-data'], 'shot.png', { type: 'image/png' });
      const mockClipboard = {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
        files: [],
        getData: () => '',
      } as unknown as DataTransfer;
      const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvt.clipboardData = mockClipboard;
      return pasteEvt;
    };

    // First paste: 0ms
    container.dispatchEvent(createPasteEvt());
    expect(uploadCount).toBe(1);

    // Rapid continuous repeat stream every 50ms: at 50, 100, 150, 200, 250, 300, 350ms
    for (let i = 0; i < 7; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      container.dispatchEvent(createPasteEvt());
      expect(uploadCount).toBe(1);
    }

    // Now pause for 350ms (key released)
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Next paste press: should trigger upload #2
    container.dispatchEvent(createPasteEvt());
    expect(uploadCount).toBe(2);
  });

  it('should deactivate and block background upload when paste occurs inside [role="dialog"]', () => {
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(container);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const dialogText = document.createElement('p');
    dialogText.textContent = 'Dialog text content';
    dialog.appendChild(dialogText);
    document.body.appendChild(dialog);

    const img = new File(['dialog-img'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    dialogText.dispatchEvent(pasteEvt);

    expect(manager.getActiveTarget()).toBeNull();
    dialog.remove();
  });

  it('should find and trigger upload on child element with customRequest or onDrop', () => {
    const parentContainer = document.createElement('div');
    parentContainer.className = 'nb-upload';
    parentContainer.setAttribute('data-paste-upload', 'true');

    const childDropzone = document.createElement('div');
    childDropzone.className = 'custom-dropzone';
    const customRequestSpy = vi.fn();
    (childDropzone as any)['__reactProps$custom'] = {
      customRequest: customRequestSpy,
    };
    parentContainer.appendChild(childDropzone);
    document.body.appendChild(parentContainer);

    parentContainer.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(parentContainer);

    const img = new File(['custom-req'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    parentContainer.dispatchEvent(pasteEvt);

    expect(customRequestSpy).toHaveBeenCalledTimes(1);
    expect(customRequestSpy.mock.calls[0][0].file).toBeDefined();

    parentContainer.remove();
  });

  it('should find input[type="file"] nested inside child element Shadow DOM', () => {
    const hostContainer = document.createElement('div');
    hostContainer.className = 'nb-upload';
    hostContainer.setAttribute('data-paste-upload', 'true');

    const customElem = document.createElement('div');
    const shadow = customElem.attachShadow({ mode: 'open' });
    const shadowInput = document.createElement('input');
    shadowInput.type = 'file';
    shadow.appendChild(shadowInput);
    hostContainer.appendChild(customElem);
    document.body.appendChild(hostContainer);

    hostContainer.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(manager.getActiveTarget()).toBe(hostContainer);

    const changeSpy = vi.fn();
    shadowInput.addEventListener('change', changeSpy);

    const img = new File(['shadow-data'], 'shot.png', { type: 'image/png' });
    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => img }],
      files: [],
      getData: () => '',
    } as unknown as DataTransfer;

    const pasteEvt = new Event('paste', { bubbles: true, cancelable: true }) as any;
    pasteEvt.clipboardData = mockClipboard;
    hostContainer.dispatchEvent(pasteEvt);

    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(shadowInput.files?.length).toBe(1);

    hostContainer.remove();
  });
});
