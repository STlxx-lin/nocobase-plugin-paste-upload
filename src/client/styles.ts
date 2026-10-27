const STYLE_ELEMENT_ID = 'nb-paste-upload-styles';

const CSS_RULES = `
/* 粘贴上传组件悬停高亮指示 */
.nb-paste-upload-hovering {
  position: relative !important;
  outline: 2px dashed #1677ff !important;
  outline-offset: 2px !important;
  border-radius: 6px !important;
  transition: outline 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important;
  cursor: pointer !important;
}

.nb-paste-upload-hovering.ant-upload.ant-upload-select,
.nb-paste-upload-hovering .ant-upload.ant-upload-select,
.nb-paste-upload-hovering.ant-upload-drag,
.nb-paste-upload-hovering .ant-upload-drag {
  border-color: #1677ff !important;
}

/* 微型悬浮提示标签 */
.nb-paste-upload-badge {
  position: absolute !important;
  top: 4px !important;
  right: 4px !important;
  z-index: 1000 !important;
  background-color: #1677ff !important;
  color: #ffffff !important;
  font-size: 11px !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  font-weight: 500 !important;
  line-height: 1.2 !important;
  padding: 2px 7px !important;
  border-radius: 10px !important;
  box-shadow: 0 2px 6px rgba(22, 119, 255, 0.35) !important;
  pointer-events: none !important;
  user-select: none !important;
  white-space: nowrap !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 3px !important;
  animation: nb-paste-badge-pop 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

@keyframes nb-paste-badge-pop {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 粘贴触发成功微动涟漪 */
.nb-paste-upload-success-pulse {
  animation: nb-paste-pulse 0.4s ease-out !important;
}

@keyframes nb-paste-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(22, 119, 255, 0.6);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(22, 119, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(22, 119, 255, 0);
  }
}
`;

export function injectPasteUploadStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ELEMENT_ID;
  styleEl.textContent = CSS_RULES;
  document.head.appendChild(styleEl);
}

export function removePasteUploadStyles(): void {
  if (typeof document === 'undefined') return;
  const styleEl = document.getElementById(STYLE_ELEMENT_ID);
  if (styleEl) {
    styleEl.remove();
  }
}
