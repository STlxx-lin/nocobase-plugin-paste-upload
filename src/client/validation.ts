/**
 * Format bytes to readable size string (e.g. 10MB, 500KB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const COMMON_EXTENSION_MIMES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/**
 * Check whether a file matches the `accept` attribute string.
 * Supports:
 * - Wildcards: any file
 * - MIME wildcards: image/*, video/*, audio/*
 * - Exact MIME: application/pdf, image/png
 * - File extensions: .jpg, .png, .pdf, .docx
 * - Comma-separated list: image/*, .pdf, application/zip
 */
export function matchAccept(file: File, accept?: string | string[] | null): boolean {
  if (!accept) {
    return true;
  }

  const acceptStr = Array.isArray(accept) ? accept.join(',') : (typeof accept === 'string' ? accept : '');
  if (!acceptStr.trim() || acceptStr.trim() === '*' || acceptStr.trim() === '*/*') {
    return true;
  }

  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const inferredMime = (!fileType && ext ? COMMON_EXTENSION_MIMES[ext] : '') || '';
  const effectiveMime = fileType || inferredMime;
  const baseMimeType = effectiveMime.replace(/\/.*$/, '');

  const rules = acceptStr
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return rules.some((rule) => {
    // Wildcard
    if (rule === '*' || rule === '*/*') {
      return true;
    }

    // Extension rule, e.g. .jpg, .png, .pdf, or without leading dot like png, jpg
    const normalizedExtRule = rule.startsWith('.') ? rule : (!rule.includes('/') ? `.${rule}` : '');
    if (normalizedExtRule) {
      if (normalizedExtRule === '.jpg' || normalizedExtRule === '.jpeg') {
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return true;
      } else if (fileName.endsWith(normalizedExtRule)) {
        return true;
      }
      if (COMMON_EXTENSION_MIMES[normalizedExtRule] && effectiveMime === COMMON_EXTENSION_MIMES[normalizedExtRule]) {
        return true;
      }
    }

    // MIME wildcard, e.g. image/*
    if (rule.endsWith('/*')) {
      const expectedBase = rule.replace(/\/\*$/, '');
      return baseMimeType === expectedBase;
    }

    // Exact MIME match (with jpeg/jpg alias support)
    if (effectiveMime) {
      if (effectiveMime === rule) return true;
      if (
        (effectiveMime === 'image/jpeg' && rule === 'image/jpg') ||
        (effectiveMime === 'image/jpg' && rule === 'image/jpeg')
      ) {
        return true;
      }
    }

    return false;
  });
}

export interface ValidateOptions {
  accept?: string | string[] | null;
  maxSize?: number | null;
  multiple?: boolean;
  t?: (key: string, defaultText: string, params?: Record<string, any>) => string;
}

export interface ValidationResult {
  validFiles: File[];
  rejectedFiles: Array<{
    file: File;
    reason: string;
  }>;
  warning?: string;
}

/**
 * Validate files against upload restrictions.
 */
export function validateFiles(files: File[], options: ValidateOptions = {}): ValidationResult {
  const { accept, maxSize, multiple = true, t } = options;
  const validFiles: File[] = [];
  const rejectedFiles: Array<{ file: File; reason: string }> = [];

  const tr = (key: string, defaultText: string, params: Record<string, any> = {}) => {
    if (t) {
      return t(key, defaultText, params);
    }
    let res = defaultText;
    for (const [k, v] of Object.entries(params)) {
      const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      res = res.replace(new RegExp(`\\{\\{${escapedK}\\}\\}`, 'g'), () => String(v));
    }
    return res;
  };

  for (const file of files) {
    const fileName = file.name || '未知文件';

    // 1. Validate file type
    if (accept && !matchAccept(file, accept)) {
      const reason = tr(
        'File type not allowed: {{name}}',
        `文件类型不符合要求：${fileName}（支持类型：${accept}）`,
        { name: fileName, accept }
      );
      rejectedFiles.push({ file, reason });
      continue;
    }

    // 2. Validate file size
    if (maxSize && maxSize > 0 && file.size > maxSize) {
      const limitStr = formatFileSize(maxSize);
      const currentStr = formatFileSize(file.size);
      const reason = tr(
        'File size exceeds limit: {{name}}',
        `文件大小超出限制：${fileName}（限制 ${limitStr}，当前 ${currentStr}）`,
        { name: fileName, limit: limitStr, current: currentStr }
      );
      rejectedFiles.push({ file, reason });
      continue;
    }

    validFiles.push(file);
  }

  let warning: string | undefined;
  if (!multiple && validFiles.length > 1) {
    const firstFileName = validFiles[0].name;
    warning = tr(
      'Single file upload only, uploading the first file',
      `当前上传组件仅支持单文件上传，已为您保留第 1 个文件（${firstFileName}）`,
      { name: firstFileName }
    );
    return {
      validFiles: [validFiles[0]],
      rejectedFiles,
      warning,
    };
  }

  return {
    validFiles,
    rejectedFiles,
    warning,
  };
}
