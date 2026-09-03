import { describe, it, expect } from 'vitest';
import { StockAggregate } from './stock-aggregate.js';

describe('StockAggregate Domain & Outbox (TDD)', () => {
  it('creates stock item and registers outbox event', () => {
    const stock = StockAggregate.create({
      id: 'SKU-001',
      sku: 'BALL-BEARING-6205',
      name: 'Ball Bearing 6205',
      warehouseId: 'WH-MAIN',
      quantityOnHand: 20
    });

    expect(stock.availableQuantity).toBe(20);
    expect(stock.outboxEvents).toHaveLength(1);
    expect(stock.outboxEvents[0].eventType).toBe('wms.stock.created');
  });

  it('reserves stock and emits wms.stock.reserved', () => {
    const stock = StockAggregate.create({
      id: 'SKU-002',
      sku: 'BELT-100',
      name: 'V-Belt 100',
      warehouseId: 'WH-MAIN',
      quantityOnHand: 10
    });

    stock.reserve(4, 'WO-999');
    expect(stock.availableQuantity).toBe(6);
    expect(stock.props.quantityReserved).toBe(4);
    expect(stock.outboxEvents[1].eventType).toBe('wms.stock.reserved');
  });

  it('issues reserved stock and emits wms.stock.depleted when exhausted', () => {
    const stock = StockAggregate.create({
      id: 'SKU-003',
      sku: 'SEAL-05',
      name: 'Oil Seal',
      warehouseId: 'WH-MAIN',
      quantityOnHand: 5
    });

    stock.reserve(5, 'WO-1001');
    stock.issue(5, 'Petrov S.');

    expect(stock.props.quantityOnHand).toBe(0);
    expect(stock.props.quantityReserved).toBe(0);
    expect(stock.outboxEvents.some(e => e.eventType === 'wms.stock.depleted')).toBe(true);
  });
});
