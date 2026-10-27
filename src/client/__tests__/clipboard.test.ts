import { describe, it, expect } from 'vitest';
import {
  extractFilesFromClipboard,
  normalizeClipboardFile,
  isGenericScreenshotName,
  getExtensionFromMime,
  normalizeMimeType,
  isDuplicateFile,
} from '../clipboard';

describe('clipboard file extraction', () => {
  it('should return empty array when clipboardData is null or undefined', () => {
    expect(extractFilesFromClipboard(null)).toEqual([]);
    expect(extractFilesFromClipboard(undefined)).toEqual([]);
  });

  it('should return empty array for pure text clipboard without errors', () => {
    const mockClipboard = {
      items: [
        {
          kind: 'string',
          type: 'text/plain',
          getAsString: (cb: (str: string) => void) => cb('Hello world'),
          getAsFile: () => null,
        },
      ],
      files: [] as File[],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files).toEqual([]);
  });

  it('should extract screenshot image file from clipboardData.items', () => {
    const rawFile = new File(['mock-img-content'], 'image.png', { type: 'image/png' });
    const mockClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => rawFile,
        },
      ],
      files: [] as File[],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
    expect(files[0].name).toMatch(/^screenshot-\d+\.png$/);
  });

  it('should extract multiple files copied from local file explorer via clipboardData.files', () => {
    const file1 = new File(['content-1'], 'report.pdf', { type: 'application/pdf' });
    const file2 = new File(['content-2'], 'avatar.jpg', { type: 'image/jpeg' });
    const file3 = new File(['content-3'], 'table.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const mockClipboard = {
      items: [],
      files: [file1, file2, file3],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(3);
    expect(files[0].name).toBe('report.pdf');
    expect(files[1].name).toBe('avatar.jpg');
    expect(files[2].name).toBe('table.xlsx');
  });

  it('should normalize screenshot file with generic or empty names', () => {
    const fileNoName = new File(['data'], '', { type: 'image/jpeg' });
    const normalized = normalizeClipboardFile(fileNoName, 0);
    expect(normalized.name).toMatch(/^screenshot-\d+\.jpg$/);
    expect(normalized.type).toBe('image/jpeg');

    const fileExisting = new File(['data'], 'document.docx', { type: 'application/docx' });
    const normalizedExisting = normalizeClipboardFile(fileExisting, 0);
    expect(normalizedExisting.name).toBe('document.docx');
  });

  it('should preserve filenames without extensions like LICENSE or Makefile', () => {
    const licenseFile = new File(['MIT License'], 'LICENSE', { type: 'text/plain' });
    const normalized = normalizeClipboardFile(licenseFile, 0);
    expect(normalized.name).toBe('LICENSE');

    const makefile = new File(['all: build'], 'Makefile', { type: '' });
    const normalizedMake = normalizeClipboardFile(makefile, 0);
    expect(normalizedMake.name).toBe('Makefile');
  });

  it('should map SVG mime type image/svg+xml to clean .svg extension for screenshots', () => {
    const svgScreenshot = new File(['<svg></svg>'], '', { type: 'image/svg+xml' });
    const normalized = normalizeClipboardFile(svgScreenshot, 0);
    expect(normalized.name).toMatch(/^screenshot-\d+\.svg$/);
  });

  it('should extract both clipboardData.files and clipboardData.items without dropping items', () => {
    const fileA = new File(['a'], 'explorer1.pdf', { type: 'application/pdf' });
    const fileB = new File(['b'], 'explorer2.pdf', { type: 'application/pdf' });
    const fileItem = new File(['c'], 'screenshot.png', { type: 'image/png' });

    const mockClipboard = {
      files: [fileA, fileB],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => fileItem,
        },
      ],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(3);
    const names = files.map((f) => f.name);
    expect(names).toContain('explorer1.pdf');
    expect(names).toContain('explorer2.pdf');
    expect(names.some((n) => n.includes('screenshot') || n.includes('png'))).toBe(true);
  });

  it('should tolerate unreadable or throwing sandbox items gracefully', () => {
    const validFile = new File(['valid'], 'safe.png', { type: 'image/png' });
    const mockClipboard = {
      files: [],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => {
            throw new Error('Sandbox permission denied');
          },
        },
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => validFile,
        },
      ],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
  });

  it('should safely return empty array when cross-origin iframe throws SecurityError on property access', () => {
    const mockRestrictedClipboard = {} as unknown as DataTransfer;
    Object.defineProperty(mockRestrictedClipboard, 'files', {
      get: () => {
        throw new DOMException('Blocked cross-origin iframe clipboard access', 'SecurityError');
      },
    });
    Object.defineProperty(mockRestrictedClipboard, 'items', {
      get: () => {
        throw new DOMException('Blocked cross-origin iframe clipboard access', 'SecurityError');
      },
    });

    expect(() => {
      const files = extractFilesFromClipboard(mockRestrictedClipboard);
      expect(files).toEqual([]);
    }).not.toThrow();
  });

  it('should deduplicate when browser populates the same file in both clipboardData.files and clipboardData.items', () => {
    const rawScreenshot = new File(['screenshot-bytes'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });

    const mockBrowserClipboard = {
      files: [rawScreenshot],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => rawScreenshot,
        },
      ],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockBrowserClipboard);
    // MUST be deduplicated to exactly 1 file, not 2!
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
    expect(files[0].name).toMatch(/^screenshot-\d+\.png$/);
  });

  it('should not force image/png on non-screenshot files that have empty type', () => {
    const license = new File(['MIT License'], 'LICENSE', { type: '' });
    const normalized = normalizeClipboardFile(license, 0);
    expect(normalized.name).toBe('LICENSE');
    expect(normalized.type).toBe('');
  });

  it('should strictly extract 1 file when browser populates both items and files with different File instances and millisecond lastModified skew', () => {
    // In real Chromium/WebKit browsers, items[0].getAsFile() creates a new File instance on the fly
    // with lastModified having a slight timestamp skew (e.g. 5ms later) compared to files[0].
    const fileFromItems = new File(['screenshot-binary-data'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000005,
    });
    const fileFromFiles = new File(['screenshot-binary-data'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });

    const mockBrowserClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => fileFromItems,
        },
      ],
      files: [fileFromFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockBrowserClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
    expect(files[0].name).toMatch(/^screenshot-\d+\.png$/);
  });

  it('should deduplicate screenshot when items has image.png and files has blob or empty name with same size', () => {
    const fileFromItems = new File(['screenshot-binary-payload'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000010,
    });
    const fileFromFiles = new File(['screenshot-binary-payload'], 'blob', {
      type: '',
      lastModified: 1700000000000,
    });

    const mockBrowserClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => fileFromItems,
        },
      ],
      files: [fileFromFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockBrowserClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
  });

  it('should deduplicate single document copied from file explorer present in both items and files', () => {
    const docItems = new File(['pdf-content'], 'statement.pdf', {
      type: 'application/pdf',
      lastModified: 1690000000000,
    });
    const docFiles = new File(['pdf-content'], 'statement.pdf', {
      type: 'application/pdf',
      lastModified: 1690000000005,
    });

    const mockClipboard = {
      items: [
        {
          kind: 'file',
          type: 'application/pdf',
          getAsFile: () => docItems,
        },
      ],
      files: [docFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('statement.pdf');
  });

  it('should not drop distinct screenshots when user pastes multiple images with identical byte size', () => {
    // Adversarial case: two distinct screenshots or images with identical byte size in dual-channel
    const img1Items = new File(['AAAAA'], 'image.png', { type: 'image/png' });
    const img2Items = new File(['BBBBB'], 'image.png', { type: 'image/png' });

    const img1Files = new File(['AAAAA'], 'image.png', { type: 'image/png' });
    const img2Files = new File(['BBBBB'], 'image.png', { type: 'image/png' });

    const mockClipboard = {
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => img1Items },
        { kind: 'file', type: 'image/png', getAsFile: () => img2Items },
      ],
      files: [img1Files, img2Files],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    // Must strictly extract BOTH files (2 files), not falsely drop the 2nd file!
    expect(files.length).toBe(2);
    expect(files[0].type).toBe('image/png');
    expect(files[1].type).toBe('image/png');
    expect(files[0].name).not.toBe(files[1].name);
  });

  it('should not drop distinct files when user copies multiple files with same filename and size from different folders', () => {
    // E.g. search results selecting two files with same name and size from different directories
    const file1Items = new File(['data-100'], 'README.md', { type: 'text/markdown' });
    const file2Items = new File(['data-100'], 'README.md', { type: 'text/markdown' });

    const file1Files = new File(['data-100'], 'README.md', { type: 'text/markdown' });
    const file2Files = new File(['data-100'], 'README.md', { type: 'text/markdown' });

    const mockClipboard = {
      items: [
        { kind: 'file', type: 'text/markdown', getAsFile: () => file1Items },
        { kind: 'file', type: 'text/markdown', getAsFile: () => file2Items },
      ],
      files: [file1Files, file2Files],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(2);
    expect(files[0].name).toBe('README.md');
    expect(files[1].name).toBe('README.md');
  });

  it('should extract all files when items is empty and files has multiple generic images of same size', () => {
    const f1 = new File(['123'], 'image.png', { type: 'image/png' });
    const f2 = new File(['456'], 'image.png', { type: 'image/png' });

    const mockClipboard = {
      items: [],
      files: [f1, f2],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(2);
  });

  it('should extract both dual-channel duplicate and distinct extra file when files has more items than items channel', () => {
    const screenshotItems = new File(['img-bytes'], 'image.png', { type: 'image/png' });
    const screenshotFiles = new File(['img-bytes'], 'blob', { type: 'image/png' });
    const extraFile = new File(['extra-data'], 'notes.txt', { type: 'text/plain' });

    const mockClipboard = {
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => screenshotItems },
      ],
      files: [screenshotFiles, extraFile],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    // screenshot is deduplicated to 1, extraFile is kept -> total 2 files
    expect(files.length).toBe(2);
    expect(files.some((f) => f.name.includes('screenshot'))).toBe(true);
    expect(files.some((f) => f.name === 'notes.txt')).toBe(true);
  });

  it('should accurately recognize OS-specific and browser generic screenshot names', () => {
    // macOS Safari & Cocoa clipboard names
    expect(isGenericScreenshotName('Pasted Graphic.png')).toBe(true);
    expect(isGenericScreenshotName('Pasted Graphic 1.png')).toBe(true);
    expect(isGenericScreenshotName('pasted image.png')).toBe(true);
    expect(isGenericScreenshotName('pasted-image.png')).toBe(true);
    expect(isGenericScreenshotName('Screenshot 2026-10-27 at 12.00.00.png')).toBe(true);
    expect(isGenericScreenshotName('Screen Shot 2026-10-27 at 3.30.00 PM.png')).toBe(true);

    // Windows Snipping tool & clipboard
    expect(isGenericScreenshotName('ScreenClip.png')).toBe(true);
    expect(isGenericScreenshotName('Capture.png')).toBe(true);
    expect(isGenericScreenshotName('Capture-1.png')).toBe(true);
    expect(isGenericScreenshotName('Screenshot 2026-10-27 120000.png')).toBe(true);
    expect(isGenericScreenshotName('snipping tool.png')).toBe(true);
    expect(isGenericScreenshotName('snipping tool (1).png')).toBe(true);
    expect(isGenericScreenshotName('snippingtool.png')).toBe(true);
    expect(isGenericScreenshotName('snip.png')).toBe(true);

    // Linux GNOME
    expect(isGenericScreenshotName('Screenshot from 2026-10-27 12-00-00.png')).toBe(true);

    // Numbered & indexed placeholders
    expect(isGenericScreenshotName('image (1).png')).toBe(true);
    expect(isGenericScreenshotName('image-1.png')).toBe(true);
    expect(isGenericScreenshotName('image_1.png')).toBe(true);

    // Real distinct files must NOT be detected as generic screenshots
    expect(isGenericScreenshotName('image-processing.pdf')).toBe(false);
    expect(isGenericScreenshotName('screenshot-report.docx')).toBe(false);
    expect(isGenericScreenshotName('my-avatar.png')).toBe(false);
    expect(isGenericScreenshotName('document.txt')).toBe(false);
    expect(isGenericScreenshotName('contract-2026.pdf')).toBe(false);
  });

  it('should strictly deduplicate dual-channel screenshot in macOS Safari (items: image.png vs files: Pasted Graphic.png)', () => {
    const fileItems = new File(['apple-screenshot-data'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });
    const fileFiles = new File(['apple-screenshot-data'], 'Pasted Graphic.png', {
      type: 'image/png',
      lastModified: 1700000000008,
    });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => fileItems }],
      files: [fileFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
    expect(files[0].name).toMatch(/^screenshot-\d+\.png$/);
  });

  it('should strictly deduplicate dual-channel screenshot in Windows Snipping Tool (items: image.png vs files: Screenshot 2026-10-27 120000.png)', () => {
    const fileItems = new File(['windows-screenshot-data'], 'image.png', {
      type: 'image/png',
      lastModified: 1700000000002,
    });
    const fileFiles = new File(['windows-screenshot-data'], 'Screenshot 2026-10-27 120000.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => fileItems }],
      files: [fileFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].type).toBe('image/png');
  });

  it('should normalize generic non-image files with correct extension and preserve non-image MIME type', () => {
    // 1. PDF with generic name blob: must NOT become image/pdf
    const pdfBlob = new File(['%PDF-1.4'], 'blob', { type: 'application/pdf' });
    const normalizedPdf = normalizeClipboardFile(pdfBlob, 0);
    expect(normalizedPdf.name).toMatch(/^pasted-file-\d+\.pdf$/);
    expect(normalizedPdf.type).toBe('application/pdf');

    // 2. Plain text with generic name blob: extension must be .txt, NOT .plain
    const textBlob = new File(['hello text'], 'blob', { type: 'text/plain' });
    const normalizedText = normalizeClipboardFile(textBlob, 0);
    expect(normalizedText.name).toMatch(/^pasted-file-\d+\.txt$/);
    expect(normalizedText.type).toBe('text/plain');

    // 3. Word document with generic name paste: extension must be .docx
    const docxBlob = new File(['word-bytes'], 'paste', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const normalizedDocx = normalizeClipboardFile(docxBlob, 0);
    expect(normalizedDocx.name).toMatch(/^pasted-file-\d+\.docx$/);
    expect(normalizedDocx.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // 4. MIME type with parameters (e.g. charset)
    const mimeWithParams = getExtensionFromMime('image/png; charset=utf-8');
    expect(mimeWithParams).toBe('png');
    const normMimeWithParams = normalizeMimeType('text/plain; charset=utf-8');
    expect(normMimeWithParams).toBe('text/plain');
  });

  it('should deduplicate zero-byte files across channels without errors', () => {
    const zeroByteItems = new File([], 'empty.txt', { type: 'text/plain' });
    const zeroByteFiles = new File([], 'empty.txt', { type: 'text/plain', lastModified: 1700000000005 });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'text/plain', getAsFile: () => zeroByteItems }],
      files: [zeroByteFiles],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('empty.txt');
  });

  it('should consume unmatched pool when candidate matches exact object reference in seenRawObjects', () => {
    const sameInstance = new File(['content'], 'image.png', { type: 'image/png' });
    const secondFile = new File(['other-content'], 'extra.png', { type: 'image/png' });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => sameInstance }],
      files: [sameInstance, secondFile],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(2);
    expect(files.some((f) => f.name === 'extra.png')).toBe(true);
  });

  it('should strictly deduplicate dual-channel screenshots in Chinese macOS (屏幕快照) and Windows (屏幕截图)', () => {
    // 1. macOS Chinese default screenshot name: 屏幕快照 2026-10-27 12.00.00.png
    const macChineseItems = new File(['chinese-mac-bytes'], 'image.png', { type: 'image/png' });
    const macChineseFiles = new File(['chinese-mac-bytes'], '屏幕快照 2026-10-27 12.00.00.png', {
      type: 'image/png',
      lastModified: 1700000000008,
    });
    const macCb = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => macChineseItems }],
      files: [macChineseFiles],
    } as unknown as DataTransfer;

    const macFiles = extractFilesFromClipboard(macCb);
    expect(macFiles.length).toBe(1);
    expect(macFiles[0].type).toBe('image/png');
    expect(macFiles[0].name).toMatch(/^screenshot-\d+\.png$/);

    // 2. Windows Chinese default screenshot name: 屏幕截图 2026-10-27 120000.png
    const winChineseItems = new File(['chinese-win-bytes'], 'image.png', { type: 'image/png' });
    const winChineseFiles = new File(['chinese-win-bytes'], '屏幕截图 2026-10-27 120000.png', {
      type: 'image/png',
      lastModified: 1700000000003,
    });
    const winCb = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => winChineseItems }],
      files: [winChineseFiles],
    } as unknown as DataTransfer;

    const winFiles = extractFilesFromClipboard(winCb);
    expect(winFiles.length).toBe(1);
    expect(winFiles[0].type).toBe('image/png');
    expect(winFiles[0].name).toMatch(/^screenshot-\d+\.png$/);
  });

  it('should strictly deduplicate screenshots copied from popular tools (Snipaste, PixPin, ShareX)', () => {
    const snipasteItems = new File(['snipaste-bytes'], 'image.png', { type: 'image/png' });
    const snipasteFiles = new File(['snipaste-bytes'], 'Snipaste_2026-10-27_12-34-56.png', {
      type: 'image/png',
      lastModified: 1700000000015,
    });
    const snipasteCb = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => snipasteItems }],
      files: [snipasteFiles],
    } as unknown as DataTransfer;

    const snipFiles = extractFilesFromClipboard(snipasteCb);
    expect(snipFiles.length).toBe(1);
    expect(snipFiles[0].type).toBe('image/png');

    const pixpinItems = new File(['pixpin-bytes'], 'image.png', { type: 'image/png' });
    const pixpinFiles = new File(['pixpin-bytes'], 'PixPin_2026-10-27_123456.png', {
      type: 'image/png',
    });
    const pixpinCb = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => pixpinItems }],
      files: [pixpinFiles],
    } as unknown as DataTransfer;

    const pixFiles = extractFilesFromClipboard(pixpinCb);
    expect(pixFiles.length).toBe(1);
    expect(pixFiles[0].type).toBe('image/png');
  });

  it('should preserve descriptive filenames from files channel when dual-channel matches against generic items', () => {
    // When user copies a real file where items has generic 'image.png' but files channel provides real name
    const genericItem = new File(['diagram-content-bytes'], 'image.png', { type: 'image/png' });
    const descriptiveFile = new File(['diagram-content-bytes'], 'ArchitectureDiagram.png', {
      type: 'image/png',
    });

    const mockClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => genericItem }],
      files: [descriptiveFile],
    } as unknown as DataTransfer;

    const files = extractFilesFromClipboard(mockClipboard);
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('ArchitectureDiagram.png');
    expect(files[0].type).toBe('image/png');
  });

  it('should accurately recognize Chinese localized screenshot names as generic', () => {
    expect(isGenericScreenshotName('屏幕快照 2026-10-27 12.00.00.png')).toBe(true);
    expect(isGenericScreenshotName('屏幕截图 2026-10-27 120000.png')).toBe(true);
    expect(isGenericScreenshotName('截图.png')).toBe(true);
    expect(isGenericScreenshotName('截屏.png')).toBe(true);
    expect(isGenericScreenshotName('剪贴板图片.png')).toBe(true);
    expect(isGenericScreenshotName('未命名.png')).toBe(true);
    expect(isGenericScreenshotName('未命名图片.png')).toBe(true);
    expect(isGenericScreenshotName('Snipaste_2026-10-27_12-34-56.png')).toBe(true);
    expect(isGenericScreenshotName('PixPin_2026-10-27_123456.png')).toBe(true);
    expect(isGenericScreenshotName('ShareX_20261027-123456.png')).toBe(true);
  });
});
