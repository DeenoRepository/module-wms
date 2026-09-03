import { StockBatch, StockMovementRecord, InventoryReservation, OperationType } from './stock-movement.js';
import { StockService } from './stock-service.js';

export interface StockItemProps {
  id: string;
  sku: string;
  name: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  cellId?: string | null;
  minStockThreshold?: number;
  batches?: StockBatch[];
  reservations?: InventoryReservation[];
  movements?: StockMovementRecord[];
}

export interface WmsOutboxRecord {
  id: string;
  aggregateType: 'StockItem';
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  published: boolean;
}

export class StockAggregate {
  private _props: StockItemProps;
  private _outbox: WmsOutboxRecord[] = [];
  private _stockService: StockService;

  constructor(props: StockItemProps) {
    this._props = {
      ...props,
      cellId: props.cellId ?? null,
      minStockThreshold: props.minStockThreshold ?? 0,
      batches: props.batches ? [...props.batches] : [],
      reservations: props.reservations ? [...props.reservations] : [],
      movements: props.movements ? [...props.movements] : []
    };
    this._stockService = new StockService();
  }

  static create(props: Omit<StockItemProps, 'quantityReserved' | 'batches' | 'reservations' | 'movements'> & {
    initialBatch?: Omit<StockBatch, 'stockItemId'>;
  }): StockAggregate {
    const batches: StockBatch[] = [];
    if (props.initialBatch) {
      batches.push({
        ...props.initialBatch,
        stockItemId: props.id
      });
    }

    const aggregate = new StockAggregate({
      ...props,
      quantityReserved: 0,
      batches,
      reservations: [],
      movements: []
    });

    aggregate.recordOutbox('wms.stock.created', {
      itemId: props.id,
      sku: props.sku,
      warehouseId: props.warehouseId,
      quantity: props.quantityOnHand,
      cellId: props.cellId ?? null
    });

    return aggregate;
  }

  get props(): Readonly<StockItemProps> {
    return Object.freeze({ ...this._props });
  }

  get outboxEvents(): readonly WmsOutboxRecord[] {
    return this._outbox;
  }

  get availableQuantity(): number {
    return this._props.quantityOnHand - this._props.quantityReserved;
  }

  get batches(): readonly StockBatch[] {
    return this._props.batches ?? [];
  }

  get reservations(): readonly InventoryReservation[] {
    return this._props.reservations ?? [];
  }

  get movements(): readonly StockMovementRecord[] {
    return this._props.movements ?? [];
  }

  assignCell(cellId: string | null): void {
    const previousCellId = this._props.cellId;
    this._props.cellId = cellId;

    this.recordOutbox('wms.stock.cell_assigned', {
      itemId: this._props.id,
      sku: this._props.sku,
      previousCellId,
      newCellId: cellId
    });
  }

  receiveBatch(input: {
    batchNumber: string;
    quantity: number;
    unitCost?: number;
    receivedAt?: Date;
    expiresAt?: Date | null;
    supplier?: string | null;
    document?: string | null;
    userId: string;
  }): void {
    if (input.quantity <= 0) throw new Error('Received quantity must be positive');

    const batchId = crypto.randomUUID();
    const receivedAt = input.receivedAt ?? new Date();

    const newBatch: StockBatch = {
      batchId,
      stockItemId: this._props.id,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      initialQuantity: input.quantity,
      unitCost: input.unitCost,
      receivedAt,
      expiresAt: input.expiresAt ?? null,
      supplier: input.supplier ?? null
    };

    this._props.batches?.push(newBatch);
    this._props.quantityOnHand += input.quantity;

    const movement: StockMovementRecord = {
      id: crypto.randomUUID(),
      type: 'RECEIPT',
      stockItemId: this._props.id,
      warehouseId: this._props.warehouseId,
      sourceCellId: null,
      targetCellId: this._props.cellId ?? null,
      targetWarehouseId: null,
      batchId,
      quantity: input.quantity,
      document: input.document ?? null,
      counterparty: input.supplier ?? null,
      createdById: input.userId,
      createdAt: receivedAt
    };

    this._props.movements?.push(movement);

    this.recordOutbox('wms.stock.received', {
      itemId: this._props.id,
      sku: this._props.sku,
      batchId,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      quantityOnHand: this._props.quantityOnHand
    });
  }

  reserve(amount: number, workOrderId: string): InventoryReservation {
    if (amount <= 0) throw new Error('Reserve amount must be positive');
    if (this.availableQuantity < amount) {
      throw new Error(`Insufficient available stock to reserve ${amount}. Available: ${this.availableQuantity}`);
    }

    const availableBatches = (this._props.batches ?? []).filter(b => b.quantity > 0);
    let plan: Array<{ batchId: string; quantity: number }> = [];

    if (availableBatches.length > 0) {
      plan = this._stockService.allocateFifo(amount, availableBatches);
    }

    this._props.quantityReserved += amount;

    const reservation: InventoryReservation = {
      reservationId: crypto.randomUUID(),
      stockItemId: this._props.id,
      workOrderId,
      quantity: amount,
      batchAllocations: plan,
      reservedAt: new Date(),
      status: 'PENDING'
    };

    this._props.reservations?.push(reservation);

    this.recordOutbox('wms.stock.reserved', {
      itemId: this._props.id,
      sku: this._props.sku,
      amount,
      workOrderId,
      reservationId: reservation.reservationId,
      batchAllocations: plan
    });

    return reservation;
  }

  cancelReservation(reservationId: string): void {
    const res = this._props.reservations?.find(r => r.reservationId === reservationId);
    if (!res) {
      throw new Error(`Reservation ${reservationId} not found`);
    }
    if (res.status !== 'PENDING') {
      throw new Error(`Reservation ${reservationId} is already ${res.status}`);
    }

    res.status = 'CANCELLED';
    this._props.quantityReserved -= res.quantity;

    this.recordOutbox('wms.stock.reservation_cancelled', {
      itemId: this._props.id,
      sku: this._props.sku,
      reservationId,
      releasedQuantity: res.quantity
    });
  }

