export * from './domain/stock-service.js';

export const WmsModule = {
  id: 'module-wms',
  version: '1.0.0',
  async onInit(ctx: any) {
    ctx.registerNavigation({
      id: 'wms-menu',
      title: 'РЎРєР»Р°РґСЃРєРѕР№ СѓС‡РµС‚',
      path: '/wms',
      permission: 'wms:stock:read'
    });
  },
  async onStart() {},
  async onStop() {}
};
