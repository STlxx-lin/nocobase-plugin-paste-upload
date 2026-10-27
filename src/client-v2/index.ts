import { Plugin } from '@nocobase/client-v2';
import { setupPasteUploadPlugin } from '../client/pluginHelper';

export * from '../client/clipboard';
export * from '../client/validation';
export * from '../client/uploader';
export * from '../client/pasteUploadManager';
export * from '../client/withPasteUpload';
export * from '../client/styles';
export * from '../client/pluginHelper';

export class PluginPasteUploadClientV2 extends Plugin {
  async load() {
    setupPasteUploadPlugin(this.app);
  }
}

export default PluginPasteUploadClientV2;
