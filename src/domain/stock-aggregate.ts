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
  private _outbox: WmsOutboxRecord[] = [];

  constructor(private props: StockItemProps) {}

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
    return Object.freeze({ ...this.props });
  }

  get outboxEvents(): readonly WmsOutboxRecord[] {
    return this._outbox;
  }

  get availableQuantity(): number {
    return this.props.quantityOnHand - this.props.quantityReserved;
  }

  reserve(amount: number, workOrderId: string): void {
    if (amount <= 0) throw new Error('Reserve amount must be positive');
    if (this.availableQuantity < amount) {
      throw new Error(`Insufficient available stock to reserve ${amount}. Available: ${this.availableQuantity}`);
    }

    this.props.quantityReserved += amount;
    this.recordOutbox('wms.stock.reserved', {
      itemId: this.props.id,
      sku: this.props.sku,
      amount,
      workOrderId
    });
  }

  issue(amount: number, recipient: string): void {
    if (amount <= 0) throw new Error('Issue amount must be positive');
    if (this.props.quantityReserved < amount) {
      throw new Error('Cannot issue more than currently reserved stock');
    }

    this.props.quantityOnHand -= amount;
    this.props.quantityReserved -= amount;

    this.recordOutbox('wms.stock.issued', {
      itemId: this.props.id,
      sku: this.props.sku,
      amount,
      recipient,
      remainingOnHand: this.props.quantityOnHand
    });

    if (this.props.quantityOnHand === 0) {
      this.recordOutbox('wms.stock.depleted', {
        itemId: this.props.id,
        sku: this.props.sku,
        warehouseId: this.props.warehouseId
      });
    }
  }

  private recordOutbox(eventType: string, payload: Record<string, unknown>): void {
    this._outbox.push({
      id: crypto.randomUUID(),
      aggregateType: 'StockItem',
      aggregateId: this.props.id,
      eventType,
      payload,
      createdAt: new Date().toISOString(),
      published: false
    });
  }
}
