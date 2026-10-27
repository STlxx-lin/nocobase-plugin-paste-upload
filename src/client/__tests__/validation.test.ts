import { describe, it, expect } from 'vitest';
import { matchAccept, validateFiles, formatFileSize } from '../validation';

describe('file validation and restrictions', () => {
  it('formatFileSize should format bytes properly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
  });

  describe('matchAccept', () => {
    it('should accept all files when accept is empty or wildcard', () => {
      const file = new File(['123'], 'test.txt', { type: 'text/plain' });
      expect(matchAccept(file, '')).toBe(true);
      expect(matchAccept(file, '*')).toBe(true);
      expect(matchAccept(file, '*/*')).toBe(true);
      expect(matchAccept(file, null)).toBe(true);
    });

    it('should match MIME wildcard like image/*', () => {
      const imgPng = new File(['123'], 'test.png', { type: 'image/png' });
      const imgJpg = new File(['123'], 'test.jpg', { type: 'image/jpeg' });
      const docPdf = new File(['123'], 'test.pdf', { type: 'application/pdf' });

      expect(matchAccept(imgPng, 'image/*')).toBe(true);
      expect(matchAccept(imgJpg, 'image/*')).toBe(true);
      expect(matchAccept(docPdf, 'image/*')).toBe(false);
    });

    it('should match file extensions case-insensitively and support aliases', () => {
      const pdf = new File(['123'], 'Contract.PDF', { type: 'application/pdf' });
      const jpg = new File(['123'], 'photo.JPG', { type: 'image/jpeg' });
      const exe = new File(['123'], 'danger.exe', { type: 'application/x-msdownload' });

      expect(matchAccept(pdf, '.pdf')).toBe(true);
      expect(matchAccept(jpg, '.jpeg')).toBe(true);
      expect(matchAccept(jpg, '.jpg')).toBe(true);
      expect(matchAccept(exe, '.pdf, .jpg')).toBe(false);
    });

    it('should match multiple comma-separated rules', () => {
      const pdf = new File(['123'], 'doc.pdf', { type: 'application/pdf' });
      const png = new File(['123'], 'pic.png', { type: 'image/png' });
      const txt = new File(['123'], 'note.txt', { type: 'text/plain' });

      const acceptRule = 'image/*, .pdf';
      expect(matchAccept(pdf, acceptRule)).toBe(true);
      expect(matchAccept(png, acceptRule)).toBe(true);
      expect(matchAccept(txt, acceptRule)).toBe(false);
    });

    it('should infer MIME type from file extension when file.type is empty', () => {
      // Windows explorer copy often leaves file.type empty
      const pdfNoMime = new File(['123'], 'invoice.pdf', { type: '' });
      const pngNoMime = new File(['123'], 'graphic.png', { type: '' });

      expect(matchAccept(pdfNoMime, 'application/pdf')).toBe(true);
      expect(matchAccept(pngNoMime, 'image/*')).toBe(true);
      expect(matchAccept(pngNoMime, 'application/pdf')).toBe(false);
    });
  });

  describe('validateFiles', () => {
    it('should pass valid files under size limit and matching accept', () => {
      const file = new File(['content'], 'avatar.png', { type: 'image/png' });
      const result = validateFiles([file], {
        accept: 'image/*',
        maxSize: 10 * 1024 * 1024,
      });

      expect(result.validFiles.length).toBe(1);
      expect(result.rejectedFiles.length).toBe(0);
    });

    it('should reject file that violates accept rule with clear message', () => {
      const file = new File(['content'], 'setup.exe', { type: 'application/octet-stream' });
      const result = validateFiles([file], {
        accept: 'image/*',
      });

      expect(result.validFiles.length).toBe(0);
      expect(result.rejectedFiles.length).toBe(1);
      expect(result.rejectedFiles[0].reason).toContain('文件类型不符合要求');
      expect(result.rejectedFiles[0].reason).toContain('setup.exe');
    });

    it('should reject file exceeding size limit with clear message', () => {
      // 5MB file
      const bigBuffer = new Uint8Array(5 * 1024 * 1024);
      const file = new File([bigBuffer], 'huge.png', { type: 'image/png' });
      const result = validateFiles([file], {
        maxSize: 2 * 1024 * 1024, // 2MB limit
      });

      expect(result.validFiles.length).toBe(0);
      expect(result.rejectedFiles.length).toBe(1);
      expect(result.rejectedFiles[0].reason).toContain('文件大小超出限制');
      expect(result.rejectedFiles[0].reason).toContain('huge.png');
    });

    it('should match image/jpg and image/jpeg as interchangeable aliases', () => {
      const jpg = new File(['123'], 'photo.jpg', { type: 'image/jpeg' });
      expect(matchAccept(jpg, 'image/jpg')).toBe(true);
      expect(matchAccept(jpg, 'image/jpeg')).toBe(true);

      const jpeg = new File(['123'], 'photo.jpeg', { type: 'image/jpg' });
      expect(matchAccept(jpeg, 'image/jpeg')).toBe(true);
      expect(matchAccept(jpeg, 'image/jpg')).toBe(true);
    });

    it('should match extension rules specified without leading dot (e.g. png, jpg)', () => {
      const png = new File(['123'], 'photo.png', { type: 'image/png' });
      const pdf = new File(['123'], 'doc.pdf', { type: 'application/pdf' });
      expect(matchAccept(png, 'png, jpg')).toBe(true);
      expect(matchAccept(pdf, 'png, jpg')).toBe(false);
    });

    it('should enforce single-file limit when multiple is false', () => {
      const file1 = new File(['1'], 'file1.png', { type: 'image/png' });
      const file2 = new File(['2'], 'file2.png', { type: 'image/png' });

      const result = validateFiles([file1, file2], {
        multiple: false,
      });

      expect(result.validFiles.length).toBe(1);
      expect(result.validFiles[0].name).toBe('file1.png');
      expect(result.warning).toContain('仅支持单文件上传');
    });

    it('should localize error messages when translation function t is provided', () => {
      const file = new File([new Uint8Array(200)], 'bad.exe', { type: 'application/octet-stream' });
      const mockT = (key: string, def: string, params?: Record<string, any>) => {
        if (key === 'File type not allowed: {{name}}') {
          return `English: Not allowed [${params?.name}]`;
        }
        return def;
      };

      const result = validateFiles([file], {
        accept: 'image/*',
        t: mockT,
      });

      expect(result.rejectedFiles.length).toBe(1);
      expect(result.rejectedFiles[0].reason).toBe('English: Not allowed [bad.exe]');
    });

    it('should support accept as an array of mime types or extensions without throwing', () => {
      const png = new File(['data'], 'test.png', { type: 'image/png' });
      const txt = new File(['data'], 'test.txt', { type: 'text/plain' });

      expect(matchAccept(png, ['image/png', 'image/jpeg'])).toBe(true);
      expect(matchAccept(txt, ['image/png', 'image/jpeg'])).toBe(false);

      const result = validateFiles([png, txt], {
        accept: ['image/png', 'image/jpeg'],
      });
      expect(result.validFiles.length).toBe(1);
      expect(result.validFiles[0].name).toBe('test.png');
      expect(result.rejectedFiles.length).toBe(1);
    });

    it('should safely interpolate filenames containing dollar characters like $1 or $& without regex corruption', () => {
      const fileWithDollar = new File(['data'], 'invoice$100$&.exe', { type: 'application/octet-stream' });
      const result = validateFiles([fileWithDollar], {
        accept: 'image/*',
      });
      expect(result.rejectedFiles.length).toBe(1);
      expect(result.rejectedFiles[0].reason).toContain('invoice$100$&.exe');
      expect(result.rejectedFiles[0].reason).not.toContain('{{name}}');
    });

    it('should match extension rule via MIME type when file has no extension', () => {
      const blobFile = new File(['data'], 'pasted-raw-blob', { type: 'image/png' });
      expect(matchAccept(blobFile, '.png')).toBe(true);
      expect(matchAccept(blobFile, '.jpg')).toBe(false);
    });

    it('should safely interpolate parameters when parameter key contains special characters', () => {
      const file = new File([new Uint8Array(500)], 'toolarge.jpg', { type: 'image/jpeg' });
      const mockT = (key: string, def: string, params?: Record<string, any>) => {
        return def;
      };
      const result = validateFiles([file], {
        maxSize: 100,
        t: mockT,
      });
      expect(result.rejectedFiles.length).toBe(1);
      expect(result.rejectedFiles[0].reason).toContain('toolarge.jpg');
    });
  });
});
