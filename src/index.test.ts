import { describe, it, expect, vi } from 'vitest';
import { WmsModule } from './index.js';

describe('WmsModule lifecycle and exports', () => {
  it('registers navigation in onInit', async () => {
    const registerNavigation = vi.fn();
    const ctx = { registerNavigation };

    await WmsModule.onInit(ctx);
    expect(registerNavigation).toHaveBeenCalledWith({
      id: 'wms-menu',
      title: 'Warehouse Management',
      path: '/wms',
      permission: 'wms:stock:read'
    });
  });

  it('runs onStart and onStop without errors', async () => {
    await expect(WmsModule.onStart()).resolves.toBeUndefined();
    await expect(WmsModule.onStop()).resolves.toBeUndefined();
  });
});
