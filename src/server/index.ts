import { Plugin } from '@nocobase/server';

export class PluginPasteUploadServer extends Plugin {
  async load() {
    this.app.logger?.info?.('[@nocobase/plugin-paste-upload] server plugin loaded');
  }
}

export default PluginPasteUploadServer;
