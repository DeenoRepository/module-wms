import { z } from 'zod';

export const StorageCellSchema = z.object({
  id: z.string().uuid(),
  zoneId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().max(100).nullable().optional(),
  maxWeightKg: z.number().positive().optional(),
  maxVolumeM3: z.number().positive().optional(),
  isActive: z.boolean().default(true)
});

export type StorageCell = z.infer<typeof StorageCellSchema>;

export const StorageZoneSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
  description: z.string().max(255).nullable().optional(),
  cells: z.array(StorageCellSchema).default([])
});

export type StorageZone = z.infer<typeof StorageZoneSchema>;

export const WarehouseTopologySchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  location: z.string().max(255).nullable().optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  zones: z.array(StorageZoneSchema).default([])
});

export type WarehouseTopologyProps = z.infer<typeof WarehouseTopologySchema>;

export class WarehouseTopology {
  private _props: WarehouseTopologyProps;

  constructor(props: WarehouseTopologyProps) {
    this._props = WarehouseTopologySchema.parse(props);
  }

  static create(props: Omit<WarehouseTopologyProps, 'zones'> & { zones?: StorageZone[] }): WarehouseTopology {
    return new WarehouseTopology({
      ...props,
      zones: props.zones ?? []
    });
  }

  get props(): Readonly<WarehouseTopologyProps> {
    return Object.freeze({ ...this._props });
  }

  get id(): string {
    return this._props.id;
  }

  get code(): string {
    return this._props.code;
  }

  get name(): string {
    return this._props.name;
  }

  get zones(): readonly StorageZone[] {
    return this._props.zones;
  }

  addZone(zone: Omit<StorageZone, 'warehouseId' | 'cells'> & { cells?: StorageCell[] }): void {
    if (this._props.zones.some((z: StorageZone) => z.code.toLowerCase() === zone.code.toLowerCase())) {
      throw new Error(`Zone with code "${zone.code}" already exists in warehouse ${this._props.code}`);
    }

    this._props.zones.push({
      ...zone,
      warehouseId: this._props.id,
      cells: zone.cells ?? []
    });
  }

  addCellToZone(zoneCode: string, cell: Omit<StorageCell, 'zoneId'>): void {
    const zone = this._props.zones.find((z: StorageZone) => z.code.toLowerCase() === zoneCode.toLowerCase());
    if (!zone) {
      throw new Error(`Zone with code "${zoneCode}" not found in warehouse ${this._props.code}`);
    }

    if (zone.cells.some((c: StorageCell) => c.code.toLowerCase() === cell.code.toLowerCase())) {
      throw new Error(`Cell with code "${cell.code}" already exists in zone "${zoneCode}"`);
    }

    zone.cells.push({
      ...cell,
      zoneId: zone.id
    });
  }

  findCellByCode(cellCode: string): { zone: StorageZone; cell: StorageCell } | null {
    const search = cellCode.toLowerCase();
    for (const zone of this._props.zones) {
      const cell = zone.cells.find((c: StorageCell) => c.code.toLowerCase() === search);
      if (cell) {
        return { zone, cell };
      }
    }
    return null;
  }

  formatAddressPath(cellCode: string): string {
    const found = this.findCellByCode(cellCode);
    if (!found) {
      throw new Error(`Cell code "${cellCode}" does not belong to warehouse ${this._props.code}`);
    }
    return `${this._props.code} / ${found.zone.code} / ${found.cell.code}`;
  }
}
