import { Plugin } from '@nocobase/client';
import { setupPasteUploadPlugin } from './pluginHelper';

export * from './clipboard';
export * from './validation';
export * from './uploader';
export * from './pasteUploadManager';
export * from './withPasteUpload';
export * from './styles';
export * from './pluginHelper';

export class PluginPasteUploadClient extends Plugin {
  async load() {
    setupPasteUploadPlugin(this.app);
  }
}

export default PluginPasteUploadClient;
