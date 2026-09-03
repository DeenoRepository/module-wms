export * from './domain/stock-service.js';
export * from './domain/stock-aggregate.js';

export const WmsModule = {
  id: 'module-wms',
  version: '1.0.0',
  async onInit(ctx: any) {
    ctx.registerNavigation({
      id: 'wms-menu',
      title: 'Warehouse Management',
      path: '/wms',
      permission: 'wms:stock:read'
    });
  },
  async onStart() {},
  async onStop() {}
};