  issue(amount: number, recipient: string, options?: {
    reservationId?: string;
    workOrderId?: string;
    equipmentId?: string;
    userId?: string;
  }): void {
    if (amount <= 0) throw new Error('Issue amount must be positive');
    if (this._props.quantityReserved < amount) {
      throw new Error('Cannot issue more than currently reserved stock');
    }

    // Allocate FIFO from batches and decrement
    let remainingToDeduct = amount;
    const availableBatches = (this._props.batches ?? [])
      .filter(b => b.quantity > 0)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    for (const b of availableBatches) {
      if (remainingToDeduct <= 0) break;
      const take = Math.min(b.quantity, remainingToDeduct);
      b.quantity -= take;
      remainingToDeduct -= take;
    }

    this._props.quantityOnHand -= amount;
    this._props.quantityReserved -= amount;

    if (options?.reservationId) {
      const res = this._props.reservations?.find(r => r.reservationId === options.reservationId);
      if (res && res.status === 'PENDING') {
        res.status = 'FULFILLED';
      }
    }

    const movement: StockMovementRecord = {
      id: crypto.randomUUID(),
      type: options?.equipmentId ? 'ISSUE_WRITE_OFF' : 'ISSUE',
      stockItemId: this._props.id,
      warehouseId: this._props.warehouseId,
      sourceCellId: this._props.cellId ?? null,
      targetCellId: null,
      targetWarehouseId: null,
      quantity: amount,
      counterparty: recipient,
      workOrderId: options?.workOrderId ?? null,
      equipmentId: options?.equipmentId ?? null,
      createdById: options?.userId ?? '00000000-0000-0000-0000-000000000000',
      createdAt: new Date()
    };

    this._props.movements?.push(movement);

    this.recordOutbox('wms.stock.issued', {
      itemId: this._props.id,
      sku: this._props.sku,
      amount,
      recipient,
      equipmentId: options?.equipmentId ?? null,
      workOrderId: options?.workOrderId ?? null,
      remainingOnHand: this._props.quantityOnHand
    });

    if (this._props.quantityOnHand === 0) {
      this.recordOutbox('wms.stock.depleted', {
        itemId: this._props.id,
        sku: this._props.sku,
        warehouseId: this._props.warehouseId
      });
    } else if (this._props.minStockThreshold && this._props.quantityOnHand <= this._props.minStockThreshold) {
      this.recordOutbox('wms.stock.low_threshold_alert', {
        itemId: this._props.id,
        sku: this._props.sku,
        warehouseId: this._props.warehouseId,
        quantityOnHand: this._props.quantityOnHand,
        minStockThreshold: this._props.minStockThreshold
      });
    }
  }

  transfer(quantity: number, targetWarehouseId: string, targetCellId?: string | null, userId?: string): void {
    if (quantity <= 0) throw new Error('Transfer quantity must be positive');
    if (this.availableQuantity < quantity) {
      throw new Error(`Insufficient available stock for transfer. Available: ${this.availableQuantity}`);
    }

    let remaining = quantity;
    const availableBatches = (this._props.batches ?? [])
      .filter(b => b.quantity > 0)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    for (const b of availableBatches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      b.quantity -= take;
      remaining -= take;
    }

    this._props.quantityOnHand -= quantity;

    const movement: StockMovementRecord = {
      id: crypto.randomUUID(),
      type: 'TRANSFER',
      stockItemId: this._props.id,
      warehouseId: this._props.warehouseId,
      sourceCellId: this._props.cellId ?? null,
      targetCellId: targetCellId ?? null,
      targetWarehouseId,
      quantity,
      createdById: userId ?? '00000000-0000-0000-0000-000000000000',
      createdAt: new Date()
    };

    this._props.movements?.push(movement);

    this.recordOutbox('wms.stock.transferred', {
      itemId: this._props.id,
      sku: this._props.sku,
      sourceWarehouseId: this._props.warehouseId,
      targetWarehouseId,
      targetCellId: targetCellId ?? null,
      quantity,
      remainingOnHand: this._props.quantityOnHand
    });
  }

  adjustBalance(actualQuantity: number, reason: string, userId?: string): void {
    if (actualQuantity < 0) throw new Error('Adjusted quantity cannot be negative');

    const diff = actualQuantity - this._props.quantityOnHand;
    const previous = this._props.quantityOnHand;
    this._props.quantityOnHand = actualQuantity;

    const movement: StockMovementRecord = {
      id: crypto.randomUUID(),
      type: 'ADJUSTMENT',
      stockItemId: this._props.id,
      warehouseId: this._props.warehouseId,
      sourceCellId: this._props.cellId ?? null,
      targetCellId: null,
      targetWarehouseId: null,
      quantity: Math.abs(diff),
      comment: `Reason: ${reason}. Delta: ${diff}`,
      createdById: userId ?? '00000000-0000-0000-0000-000000000000',
      createdAt: new Date()
    };

    this._props.movements?.push(movement);

    this.recordOutbox('wms.stock.adjusted', {
      itemId: this._props.id,
      sku: this._props.sku,
      previousQuantity: previous,
      newQuantity: actualQuantity,
      difference: diff,
      reason
    });
  }

  private recordOutbox(eventType: string, payload: Record<string, unknown>): void {
    this._outbox.push({
      id: crypto.randomUUID(),
      aggregateType: 'StockItem',
      aggregateId: this._props.id,
      eventType,
      payload,
      createdAt: new Date().toISOString(),
      published: false
    });
  }
}
