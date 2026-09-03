import { describe, it, expect } from 'vitest';
import { WarehouseTopology } from './warehouse-topology.js';

describe('WarehouseTopology', () => {
  const baseWarehouse = {
    id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    code: 'WH-MAIN',
    name: 'Central Spare Parts Warehouse',
    location: 'Sector A, Building 4',
    isActive: true
  };

  it('creates warehouse and adds zones and cells', () => {
    const wh = WarehouseTopology.create(baseWarehouse);
    expect(wh.id).toBe(baseWarehouse.id);
    expect(wh.code).toBe('WH-MAIN');
    expect(wh.name).toBe('Central Spare Parts Warehouse');
    expect(wh.props.isActive).toBe(true);
    expect(wh.zones.length).toBe(0);

    wh.addZone({
      id: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      code: 'ZONE-A',
      name: 'Pumps & Motors'
    });
    expect(wh.zones.length).toBe(1);

    wh.addCellToZone('ZONE-A', {
      id: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
      code: 'A-01-01',
      name: 'Shelf 1, Bin 1',
      isActive: true
    });

    const location = wh.findCellByCode('a-01-01');
    expect(location).not.toBeNull();
    expect(location?.zone.code).toBe('ZONE-A');
    expect(location?.cell.code).toBe('A-01-01');

    const address = wh.formatAddressPath('A-01-01');
    expect(address).toBe('WH-MAIN / ZONE-A / A-01-01');
  });

  it('throws error when adding duplicate zone code', () => {
    const wh = WarehouseTopology.create(baseWarehouse);
    wh.addZone({
      id: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      code: 'ZONE-A',
      name: 'Pumps & Motors'
    });

    expect(() => {
      wh.addZone({
        id: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
        code: 'zone-a',
        name: 'Duplicate Zone'
      });
    }).toThrow('Zone with code "zone-a" already exists');
  });

  it('throws error when adding duplicate cell code in the same zone', () => {
    const wh = WarehouseTopology.create(baseWarehouse);
    wh.addZone({
      id: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      code: 'ZONE-A',
      name: 'Pumps & Motors'
    });

    wh.addCellToZone('ZONE-A', {
      id: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
      code: 'A-01-01',
      isActive: true
    });

    expect(() => {
      wh.addCellToZone('ZONE-A', {
        id: 'e5f6a1b2-c3d4-4e5f-8a6b-7c8d9e0f1a2b',
        code: 'a-01-01',
        isActive: true
      });
    }).toThrow('Cell with code "a-01-01" already exists in zone "ZONE-A"');
  });

  it('throws error when adding cell to non-existent zone', () => {
    const wh = WarehouseTopology.create(baseWarehouse);
    expect(() => {
      wh.addCellToZone('ZONE-NONEXISTENT', {
        id: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
        code: 'A-01-01',
        isActive: true
      });
    }).toThrow('Zone with code "ZONE-NONEXISTENT" not found');
  });

  it('throws error when formatting address path for non-existent cell', () => {
    const wh = WarehouseTopology.create(baseWarehouse);
    expect(() => {
      wh.formatAddressPath('UNKNOWN-CELL');
    }).toThrow('Cell code "UNKNOWN-CELL" does not belong to warehouse WH-MAIN');
  });
});
