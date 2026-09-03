export interface StockItemProps {
  id: string;
  sku: string;
  name: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
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

  constructor(props: StockItemProps) {
    this._props = { ...props };
  }

  static create(props: Omit<StockItemProps, 'quantityReserved'>): StockAggregate {
    const aggregate = new StockAggregate({
      ...props,
      quantityReserved: 0
    });

    aggregate.recordOutbox('wms.stock.created', {
      itemId: props.id,
      sku: props.sku,
      quantity: props.quantityOnHand
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

  reserve(amount: number, workOrderId: string): void {
    if (amount <= 0) throw new Error('Reserve amount must be positive');
    if (this.availableQuantity < amount) {
      throw new Error(`Insufficient available stock to reserve ${amount}. Available: ${this.availableQuantity}`);
    }

    this._props.quantityReserved += amount;
    this.recordOutbox('wms.stock.reserved', {
      itemId: this._props.id,
      sku: this._props.sku,
      amount,
      workOrderId
    });
  }

  issue(amount: number, recipient: string): void {
    if (amount <= 0) throw new Error('Issue amount must be positive');
    if (this._props.quantityReserved < amount) {
      throw new Error('Cannot issue more than currently reserved stock');
    }

    this._props.quantityOnHand -= amount;
    this._props.quantityReserved -= amount;

    this.recordOutbox('wms.stock.issued', {
      itemId: this._props.id,
      sku: this._props.sku,
      amount,
      recipient,
      remainingOnHand: this._props.quantityOnHand
    });

    if (this._props.quantityOnHand === 0) {
      this.recordOutbox('wms.stock.depleted', {
        itemId: this._props.id,
        sku: this._props.sku,
        warehouseId: this._props.warehouseId
      });
    }
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
